// Patrol engine.
//
// Everything a unit does when it is *not* on a call lives here. The backend
// hands over the plan — beats, posts, districts, move-up directives — and this
// module turns that plan into movement along the real road network:
//
//   police   continuous loop around the beat, pausing at the waypoints flagged
//            as stationary posts
//   EMS      system status management: hold at a post, then reposition to the
//            next one. Ambulances post, they don't cruise.
//   fire     in quarters. The engine only rolls for a call, a move-up, or a
//            periodic district familiarization lap.
//
// Beat geometry comes from OSRM once per beat and is then reused, so a shift
// costs one routing request per beat rather than one per tick.

import {
  fetchRouteThroughWaypoints,
  fetchDrivingRoute,
  straightLineRoute,
  makeDistanceInterpolator,
  nearestDistanceAlong
} from './routing.js';

const TICK_MS = 200;
const SYNC_MS = 6000;
const COVER_MINUTES = 10;
const ROUTE_REQUEST_SPACING_MS = 250;

// What the dispatcher sees next to each unit.
const LABELS = {
  PATROLLING: 'On patrol',
  STATIONARY: 'Stationary post',
  POSTED: 'Posted',
  REPOSITIONING: 'Repositioning',
  IN_QUARTERS: 'In quarters',
  FAMILIARIZATION: 'District familiarization',
  COVERING: 'Covering',
  RETURNING: 'Returning to service'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createPatrolEngine({ onUpdate, onSync, onGeometry } = {}) {
  const beats = new Map();   // beatId -> { beat, coords, legEnds, interp }
  const units = new Map();   // unitId -> runtime state
  const stations = new Map();

  let timer = null;
  let lastTick = 0;
  let lastSync = 0;

  function beatOf(unit) {
    return beats.get(unit.beatId);
  }

  function emitGeometry() {
    if (!onGeometry) return;
    const out = {};
    for (const [beatId, entry] of beats) {
      if (entry.coords && entry.coords.length > 1) out[beatId] = entry.coords;
    }
    onGeometry(out);
  }

  // One OSRM call per beat, spaced out so the free demo server isn't hit with
  // seven simultaneous requests. A failure degrades to straight lines rather
  // than leaving the unit parked.
  async function buildBeatGeometry(beatList) {
    for (const beat of beatList) {
      if (!beat.waypoints || beat.waypoints.length < 2) continue;
      let route;
      try {
        route = await fetchRouteThroughWaypoints(beat.waypoints, { loop: beat.loop !== false });
      } catch {
        route = straightLineRoute(beat.waypoints, { loop: beat.loop !== false });
      }
      beats.set(beat.id, {
        beat,
        coords: route.coords,
        legEnds: route.legEnds,
        interp: makeDistanceInterpolator(route.coords)
      });
      emitGeometry();
      attachUnitsTo(beat.id);
      await sleep(ROUTE_REQUEST_SPACING_MS);
    }
  }

  // Once a beat's geometry lands, any unit waiting on it enters service.
  function attachUnitsTo(beatId) {
    const entry = beats.get(beatId);
    if (!entry) return;
    for (const unit of units.values()) {
      if (unit.beatId !== beatId || unit.phase !== 'waiting') continue;
      const snapped = nearestDistanceAlong(entry.coords, unit.position);
      unit.distance = snapped.meters;
      unit.nextLegIdx = nextLegIndexFor(entry, unit.distance);

      if (entry.beat.mode === 'STATION_COVER') {
        setPhase(unit, 'quarters', 'IN_QUARTERS', LABELS.IN_QUARTERS);
        unit.nextLapAt = Date.now() + lapIntervalMs(entry.beat);
      } else if (entry.beat.mode === 'POST_ROTATION') {
        const hold = entry.beat.waypoints[0]?.dwellSeconds || 120;
        setPhase(unit, 'dwell', 'POSTED', LABELS.POSTED);
        unit.dwellUntil = Date.now() + hold * 1000;
      } else {
        setPhase(unit, 'patrol', 'PATROLLING', LABELS.PATROLLING);
      }
    }
  }

  function lapIntervalMs(beat) {
    const minutes = beat.familiarizationEveryMinutes || 20;
    return minutes * 60 * 1000;
  }

  function nextLegIndexFor(entry, distance) {
    const legEnds = entry.legEnds || [];
    for (let i = 0; i < legEnds.length; i++) {
      if (legEnds[i] > distance) return i;
    }
    return legEnds.length;
  }

  function setPhase(unit, phase, status, label) {
    unit.phase = phase;
    unit.status = status;
    unit.statusLabel = label;
  }

  // Drives a unit from wherever it is to a specific point, then runs `onArrive`.
  // Used for rejoining a beat after a call, move-ups, and returning to quarters.
  async function beginTransit(unit, target, { status, label, onArrive }) {
    let route;
    try {
      route = await fetchDrivingRoute(unit.position[0], unit.position[1], target[0], target[1]);
    } catch {
      route = { coords: [unit.position, target] };
    }
    const interp = makeDistanceInterpolator(route.coords);
    unit.transit = { interp, distance: 0, onArrive };
    setPhase(unit, 'transit', status, label);
  }

  // Put a unit back on its own assignment from wherever it is standing:
  // engines drive home to quarters, cruisers and medics rejoin their beat at
  // the nearest point on it rather than at the point they left.
  function releaseUnitToService(unit, position) {
    if (position) unit.position = position;
    const entry = beatOf(unit);

    if (!entry) {
      setPhase(unit, 'patrol', 'PATROLLING', LABELS.PATROLLING);
      return;
    }

    if (entry.beat.mode === 'STATION_COVER') {
      const home = stations.get(unit.homeStationId);
      const target = home ? [home.lat, home.lng] : entry.coords[0];
      beginTransit(unit, target, {
        status: 'RETURNING',
        label: LABELS.RETURNING,
        onArrive: (now) => {
          unit.distance = 0;
          unit.nextLegIdx = 0;
          unit.nextLapAt = now + lapIntervalMs(entry.beat);
          setPhase(unit, 'quarters', 'IN_QUARTERS', LABELS.IN_QUARTERS);
        }
      });
      return;
    }

    const snapped = nearestDistanceAlong(entry.coords, unit.position);
    const rejoinAt = entry.interp.at(snapped.meters);
    beginTransit(unit, rejoinAt, {
      status: 'RETURNING',
      label: LABELS.RETURNING,
      onArrive: () => {
        unit.distance = snapped.meters;
        unit.nextLegIdx = nextLegIndexFor(entry, unit.distance);
        const posted = entry.beat.mode === 'POST_ROTATION';
        setPhase(
          unit,
          'patrol',
          posted ? 'REPOSITIONING' : 'PATROLLING',
          posted ? LABELS.REPOSITIONING : LABELS.PATROLLING
        );
      }
    });
  }

  function tickUnit(unit, dtSeconds, now) {
    if (unit.phase === 'suspended' || unit.phase === 'waiting') return;

    if (unit.phase === 'transit') {
      const t = unit.transit;
      if (!t) {
        setPhase(unit, 'patrol', 'PATROLLING', LABELS.PATROLLING);
        return;
      }
      t.distance += unit.speedMps * dtSeconds;
      if (t.distance >= t.interp.totalMeters) {
        unit.position = t.interp.at(t.interp.totalMeters);
        const done = t.onArrive;
        unit.transit = null;
        if (done) done(now);
      } else {
        unit.position = t.interp.at(t.distance);
      }
      return;
    }

    if (unit.phase === 'dwell') {
      if (now < unit.dwellUntil) return;

      // Cover assignment over: go back to your own district rather than
      // wandering off down whatever beat you happen to be standing on.
      if (unit.afterCover) {
        unit.afterCover = false;
        unit.coveringTargetId = null;
        releaseUnitToService(unit);
        return;
      }

      const entry = beatOf(unit);
      const repositioning = entry && entry.beat.mode === 'POST_ROTATION';
      setPhase(
        unit,
        'patrol',
        repositioning ? 'REPOSITIONING' : 'PATROLLING',
        repositioning ? LABELS.REPOSITIONING : LABELS.PATROLLING
      );
      return;
    }

    if (unit.phase === 'quarters') {
      const entry = beatOf(unit);
      if (!entry || !entry.beat.familiarizationEveryMinutes) return;
      if (unit.nextLapAt && now >= unit.nextLapAt) {
        unit.lapRunning = true;
        setPhase(unit, 'patrol', 'REPOSITIONING', LABELS.FAMILIARIZATION);
      }
      return;
    }

    // phase === 'patrol'
    const entry = beatOf(unit);
    if (!entry) return;

    unit.distance += unit.speedMps * dtSeconds;
    const total = entry.interp.totalMeters;
    const legEnds = entry.legEnds || [];

    // Reached the next waypoint on the beat?
    while (unit.nextLegIdx < legEnds.length && unit.distance >= legEnds[unit.nextLegIdx]) {
      const waypointIdx = (unit.nextLegIdx + 1) % entry.beat.waypoints.length;
      const waypoint = entry.beat.waypoints[waypointIdx];
      unit.nextLegIdx += 1;
      if (waypoint && waypoint.dwellSeconds > 0 && !unit.lapRunning) {
        unit.distance = legEnds[unit.nextLegIdx - 1];
        unit.dwellUntil = now + waypoint.dwellSeconds * 1000;
        const posted = entry.beat.mode === 'POST_ROTATION';
        setPhase(
          unit,
          'dwell',
          posted ? 'POSTED' : 'PATROLLING',
          posted ? `${LABELS.POSTED} · ${waypoint.name}` : LABELS.STATIONARY
        );
        break;
      }
    }

    if (unit.distance >= total) {
      unit.distance -= total;
      unit.nextLegIdx = 0;
      // An engine only runs one lap, then goes back in quarters.
      if (unit.lapRunning) {
        unit.lapRunning = false;
        unit.nextLapAt = now + lapIntervalMs(entry.beat);
        setPhase(unit, 'quarters', 'IN_QUARTERS', LABELS.IN_QUARTERS);
      }
    }

    unit.position = entry.interp.at(unit.distance);
  }

  function tick() {
    const now = Date.now();
    const dtSeconds = Math.min(2, (now - lastTick) / 1000);
    lastTick = now;

    const updates = [];
    for (const unit of units.values()) {
      const before = unit.position;
      tickUnit(unit, dtSeconds, now);
      if (unit.phase === 'suspended' || unit.phase === 'waiting') continue;
      if (!unit.position) unit.position = before;
      updates.push({
        unitId: unit.id,
        lat: unit.position[0],
        lng: unit.position[1],
        status: unit.status,
        statusLabel: unit.statusLabel
      });
    }

    if (updates.length && onUpdate) onUpdate(updates);

    if (onSync && now - lastSync >= SYNC_MS && updates.length) {
      lastSync = now;
      onSync(updates.map(({ unitId, lat, lng, status }) => ({ unitId, lat, lng, status })));
    }
  }

  return {
    // `fleet` is the responder list from the backend: it tells us where each
    // unit currently is and which beat it answers to.
    configure({ beats: beatList = [], fleet = [], stations: stationList = [] }) {
      stations.clear();
      for (const s of stationList) stations.set(s.id, s);

      for (const responder of fleet) {
        if (!responder.beatId) continue;
        const beat = beatList.find(b => b.id === responder.beatId);
        if (!beat) continue;
        const existing = units.get(responder.id);
        if (existing) continue;
        units.set(responder.id, {
          id: responder.id,
          type: responder.type,
          beatId: responder.beatId,
          homeStationId: responder.homeStationId,
          speedMps: (beat.speedKph || 32) / 3.6,
          phase: 'waiting',
          distance: 0,
          nextLegIdx: 0,
          dwellUntil: 0,
          nextLapAt: 0,
          lapRunning: false,
          transit: null,
          position: [responder.lat, responder.lng],
          status: 'PATROLLING',
          statusLabel: LABELS.PATROLLING
        });
      }

      const needed = beatList.filter(b => !beats.has(b.id));
      if (needed.length) buildBeatGeometry(needed);
      else for (const beat of beatList) attachUnitsTo(beat.id);
    },

    start() {
      if (timer) return;
      lastTick = Date.now();
      lastSync = Date.now();
      timer = setInterval(tick, TICK_MS);
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },

    // The unit has been dispatched — the call animation owns it from here.
    suspend(unitId) {
      const unit = units.get(unitId);
      if (!unit) return;
      unit.transit = null;
      unit.lapRunning = false;
      unit.phase = 'suspended';
    },

    // Cleared from a call. Engines go back to quarters, everyone else rejoins
    // their beat at the nearest point rather than where they left it.
    releaseToService(unitId, position) {
      const unit = units.get(unitId);
      if (!unit) return;
      unit.afterCover = false;
      unit.coveringTargetId = null;
      releaseUnitToService(unit, position);
    },

    // Backend move-up directive: slide a unit over to cover a hole in coverage,
    // hold it there, then send it home.
    applyCoverage(directive) {
      const unit = units.get(directive.unitId);
      if (!unit) return;
      if (unit.phase === 'suspended') return;
      if (unit.coveringTargetId === directive.targetId) return;

      unit.coveringTargetId = directive.targetId;
      beginTransit(unit, [directive.targetLat, directive.targetLng], {
        status: 'REPOSITIONING',
        label: `Moving up · ${directive.targetName}`,
        onArrive: (now) => {
          setPhase(unit, 'dwell', 'COVERING', `${LABELS.COVERING} · ${directive.targetName}`);
          unit.dwellUntil = now + COVER_MINUTES * 60 * 1000;
          unit.afterCover = true;
        }
      });
    },

    snapshot() {
      const out = {};
      for (const [id, unit] of units) {
        out[id] = { status: unit.status, statusLabel: unit.statusLabel, phase: unit.phase };
      }
      return out;
    },

    reset() {
      units.clear();
      beats.clear();
    }
  };
}
