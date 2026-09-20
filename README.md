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

## Letting the AI operator actually dispatch units

Talking to the AI on the citizen report page's "Call Dispatch" button used
to only ever produce a transcript and a post-call summary — a human still
had to read it and click **Dispatch** on the console. Two things changed
that:

- **Automatic fallback (works with zero extra setup).** Once a citizen call
  ends, `WebhookController` reads the AI's summary, and if no unit is
  already responding to that call, it dispatches the nearest available
  unit of the inferred type itself (defaulting to police if the type
  couldn't be worked out). This happens a few seconds after the call ends
  — as soon as ElevenLabs' post-call webhook lands — not live during the
  conversation.
- **Live dispatch during the call (optional, needs a dashboard tool).** To
  have the AI actually commit a unit *while still on the phone* — so it can
  tell the caller "a cruiser is on its way, about 6 minutes out" — add a
  **Server Tool** to the same agent in the ElevenLabs dashboard:
  1. Agent → **Tools** → **Add tool** → **Server**.
  2. Method `POST`, URL `https://<your-backend>/api/elevenlabs/dispatch-tool`.
  3. Body parameters: `code` (string, the call's intersection code — tell
     the agent in its prompt to use the `{{code}}` dynamic variable it
     already receives) and `unit_type` (string enum: `police`, `fire`,
     `medical`).
  4. If you set `ELEVENLABS_TOOL_SECRET` on the backend, add a header on
     the tool named `x-gridline-tool-secret` with that same value.
  5. In the agent's system prompt, tell it to call this tool once it has
     confirmed the emergency type and location, and to relay whatever the
     tool responds with (`dispatched`, `unitId`/`callsign`, `etaMinutes`,
     or a `reason` it wasn't sent) back to the caller.

  Either way, the fallback still runs after the call ends — it just skips
  itself if the live tool already sent someone, so calls never end up with
  two units committed.

## Citizen report page

`/report` is a second, completely separate frontend page for the public —
distinct from the dispatcher console at `/`. It shares the API server but
none of the console's UI or data:

- It can only **send** a location (plus an optional emergency type and a
  short note) and **update** that same location later if the person
  moves. It never fetches responder positions, stations, beats, or any
  other call — those API calls simply aren't in its code, so there's
  nothing there to leak even by inspecting network traffic.
- The dispatcher console polls `GET /api/citizen-reports` every few
  seconds and adds any new one straight into the active call queue —
  it shows up like any other call, with the caller's real submitted
  location (not a random or snapped-to-nearest-intersection point).
  There's no "Start voice call" control on these (no phone line exists
  to bridge), just a free-text box to log what's said, same dispatch
  controls as every other call.
- New endpoints: `POST /api/citizen-reports` (create), `POST
  /api/citizen-reports/{id}/location` (update after moving), `GET
  /api/citizen-reports` (dispatcher poll — the citizen page itself
  never calls this).

Try it locally at `http://localhost:5173/report` in one tab while the
dispatcher console runs in another, on duty, at `http://localhost:5173/`.

**Worth knowing before this goes anywhere beyond a demo:** like every
other endpoint in this project, `GET /api/citizen-reports` has no
authentication — the citizen-facing *page* never calls it, but the
*endpoint* itself would answer anyone who requested it directly. Put an
API key or session check in front of it before treating "citizens can't
see each other's reports" as an actual security property rather than a
UI-level one.

## Operator hub and the Scan dashboard

The start screen still offers the same two choices. **Operator Console** still
asks for the password, but it no longer drops straight into the dispatcher
console — it opens the **operator hub**, a menu of three pages:

| Card | What it opens | Where it lives |
|---|---|---|
| Operator Dashboard | the dispatch console, unchanged | `src/App.jsx` |
| Scan Dashboard | Gridline Scan — floor plan in, walkable 3D model out | `src/ScanDashboard.jsx` + `public/scan/gridline-studio.html` |
| Volunteer | community volunteer posts (Police / EMS / Fire) and sign-ups | `src/VolunteerPage.jsx` + `src/components/Volunteer*.jsx` |

The start screen, hub and volunteer page share one look, taken from the
dispatcher console: `src/components/HomeShell.jsx` (top bar, map-toned canvas with a
faint grid and a slow location "ping", status strip), `HomeCard.jsx` (the destination
cards) and `src/home.css`. All colours come from the variables in `styles.css`, so a
change there restyles the dashboard and the home pages together. Red means emergency,
blue means operator tooling. The ping respects `prefers-reduced-motion`.

Routing is the `view` state in `src/main.jsx`
(`start | citizen | hub | operator | scan | volunteer`). Every page behind the
hub has a **‹ Menu** button; the hub has **Sign out**, which clears the password
flag and returns to the start screen.

**Leaving a page doesn't reset it.** The operator console and the scan dashboard
mount on first visit and are then hidden, not destroyed, when you go back to the
hub — so a dispatcher can check a building model mid-shift without losing their
call queue, unit assignments, patrol simulation or a live voice call, and the
scan studio keeps whatever model was loaded. Only **Sign out** tears them down
(it asks first if a dispatch session is running). Because browsers don't throttle
a hidden same-origin iframe, `ScanDashboard` also parks the studio's animation
loop while it's off-screen (`setFramePaused`) so a hidden 3D scene isn't rendering
behind the console all shift.

### The Scan dashboard

Gridline Scan is one self-contained HTML file — interface, floor-plan extractor,
renderer and three.js, **zero network requests**, no backend. It's served as a
static asset from `public/scan/` and shown in an iframe rather than merged into
the React app, because it injects global CSS resets and expects to own the whole
window. Floor plans are read with `FileReader` and processed in the browser tab;
nothing is uploaded anywhere. The host forces the studio's dark theme
(`data-theme="dark"`) so it matches the rest of Gridline whatever the OS setting.

**Updating the studio:** it's built in the separate `gridline-scan` project
(`node frontend/build-studio.js output/gridline-studio.html ...`). Copy the
resulting `gridline-studio.html` over `frontend/public/scan/gridline-studio.html`
and redeploy. No React changes are needed — the iframe just loads the new file.

### The Volunteer page

A volunteer program for the police, fire and EMS community-engagement teams,
merged in from the standalone `precinct-volunteer` app. It has two tabs over the
same posts (`src/VolunteerPage.jsx`):

- **Community feed** — what residents see: a blog-style feed of posts, each
  tagged **Police**, **EMS** or **Fire**, filterable by department and category,
  with an "Urgently need volunteers" banner for featured posts and a **Sign up**
  button on every post that still has room. Spots count down live; a full post
  can't be joined and the same email can't join the same post twice.
- **Manage posts** — what staff use: publish a post (department badge, picture
  URL, category, date/time, location, capacity), **Feature** it, **Copy invite**
  (an email/text draft to paste — nothing is sent automatically), see the
  sign-ups (name, email, phone, notes), or delete it along with its sign-ups.

Backend: `VolunteerController` (`/api/volunteer/*`) over `VolunteerStore`, which
holds every rule (validation, the capacity check that keeps two people from
taking the last spot, duplicate-email detection). Frontend calls are in
`src/api.js`; components are `VolunteerFeed`, `VolunteerAdmin`,
`VolunteerSignupModal` and `VolunteerBits`, styled by `src/volunteer.css`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/volunteer/events` | All posts, with live `registered` / `remaining` counts |
| POST | `/api/volunteer/events` | Publish a post (`faction`: `Police` \| `EMS` \| `Fire`) |
| PATCH | `/api/volunteer/events/{id}` | Partial update, e.g. `{"featured": true}` |
| DELETE | `/api/volunteer/events/{id}` | Delete a post and its sign-ups |
| POST | `/api/volunteer/register` | Sign up for a post |
| GET | `/api/volunteer/registrations?eventId=` | Sign-ups (personal data) |

**Storage.** Unlike the rest of the backend, volunteer data is not in-memory: it
is written to `events.json` and `registrations.json` after every change and
reloaded at startup. The folder is `volunteer.data-dir` (env
`VOLUNTEER_DATA_DIR`, default `./data/volunteer`, git-ignored). Six sample posts
are created the first time the backend runs with no `events.json`; deleting them
later does not bring them back. On a host with a disk that is wiped on deploy
(Render's free tier) set `VOLUNTEER_DATA_DIR` to a persistent volume, or
sign-ups are lost with every deploy.

**Before this holds real people's details:** the write routes and
`GET /api/volunteer/registrations` have no server-side authentication (same as
every other endpoint here), so anyone who can reach the API can publish, delete
or read volunteers' names, emails and phone numbers directly. The operator
password only hides the page. Also, the page is only reachable through the
operator hub, so residents can't use the sign-up flow yet, and the invite draft's
sign-up link points at the site root — a public route (like `/report`) is the
missing piece for both.

> **Same caveat as the rest of the operator side:** the password gate is client
> side and UI-level. `/scan/gridline-studio.html` is a plain public static file,
> so anyone who knows the URL can open it directly. That's harmless for the
> studio itself (it holds no data and uploads nothing), but don't treat the gate
> as access control.

## Known shortcuts for the demo

- All state (responders, call notes) lives in memory on the backend and
  resets on restart. (Volunteer posts and sign-ups are the exception — they
  are written to disk; see "The Volunteer page".)
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
