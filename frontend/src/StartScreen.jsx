import { useState } from 'react';
import { AUTH_KEY } from './auth.js';
import HomeShell from './components/HomeShell.jsx';
import HomeCard from './components/HomeCard.jsx';
import { PinIcon, ConsoleIcon, LockIcon, PeopleIcon } from './components/HomeIcons.jsx';

const OPERATOR_PASSWORD = 'adm1n';

// Shared landing screen for both the public citizen-report flow and the
// operator side. Picking "Operator" doesn't hand over anything itself — it
// drops into a password gate first, and only a correct password (checked
// client-side, same as any other demo-grade gate) lets the parent move on to
// the operator hub, where the dispatch console, scan dashboard and volunteer
// page are chosen.
export default function StartScreen({ onSelectCitizen, onSelectVolunteer, onSelectOperator }) {
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
    <HomeShell maxWidth={showPasswordForm ? 420 : 1060}>
      {!showPasswordForm ? (
        <>
          <div className="gl-head">
            <h1 className="gl-h1">Choose how you'd like to continue.</h1>
          </div>

          <div className="gl-grid" style={{ '--cols': 3 }}>
            <HomeCard
              tone="danger"
              icon={<PinIcon />}
              tag="NO SIGN-IN"
              title="Report an Emergency"
              desc="Send your location and a short description straight to dispatch."
              onClick={onSelectCitizen}
            />
            <HomeCard
              tone="status"
              icon={<PeopleIcon />}
              tag="NO SIGN-IN"
              title="Community Volunteering"
              desc="Browse opportunities from Police, Fire, and EMS and sign up."
              onClick={onSelectVolunteer}
            />
            <HomeCard
              tone="accent"
              icon={<ConsoleIcon />}
              tag="PASSWORD"
              title="Operator Console"
              desc="Dispatcher access — requires a password."
              onClick={handleOperatorClick}
            />
          </div>
        </>
      ) : (
        <form className="gl-panel" onSubmit={handlePasswordSubmit}>
          <div className="gl-panel-head">
            <span className="gl-card-icon" style={{ '--rail-tint': 'var(--accent-tint)', '--rail-ink': 'var(--accent)' }}>
              <LockIcon />
            </span>
            Operator password
          </div>
          <input
            className="gl-input"
            type="password"
            autoFocus
            aria-label="Operator password"
            aria-invalid={error ? 'true' : 'false'}
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            placeholder="Enter password"
          />
          {error && <div className="gl-error" role="alert">{error}</div>}
          <div className="gl-actions">
            <button
              type="button"
              className="gl-btn"
              onClick={() => { setShowPasswordForm(false); setPassword(''); setError(null); }}
            >Back</button>
            <button type="submit" className="gl-btn" data-primary>Enter</button>
          </div>
        </form>
      )}
    </HomeShell>
  );
}
