import { useEffect, useRef, useState } from 'react';
import TopNav from './components/TopNav.jsx';
import MapView from './components/MapView.jsx';
import CallPanel from './components/CallPanel.jsx';
import { generateCallQueue } from './calls.js';
import { getIntersections, getResponders, getMapConfig, dispatch as dispatchCall, arrive } from './api.js';
import { fetchDrivingRoute, makePathInterpolator } from './routing.js';

const FALLBACK_CENTER = { centerLat: 37.2296, centerLng: -80.4139, cityName: 'Blacksburg, VA', zip: '24060' };

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

  const animRefs = useRef({});
  const shiftTimerRef = useRef(null);

  useEffect(() => {
    getMapConfig().then(setMapConfig).catch(() => {});
    getIntersections().then(setIntersections).catch(() => {});
    getResponders().then(setResponders).catch(() => {});
  }, []);

  function refreshResponders() {
    getResponders().then(setResponders).catch(() => {});
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
    refreshResponders();

    for (const unit of result.dispatched) {
      dispatchOneUnit(unit, openCallId);
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
    setUnitDispatches(d => ({ ...d, [unitId]: { callId, type, etaSeconds, status: 'En route', targetLat, targetLng } }));

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
        setUnitDispatches(d => (d[unitId] ? { ...d, [unitId]: { ...d[unitId], status: 'On scene', etaSeconds: 0 } } : d));
        setRoutes(r => { const next = { ...r }; delete next[unitId]; return next; });
        arrive(unitId, targetLat, targetLng).then(refreshResponders).catch(() => {});
      }
    }
    animRefs.current[unitId] = requestAnimationFrame(step);
  }

  function closeCallPanel() {
    setOpenCallId(null);
    setActivePin(null);
  }

  const dispatchList = Object.entries(unitDispatches).map(([unitId, d]) => ({ unitId, ...d }));
  const availCount = responders.filter(r => !r.busy).length;
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
                onDispatchUnits={handleDispatchUnits}
              />
            )}
          </div>
          <div style={{
            marginTop: 12, fontSize: 12.5, color: 'var(--ink-secondary)', display: 'flex', gap: 18,
            padding: '10px 4px', borderTop: '1px solid var(--line)'
          }}>
            <span>{availCount} available</span>
            <span>{enRouteCount} en route</span>
            <span>{onSceneCount} on scene</span>
            <span style={{ marginLeft: 'auto' }}>{waitingCalls.length} waiting call{waitingCalls.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
