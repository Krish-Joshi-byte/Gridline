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
