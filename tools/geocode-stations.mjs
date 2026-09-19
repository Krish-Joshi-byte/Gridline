#!/usr/bin/env node
//
// Replaces the estimated station coordinates in
// backend/src/main/resources/gridline/stations.json with real OpenStreetMap
// geocodes of their published addresses.
//
// Why this exists: the addresses in stations.json are public record and
// correct. Some of the coordinates are street-level *estimates* derived from
// those addresses — good enough to sit on the right side of town for a demo,
// not good enough to claim they came off a map. Run this once and they will
// have.
//
//   node tools/geocode-stations.mjs --check     # report drift, write nothing
//   node tools/geocode-stations.mjs             # rewrite stations.json
//
// Nominatim's usage policy allows at most 1 request/second and requires a
// real User-Agent. Both are honoured below. Seven stations, seven seconds.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATIONS_PATH = resolve(HERE, '../backend/src/main/resources/gridline/stations.json');
const USER_AGENT = 'gridline-dispatch-demo/1.0 (station coordinate refresh)';
const RATE_LIMIT_MS = 1100;

const checkOnly = process.argv.includes('--check');

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`nominatim responded ${res.status}`);
  const results = await res.json();
  if (!results.length) return null;
  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    displayName: results[0].display_name,
    osmType: results[0].osm_type,
    osmId: results[0].osm_id
  };
}

const file = JSON.parse(await readFile(STATIONS_PATH, 'utf8'));
let changed = 0;

for (const station of file.stations) {
  // Try the facility name first — OSM usually has the station itself tagged,
  // which lands on the building rather than the middle of the street.
  const queries = [
    `${station.name}, Blacksburg, Virginia`,
    station.address
  ].filter(Boolean);

  let hit = null;
  for (const query of queries) {
    try {
      hit = await geocode(query);
    } catch (err) {
      console.error(`  ! ${station.id}: ${err.message}`);
    }
    await sleep(RATE_LIMIT_MS);
    if (hit) break;
  }

  if (!hit) {
    console.log(`× ${station.id.padEnd(9)} no match — leaving ${station.lat}, ${station.lng}`);
    continue;
  }

  const drift = Math.round(haversineMeters(station, hit));
  console.log(`✓ ${station.id.padEnd(9)} ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}  (${drift} m from the estimate)`);
  console.log(`  ${hit.displayName}`);

  if (!checkOnly) {
    station.lat = Number(hit.lat.toFixed(5));
    station.lng = Number(hit.lng.toFixed(5));
    station.precision = 'geocoded';
    station.source = `${station.source} · coordinate from OpenStreetMap ${hit.osmType}/${hit.osmId} via Nominatim`;
    changed += 1;
  }
}

if (checkOnly) {
  console.log('\n--check: nothing written.');
} else if (changed) {
  await writeFile(STATIONS_PATH, JSON.stringify(file, null, 2) + '\n');
  console.log(`\nUpdated ${changed} station(s) in ${STATIONS_PATH}`);
  console.log('Restart the backend to pick them up. Beat waypoints are intersections, not addresses —');
  console.log('those are snapped to the road network by OSRM at runtime and need no geocoding.');
} else {
  console.log('\nNothing to update.');
}
