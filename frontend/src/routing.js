// Fetches a real, road-following driving route between two points using
// OSRM's public demo routing server. Returns coordinates as [lat, lng]
// pairs (Leaflet's order), plus the route's actual distance/duration.
export async function fetchDrivingRoute(startLat, startLng, endLat, endLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('routing service unavailable');
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('no route found');
  const route = data.routes[0];
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return { coords, distanceMeters: route.distance, durationSeconds: route.duration };
}

export function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Given a polyline of [lat,lng] points, returns a function that maps a
// progress fraction (0..1) to an interpolated [lat,lng] along the path —
// used to move a unit marker along actual streets instead of cutting
// straight across blocks.
export function makePathInterpolator(coords) {
  if (!coords || coords.length < 2) {
    return () => coords?.[0] || [0, 0];
  }
  const segLengths = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineMeters(coords[i], coords[i + 1]);
    segLengths.push(d);
    total += d;
  }
  return (p) => {
    const target = Math.max(0, Math.min(1, p)) * total;
    let covered = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (covered + segLengths[i] >= target || i === segLengths.length - 1) {
        const segP = segLengths[i] === 0 ? 0 : (target - covered) / segLengths[i];
        const [lat1, lng1] = coords[i];
        const [lat2, lng2] = coords[i + 1];
        return [lat1 + (lat2 - lat1) * segP, lng1 + (lng2 - lng1) * segP];
      }
      covered += segLengths[i];
    }
    return coords[coords.length - 1];
  };
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// Routes through an ordered list of waypoints ({lat, lng}) and, when `loop` is
// set, back to the first one — which is what turns a handful of real
// intersections into a closed patrol beat that follows actual streets.
//
// Returns the full polyline plus `legEnds`: the cumulative distance (metres) at
// which each waypoint is reached. That's what lets a unit know it has arrived
// at a post and should sit there for a while before moving on.
export async function fetchRouteThroughWaypoints(waypoints, { loop = true } = {}) {
  const points = waypoints.slice();
  if (loop && points.length > 1) points.push(points[0]);
  if (points.length < 2) throw new Error('need at least two waypoints');

  const path = points.map(w => `${w.lng},${w.lat}`).join(';');
  const res = await fetch(`${OSRM_BASE}/${path}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error('routing service unavailable');
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('no route found');

  const route = data.routes[0];
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  const legEnds = [];
  let running = 0;
  for (const leg of route.legs || []) {
    running += leg.distance;
    legEnds.push(running);
  }

  return {
    coords,
    legEnds,
    distanceMeters: route.distance,
    durationSeconds: route.duration
  };
}

// Straight-line stand-in used when OSRM is unreachable, so a patrol still runs
// (across blocks rather than along them) instead of the map sitting frozen.
export function straightLineRoute(waypoints, { loop = true } = {}) {
  const points = waypoints.slice();
  if (loop && points.length > 1) points.push(points[0]);
  const coords = points.map(w => [w.lat, w.lng]);
  const legEnds = [];
  let running = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    running += haversineMeters(coords[i], coords[i + 1]);
    legEnds.push(running);
  }
  return { coords, legEnds, distanceMeters: running, durationSeconds: running / 11 };
}

// Distance-indexed view of a polyline: `at(metres)` gives the [lat, lng] that
// far along it. Patrol movement is driven by distance rather than by a 0..1
// fraction so a unit's speed stays constant no matter how long its beat is.
export function makeDistanceInterpolator(coords) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineMeters(coords[i], coords[i + 1]);
    segments.push({ start: total, length: d, from: coords[i], to: coords[i + 1] });
    total += d;
  }
  function at(meters) {
    if (!segments.length) return coords[0] || [0, 0];
    const target = Math.max(0, Math.min(total, meters));
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].start + segments[mid].length < target) lo = mid + 1;
      else hi = mid;
    }
    const seg = segments[lo];
    const p = seg.length === 0 ? 0 : (target - seg.start) / seg.length;
    return [
      seg.from[0] + (seg.to[0] - seg.from[0]) * p,
      seg.from[1] + (seg.to[1] - seg.from[1]) * p
    ];
  }
  return { at, totalMeters: total };
}

// Closest vertex on a polyline to a point, as a distance along that polyline.
// Used when a unit clears a call somewhere off its beat: it rejoins at the
// nearest point rather than teleporting back to where it left off.
export function nearestDistanceAlong(coords, [lat, lng]) {
  let best = { meters: 0, distance: Infinity };
  let running = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) running += haversineMeters(coords[i - 1], coords[i]);
    const d = haversineMeters(coords[i], [lat, lng]);
    if (d < best.distance) best = { meters: running, distance: d };
  }
  return best;
}
