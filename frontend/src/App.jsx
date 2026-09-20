import { useEffect, useRef, useState } from 'react';
import TopNav from './components/TopNav.jsx';
import MapView from './components/MapView.jsx';
import CallPanel from './components/CallPanel.jsx';
import FleetPanel from './components/FleetPanel.jsx';
import { generateCallQueue } from './calls.js';
import {
  getIntersections, getResponders, getMapConfig, getStations, getBeats,
  dispatch as dispatchCall, arrive, clearUnit, syncPositions, getCitizenReports
} from './api.js';
import { fetchDrivingRoute, makePathInterpolator } from './routing.js';
import { createPatrolEngine } from './patrol.js';

const FALLBACK_CENTER = { centerLat: 37.2296, centerLng: -80.4139, cityName: 'Blacksburg, VA', zip: '24060' };

const CITIZEN_TITLE = {
  police: 'Citizen Report — Police Needed',
  fire: 'Citizen Report — Fire',
  medical: 'Citizen Report — Medical'
};

// Turns a row from GET /api/citizen-reports into the same shape every
// other call in the queue already has, so CallPanel, the map pin, and
// dispatch all work on it without knowing it came from the public page
// rather than the simulated queue. `source: 'citizen'` is the only tell —
// CallPanel uses it to hide the voice-call controls (there's no phone
// line to bridge here, just a location and an optional note) and the AI
// call-notes panel (ElevenLabs never touched this call).
function citizenReportToCall(report) {
  return {
    id: `citizen-${report.id}`,
    source: 'citizen',
    title: CITIZEN_TITLE[report.type] || 'Citizen-Reported Emergency',
    type: ['police', 'fire', 'medical'].includes(report.type) ? report.type : 'police',
    opening: report.message || 'Shared their location through the citizen report page.',
    questions: [],
    code: report.code,
    locationName: report.locationName || `${report.lat.toFixed(4)}, ${report.lng.toFixed(4)}`,
    lat: report.lat,
    lng: report.lng,
    caller: 'Citizen Report',
    status: 'waiting',
    transcript: [
      { from: 'dispatcher', text: '📍 Citizen shared their location through the report page.' },
      ...(report.message ? [{ from: 'caller', text: report.message }] : [])
    ]
  };
}

// How long a unit works a call before it clears itself back into service. Real
// scene times vary wildly; this keeps the demo board from silting up with units
// parked on scene forever, and the dispatcher can always clear one early.
const ON_SCENE_MS = 90_000;

export default function App() {
  const [mapConfig, setMapConfig] = useState(FALLBACK_CENTER);
  const [intersections, setIntersections] = useState([]);
  const [responders, setResponders] = useState([]);

  const [onDuty, setOnDuty] = useState(false);
  const [onDutySeconds, setOnDutySeconds] = useState(0);

  const [queue, setQueue] = useState([]);
  const [openCallId, setOpenCallId] = useState(null);
  const [activePin, setActivePin] = useState(null);

  // One entry per unit currently committed to a call: real (uncompressed)
  // ETA counts down in wall-clock seconds, same as it would on a real CAD board.
  const [unitDispatches, setUnitDispatches] = useState({}); // unitId -> { callId, type, etaSeconds, status, targetLat, targetLng }
  const [routes, setRoutes] = useState({});                 // unitId -> [[lat,lng], ...]

  const [stations, setStations] = useState([]);
  const [beats, setBeats] = useState([]);
  const [beatGeometry, setBeatGeometry] = useState({}); // beatId -> routed [[lat,lng], ...]

  const animRefs = useRef({});
  const shiftTimerRef = useRef(null);
  const clearTimersRef = useRef({});
  const patrolRef = useRef(null);

  useEffect(() => {
    getMapConfig().then(setMapConfig).catch(() => {});
    getIntersections().then(setIntersections).catch(() => {});
    getResponders().then(setResponders).catch(() => {});
    getStations().then(data => setStations(data.stations || [])).catch(() => {});
    getBeats().then(data => setBeats(data.beats || [])).catch(() => {});
  }, []);

  // The patrol engine runs for the whole session, on duty or not — cruisers
  // don't stop patrolling because the dispatcher stepped away from the console.
  useEffect(() => {
    const engine = createPatrolEngine({
      onUpdate: (updates) => {
        setResponders(prev => {
          if (!prev.length) return prev;
          const byId = new Map(updates.map(u => [u.unitId, u]));
          return prev.map(r => {
            const u = byId.get(r.id);
            return u ? { ...r, lat: u.lat, lng: u.lng, status: u.status, statusLabel: u.statusLabel } : r;
          });
        });
      },
      onSync: (positions) => { syncPositions(positions).catch(() => {}); },
      onGeometry: setBeatGeometry
    });
    patrolRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      patrolRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!patrolRef.current || !beats.length || !responders.length) return;
    patrolRef.current.configure({ beats, fleet: responders, stations });
    // Only re-configure when the plan or the roster changes; live positions are
    // owned by the engine itself from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beats, stations, responders.length]);

  useEffect(() => () => {
    Object.values(clearTimersRef.current).forEach(clearTimeout);
    clearTimersRef.current = {};
  }, []);

  // Picks up reports submitted through the separate /report page. Only
  // while on duty — same as the simulated queue, a report just sits
  // server-side until someone's on the board to see it.
  useEffect(() => {
    if (!onDuty) return;
    let cancelled = false;

    function poll() {
      getCitizenReports().then(reports => {
        if (cancelled || !reports.length) return;
        setQueue(q => {
          const existingIds = new Set(q.map(c => c.id));
          const additions = reports
            .filter(r => !existingIds.has(`citizen-${r.id}`))
            .map(citizenReportToCall);
          return additions.length ? [...additions, ...q] : q;
        });
      }).catch(() => {});
    }

    poll();
    const t = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [onDuty]);

  // The server is authoritative for *state* (who's committed, who's free); the
  // patrol engine is authoritative for *position* of anything not on a call.
  // Merging rather than replacing is what stops a refresh from yanking a
  // patrolling cruiser back to wherever its last heartbeat put it.
  function refreshResponders() {
    getResponders().then(fresh => {
      setResponders(prev => {
        const local = new Map(prev.map(r => [r.id, r]));
        return fresh.map(r => {
          const mine = local.get(r.id);
          if (!mine) return r;
          if (r.busy) return { ...r, statusLabel: undefined };
          const localCommitted = mine.status === 'EN_ROUTE' || mine.status === 'ON_SCENE';
          return {
            ...r,
            lat: mine.lat,
            lng: mine.lng,
            status: localCommitted ? r.status : (mine.status || r.status),
            statusLabel: localCommitted ? undefined : mine.statusLabel
          };
        });
      });
    }).catch(() => {});
  }

  function toggleDuty() {
    if (onDuty) {
      setOnDuty(false);
      clearInterval(shiftTimerRef.current);
      setQueue([]);
      setOpenCallId(null);
      setActivePin(null);
    } else {
      setOnDuty(true);
      setOnDutySeconds(0);
      setQueue(generateCallQueue(intersections, 4));
      shiftTimerRef.current = setInterval(() => setOnDutySeconds(s => s + 1), 1000);
    }
  }

  const openCall = queue.find(c => c.id === openCallId) || null;

  function handleOpenCall(id) {
    setOpenCallId(id);
    const call = queue.find(c => c.id === id);
    if (call) setActivePin({ code: call.code, lat: call.lat, lng: call.lng });
  }

  function handleAskQuestion(item) {
    setQueue(q => q.map(c => {
      if (c.id !== openCallId) return c;
      return {
        ...c,
        transcript: [...c.transcript, { from: 'dispatcher', text: item.q }, { from: 'caller', text: item.a }]
      };
    }));
  }

  // Fed by CallPanel's live ElevenLabs voice session — each turn of the
  // real conversation (caller speaking into the mic, the AI's replies)
  // lands here the same way a scripted question/answer does.
  function handleLiveTranscript(entry) {
    setQueue(q => q.map(c => (c.id === openCallId
      ? { ...c, transcript: [...c.transcript, entry] }
      : c)));
  }

  // The dispatcher picks exactly which units respond — no auto-assignment.
  async function handleDispatchUnits(unitIds) {
    if (!openCall || unitIds.length === 0) return;
    let result;
    try {
      result = await dispatchCall(openCall.code, unitIds);
    } catch (e) {
      setQueue(q => q.map(c => (c.id === openCallId
        ? { ...c, transcript: [...c.transcript, { from: 'dispatcher', text: `⚠ ${e.message}` }] }
        : c)));
      return;
    }

    if (result.errors && result.errors.length) {
      setQueue(q => q.map(c => (c.id === openCallId
        ? { ...c, transcript: [...c.transcript, { from: 'dispatcher', text: `⚠ ${result.errors.join('; ')}` }] }
        : c)));
    }

    setQueue(q => q.map(c => (c.id === openCallId ? { ...c, status: 'dispatched' } : c)));

    // Move-ups: with a unit committed, the backend says who slides over to
    // cover the hole it left. Fire moves up to the vacated station, EMS shifts
    // to the post covering that district.
    if (result.coverage && result.coverage.length) {
      for (const directive of result.coverage) {
        patrolRef.current?.applyCoverage(directive);
      }
      setQueue(q => q.map(c => (c.id === openCallId
        ? { ...c, transcript: [...c.transcript, { from: 'dispatcher', text: `↻ ${result.coverage.map(d => d.reason).join('; ')}` }] }
        : c)));
    }

    for (const unit of result.dispatched) {
      // The call animation owns this unit now; patrol hands it over. Start the
      // run from where the unit is on screen rather than from its last
      // heartbeat, so the marker doesn't jump backwards as it rolls.
      const live = responders.find(r => r.id === unit.unitId);
      patrolRef.current?.suspend(unit.unitId);
      dispatchOneUnit(live ? { ...unit, startLat: live.lat, startLng: live.lng } : unit, openCallId);
    }
  }

  // Back in service from wherever the unit finished up: tell the server, drop
  // it off the responding list, and let patrol drive it home or back to its beat.
  function clearUnitNow(unitId, lat, lng) {
    const timer = clearTimersRef.current[unitId];
    if (timer) {
      clearTimeout(timer);
      delete clearTimersRef.current[unitId];
    }
    setUnitDispatches(d => {
      const next = { ...d };
      delete next[unitId];
      return next;
    });
    patrolRef.current?.releaseToService(unitId, [lat, lng]);
    clearUnit(unitId, lat, lng).catch(() => {}).finally(refreshResponders);
  }

  // Pulls a unit off whatever it's doing mid-route and frees it immediately,
  // from wherever it actually is on screen right now — for when a more
  // emergent call comes in and everything is already dispatched. Unlike
  // "Clear" (which wraps up a finished scene), this interrupts a unit that's
  // still driving, so the in-flight route animation has to be torn down too.
  function rerouteUnit(unitId) {
    const dispatch = unitDispatches[unitId];
    const live = responders.find(r => r.id === unitId);
    const lat = live?.lat ?? dispatch?.targetLat;
    const lng = live?.lng ?? dispatch?.targetLng;

    if (animRefs.current[unitId]) {
      cancelAnimationFrame(animRefs.current[unitId]);
      delete animRefs.current[unitId];
    }
    setRoutes(r => {
      const next = { ...r };
      delete next[unitId];
      return next;
    });
    clearUnitNow(unitId, lat, lng);

    // If this was the last unit still responding to that call, put it back
    // to 'waiting' so it doesn't sit there looking handled when nobody's
    // actually still coming.
    if (dispatch) {
      const stillCovered = Object.entries(unitDispatches)
        .some(([uid, d]) => d.callId === dispatch.callId && uid !== unitId);
      if (!stillCovered) {
        setQueue(q => q.map(c => (c.id === dispatch.callId ? { ...c, status: 'waiting' } : c)));
      }
    }
  }

  async function dispatchOneUnit(unit, callId) {
    const { unitId, type, startLat, startLng, targetLat, targetLng } = unit;
    let etaSeconds = unit.etaMinutes * 60;
    let path = [[startLat, startLng], [targetLat, targetLng]];

    try {
      const route = await fetchDrivingRoute(startLat, startLng, targetLat, targetLng);
      path = route.coords;
      etaSeconds = route.durationSeconds; // real routed travel time — not sped up
    } catch {
      // routing service unavailable — fall back to the straight-line ETA
    }

    setRoutes(r => ({ ...r, [unitId]: path }));
    setUnitDispatches(d => ({
      ...d,
      [unitId]: { callId, type, etaSeconds, status: 'En route', targetLat, targetLng, clearsAt: null }
    }));

    animateAlongRoute(unitId, path, etaSeconds, targetLat, targetLng);
  }

  // Moves the unit marker along the real route over the *actual* travel
  // time — a 6-minute ETA takes 6 real minutes, matching how long a unit
  // would really take to reach the scene.
  function animateAlongRoute(unitId, path, etaSeconds, targetLat, targetLng) {
    if (animRefs.current[unitId]) cancelAnimationFrame(animRefs.current[unitId]);

    const interpolate = makePathInterpolator(path);
    const playbackMs = Math.max(1000, etaSeconds * 1000);
    let t0 = null;

    function step(ts) {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / playbackMs);
      const [lat, lng] = interpolate(p);

      setResponders(prev => prev.map(r => (r.id === unitId ? { ...r, lat, lng } : r)));
      const remaining = Math.max(0, etaSeconds * (1 - p));
      setUnitDispatches(d => (d[unitId] ? { ...d, [unitId]: { ...d[unitId], etaSeconds: remaining } } : d));

      if (p < 1) {
        animRefs.current[unitId] = requestAnimationFrame(step);
      } else {
        const clearsAt = Date.now() + ON_SCENE_MS;
        setUnitDispatches(d => (d[unitId]
          ? { ...d, [unitId]: { ...d[unitId], status: 'On scene', etaSeconds: 0, clearsAt } }
          : d));
        setRoutes(r => { const next = { ...r }; delete next[unitId]; return next; });
        arrive(unitId, targetLat, targetLng).then(refreshResponders).catch(() => {});
        // On scene keeps the unit committed — it only frees up when it clears.
        clearTimersRef.current[unitId] = setTimeout(
          () => clearUnitNow(unitId, targetLat, targetLng),
          ON_SCENE_MS
        );
      }
    }
    animRefs.current[unitId] = requestAnimationFrame(step);
  }

  function closeCallPanel() {
    setOpenCallId(null);
    setActivePin(null);
  }

  const dispatchList = Object.entries(unitDispatches).map(([unitId, d]) => ({ unitId, ...d }));
  const beatTypes = Object.fromEntries(beats.map(b => [b.id, b.type]));
  const availCount = responders.filter(r => !r.busy).length;
  const patrollingCount = responders.filter(r => r.status === 'PATROLLING').length;
  const enRouteCount = dispatchList.filter(d => d.status === 'En route').length;
  const onSceneCount = dispatchList.filter(d => d.status === 'On scene').length;
  const waitingCalls = queue.filter(c => c.status === 'waiting');
  const center = [mapConfig.centerLat, mapConfig.centerLng];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav onDuty={onDuty} onDutySeconds={onDutySeconds} onToggleDuty={toggleDuty} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* left column */}
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--line)', padding: 18, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 10, letterSpacing: 0.4 }}>
            {onDuty ? `ACTIVE CALLS (${queue.length})` : 'CALL QUEUE'}
          </div>

          {!onDuty ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: 24
            }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
                You're off duty. Go on duty to start receiving 911 calls for Blacksburg.
              </div>
              <button
                onClick={toggleDuty}
                style={{
                  width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--status)', cursor: 'pointer',
                  background: 'var(--status-tint)', color: 'var(--status)', fontWeight: 700, fontSize: 13.5
                }}
              >Go on duty</button>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.length === 0 && (
                <div style={{ color: 'var(--ink-muted)', fontSize: 13, textAlign: 'center', marginTop: 30 }}>No calls yet.</div>
              )}
              {queue.map(call => {
                const assigned = dispatchList.filter(d => d.callId === call.id);
                return (
                  <div
                    key={call.id}
                    onClick={() => handleOpenCall(call.id)}
                    style={{
                      cursor: 'pointer', padding: 14, borderRadius: 10, background: 'var(--surface)',
                      border: '1px solid ' + (openCallId === call.id ? 'var(--accent)' : 'var(--line)')
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{call.title}</span>
                      {assigned.length > 0 ? (
                        <span style={{ fontSize: 11, color: 'var(--status)', fontWeight: 700 }}>
                          {assigned.length} UNIT{assigned.length > 1 ? 'S' : ''}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>OPEN</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 8, lineHeight: 1.4 }}>{call.opening}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                      {call.locationName} · caller: {call.caller}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <FleetPanel
            responders={responders}
            stations={stations}
            dispatches={unitDispatches}
            onClearUnit={clearUnitNow}
            onRerouteUnit={rerouteUnit}
          />
        </div>

        {/* right column: map */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: 18 }}>
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <MapView
              center={center}
              intersections={intersections}
              responders={responders}
              activePin={activePin}
              routes={routes}
              stations={stations}
              beatGeometry={beatGeometry}
              beatTypes={beatTypes}
              onIntersectionClick={() => {}}
              cityLabel={`${mapConfig.cityName || 'Blacksburg, VA'} · ${mapConfig.zip || '24060'}`}
            />
            {openCall && (
              <CallPanel
                call={openCall}
                allResponders={responders}
                unitsForCall={dispatchList.filter(d => d.callId === openCall.id)}
                onClose={closeCallPanel}
                onAskQuestion={handleAskQuestion}
                onLiveTranscript={handleLiveTranscript}
                onDispatchUnits={handleDispatchUnits}
              />
            )}
          </div>
          <div style={{
            marginTop: 12, fontSize: 12.5, color: 'var(--ink-secondary)', display: 'flex', gap: 18,
            padding: '10px 4px', borderTop: '1px solid var(--line)'
          }}>
            <span>{availCount} available</span>
            <span>{patrollingCount} on patrol</span>
            <span>{enRouteCount} en route</span>
            <span>{onSceneCount} on scene</span>
            <span style={{ marginLeft: 'auto' }}>{waitingCalls.length} waiting call{waitingCalls.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
