import { useEffect, useRef, useState } from 'react';
import { registerForVolunteerEvent } from '../api.js';
import { whenWhere } from '../volunteer.js';

// Sign-up form for one post. Errors from the server (already signed up, post is
// now full, invalid email…) are shown in the form so the person can fix them
// without losing what they typed.
export default function VolunteerSignupModal({ event, onClose, onSignedUp }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [status, setStatus] = useState('idle'); // idle | submitting | done
  const [error, setError] = useState(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      await registerForVolunteerEvent({
        eventId: event.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim()
      });
      setStatus('done');
      onSignedUp();                                   // refresh the spot counts behind the modal
      closeTimer.current = setTimeout(onClose, 1600);
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  const busy = status !== 'idle';

  return (
    <div className="vol-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vol-modal" role="dialog" aria-modal="true" aria-labelledby="vol-modal-title">
        <h3 id="vol-modal-title" className="vol-modal-title">{event.title}</h3>
        <p className="vol-modal-sub">{whenWhere(event)}</p>

        {status === 'done' && (
          <div className="vol-msg" data-kind="success" role="status">
            You're signed up. A coordinator may follow up by email before the date.
          </div>
        )}
        {error && <div className="vol-msg" data-kind="error" role="alert">{error}</div>}

        <form onSubmit={submit}>
          <label className="vol-field">
            <span>Full name</span>
            <input className="vol-input" required autoFocus maxLength={120} value={form.name} onChange={set('name')} disabled={busy} />
          </label>
          <label className="vol-field">
            <span>Email</span>
            <input className="vol-input" type="email" required maxLength={200} value={form.email} onChange={set('email')} disabled={busy} />
          </label>
          <label className="vol-field">
            <span>Phone (optional)</span>
            <input className="vol-input" type="tel" maxLength={40} value={form.phone} onChange={set('phone')} disabled={busy} />
          </label>
          <label className="vol-field">
            <span>Anything we should know? (optional)</span>
            <textarea
              className="vol-input vol-textarea" maxLength={1000} value={form.notes} onChange={set('notes')} disabled={busy}
              placeholder="Accessibility needs, prior experience, questions…"
            />
          </label>
          <div className="vol-actions">
            <button type="submit" className="vol-btn" data-variant="primary" disabled={busy}>
              {status === 'submitting' ? 'Submitting…' : status === 'done' ? 'Signed up' : 'Confirm sign-up'}
            </button>
            <button type="button" className="vol-btn" onClick={onClose}>{status === 'done' ? 'Close' : 'Cancel'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
