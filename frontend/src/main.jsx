import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConversationProvider } from '@elevenlabs/react';
import App from './App.jsx';
import CitizenApp from './CitizenApp.jsx';
import StartScreen from './StartScreen.jsx';
import './styles.css';

// `/report` stays a direct, standalone link to the citizen page (e.g. for
// flyers/QR codes) — it never shows the picker or the operator gate.
// Everything else (including `/`) lands on the shared start screen, from
// which "Operator Console" is the only path into the dispatcher console,
// and only after the password check in StartScreen passes.
const isCitizenPage = window.location.pathname.replace(/\/+$/, '') === '/report';

function Root() {
  const [view, setView] = useState('start'); // start | citizen | operator

  if (view === 'citizen') {
    return (
      <ConversationProvider>
        <CitizenApp />
      </ConversationProvider>
    );
  }

  if (view === 'operator') {
    return (
      <ConversationProvider>
        <App />
      </ConversationProvider>
    );
  }

  return (
    <StartScreen
      onSelectCitizen={() => setView('citizen')}
      onSelectOperator={() => setView('operator')}
    />
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
