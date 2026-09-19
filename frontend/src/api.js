export async function getIntersections() {
  const res = await fetch('/api/intersections');
  if (!res.ok) throw new Error('Failed to load intersections');
  return res.json();
}

export async function getResponders() {
  const res = await fetch('/api/responders');
  if (!res.ok) throw new Error('Failed to load responders');
  return res.json();
}

export async function getMapConfig() {
  const res = await fetch('/api/map-config');
  if (!res.ok) throw new Error('Failed to load map config');
  return res.json();
}

export async function dispatch(code, type) {
  const res = await fetch('/api/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, type })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Dispatch failed');
  return data;
}

export async function arrive(unitId, lat, lng) {
  const res = await fetch(`/api/dispatch/${encodeURIComponent(unitId)}/arrive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
  if (!res.ok) throw new Error('Failed to free unit');
  return res.json();
}

export async function getCallNotes(code) {
  const res = await fetch(`/notes/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error('Failed to load call notes');
  return res.json();
}
