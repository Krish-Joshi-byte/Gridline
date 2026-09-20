import { useEffect, useState } from 'react';
import BackButton from './BackButton.jsx';

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function TopNav({ onDuty, onDutySeconds, onToggleDuty, onBack, dispatcherName = 'Dispatcher' }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: '#000000', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px' }}>
        {onBack && <BackButton onClick={onBack} />}
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)',
          border: '1px solid var(--line-strong)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 15, flexShrink: 0, color: 'var(--accent)', fontWeight: 800
        }}>911</div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Blacksburg–Montgomery E911 Dispatch</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{dispatcherName}</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink-secondary)' }}>
            <div>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
            <div style={{ fontFamily: 'monospace' }}>{now.toLocaleTimeString([], { hour12: false })}</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button
              onClick={onToggleDuty}
              style={{
                height: 36, padding: '0 18px', borderRadius: 8, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3,
                border: '1px solid ' + (onDuty ? 'var(--danger)' : 'var(--status)'),
                background: onDuty ? 'var(--danger-tint)' : 'var(--status-tint)',
                color: onDuty ? 'var(--danger)' : 'var(--status)'
              }}
            >
              {onDuty ? 'Go off duty' : 'Go on duty'}
            </button>
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--ink-muted)', textAlign: 'right' }}>
              {onDuty ? `On duty · ${formatDuration(onDutySeconds)}` : 'Off duty'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
