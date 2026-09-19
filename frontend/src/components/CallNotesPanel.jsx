import { useEffect, useState } from 'react';
import { getCallNotes } from '../api';

const SEVERITY_STYLES = {
  high: { bg: 'var(--danger-tint)', text: 'var(--danger)', label: 'High' },
  medium: { bg: 'var(--warning-tint)', text: 'var(--warning)', label: 'Medium' },
  low: { bg: 'var(--status-tint)', text: 'var(--status)', label: 'Low' }
};

export default function CallNotesPanel({ code }) {
  const [notes, setNotes] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setStatus('loading');

    getCallNotes(code)
      .then(data => {
        if (cancelled) return;
        setNotes(data.notes || []);
        setStatus('done');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });

    return () => { cancelled = true; };
  }, [code]);

  if (!code || status === 'idle') return null;
  if (status === 'done' && notes.length === 0) return null;

  return (
    <div style={{ padding: '10px 12px 2px', fontSize: 11 }}>
      <div style={{ color: 'var(--ink-muted)', marginBottom: 8, letterSpacing: 0.4 }}>AI CALL NOTES — {code}</div>

      {status === 'loading' && <div style={{ color: 'var(--ink-secondary)' }}>Loading notes…</div>}
      {status === 'error' && <div style={{ color: 'var(--danger)' }}>Couldn't reach the call-notes service.</div>}

      {status === 'done' && notes.map(note => {
        const sev = SEVERITY_STYLES[note.severity] || SEVERITY_STYLES.low;
        return (
          <div key={note.conversationId || note.receivedAt} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: sev.bg, color: sev.text }}>
                {sev.label} severity
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>
                {new Date(note.receivedAt).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-secondary)' }}>{note.summary}</div>
          </div>
        );
      })}
    </div>
  );
}
