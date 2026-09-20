import { useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import HomeShell from './components/HomeShell.jsx';
import './citizen.css';
import { PinIcon, PhoneIcon, KeyboardIcon, CheckIcon, AlertIcon } from './components/HomeIcons.jsx';
import { submitCitizenReport, updateCitizenReportLocation, getElevenLabsSession } from './api.js';

// data-kind on each option picks up the police / fire / medical colours the
// dispatcher map already uses.
const TYPE_OPTIONS = [
  { value: 'police', label: 'Police' },
  { value: 'fire', label: 'Fire' },
  { value: 'medical', label: 'Medical' },
  { value: 'unsure', label: "Not sure" }
];

const MESSAGE_LIMIT = 500;

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied — allow location access and try again'
          : 'Could not get your location'
      )),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

// Entire surface area of this page: request a location, then either call
// in and talk to the AI dispatcher or type a short note, and send it. It
// never fetches or renders responder positions, unit statuses, or any
// other person's report — those endpoints simply aren't imported here.
export default function CitizenApp({ onBack }) {
  const [stage, setStage] = useState('start'); // start | locating | ready | submitting | in-call | done
  const [coords, setCoords] = useState(null);
  const [type, setType] = useState('unsure');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [updateNote, setUpdateNote] = useState(null);
  const [showTypedForm, setShowTypedForm] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [calledIn, setCalledIn] = useState(false); // did this report come from an actual call?
  const scrollRef = useRef(null);

  // The actual voice call: a real conversation with the ElevenLabs AI
  // operator, same agent/session plumbing the dispatcher console uses,
  // just used the way it's meant to be used here — a real caller talking
  // to a real (AI) dispatcher. Only once this call ends does ElevenLabs'
  // post-call webhook write up the report on the backend — nothing here
  // fabricates that summary client-side.
  const conversation = useConversation({
    onMessage: (msg) => {
      const text = msg?.message ?? '';
      if (!text) return;
      setTranscript(t => [...t, { from: msg.source === 'user' ? 'you' : 'operator', text }]);
    },
    onDisconnect: () => setStage('done'),
    onError: (err) => setError(typeof err === 'string' ? err : (err?.message || 'The call dropped unexpectedly'))
  });

  useEffect(() => {
    // Hang up if someone navigates away mid-call.
    return () => { if (conversation.status === 'connected') conversation.endSession(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript.length]);

  async function handleShareLocation() {
    setError(null);
    setStage('locating');
    try {
      const loc = await getLocation();
      setCoords(loc);
      setStage('ready');
    } catch (e) {
      setError(e.message);
      setStage('start');
    }
  }

  // Calling is the primary path: it creates the report right when the call
  // starts (so it appears on the dispatcher board the moment someone is on
  // the line, the way a real 911 call would), then hands the conversation
  // to the ElevenLabs agent. The type and description that end up on the
  // report come from what the AI operator hears, filled in server-side
  // once the call ends — this page never guesses at that content.
  async function handleStartCall() {
    if (!coords) return;
    setError(null);
    setTranscript([]);
    setStage('submitting');
    try {
      const created = await submitCitizenReport({ ...coords, type: 'unsure', message: null });
      setReport(created);
      setCalledIn(true);
      const session = await getElevenLabsSession();
      const startOpts = session.signed_url ? { signedUrl: session.signed_url } : { agentId: session.agentId };
      setStage('in-call');
      await conversation.startSession({
        ...startOpts,
        dynamicVariables: {
          code: created.code,
          incident_type: 'citizen emergency call',
          location: created.locationName,
          caller_name: 'Citizen caller'
        }
      });
    } catch (e) {
      setError(e.message || 'Could not start the call');
      setStage('ready');
    }
  }

  function handleEndCall() {
    conversation.endSession().catch(() => {});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!coords) return;
    setError(null);
    setStage('submitting');
    try {
      const created = await submitCitizenReport({ ...coords, type, message });
      setReport(created);
      setCalledIn(false);
      setStage('done');
    } catch (e) {
      setError(e.message);
      setStage('ready');
    }
  }

  async function handleUpdateLocation() {
    if (!report) return;
    setUpdateNote(null);
    try {
      const loc = await getLocation();
      await updateCitizenReportLocation(report.id, loc.lat, loc.lng);
      setUpdateNote('Updated — dispatch now has your current location.');
    } catch (e) {
      setUpdateNote(e.message);
    }
  }

  const busy = stage === 'submitting';
  // Backing out mid-call would silently hang up on someone, so the button only
  // shows when nothing is in flight.
  const canGoBack = onBack && stage !== 'in-call' && stage !== 'submitting';

  return (
    <HomeShell
      subtitle="Report an emergency"
      maxWidth={480}
      onBack={canGoBack ? onBack : undefined}
      footerRight={report?.code ? <span>Ref <span className="cz-mono">{report.code}</span></span> : null}
    >
      <div className="cz-stack">
        <div className="gl-head">
          <h1 className="gl-h1">Report an emergency</h1>
          <p className="gl-lede">
            This sends your location straight to dispatch. You won't see unit
            locations or anyone else's report here.
          </p>
        </div>

        <div className="cz-notice" role="note">
          <AlertIcon />
          <span>Demo tool, not a real emergency line. In a real emergency, call 911 (or your local emergency number) directly.</span>
        </div>

        {(stage === 'start' || stage === 'locating') && (
          <div className="gl-panel cz-panel" data-tone="danger">
            <div className="gl-panel-head">
              <span className="gl-card-icon" style={{ '--rail-tint': 'var(--danger-tint)', '--rail-ink': 'var(--danger)' }}><PinIcon /></span>
              Step 1 · Share your location
            </div>
            <p className="cz-text">Dispatch needs to know where you are before anything else.</p>
            <button
              className="gl-btn cz-btn" data-primary
              onClick={handleShareLocation}
              disabled={stage === 'locating'}
            >
              <PinIcon />{stage === 'locating' ? 'Getting your location…' : 'Share my location'}
            </button>
            {error && <div className="gl-error cz-note" role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}
          </div>
        )}

        {(stage === 'ready' || stage === 'submitting') && coords && (
          <div className="gl-panel cz-panel" data-tone="status">
            <div className="cz-chip" style={{ marginBottom: 16 }}>
              <CheckIcon />
              <span>Location captured <span className="cz-mono" style={{ color: 'inherit' }}>({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})</span></span>
            </div>

            {!showTypedForm ? (
              <>
                <p className="cz-text">
                  Calling connects you to an AI dispatch operator who will ask
                  what's happening and send it straight to a human dispatcher.
                </p>
                <button className="gl-btn cz-btn" data-tone="status" onClick={handleStartCall} disabled={busy}>
                  <PhoneIcon />{busy ? 'Connecting…' : 'Call dispatch'}
                </button>
                <button className="gl-btn cz-btn" data-quiet onClick={() => setShowTypedForm(true)} disabled={busy}>
                  <KeyboardIcon />Can't talk right now? Type it instead
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <span className="cz-label" id="cz-type-label">WHAT KIND OF HELP DO YOU NEED?</span>
                <div className="cz-seg" role="radiogroup" aria-labelledby="cz-type-label">
                  {TYPE_OPTIONS.map(opt => (
                    <label key={opt.value} data-kind={opt.value}>
                      <input
                        type="radio" name="type" value={opt.value} checked={type === opt.value}
                        onChange={() => setType(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>

                <label className="cz-label" htmlFor="cz-message">ANYTHING DISPATCH SHOULD KNOW? (OPTIONAL)</label>
                <textarea
                  id="cz-message"
                  className="cz-textarea"
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MESSAGE_LIMIT))}
                  placeholder="A short description of what's happening…"
                  rows={4}
                />
                <div className="cz-count">{message.length}/{MESSAGE_LIMIT}</div>

                <button type="submit" className="gl-btn cz-btn" data-tone="status" disabled={busy}>
                  {busy ? 'Sending…' : 'Send to dispatch'}
                </button>
                <button type="button" className="gl-btn cz-btn" data-quiet data-ghost onClick={() => setShowTypedForm(false)}>
                  ‹ Back to calling instead
                </button>
              </form>
            )}

            {error && <div className="cz-note" role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}
          </div>
        )}

        {stage === 'in-call' && (
          <div className="gl-panel cz-panel" data-tone="status">
            <div className="cz-live" aria-live="polite">
              <span className="cz-dot" data-wait={conversation.status === 'connected' ? undefined : ''} />
              {conversation.status === 'connected'
                ? (conversation.isSpeaking ? 'Operator speaking…' : 'Connected — go ahead')
                : 'Connecting…'}
            </div>

            <div className="cz-chip" data-plain>
              <span>Reference: <span className="cz-mono">{report?.code}</span></span>
            </div>

            <div ref={scrollRef} className="cz-log">
              {transcript.length === 0 && (
                <div className="cz-empty">Waiting for the operator to pick up…</div>
              )}
              {transcript.map((m, i) => (
                <div key={i} className="cz-bubble" data-you={m.from === 'you' ? '' : undefined}>{m.text}</div>
              ))}
            </div>

            <button className="gl-btn cz-btn" data-tone="danger" onClick={handleEndCall}>
              <PhoneIcon />End call
            </button>

            {error && <div className="cz-note" role="alert" style={{ color: 'var(--danger)' }}>{error}</div>}
          </div>
        )}

        {stage === 'done' && report && (
          <div className="gl-panel cz-panel" data-tone="status">
            <div className="cz-done-title"><CheckIcon />Sent to dispatch</div>
            <p className="cz-text">
              {calledIn
                ? 'Your call has ended and been sent to dispatch. Stay safe — if anything changes or you need to move, use the button below to update your location.'
                : "Your location and description have been sent. Stay safe — if anything changes or you need to move, use the button below to update your location."}
            </p>
            <div className="cz-chip" data-plain style={{ marginBottom: 16 }}>
              <span>Reference: <span className="cz-mono">{report.code}</span></span>
            </div>
            <button className="gl-btn cz-btn" data-primary onClick={handleUpdateLocation}>
              <PinIcon />Update my location
            </button>
            {updateNote && <div className="cz-note">{updateNote}</div>}
          </div>
        )}
      </div>
    </HomeShell>
  );
}
