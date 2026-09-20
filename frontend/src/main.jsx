import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConversationProvider } from '@elevenlabs/react';
import App from './App.jsx';
import CitizenApp from './CitizenApp.jsx';
import StartScreen from './StartScreen.jsx';
import UserHub from './UserHub.jsx';
import OperatorHub from './OperatorHub.jsx';
import ScanDashboard from './ScanDashboard.jsx';
import VolunteerPage from './VolunteerPage.jsx';
import { signOutOperator } from './auth.js';
import './styles.css';

// `/report` stays a direct, standalone link to the citizen page (e.g. for
// flyers/QR codes) — it never shows the picker or the operator gate.
// Everything else (including `/`) lands on the shared start screen, which is
// the very first fork: User or Operator.
//
// Picking "User" opens the user hub — a menu of the two user-side pages:
//   userHub    the menu itself
//   citizen    report-an-emergency (App's CitizenApp, no sign-in)
//   community  the same volunteer feed operators publish to, read-only —
//              a user can browse posts but not publish, edit or sign up
//
// Picking "Operator" asks for the password and, once it passes, opens the
// operator hub — a menu of the three operator-side pages:
//   hub        the menu itself
//   operator   the dispatcher console (App.jsx)
//   scan       Gridline Scan, floor plan -> 3D model (ScanDashboard.jsx)
//   volunteer  community volunteer posts and sign-ups, full read/write
//              (VolunteerPage.jsx)
const isCitizenPage = window.location.pathname.replace(/\/+$/, '') === '/report';

// Wraps a screen that has to survive the operator going back to the hub.
// Hidden with display:none rather than unmounted, so the dispatcher console
// keeps its call queue, dispatches, patrol simulation and any live voice call,
// and the scan studio keeps the model that was loaded — flipping over to look
// at a building mid-shift shouldn't cost anyone their shift. (display:none does
// NOT stop a same-origin iframe's animation loop, so ScanDashboard parks its own
// while it's inactive — see setFramePaused there.)
function KeepAlive({ active, children }) {
  return <div style={{ display: active ? 'block' : 'none' }}>{children}</div>;
}

function Root() {
  // start | userHub | citizen | community | hub | operator | scan | volunteer
  const [view, setView] = useState('start');
  // Which keep-alive screens have been opened at least once. They mount on
  // first visit and stay mounted until sign-out.
  const [opened, setOpened] = useState({ operator: false, scan: false });

  function go(next) {
    if (next === 'operator' || next === 'scan') {
      setOpened(prev => (prev[next] ? prev : { ...prev, [next]: true }));
    }
    setView(next);
  }

  function signOut() {
    // Signing out is the one thing that discards a running dispatch session,
    // so don't let a stray click do it silently.
    if (opened.operator &&
        !window.confirm('Sign out? Your dispatch session — call queue, unit assignments and patrol state — will be reset.')) {
      return;
    }
    signOutOperator();
    setOpened({ operator: false, scan: false });
    setView('start');
  }

  // The map was laid out while hidden or at another size; nudge it to re-measure
  // when the console comes back. Harmless if the map already tracks its container.
  useEffect(() => {
    if (view === 'operator') window.dispatchEvent(new Event('resize'));
  }, [view]);

  if (view === 'citizen') {
    return (
      <ConversationProvider>
        <CitizenApp onBack={() => setView('userHub')} />
      </ConversationProvider>
    );
  }

  if (view === 'community') {
    // Same feed operators see, but read-only: no "Manage posts" tab and no
    // sign-up — a user can look, not touch.
    return <VolunteerPage onBack={() => setView('userHub')} readOnly />;
  }

  if (view === 'start') {
    return (
      <StartScreen
        onSelectUser={() => setView('userHub')}
        onSelectOperator={() => go('hub')}
      />
    );
  }

  if (view === 'userHub') {
    return (
      <UserHub
        onSelect={next => setView(next)}
        onBack={() => setView('start')}
      />
    );
  }

  // Everything else is the operator side — only reachable through the gate.
  return (
    <>
      {view === 'hub' && <OperatorHub onSelect={go} onSignOut={signOut} />}
      {view === 'volunteer' && <VolunteerPage onBack={() => go('hub')} />}

      {opened.operator && (
        <KeepAlive active={view === 'operator'}>
          <ConversationProvider>
            <App onBack={() => go('hub')} />
          </ConversationProvider>
        </KeepAlive>
      )}
      {opened.scan && (
        <KeepAlive active={view === 'scan'}>
          <ScanDashboard active={view === 'scan'} onBack={() => go('hub')} />
        </KeepAlive>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isCitizenPage ? (
      <ConversationProvider>
        <CitizenApp />
      </ConversationProvider>
    ) : <Root />}
  </React.StrictMode>
);
