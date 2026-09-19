import { useEffect, useRef, useState } from 'react';
import CallNotesPanel from './CallNotesPanel.jsx';

const TYPE_LABEL = { police: 'police', fire: 'fire', medical: 'EMS' };

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function initials(name) {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function CallPanel({ call, onClose, onAskQuestion, onDispatch, dispatchInfo }) {
  const [connected, setConnected] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    setConnected(0);
    const t = setInterval(() => setConnected(c => c + 1), 1000);
    return () => clearInterval(t);
  }, [call.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [call.transcript.length]);

  const totalQuestions = call.questions.length;
  const askedTexts = new Set(call.transcript.filter(m => m.from === 'dispatcher').slice(1).map(m => m.text));
  const remaining = call.questions.filter(q => !askedTexts.has(q.q));

  return (
    <div className="fade-in" style={{
      position: 'absolute', top: 12, right: 12, width: 340, maxHeight: 'calc(100% - 24px)',
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
      <div ref={scrollRef} style={{ flex: '0 1 auto', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220 }}>
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

      {/* remaining questions to ask */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>
          Details gathered: {totalQuestions - remaining.length}/{totalQuestions}
        </div>
        <div style={{ height: 4, borderRadius: 3, background: 'var(--surface-2)', marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--accent)', borderRadius: 3,
            width: `${((totalQuestions - remaining.length) / totalQuestions) * 100}%`, transition: 'width 0.2s ease'
          }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
          {remaining.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', textAlign: 'center', padding: '4px 0' }}>
              All details gathered — dispatch when ready.
            </div>
          )}
          {remaining.map(item => (
            <button
              key={item.q}
              onClick={() => onAskQuestion(item)}
              style={{
                textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--line-strong)',
                background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12.5, cursor: 'pointer'
              }}
            >{item.q}</button>
          ))}
        </div>
      </div>

      {/* dispatch action */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
        {dispatchInfo ? (
          <div style={{ fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--ink-muted)' }}>Unit {dispatchInfo.unitId} dispatched</span>
              <span style={{ color: 'var(--status)', fontWeight: 600 }}>{dispatchInfo.status}</span>
            </div>
            <div style={{ color: 'var(--ink-secondary)' }}>ETA {dispatchInfo.eta <= 0 ? 'arrived' : dispatchInfo.eta + ' min'}</div>
          </div>
        ) : (
          <button
            onClick={onDispatch}
            style={{
              width: '100%', height: 40, borderRadius: 9, border: 'none', cursor: 'pointer',
              background: 'var(--status)', color: '#04241a', fontWeight: 700, fontSize: 13.5
            }}
          >
            Dispatch nearest {TYPE_LABEL[call.type]} unit
          </button>
        )}
      </div>

      <div style={{ maxHeight: 160, overflowY: 'auto', padding: '0 4px 8px' }}>
        <CallNotesPanel code={call.code} />
      </div>
    </div>
  );
}
