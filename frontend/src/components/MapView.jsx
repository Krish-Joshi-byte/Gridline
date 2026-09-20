import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// OpenFreeMap: free vector tiles, no API key, no rate limit, no registration —
// same "free forever" deal as the CARTO raster tiles this replaces, but GPU
// vector rendering instead of stitched PNGs (smooth continuous zoom, crisp
// labels at any zoom level, optional 3D building tilt via right-click drag).
// Swap the last path segment for 'liberty' (colorful) or 'positron' (light)
// if you want a different look — all three are OpenFreeMap/no-key.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

const TYPE_COLOR = { police: '#4c8dff', fire: '#ff6a4c', medical: '#35c98a' };
const TYPE_ICON = { police: '🚓', fire: '🚒', medical: '🚑' };

const ROUTES_SOURCE_ID = 'unit-routes';
const ROUTES_LAYER_ID = 'unit-routes-line';
const BEATS_SOURCE_ID = 'patrol-beats';
const BEATS_LAYER_ID = 'patrol-beats-line';

const STATION_COLOR = { police: '#4c8dff', fire: '#ff6a4c', medical: '#35c98a', hospital: '#b98cf5' };
const STATION_GLYPH = { police: 'PD', fire: 'FD', medical: 'EMS', hospital: 'H' };

// A unit that's in quarters or posted sits quieter on the map than one that's
// rolling, so a glance at the board tells you what's actually moving.
const DIMMED_STATUSES = new Set(['IN_QUARTERS', 'POSTED']);

function stationMarkerEl(station) {
  const color = STATION_COLOR[station.type] || '#9aa7bd';
  const el = document.createElement('div');
  el.style.cssText = `
    min-width:30px;height:22px;padding:0 6px;border-radius:5px;
    background:rgba(10,14,20,0.92);border:1.5px solid ${color};
    display:flex;align-items:center;justify-content:center;cursor:default;
    box-shadow:0 1px 6px rgba(0,0,0,0.5);
  `;
  el.innerHTML = `<span style="font-size:10px;font-weight:800;letter-spacing:0.4px;color:${color};">${
    STATION_GLYPH[station.type] || 'STA'
  }</span>`;
  return el;
}

function beatsToGeoJSON(beatGeometry, beatMeta) {
  return {
    type: 'FeatureCollection',
    features: Object.entries(beatGeometry || {})
      .filter(([, coords]) => coords && coords.length > 1)
      .map(([beatId, coords]) => ({
        type: 'Feature',
        properties: {
          beatId,
          beatType: (beatMeta && beatMeta[beatId]) || 'police'
        },
        geometry: { type: 'LineString', coordinates: coords.map(([lat, lng]) => [lng, lat]) }
      }))
  };
}

function unitMarkerEl(type) {
  const color = TYPE_COLOR[type] || '#9aa7bd';
  const el = document.createElement('div');
  el.style.cssText = `
    width:26px;height:26px;border-radius:50%;
    background:${color}22;display:flex;align-items:center;justify-content:center;
    border:2px solid ${color};box-shadow:0 0 0 2px rgba(0,0,0,0.35);cursor:default;
  `;
  el.innerHTML = `<span style="font-size:13px;line-height:1;">${TYPE_ICON[type] || '●'}</span>`;
  return el;
}

function callMarkerEl(active) {
  const color = active ? '#3b7cf6' : '#9aa7bd';
  const size = active ? 16 : 10;
  const el = document.createElement('div');
  el.style.cssText = `
    width:${size}px;height:${size}px;border-radius:50%;
    background:${color};border:2px solid #0a0e14;cursor:pointer;
    ${active ? `box-shadow:0 0 0 6px ${color}33;` : ''}
  `;
  return el;
}

function routesToGeoJSON(routes) {
  return {
    type: 'FeatureCollection',
    features: Object.entries(routes || {})
      .filter(([, coords]) => coords && coords.length > 1)
      .map(([unitId, coords]) => ({
        type: 'Feature',
        properties: { unitId },
        // MapLibre/GeoJSON wants [lng, lat]; our coords are [lat, lng].
        geometry: { type: 'LineString', coordinates: coords.map(([lat, lng]) => [lng, lat]) }
      }))
  };
}

export default function MapView({
  center,
  intersections,
  responders,
  activePin,
  routes,          // { [unitId]: [[lat,lng], ...] }
  stations = [],
  beatGeometry = {},   // { [beatId]: [[lat,lng], ...] } — real routed beats
  beatTypes = {},      // { [beatId]: 'police' | 'fire' | 'medical' }
  onIntersectionClick,
  cityLabel = 'Blacksburg, VA · 24060'
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const intersectionMarkersRef = useRef(new Map()); // code -> maplibregl.Marker
  const responderMarkersRef = useRef(new Map());     // id -> maplibregl.Marker
  const stationMarkersRef = useRef(new Map());       // id -> maplibregl.Marker
  const [ready, setReady] = useState(false);
  const [showBeats, setShowBeats] = useState(true);
  const [showStations, setShowStations] = useState(true);

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [center[1], center[0]],
      zoom: 14,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      // Beats go in first so live dispatch routes always draw on top of them.
      map.addSource(BEATS_SOURCE_ID, { type: 'geojson', data: beatsToGeoJSON({}, {}) });
      map.addLayer({
        id: BEATS_LAYER_ID,
        type: 'line',
        source: BEATS_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'beatType'],
            'police', '#4c8dff',
            'fire', '#ff6a4c',
            'medical', '#35c98a',
            '#9aa7bd'
          ],
          'line-width': 2,
          'line-opacity': 0.35,
          'line-dasharray': [2, 2]
        }
      });

      map.addSource(ROUTES_SOURCE_ID, { type: 'geojson', data: routesToGeoJSON({}) });
      map.addLayer({
        id: ROUTES_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b7cf6', 'line-width': 3, 'line-opacity': 0.7 }
      });
      setReady(true);
    });

    return () => {
      intersectionMarkersRef.current.forEach(m => m.remove());
      intersectionMarkersRef.current.clear();
      responderMarkersRef.current.forEach(m => m.remove());
      responderMarkersRef.current.clear();
      stationMarkersRef.current.forEach(m => m.remove());
      stationMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Intentionally only on mount — `center` only sets the *initial* view,
    // matching the previous Leaflet <MapContainer center> behavior. Panning
    // afterwards is driven by `activePin` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Intersection / call markers.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const live = new Set();

    for (const pt of intersections) {
      live.add(pt.code);
      const active = activePin?.code === pt.code;
      let marker = intersectionMarkersRef.current.get(pt.code);
      if (!marker) {
        const el = callMarkerEl(active);
        el.addEventListener('click', () => onIntersectionClick && onIntersectionClick(pt.code));
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
          .setText(pt.name || pt.code);
        el.addEventListener('mouseenter', () => popup.setLngLat([pt.lng, pt.lat]).addTo(map));
        el.addEventListener('mouseleave', () => popup.remove());
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([pt.lng, pt.lat])
          .addTo(map);
        intersectionMarkersRef.current.set(pt.code, marker);
      } else {
        marker.setLngLat([pt.lng, pt.lat]);
        const el = marker.getElement();
        const size = active ? 16 : 10;
        const color = active ? '#3b7cf6' : '#9aa7bd';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.background = color;
        el.style.boxShadow = active ? `0 0 0 6px ${color}33` : 'none';
      }
    }

    for (const [code, marker] of intersectionMarkersRef.current) {
      if (!live.has(code)) {
        marker.remove();
        intersectionMarkersRef.current.delete(code);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, intersections, activePin, onIntersectionClick]);

  // Station markers: police HQ, both fire stations, the rescue squad, and the
  // receiving hospital. Positions come from the backend's public-address data.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const live = new Set();

    for (const station of stations) {
      live.add(station.id);
      let marker = stationMarkersRef.current.get(station.id);
      if (!marker) {
        const el = stationMarkerEl(station);
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 })
          .setText(`${station.name} · ${station.address || ''}`.trim());
        el.addEventListener('mouseenter', () => popup.setLngLat([station.lng, station.lat]).addTo(map));
        el.addEventListener('mouseleave', () => popup.remove());
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([station.lng, station.lat])
          .addTo(map);
        marker.getElement().style.zIndex = 800;
        stationMarkersRef.current.set(station.id, marker);
      } else {
        marker.setLngLat([station.lng, station.lat]);
      }
      marker.getElement().style.display = showStations ? 'flex' : 'none';
    }

    for (const [id, marker] of stationMarkersRef.current) {
      if (!live.has(id)) {
        marker.remove();
        stationMarkersRef.current.delete(id);
      }
    }
  }, [ready, stations, showStations]);

  // Responder (unit) markers.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const live = new Set();

    for (const r of responders) {
      live.add(r.id);
      let marker = responderMarkersRef.current.get(r.id);
      if (!marker) {
        const el = unitMarkerEl(r.type);
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
          .setText(`${r.id} · ${r.type}`);
        el.addEventListener('mouseenter', () => popup.setLngLat([r.lng, r.lat]).addTo(map));
        el.addEventListener('mouseleave', () => popup.remove());
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([r.lng, r.lat])
          .addTo(map);
        marker.getElement().style.zIndex = 1000;
        responderMarkersRef.current.set(r.id, marker);
      } else {
        marker.setLngLat([r.lng, r.lat]);
      }

      // Status is carried by the marker itself: committed units read bright and
      // ringed, units sitting in quarters or on post fade back.
      const el = marker.getElement();
      const committed = r.status === 'EN_ROUTE' || r.status === 'ON_SCENE';
      el.style.opacity = DIMMED_STATUSES.has(r.status) ? '0.55' : '1';
      el.style.boxShadow = committed
        ? `0 0 0 3px ${(TYPE_COLOR[r.type] || '#9aa7bd')}55`
        : '0 0 0 2px rgba(0,0,0,0.35)';
    }

    for (const [id, marker] of responderMarkersRef.current) {
      if (!live.has(id)) {
        marker.remove();
        responderMarkersRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, responders]);

  // Dispatch routes.
  useEffect(() => {
    if (!ready) return;
    const source = mapRef.current.getSource(ROUTES_SOURCE_ID);
    if (source) source.setData(routesToGeoJSON(routes));
  }, [ready, routes]);

  // Patrol beats / post rotations / fire districts, as routed road geometry.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const source = map.getSource(BEATS_SOURCE_ID);
    if (source) source.setData(beatsToGeoJSON(beatGeometry, beatTypes));
    if (map.getLayer(BEATS_LAYER_ID)) {
      map.setLayoutProperty(BEATS_LAYER_ID, 'visibility', showBeats ? 'visible' : 'none');
    }
  }, [ready, beatGeometry, beatTypes, showBeats]);

  // Keep the view gently centered on the active call, without fighting the
  // dispatcher if they've panned/zoomed manually — same behavior as the old
  // Leaflet <AutoPan> helper.
  useEffect(() => {
    if (!ready || !activePin) return;
    mapRef.current.panTo([activePin.lng, activePin.lat], { animate: true, duration: 600 });
  }, [ready, activePin]);

  return (
    // zIndex: 0 here isn't decorative — it's what makes this div its own
    // stacking context. Without it, `position: relative` alone doesn't
    // contain descendants: the high z-index values set inline on map
    // markers below (up to 1000, so unit icons draw over stations) would
    // otherwise be compared directly against sibling UI like CallPanel
    // (zIndex 600) and win, drawing vehicle icons on top of the call
    // panel's text instead of staying confined to the map itself.
    <div style={{ position: 'relative', height: '100%', zIndex: 0 }}>
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 500, background: 'rgba(10,14,20,0.85)',
        border: '1px solid var(--line-strong)', borderRadius: 8, padding: '5px 12px',
        fontSize: 12, fontWeight: 600, letterSpacing: 0.3, color: 'var(--ink)'
      }}>
        {cityLabel}
      </div>

      <div style={{
        position: 'absolute', bottom: 10, left: 10, zIndex: 500, background: 'rgba(10,14,20,0.85)',
        border: '1px solid var(--line-strong)', borderRadius: 8, padding: '8px 10px',
        fontSize: 11, color: 'var(--ink-secondary)', display: 'flex', flexDirection: 'column', gap: 6
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <LegendSwatch color="#4c8dff" label="Police" />
          <LegendSwatch color="#ff6a4c" label="Fire" />
          <LegendSwatch color="#35c98a" label="EMS" />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <ToggleChip active={showBeats} onClick={() => setShowBeats(v => !v)} label="Beats" />
          <ToggleChip active={showStations} onClick={() => setShowStations(v => !v)} label="Stations" />
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%', borderRadius: 10, background: '#0a0e14', overflow: 'hidden' }}
      />
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 14, height: 0, borderTop: `2px dashed ${color}`, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function ToggleChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 22, padding: '0 9px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
        border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line-strong)'),
        background: active ? 'var(--accent-tint)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--ink-muted)'
      }}
    >{label}</button>
  );
}
