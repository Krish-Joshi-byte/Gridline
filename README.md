# Gridline — full stack (Java + React)

The complete hackathon build: a Java/Spring Boot backend (intersection
registry, dispatch logic, responder tracking, and the ElevenLabs
fallback-call webhook) plus a React frontend (live map, code entry,
dispatch status, AI call notes).

## Run the backend

Requires Java 17+ and Maven.

```
cd backend
export ELEVENLABS_WEBHOOK_SECRET=your_signing_secret   # optional for local demo
mvn spring-boot:run
```

Listens on `http://localhost:3001`.

## Run the frontend

Requires Node 18+.

```
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`. The dev server proxies `/api` and
`/notes` requests to the backend on port 3001 (see `vite.config.js`),
so the browser never has to deal with CORS during local development.

## How it fits together

- **Real map**: the frontend renders an actual [Leaflet](https://leafletjs.com/)
  map (OpenStreetMap/CARTO dark tiles) centered on **Blacksburg, VA
  24060**. Intersections and responder start positions are real
  lat/lng points around town (Main St & College Ave, the Blacksburg
  PD/Fire/Rescue stations, etc.) — see `IntersectionRegistry.java` and
  `ResponderStore.java` on the backend.
- **Road-following dispatch**: when a unit is dispatched, the frontend
  (`src/routing.js`) asks the public [OSRM](https://project-osrm.org/)
  driving API for a real route between the unit and the call, and
  animates the unit marker along that road-network polyline instead of
  cutting a straight line across the map. If the routing service is
  unreachable it falls back to a straight line so the demo still works.
  The backend still returns a straight-line ETA (haversine distance /
  average urban speed) as a baseline; once a real route comes back, the
  frontend uses OSRM's own routed duration instead.
- **Call queue**: going on duty generates a small queue of realistic
  911 calls tied to real Blacksburg intersections. Opening a call shows
  a live transcript you can build out with suggested follow-up
  questions, then dispatch the nearest available unit of the right
  type via `POST /api/dispatch`. When the animation finishes, the app
  calls `POST /api/dispatch/{unitId}/arrive` to free the unit up
  server-side.
- **AI fallback calls**: point an ElevenLabs Conversational AI agent's
  post-call webhook at `POST /webhooks/elevenlabs/post-call` on the
  backend. It extracts a code and a summary from the transcript and
  stores it. The React app's `CallNotesPanel` fetches `GET /notes/:code`
  for whatever call is currently open.

## Known shortcuts for the demo

- All state (responders, call notes) lives in memory on the backend and
  resets on restart.
- No auth on the API endpoints, and CORS is wide open (`origins = "*"`)
  — fine for a demo, not for anything beyond it.
- Intersection/station coordinates are approximate (accurate enough to
  sit on the real road network for routing), not surveyed addresses.
- Routing depends on OSRM's free public demo server, which is rate
  limited and not meant for production traffic — swap in your own OSRM
  instance or a commercial routing API (Mapbox, Google, etc.) before
  this goes anywhere beyond a demo.
- The agent's system prompt and full ElevenLabs dashboard setup steps
  are the same as in the earlier Python/Java call-notes-only versions —
  ask if you want that written back into this README.
