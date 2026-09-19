import { useEffect, useState } from 'react';

// The unit board. Every unit is always somewhere in a state — patrolling,
// posted, in quarters, committed to a call — and this is where the dispatcher
// reads that at a glance and clears a unit early if the scene wraps up.

const TYPE_COLOR = { police: 'var(--police)', fire: 'var(--fire)', medical: 'var(--medical)' };
const TYPE_ICON = { police: '🚓', fire: '🚒', medical: '🚑' };

const STATUS_COLOR = {
  EN_ROUTE: 'var(--warning)',
  ON_SCENE: 'var(--danger)',
  PATROLLING: 'var(--status)',
  REPOSITIONING: 'var(--status)',
  POSTED: 'var(--ink-secondary)',
  IN_QUARTERS: 'var(--ink-muted)',
  COVERING: 'var(--accent)',
  RETURNING: 'var(--ink-secondary)'
};

const FALLBACK_LABEL = {
  EN_ROUTE: 'En route',
  ON_SCENE: 'On scene',
  PATROLLING: 'On patrol',
  REPOSITIONING: 'Repositioning',
  POSTED: 'Posted',
  IN_QUARTERS: 'In quarters',
  COVERING: 'Covering',
  RETURNING: 'Returning to service'
};

export default function FleetPanel({ responders = [], stations = [], dispatches = {}, onClearUnit }) {
  const [now, setNow] = useState(Date.now());

  // Only ticks while something is actually on scene counting down.
  const hasCountdown = Object.values(dispatches).some(d => d.clearsAt);
  useEffect(() => {
    if (!hasCountdown) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasCountdown]);

  const stationName = (id) => stations.find(s => s.id === id)?.name || '';

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12, flexShrink: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8, letterSpacing: 0.4 }}>
        UNITS ({responders.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' }}>
        {responders.map(unit => {
          const dispatch = dispatches[unit.id];
          const status = dispatch
            ? (dispatch.status === 'On scene' ? 'ON_SCENE' : 'EN_ROUTE')
            : (unit.status || 'PATROLLING');
          const label = dispatch
            ? dispatch.status
            : (unit.statusLabel || FALLBACK_LABEL[status] || status);
          const secondsLeft = dispatch?.clearsAt ? Math.max(0, Math.round((dispatch.clearsAt - now) / 1000)) : null;

          return (
            <div
              key={unit.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
                borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--line)'
              }}
            >
              <span style={{ fontSize: 13 }}>{TYPE_ICON[unit.type] || '●'}</span>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: TYPE_COLOR[unit.type] || 'var(--ink)' }}>
                  {unit.id}
                  {unit.callsign && (
                    <span style={{ fontWeight: 500, color: 'var(--ink-muted)', fontSize: 11 }}> · {unit.callsign}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 11, color: STATUS_COLOR[status] || 'var(--ink-secondary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {label}
                  {secondsLeft !== null && ` · clears in ${secondsLeft}s`}
                </div>
                {!dispatch && unit.homeStationId && (
                  <div style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{stationName(unit.homeStationId)}</div>
                )}
              </div>

              {dispatch && dispatch.status === 'On scene' && onClearUnit && (
                <button
                  onClick={() => onClearUnit(unit.id, unit.lat, unit.lng)}
                  style={{
                    height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
                    border: '1px solid var(--status)', background: 'var(--status-tint)', color: 'var(--status)'
                  }}
                >Clear</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
