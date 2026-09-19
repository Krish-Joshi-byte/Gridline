import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

const TYPE_COLOR = { police: '#4c8dff', fire: '#ff6a4c', medical: '#35c98a' };
const TYPE_ICON = { police: '🚓', fire: '🚒', medical: '🚑' };

function unitIcon(type, busy) {
  const color = TYPE_COLOR[type] || '#9aa7bd';
  return divIcon({
    className: '',
    html: `<div style="
        width:26px;height:26px;border-radius:50%;
        background:${color}22;display:flex;align-items:center;justify-content:center;
        border:2px solid ${color};box-shadow:0 0 0 2px rgba(0,0,0,0.35);
      "><span style="font-size:13px;line-height:1;">${TYPE_ICON[type] || '●'}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function callIcon(active) {
  const color = active ? '#3b7cf6' : '#9aa7bd';
  return divIcon({
    className: '',
    html: `<div style="
        width:${active ? 16 : 10}px;height:${active ? 16 : 10}px;border-radius:50%;
        background:${color};border:2px solid #0a0e14;
        ${active ? 'box-shadow:0 0 0 6px ' + color + '33;' : ''}
      "></div>`,
    iconSize: [active ? 16 : 10, active ? 16 : 10],
    iconAnchor: [active ? 8 : 5, active ? 8 : 5]
  });
}

// Keeps the view gently centered on the active call without fighting the
// user if they've panned/zoomed manually.
function AutoPan({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.panTo(target, { animate: true, duration: 0.6 });
  }, [target, map]);
  return null;
}

export default function MapView({
  center,
  intersections,
  responders,
  activePin,
  routes,          // { [unitId]: [[lat,lng], ...] }
  onIntersectionClick,
  cityLabel = 'Blacksburg, VA · 24060'
}) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 500, background: 'rgba(10,14,20,0.85)',
        border: '1px solid var(--line-strong)', borderRadius: 8, padding: '5px 12px',
        fontSize: 12, fontWeight: 600, letterSpacing: 0.3, color: 'var(--ink)'
      }}>
        {cityLabel}
      </div>

      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%', borderRadius: 10, background: '#0a0e14' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />

        {intersections.map(pt => (
          <Marker
            key={pt.code}
            position={[pt.lat, pt.lng]}
            icon={callIcon(activePin?.code === pt.code)}
            eventHandlers={{ click: () => onIntersectionClick && onIntersectionClick(pt.code) }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>{pt.name || pt.code}</Tooltip>
          </Marker>
        ))}

        {Object.entries(routes || {}).map(([unitId, coords]) => (
          coords && coords.length > 1 && (
            <Polyline key={unitId} positions={coords} pathOptions={{ color: '#3b7cf6', weight: 3, opacity: 0.7 }} />
          )
        ))}

        {responders.map(r => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={unitIcon(r.type, r.busy)} zIndexOffset={1000}>
            <Tooltip direction="top" offset={[0, -14]} opacity={0.9}>{r.id} · {r.type}</Tooltip>
          </Marker>
        ))}

        <AutoPan target={activePin ? [activePin.lat, activePin.lng] : null} />
      </MapContainer>
    </div>
  );
}
