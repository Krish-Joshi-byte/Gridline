import { useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { submitCitizenReport, updateCitizenReportLocation, getElevenLabsSession } from './api.js';

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
export default function CitizenApp() {
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

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 20px', background: 'var(--bg)', color: 'var(--ink)'
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{
          padding: '10px 14px', borderRadius: 10, background: 'var(--warning-tint)',
          border: '1px solid var(--warning)', color: 'var(--warning)', fontSize: 12.5, marginBottom: 20, lineHeight: 1.4
        }}>
          ⚠ Demo tool, not a real emergency line. If you are in a real emergency, call 911 (or your local emergency number) directly.
        </div>

        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Send Your Location</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 0, marginBottom: 24, lineHeight: 1.5 }}>
          This sends your location straight to dispatch. You won't see unit
          locations or anyone else's report here — this page only sends,
          it doesn't show.
        </p>

        {(stage === 'start' || stage === 'locating') && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
            <button
              onClick={handleShareLocation}
              disabled={stage === 'locating'}
              style={{
                width: '100%', height: 46, borderRadius: 9, border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14.5,
                cursor: stage === 'locating' ? 'wait' : 'pointer'
              }}
            >📍 {stage === 'locating' ? 'Getting your location…' : 'Share My Location'}</button>
            {error && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</div>
            )}
          </div>
        )}

        {(stage === 'ready' || stage === 'submitting') && coords && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
            <div style={{
              fontSize: 12.5, color: 'var(--status)', marginBottom: 16, padding: '8px 10px',
              background: 'var(--status-tint)', borderRadius: 8
            }}>
              ✓ Location captured ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})
            </div>

            {!showTypedForm ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
                  Calling connects you to an AI dispatch operator who will
                  ask what's happening and send it straight to a human
                  dispatcher.
                </p>
                <button
                  onClick={handleStartCall}
                  disabled={stage === 'submitting'}
                  style={{
                    width: '100%', height: 46, borderRadius: 9, border: 'none',
                    background: 'var(--status)', color: '#04241a', fontWeight: 700, fontSize: 14.5,
                    cursor: stage === 'submitting' ? 'wait' : 'pointer'
                  }}
                >📞 {stage === 'submitting' ? 'Connecting…' : 'Call Dispatch'}</button>
                <button
                  onClick={() => setShowTypedForm(true)}
                  disabled={stage === 'submitting'}
                  style={{
                    width: '100%', marginTop: 10, height: 38, borderRadius: 9, border: '1px solid var(--line-strong)',
                    background: 'transparent', color: 'var(--ink-secondary)', fontWeight: 600, fontSize: 12.5,
                    cursor: stage === 'submitting' ? 'wait' : 'pointer'
                  }}
                >⌨️ Can't talk right now — type it instead</button>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8 }}>WHAT KIND OF HELP DO YOU NEED?</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                  {TYPE_OPTIONS.map(opt => (
                    <label key={opt.value} style={{
                      flex: '1 0 auto', textAlign: 'center', padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 13, border: '1px solid ' + (type === opt.value ? 'var(--accent)' : 'var(--line-strong)'),
                      background: type === opt.value ? 'var(--accent-tint)' : 'transparent',
                      color: type === opt.value ? 'var(--accent)' : 'var(--ink)'
                    }}>
                      <input
                        type="radio" name="type" value={opt.value} checked={type === opt.value}
                        onChange={() => setType(opt.value)} style={{ display: 'none' }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 8 }}>
                  ANYTHING DISPATCH SHOULD KNOW? (OPTIONAL)
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MESSAGE_LIMIT))}
                  placeholder="A short description of what's happening…"
                  rows={3}
                  style={{
                    width: '100%', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface-2)',
                    color: 'var(--ink)', fontSize: 13, padding: 10, resize: 'vertical', marginBottom: 6
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right', marginBottom: 18 }}>
                  {message.length}/{MESSAGE_LIMIT}
                </div>

                <button
                  type="submit"
                  disabled={stage === 'submitting'}
                  style={{
                    width: '100%', height: 46, borderRadius: 9, border: 'none',
                    background: 'var(--status)', color: '#04241a', fontWeight: 700, fontSize: 14.5,
                    cursor: stage === 'submitting' ? 'wait' : 'pointer'
                  }}
                >{stage === 'submitting' ? 'Sending…' : 'Send to Dispatch'}</button>
                <button
                  type="button"
                  onClick={() => setShowTypedForm(false)}
                  style={{
                    width: '100%', marginTop: 10, height: 34, borderRadius: 9, border: 'none',
                    background: 'transparent', color: 'var(--ink-muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer'
                  }}
                >← Back to calling instead</button>
              </form>
            )}

            {error && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</div>
            )}
          </div>
        )}

        {stage === 'in-call' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--status)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: conversation.status === 'connected' ? 'var(--status)' : 'var(--warning)'
              }} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--status)' }}>
                {conversation.status === 'connected'
                  ? (conversation.isSpeaking ? 'Operator speaking…' : 'Connected — go ahead')
                  : 'Connecting…'}
              </div>
            </div>

            <div style={{
              fontSize: 12, color: 'var(--ink-muted)', padding: '8px 10px', background: 'var(--surface-2)',
              borderRadius: 8, marginBottom: 12
            }}>
              Reference: <span style={{ color: 'var(--ink)', fontFamily: 'monospace' }}>{report?.code}</span>
            </div>

            <div ref={scrollRef} style={{
              display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', marginBottom: 14
            }}>
              {transcript.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', textAlign: 'center', padding: '10px 0' }}>
                  Waiting for the operator to pick up…
                </div>
              )}
              {transcript.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.from === 'you' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', padding: '9px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.4,
                  background: m.from === 'you' ? 'var(--accent)' : 'var(--surface-2)',
                  color: m.from === 'you' ? '#fff' : 'var(--ink)'
                }}>{m.text}</div>
              ))}
            </div>

            <button
              onClick={handleEndCall}
              style={{
                width: '100%', height: 44, borderRadius: 9, border: 'none',
                background: 'var(--danger, #e5484d)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer'
              }}
            >☎ End Call</button>

            {error && (
              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>{error}</div>
            )}
          </div>
        )}

        {stage === 'done' && report && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--status)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--status)', marginBottom: 6 }}>
              ✓ Sent to dispatch
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.5, marginTop: 0 }}>
              {calledIn
                ? 'Your call has ended and been sent to dispatch. Stay safe — if anything changes or you need to move, use the button below to update your location.'
                : "Your location and description have been sent. Stay safe — if anything changes or you need to move, use the button below to update your location."}
            </p>
            <div style={{
              fontSize: 12, color: 'var(--ink-muted)', padding: '8px 10px', background: 'var(--surface-2)',
              borderRadius: 8, marginBottom: 16
            }}>
              Reference: <span style={{ color: 'var(--ink)', fontFamily: 'monospace' }}>{report.code}</span>
            </div>
            <button
              onClick={handleUpdateLocation}
              style={{
                width: '100%', height: 42, borderRadius: 9, border: '1px solid var(--accent)',
                background: 'transparent', color: 'var(--accent)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer'
              }}
            >📍 Update My Location</button>
            {updateNote && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-secondary)' }}>{updateNote}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
