import { useState } from 'react';

const OPERATOR_PASSWORD = 'adm1n';
const AUTH_KEY = 'gridline_operator_authed';

// Shared landing screen for both the public citizen-report flow and the
// dispatcher console. Picking "Operator Console" doesn't hand over the
// console itself — it drops into a password gate first, and only a
// correct password (checked client-side, same as any other demo-grade
// gate) flips `authed` and lets the parent render the real console.
export default function StartScreen({ onSelectCitizen, onSelectOperator }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  function handleOperatorClick() {
    // Already authed this session (e.g. came back via browser back button)
    // — no need to ask again.
    if (sessionStorage.getItem(AUTH_KEY) === 'true') {
      onSelectOperator();
      return;
    }
    setShowPasswordForm(true);
    setError(null);
  }

  function handlePasswordSubmit(e) {
    e.preventDefault();
    if (password === OPERATOR_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      onSelectOperator();
    } else {
      setError('Incorrect password.');
      setPassword('');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '32px 20px', background: 'var(--bg)', color: 'var(--ink)'
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Gridline</h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', margin: 0 }}>
            Choose how you'd like to continue.
          </p>
        </div>

        {!showPasswordForm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button
              onClick={onSelectCitizen}
              style={{
                width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 12, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)'
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>📍 Report an Emergency</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', lineHeight: 1.4 }}>
                Send your location and a short description straight to dispatch.
              </div>
            </button>

            <button
              onClick={handleOperatorClick}
              style={{
                width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 12, cursor: 'pointer',
                border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)'
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🚓 Operator Console</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', lineHeight: 1.4 }}>
                Dispatcher access — requires a password.
              </div>
            </button>
          </div>
        ) : (
          <form
            onSubmit={handlePasswordSubmit}
            style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Operator password</div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              placeholder="Enter password"
              style={{
                width: '100%', height: 42, borderRadius: 8, border: '1px solid ' + (error ? 'var(--danger)' : 'var(--line-strong)'),
                background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 14, padding: '0 12px', marginBottom: 10
              }}
            />
            {error && (
              <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 10 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setShowPasswordForm(false); setPassword(''); setError(null); }}
                style={{
                  flex: 1, height: 42, borderRadius: 9, border: '1px solid var(--line-strong)',
                  background: 'transparent', color: 'var(--ink-secondary)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer'
                }}
              >Back</button>
              <button
                type="submit"
                style={{
                  flex: 1, height: 42, borderRadius: 9, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer'
                }}
              >Enter</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
