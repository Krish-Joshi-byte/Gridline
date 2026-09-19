# Results — stations & patrol routes

Scope of this pass: add the real police station (and the other public safety
facilities) from public map data, and make police, fire and EMS units behave
like units rather than parked pins between calls.

---

## Outcome

| Asked for | Delivered | Status |
|---|---|---|
| Police station added from public data | BPD HQ, 200 Clay St SE, with source attribution; plus BVFD Stations 1 and 3, BVRS Station 5, LewisGale Hospital Montgomery | Done — coordinates need one geocode run, see below |
| Police cars follow normal patrol routes | 3 beats, continuous preventive patrol, stationary posts with dwell, routed over the OSM road network | Done |
| Same for fire brigades | In quarters + district familiarization laps + move-up to cover a vacated station | Done, modelled on real fire behaviour rather than copying patrol |
| Same for ambulances | System status management: post → hold → reposition, with move-up cover | Done, same reasoning |
| Handoff | `HANDOFF.md` | Done |
| Final results | this file | Done |

---

## What a shift looks like now

Load the app and, within about five seconds, three cruisers are moving along
Main, Prices Fork, Toms Creek, Patrick Henry and University City, each on its
own dashed beat. They stop for 30–60 seconds at the corners flagged as
stationary posts, then move off. Two ambulances sit at posts — Station 5,
N Main & Patrick Henry, S Main & University City, LewisGale — and reposition
between them every few minutes. Two engines don't move at all until something
happens.

Dispatch an engine to a structure fire and three things follow: the engine
routes to the call from its station, the *other* engine starts moving up to
cover the station it left, and the transcript logs the move-up. The engine
arrives, reads "On scene · clears in 90s", stays unavailable for that window,
then drives back to quarters on real streets rather than snapping back.

Dispatch a cruiser mid-beat and the route starts from where the marker is on
screen — not from the station it started the shift at.

---

## Design decision worth knowing about

"Do the same for fire brigades and ambulances" had an honest answer and a
literal one. Fire apparatus does not patrol: engines sit in quarters and roll
for calls, move-ups, or familiarization. Ambulances don't cruise either; they
post, and move between posts as coverage shifts. Copying the police loop onto
all three would have looked busier and been wrong.

So all three got a between-calls behaviour, but the behaviour each service
actually uses. The mode is a data field — set `"mode": "PATROL_LOOP"` on the
fire or EMS beats in `beats.json` and they'll circle like cruisers, no code
change, if the demo wants motion over accuracy.

---

## Verification

| Check | Result |
|---|---|
| JSON data files parse | Pass — `stations.json`, `beats.json`, `fleet.json` |
| Plain JS parses (`node --check`) | Pass — `patrol.js`, `routing.js`, `api.js`, `tools/geocode-stations.mjs` |
| JSX parses (`tsc --jsx preserve`) | Pass — no syntax errors across all components |
| Java compiles | **Not run** — no Maven and no network in the build sandbox |
| App run end to end | **Not run** — same reason |

The Java is reviewed by inspection only. Run `mvn spring-boot:run` before
trusting it; `HANDOFF.md` §6 has a seven-step manual test that exercises
every new path in about five minutes.

---

## Before the next demo

1. **`node tools/geocode-stations.mjs`** — the station addresses are correct
   public record, but some coordinates are street-level estimates rather than
   geocodes. The script rewrites them from OpenStreetMap in about 15 seconds.
   Restart the backend afterwards. This is the one item that will be visible
   to anyone who knows the town.
2. OSRM is still the free public demo server — fine for this, not for
   production.
3. Patrol runs per browser tab; two tabs will fight over positions.
4. State is still in memory and resets on restart.

Full detail, file-by-file change map, and ownership rules for position state
are in `HANDOFF.md`.
