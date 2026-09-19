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

## Deploying the frontend to gridline.wiki

The frontend is a static Vite build — it doesn't need a Node server in
production, just somewhere to host static files and point the domain at.
The backend is a separate Spring Boot app and needs its own host (see
below); the two don't have to live on the same platform.

**1. Pick a static host for the frontend.** Any of these work well with
a custom domain, have a generous free tier, and deploy straight from a
git push:
- **Cloudflare Pages** — good default if you ever move the domain's DNS
  to Cloudflare too, since the domain and hosting end up in one place.
- **Vercel** or **Netlify** — equally simple, huge ecosystem, easiest if
  you're already using GitHub.

Whichever you pick, the setup is the same shape: connect the repo (or
drag-and-drop the `frontend` folder), set the build command to
`npm run build`, the output directory to `dist`, and add the domain
`gridline.wiki` (and usually `www.gridline.wiki`) in that project's
domain settings. Each host will give you either a CNAME target or an
apex/ALIAS record to add — you add that at whichever registrar you
bought `gridline.wiki` through, then wait for DNS to propagate
(usually minutes, sometimes a couple hours).

**2. Host the backend somewhere.** You don't have a platform for this
yet either — **Render** or **Railway** are the least fussy for a plain
Spring Boot app (point it at `backend/`, it detects the Maven build).
Once it's live you'll have a URL like `https://gridline-api.onrender.com`
— you can point a subdomain like `api.gridline.wiki` at it later, or
just use that URL directly.

> **If the deploy step fails with a Vite-version error** ("cannot be
> automatically configured... update the Vite version to at least
> 6.0.0"): Cloudflare's git integration tries to auto-configure the
> Cloudflare Vite plugin during `wrangler deploy`, which needs Vite 6+.
> `frontend/wrangler.jsonc` heads this off by declaring the project as a
> plain static-assets site up front, so Wrangler skips that
> auto-detection and just publishes `dist/` directly — no Vite upgrade
> needed. If you still see the error, confirm `wrangler.jsonc` made it
> into the repo and that the project's root directory in Cloudflare's
> build settings is set to `frontend`.

**3. Wire the frontend to the backend.** Copy `frontend/.env.example` to
`frontend/.env.production` and set:

```
VITE_API_BASE=https://<wherever-your-backend-ends-up>
```

Rebuild (`npm run build`) after setting this — Vite bakes env vars in
at build time, not runtime. Locally, leave `.env.production` out
entirely; `vite.config.js`'s dev proxy handles `/api` and `/notes`
automatically.

**4. Lock down CORS.** `backend/src/main/resources/application.properties`
already defaults `app.cors.allowed-origins` to `https://gridline.wiki`
(plus `www` and localhost for dev). If you add a staging URL or change
the domain, override it with the `APP_CORS_ALLOWED_ORIGINS` env var
(comma-separated) on whatever host runs the backend — no code change
needed.



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
