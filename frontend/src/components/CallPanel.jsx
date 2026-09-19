import { useEffect, useRef, useState } from 'react';
import CallNotesPanel from './CallNotesPanel.jsx';
import { haversineMeters } from '../routing.js';

const TYPE_LABEL = { police: 'Police', fire: 'Fire', medical: 'EMS' };
const TYPE_ORDER = ['police', 'fire', 'medical'];
const AVG_URBAN_SPEED_KMH = 40;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatEta(seconds) {
  if (seconds <= 0) return 'arriving now';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m} min ${s.toString().padStart(2, '0')}s`;
}

function initials(name) {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function estimateEtaMinutes(unit, call) {
  const distKm = haversineMeters([unit.lat, unit.lng], [call.lat, call.lng]) / 1000;
  return Math.max(1, Math.round((distKm / AVG_URBAN_SPEED_KMH) * 60));
}

export default function CallPanel({ call, allResponders, unitsForCall, onClose, onAskQuestion, onDispatchUnits }) {
  const [connected, setConnected] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const scrollRef = useRef(null);

  useEffect(() => {
    setConnected(0);
    setSelected(new Set());
    const t = setInterval(() => setConnected(c => c + 1), 1000);
    return () => clearInterval(t);
  }, [call.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [call.transcript.length]);

  const totalQuestions = call.questions.length;
  const askedTexts = new Set(call.transcript.filter(m => m.from === 'dispatcher').slice(1).map(m => m.text));
  const remaining = call.questions.filter(q => !askedTexts.has(q.q));

  const assignedIds = new Set(unitsForCall.map(u => u.unitId));
  const available = allResponders.filter(r => !r.busy && !assignedIds.has(r.id));

  function toggle(id) {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function dispatchSelected() {
    if (selected.size === 0) return;
    onDispatchUnits(Array.from(selected));
    setSelected(new Set());
  }

  return (
    <div className="fade-in" style={{
      position: 'absolute', top: 12, right: 12, width: 360, maxHeight: 'calc(100% - 24px)',
      display: 'flex', flexDirection: 'column', background: '#0c1119', border: '1px solid var(--line-strong)',
      borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.55)', overflow: 'hidden', zIndex: 600
    }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', background: 'var(--surface-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
            color: 'var(--ink-secondary)', flexShrink: 0
          }}>{initials(call.caller)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{call.caller}</div>
            <div style={{ fontSize: 12, color: 'var(--accent)' }}>Reporting near {call.locationName}</div>
          </div>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line-strong)',
            background: 'var(--surface-2)', color: 'var(--ink-secondary)', cursor: 'pointer', fontSize: 12, flexShrink: 0
          }}>✕</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--status)' }}>
          LINE 1 · CONNECTED {formatClock(connected)}
        </div>
      </div>

      {/* transcript */}
      <div ref={scrollRef} style={{ flex: '0 0 auto', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160 }}>
        {call.transcript.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.from === 'dispatcher' ? 'flex-end' : 'flex-start',
            maxWidth: '85%', padding: '9px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.4,
            background: m.from === 'dispatcher' ? 'var(--accent)' : 'var(--surface-2)',
            color: m.from === 'dispatcher' ? '#fff' : 'var(--ink)',
            borderBottomRightRadius: m.from === 'dispatcher' ? 3 : 12,
            borderBottomLeftRadius: m.from === 'dispatcher' ? 12 : 3
          }}>{m.text}</div>
        ))}
      </div>

      {/* remaining questions */}
      {remaining.length > 0 && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>
            Details gathered: {totalQuestions - remaining.length}/{totalQuestions}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 90, overflowY: 'auto' }}>
            {remaining.map(item => (
              <button
                key={item.q}
                onClick={() => onAskQuestion(item)}
                style={{
                  textAlign: 'left', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line-strong)',
                  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12.5, cursor: 'pointer'
                }}
              >{item.q}</button>
            ))}
          </div>
        </div>
      )}

      {/* units already assigned to this call */}
      {unitsForCall.length > 0 && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>
            RESPONDING ({unitsForCall.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unitsForCall.map(u => (
              <div key={u.unitId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', fontSize: 12.5
              }}>
                <span>{u.unitId} <span style={{ color: 'var(--ink-muted)' }}>· {TYPE_LABEL[u.type]}</span></span>
                <span style={{ color: u.status === 'On scene' ? 'var(--status)' : 'var(--ink-secondary)' }}>
                  {u.status === 'On scene' ? 'On scene' : formatEta(u.etaSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* pick units to dispatch */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>AVAILABLE UNITS — select any number</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {TYPE_ORDER.map(type => {
            const units = available.filter(r => r.type === type);
            if (units.length === 0) return null;
            return (
              <div key={type}>
                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', margin: '6px 0 3px', letterSpacing: 0.4 }}>
                  {TYPE_LABEL[type].toUpperCase()}
                </div>
                {units.map(u => (
                  <label key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
                    background: selected.has(u.id) ? 'var(--accent-tint)' : 'transparent', cursor: 'pointer', fontSize: 12.5
                  }}>
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                    <span style={{ flex: 1 }}>{u.id}</span>
                    <span style={{ color: 'var(--ink-muted)', fontSize: 11.5 }}>~{estimateEtaMinutes(u, call)} min</span>
                  </label>
                ))}
              </div>
            );
          })}
          {available.length === 0 && (
            <div style={{ color: 'var(--ink-muted)', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
              No free units right now.
            </div>
          )}
        </div>
        <button
          onClick={dispatchSelected}
          disabled={selected.size === 0}
          style={{
            marginTop: 10, width: '100%', height: 38, borderRadius: 9, border: 'none',
            cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
            background: 'var(--status)', color: '#04241a', fontWeight: 700, fontSize: 13
          }}
        >
          Dispatch {selected.size > 0 ? `${selected.size} unit${selected.size > 1 ? 's' : ''}` : 'selected units'}
        </button>
      </div>

      <div style={{ maxHeight: 140, overflowY: 'auto', padding: '0 4px 8px', flexShrink: 0 }}>
        <CallNotesPanel code={call.code} />
      </div>
    </div>
  );
}
