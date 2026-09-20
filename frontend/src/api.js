// In dev this is empty and Vite's proxy (vite.config.js) forwards /api and
// /notes to the local backend. In production, set VITE_API_BASE at build
// time to the backend's real URL (e.g. https://api.gridline.wiki) since
// the frontend on gridline.wiki and the backend won't share an origin.
const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function getIntersections() {
  const res = await fetch(`${API_BASE}/api/intersections`);
  if (!res.ok) throw new Error('Failed to load intersections');
  return res.json();
}

export async function getResponders() {
  const res = await fetch(`${API_BASE}/api/responders`);
  if (!res.ok) throw new Error('Failed to load responders');
  return res.json();
}

// Real police, fire, rescue and hospital facilities, with the published
// address each coordinate was derived from.
export async function getStations() {
  const res = await fetch(`${API_BASE}/api/stations`);
  if (!res.ok) throw new Error('Failed to load stations');
  return res.json();
}

// Patrol beats, EMS post rotations and fire districts — the plan the client
// turns into real driving routes via OSRM.
export async function getBeats() {
  const res = await fetch(`${API_BASE}/api/beats`);
  if (!res.ok) throw new Error('Failed to load beats');
  return res.json();
}

export async function getMapConfig() {
  const res = await fetch(`${API_BASE}/api/map-config`);
  if (!res.ok) throw new Error('Failed to load map config');
  return res.json();
}

// Dispatches the specific units the dispatcher selected — no auto-assignment.
// Returns { dispatched: [...], errors: [...] }; errors covers units that
// became unavailable between being shown in the UI and being dispatched.
export async function dispatch(code, unitIds) {
  const res = await fetch(`${API_BASE}/api/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, unitIds })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Dispatch failed');
  return data;
}

export async function arrive(unitId, lat, lng) {
  const res = await fetch(`${API_BASE}/api/dispatch/${encodeURIComponent(unitId)}/arrive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
  if (!res.ok) throw new Error('Failed to free unit');
  return res.json();
}

// Back in service. Until this is called the unit stays committed to the call,
// so the board shows what's actually tied up rather than freeing a unit the
// moment it pulls onto the scene.
export async function clearUnit(unitId, lat, lng) {
  const res = await fetch(`${API_BASE}/api/dispatch/${encodeURIComponent(unitId)}/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
  if (!res.ok) throw new Error('Failed to clear unit');
  return res.json();
}

// Heartbeat for units moving under their own steam (patrol, post moves,
// familiarization laps) so server-side ETAs measure from where units really are.
export async function syncPositions(positions) {
  const res = await fetch(`${API_BASE}/api/responders/positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positions })
  });
  if (!res.ok) throw new Error('Failed to sync positions');
  return res.json();
}

// Returns either { agentId } (public agent) or { signed_url } (private
// agent) — whichever the backend is configured for. Call this right
// before starting a voice call; signed URLs are short-lived.
export async function getElevenLabsSession() {
  const res = await fetch(`${API_BASE}/api/elevenlabs/session`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not start voice session');
  return data;
}

export async function getCallNotes(code) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error('Failed to load call notes');
  return res.json();
}

// --- Citizen report page -----------------------------------------------
// These three are the entire surface the public report page touches. It
// never calls getResponders/getStations/getBeats/getIntersections, so it
// has nothing to leak even if someone reads its network traffic.

export async function submitCitizenReport({ lat, lng, type, message }) {
  const res = await fetch(`${API_BASE}/api/citizen-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, type, message })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not send your location');
  return data;
}

export async function updateCitizenReportLocation(id, lat, lng) {
  const res = await fetch(`${API_BASE}/api/citizen-reports/${encodeURIComponent(id)}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not update your location');
  return data;
}

// Dispatcher-side only: polled from App.jsx to pull new citizen reports
// onto the call board. The citizen page itself never calls this.
export async function getCitizenReports() {
  const res = await fetch(`${API_BASE}/api/citizen-reports`);
  if (!res.ok) throw new Error('Failed to load citizen reports');
  return res.json();
}
