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

export async function getCallNotes(code) {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error('Failed to load call notes');
  return res.json();
}
