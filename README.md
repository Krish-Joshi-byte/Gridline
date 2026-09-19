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
export ELEVENLABS_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxxx  # needed for the in-app voice call
export ELEVENLABS_API_KEY=your_api_key                 # only if the agent is private
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
Spring Boot app. On Render specifically: it has no native Java runtime,
so the backend deploys as a Docker image — `backend/Dockerfile` (already
in this repo) handles that, a multi-stage build that compiles with
Maven and runs on a slim JRE. Steps:

1. From the Render dashboard: **New +** → **Web Service**.
2. Connect your GitHub repo and pick this one.
3. **Root Directory**: `backend` (this is a monorepo — Render needs to
   know the Dockerfile lives in the `backend` subfolder, not the repo root).
4. Render should auto-detect the Dockerfile and offer the **Docker**
   runtime — confirm that's selected rather than trying to guess a
   native build/start command.
5. Instance type: **Free** is fine to start.
6. Under **Environment Variables**, add anything from
   `application.properties` you want to override — e.g.
   `ELEVENLABS_WEBHOOK_SECRET` if you're using the webhook,
   `ELEVENLABS_AGENT_ID` (and `ELEVENLABS_API_KEY` if the agent is
   private) for the in-app voice call, or `APP_CORS_ALLOWED_ORIGINS` if
   you need to allow an origin beyond the `gridline.wiki` default.
7. Click **Create Web Service**. Render builds the Docker image and
   deploys it — first build usually takes a few minutes.
8. Once it's live you'll get a URL like
   `https://gridline-backend.onrender.com`. That's the value that goes
   into `VITE_API_BASE` in the next step.

One thing worth knowing: Render's free tier spins a service down after
15 minutes of inactivity, so the first request after a quiet period can
take 30–60 seconds while it wakes back up. Fine for a demo; worth a
paid instance if that latency matters later.

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



- **Real map**: the frontend renders an actual [MapLibre GL JS](https://maplibre.org/)
  vector map, tiled by [OpenFreeMap](https://openfreemap.org/) (free, no API
  key, same "no auth needed" deal as the OSRM routing below) centered on
  **Blacksburg, VA 24060**. Unlike raster tile libraries (Leaflet), MapLibre
  renders on the GPU — continuous smooth zoom, crisp labels at any zoom
  level, and 3D building tilt via right-click-drag. Intersections and
  responder start positions are real lat/lng points around town (Main St &
  College Ave, the Blacksburg PD/Fire/Rescue stations, etc.) — see
  `IntersectionRegistry.java` and `ResponderStore.java` on the backend. The
  style is set in `frontend/src/components/MapView.jsx` (`MAP_STYLE`) — swap
  in OpenFreeMap's `liberty` (colorful) or `positron` (light) style there if
  you want a different look; all three are free and keyless.
- **Road-following dispatch**: when a unit is dispatched, the frontend
  (`src/routing.js`) asks the public [OSRM](https://project-osrm.org/)
  driving API for a real route between the unit and the call, and
  animates the unit marker along that road-network polyline instead of
  cutting a straight line across the map. If the routing service is
  unreachable it falls back to a straight line so the demo still works.
  The backend still returns a straight-line ETA (haversine distance /
  average urban speed) as a baseline; once a real route comes back, the
  frontend uses OSRM's own routed duration instead.
- **Stations from public data**: police HQ, both fire stations, the rescue
  squad and the receiving hospital come from
  `backend/src/main/resources/gridline/stations.json`, each with the
  published address it was derived from and a `precision` flag. They show
  on the map as labelled badges (PD / FD / EMS / H). Run
  `node tools/geocode-stations.mjs` to replace the estimated coordinates
  with OpenStreetMap geocodes — see `HANDOFF.md`.
- **Patrol, posts and quarters**: units aren't parked between calls. Each
  service runs the pattern it actually uses, configured in
  `gridline/beats.json`:
  police run continuous preventive patrol around three beats (pausing at
  waypoints flagged as stationary posts), EMS rotates between posts
  (system status management — ambulances post, they don't cruise), and
  fire apparatus sits in quarters, rolling only for calls, move-ups, or a
  periodic district familiarization lap. Beat waypoints are real
  intersections; the line a unit follows is the OSRM driving route through
  them, so patrols track actual streets. Toggle the dashed beat overlay
  with the **Beats** chip on the map.
- **Move-ups**: commit an engine and the other station's engine relocates
  to cover it; commit a medic and the other shifts to the post covering
  that district. `CoverageService` produces the directive, the client
  carries it out, and the call transcript logs it.
- **Committed until cleared**: arriving on scene no longer frees a unit.
  It stays unavailable until it clears — automatically after 90 seconds or
  via **Clear** on the unit board — then drives back to its beat or
  quarters on real roads. Patrolling units heartbeat their position every
  6 seconds so dispatch ETAs are measured from where a unit actually is.
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
  for whatever call is currently open, polling every few seconds so a
  note that lands after the call ends still shows up.
- **Live voice call, in the browser**: opening a call in `CallPanel`
  now has a real "🎙 Start voice call" button, not just the scripted
  question buttons. It uses ElevenLabs' `@elevenlabs/react` SDK to open
  an actual mic-based voice conversation with your ElevenLabs agent —
  so instead of clicking through canned Q&A, you can literally talk to
  the AI as the caller. Each turn of that real conversation streams
  into the same transcript UI. When the call ends, ElevenLabs' post-call
  webhook (above) delivers the summary the normal way.

  **Setup:**
  1. Create a Conversational AI agent in the
     [ElevenLabs dashboard](https://elevenlabs.io/app/agents), with a
     system prompt that plays a 911 dispatcher gathering details about
     an emergency (severity, location, whether the caller is safe,
     etc). Point its post-call webhook at `/webhooks/elevenlabs/post-call`
     as already described above.
  2. In the agent's **Advanced** settings, add dynamic variables named
     `code`, `incident_type`, `location`, and `caller_name` — the
     frontend passes these in automatically for every call so the
     agent can reference the intersection code the dispatcher is
     looking at (e.g. "you're speaking about incident {{code}} near
     {{location}}").
  3. Set `ELEVENLABS_AGENT_ID` on the backend to that agent's ID.
  4. Leave the agent **public** for the easiest local demo (no auth) —
     or flip it to **private** in its Security settings and also set
     `ELEVENLABS_API_KEY` on the backend; either way the backend's new
     `GET /api/elevenlabs/session` endpoint hands the frontend whatever
     it needs (an agent ID, or a short-lived signed URL) without ever
     putting the API key in the browser.
  5. `npm install` in `frontend/` to pick up the new `@elevenlabs/react`
     dependency, then browsers will prompt for microphone access the
     first time someone clicks "Start voice call".

## Known shortcuts for the demo

- All state (responders, call notes) lives in memory on the backend and
  resets on restart.
- No auth on the API endpoints, and CORS is wide open (`origins = "*"`)
  — fine for a demo, not for anything beyond it.
- Station addresses are public record, but some coordinates are
  street-level estimates from those addresses rather than geocodes — they
  are flagged `"precision": "approximate"` in `stations.json`. Run
  `node tools/geocode-stations.mjs` (about 15 seconds, then restart the
  backend) before showing this to anyone who knows Blacksburg.
  Intersection coordinates are likewise approximate — accurate enough to
  sit on the real road network for routing, not surveyed.
- The patrol simulation runs in the browser, so two open tabs simulate two
  independent patrols that both heartbeat to the same server. Fine for one
  console; move the tick to the backend if you need more.
- Routing depends on OSRM's free public demo server, which is rate
  limited and not meant for production traffic — swap in your own OSRM
  instance or a commercial routing API (Mapbox, Google, etc.) before
  this goes anywhere beyond a demo.
- The agent's system prompt and full ElevenLabs dashboard setup steps
  are the same as in the earlier Python/Java call-notes-only versions —
  ask if you want that written back into this README.
