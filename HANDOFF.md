# Handoff — stations & patrol routes

Everything below is about one change: units used to be six pins parked on
the map until a call came in. Now they behave the way the three services
actually behave between calls, moving on the real road network, and the
stations they come from are real places with published addresses.

Read the "Open items" section before you demo this. One of them matters.

---

## 1. What shipped

**Stations are real.** `backend/src/main/resources/gridline/stations.json`
holds Blacksburg PD (200 Clay St SE), both Blacksburg Volunteer Fire
Department stations (Station 1, 200 Progress St; Station 3, 407 Hubbard St),
Blacksburg Volunteer Rescue Squad Station 5 (1300 Progress St NW), and
LewisGale Hospital Montgomery (3700 S Main St). Every record carries the
`source` it came from and a `precision` flag. They render on the map as
labelled badges (PD / FD / EMS / H).

**Units run their assignment between calls.** Not one behaviour copied three
times — each service gets the pattern it really uses:

| Service | Mode | Behaviour |
|---|---|---|
| Police | `PATROL_LOOP` | Continuous preventive patrol around an assigned beat, pausing at waypoints flagged as stationary posts. Three beats, three cruisers. |
| EMS | `POST_ROTATION` | System status management: hold at a post, reposition to the next one, repeat. Ambulances post; they don't cruise. |
| Fire | `STATION_COVER` | In quarters. The engine rolls for a call, a move-up, or a periodic district familiarization lap — that's it. |

That difference is deliberate. If you'd rather have engines and ambulances
visibly circling like cruisers for demo purposes, change their beat `mode`
to `PATROL_LOOP` in `beats.json` — no code change needed. It just won't be
what a fire department does.

**Move-ups.** Commit an engine and the other station's engine slides over to
cover the vacated station. Commit a medic and the other one shifts to the
post covering that district. `CoverageService` decides; the directive rides
back on the dispatch response and the client carries it out. Police are
deliberately excluded — beats are continuously patrolled, so an adjacent
cruiser absorbing a call isn't a coverage hole.

**Units stay committed until cleared.** Arriving on scene used to free a unit
immediately. Now `arrive` sets `ON_SCENE`, and the unit is unavailable until
`clear` — automatically after 90 s, or when the dispatcher hits **Clear** on
the unit board. Then it drives back to its beat or quarters rather than
teleporting.

**Dispatch measures from where units actually are.** Patrolling units
heartbeat their position every 6 s, so an ETA for a cruiser halfway down
Prices Fork Rd is computed from Prices Fork Rd, not from the station it
started the shift at.

---

## 2. Where the data lives

All three files are in `backend/src/main/resources/gridline/` and are loaded
once at startup. Editing them is the intended way to change the simulation —
no Java changes needed for new stations, beats, posts, or units.

- **`stations.json`** — facilities. `precision` is `listing` (coordinate came
  from a public facility listing) or `approximate` (street-level estimate
  from the published address — see Open items).
- **`beats.json`** — beats, EMS post rotations, fire districts. `waypoints`
  are real intersections; `dwellSeconds` is how long a unit holds there;
  `speedKph` is average patrol speed including stops. **The waypoints are not
  the route.** The client asks OSRM for the driving route through them, so
  what a unit follows is OpenStreetMap road geometry.
- **`fleet.json`** — the roster: unit ID, callsign, agency, home station,
  assigned beat.

Malformed JSON fails the app at boot on purpose. A dispatch map with no
stations isn't worth starting.

---

## 3. API surface

New:

```
GET  /api/stations                 { stations: [...], attribution }
GET  /api/beats                    { beats: [...], note }
POST /api/dispatch/{unitId}/clear  { lat?, lng? }  → back in service
POST /api/responders/positions     { positions: [{unitId, lat, lng, status}] }
```

Changed:

- `GET /api/responders` now returns `callsign`, `agency`, `homeStationId`,
  `beatId`, `status`, `assignedCallCode`, `updatedAt`. `busy` is still there
  and still means "committed to a call" — it's now derived from `status`, so
  the existing call panel needed no changes.
- `POST /api/dispatch` response gained `coverage: [CoverageDirective]`.
- `POST /api/dispatch/{unitId}/arrive` no longer frees the unit.

Unit states: `PATROLLING`, `POSTED`, `REPOSITIONING`, `IN_QUARTERS`,
`COVERING`, `EN_ROUTE`, `ON_SCENE`, `RETURNING`. `UnitStatus.isCommitted()`
is the only place that decides which of those block a dispatch.

---

## 4. Who owns what (read this before debugging position bugs)

Position ownership is split, and most confusing behaviour comes from
forgetting which side owns a unit at a given moment:

- **Patrol engine (`frontend/src/patrol.js`)** owns the position of any unit
  *not* committed to a call. It ticks at 5 Hz, moves units by distance along
  cached beat geometry, and heartbeats to the server every 6 s.
- **Dispatch animation (`App.jsx`)** owns a unit from the moment it's
  dispatched until it's cleared. `patrol.suspend(unitId)` hands it over;
  `patrol.releaseToService(unitId, position)` hands it back.
- **Backend** owns *state*, never live position. `updatePosition` explicitly
  ignores heartbeats for committed units so a late packet can't put a unit
  back on patrol mid-call.
- **`refreshResponders()`** merges rather than replaces, for the same reason:
  a plain overwrite would yank patrolling units back to their last heartbeat.

Beat geometry is fetched once per beat (7 OSRM requests at startup, spaced
250 ms apart) and reused for the whole session. If OSRM is unreachable, beats
fall back to straight lines between waypoints — units keep moving, they just
cut across blocks.

---

## 5. Open items

**1. Geocode the stations before you show this to anyone who knows
Blacksburg.** The addresses are public record and correct. Some coordinates
are street-level *estimates* derived from those addresses, flagged
`"precision": "approximate"` — Station 3 on Hubbard St and Station 5 on
Progress St NW are the two most likely to sit a block or two off. Fix:

```
node tools/geocode-stations.mjs --check   # report drift, write nothing
node tools/geocode-stations.mjs           # rewrite with OSM coordinates
```

It geocodes against OpenStreetMap/Nominatim at 1 req/s, rewrites
`stations.json`, and stamps each record with the OSM object it matched.
Takes about 15 seconds. Restart the backend afterward.

**2. OSRM is the free public demo server.** Seven beat routes at startup plus
one per dispatch is nothing, but it's rate limited and not for production.
Swap in your own OSRM or a commercial API before this goes anywhere real.

**3. Patrol runs per browser.** Two tabs simulate two independent patrols
that each heartbeat to the same server, so positions will fight. Fine for one
dispatcher at one console; if you need multi-client, move the simulation into
a backend `@Scheduled` tick and have clients render rather than simulate.

**4. State is still in memory.** Restart resets every unit to its station.

**5. Beat waypoints are hand-picked intersections.** They're real, but they
aren't derived from call density or agency beat maps. If BPD publishes actual
beat boundaries, that's a drop-in replacement for `beats.json`.

---

## 6. Verifying it works (about five minutes)

1. Start backend and frontend. Within ~5 s of load, the three cruisers should
   be moving along roads and the dashed beat lines should appear. If beats
   render as straight lines between a handful of points, OSRM didn't answer.
2. Watch a cruiser reach a waypoint with a dwell — it should stop, show
   "Stationary post" on the unit board, and move off again.
3. Confirm the ambulances sit still at a post, then reposition, rather than
   circling. Confirm the engines don't move at all at first.
4. Go on duty, open a fire call, dispatch an engine. The other engine should
   start moving up to the committed engine's station, and the call transcript
   should log the move-up.
5. Let the unit arrive. It should read "On scene · clears in Ns", stay
   unavailable during that, then drive back to quarters on real roads.
6. Dispatch a cruiser mid-beat and check the route starts where the marker
   is, not where the station is.
7. `curl localhost:3001/api/responders` while a cruiser patrols — `lat`/`lng`
   should change every few seconds and `status` should read `PATROLLING`.

---

## 7. File map

**New — backend**
```
resources/gridline/stations.json    facilities (public addresses + sources)
resources/gridline/beats.json       beats, EMS posts, fire districts
resources/gridline/fleet.json       unit roster
Station.java, Beat.java, FleetUnit.java, UnitStatus.java
StationRegistry.java, BeatRegistry.java
CoverageService.java                move-up logic
FleetController.java                position heartbeat endpoint
```

**Changed — backend**
```
Responder.java        status/station/beat fields; busy is now derived
ResponderStore.java   loads fleet.json; status transitions; position sync
DispatchController.java  live-position ETAs, coverage directives, clear
DispatchDtos.java     CoverageDirective, ClearRequest, PositionBatch
MapDataController.java   /api/stations, /api/beats
```

**New — frontend**
```
src/patrol.js                    the patrol engine
src/components/FleetPanel.jsx    unit board with statuses and Clear
```

**Changed — frontend**
```
src/routing.js        multi-waypoint routes, distance interpolation, snapping
src/api.js            stations, beats, clear, position sync
src/App.jsx           patrol wiring, coverage, on-scene→clear lifecycle
src/components/MapView.jsx   station markers, beat lines, status styling, legend
```

**New — tooling**
```
tools/geocode-stations.mjs    refresh station coordinates from OpenStreetMap
```
