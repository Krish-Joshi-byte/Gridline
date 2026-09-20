import { useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import CallNotesPanel from './CallNotesPanel.jsx';
import { haversineMeters } from '../routing.js';
import { getElevenLabsSession } from '../api.js';

const TYPE_LABEL = { police: 'Police', fire: 'Fire', medical: 'EMS' };
const TYPE_ORDER = ['police', 'fire', 'medical'];
const AVG_URBAN_SPEED_KMH = 40;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatEta(seconds) {
  if (seconds <= 0) return 'arriving now';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m} min ${s.toString().padStart(2, '0')}s`;
}

function initials(name) {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function estimateEtaMinutes(unit, call) {
  const distKm = haversineMeters([unit.lat, unit.lng], [call.lat, call.lng]) / 1000;
  return Math.max(1, Math.round((distKm / AVG_URBAN_SPEED_KMH) * 60));
}

export default function CallPanel({ call, allResponders, unitsForCall, onClose, onAskQuestion, onLiveTranscript, onDispatchUnits }) {
  const [connected, setConnected] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [voiceError, setVoiceError] = useState(null);
  const [hadVoiceCall, setHadVoiceCall] = useState(false);
  const [manualText, setManualText] = useState('');
  const scrollRef = useRef(null);

  // A citizen-report call never had a phone line to begin with — just a
  // location and an optional note submitted through the public page. No
  // AI voice call to start, nothing for ElevenLabs' post-call webhook to
  // ever fill in, so that whole slice of the UI just doesn't apply here.
  const isCitizenReport = call.source === 'citizen';

  // Real voice conversation with the ElevenLabs Conversational AI agent —
  // replaces clicking through the canned Q&A when you actually want to
  // talk (as the caller) instead of texting through the script. Each
  // turn ElevenLabs recognizes gets appended to the same transcript via
  // onLiveTranscript; ElevenLabs' own post-call webhook fills in the AI
  // call notes below once the conversation ends.
  const conversation = useConversation({
    onConnect: () => { setVoiceError(null); setHadVoiceCall(true); },
    onMessage: (msg) => {
      const text = msg?.message ?? '';
      if (!text) return;
      onLiveTranscript({ from: msg.source === 'user' ? 'caller' : 'dispatcher', text });
    },
    onError: (err) => setVoiceError(typeof err === 'string' ? err : (err?.message || 'Voice call error'))
  });

  useEffect(() => {
    setConnected(0);
    setSelected(new Set());
    setVoiceError(null);
    setHadVoiceCall(false);
    setManualText('');
    const t = setInterval(() => setConnected(c => c + 1), 1000);
    // Hang up any live voice session when switching to a different call
    // or closing the panel — it shouldn't keep running in the background.
    return () => {
      clearInterval(t);
      if (conversation.status === 'connected') conversation.endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id]);

  async function startVoiceCall() {
    setVoiceError(null);
    try {
      const session = await getElevenLabsSession();
      const startOpts = session.signed_url
        ? { signedUrl: session.signed_url }
        : { agentId: session.agentId };
      await conversation.startSession({
        ...startOpts,
        dynamicVariables: {
          code: call.code,
          incident_type: call.title,
          location: call.locationName,
          caller_name: call.caller
        }
      });
    } catch (e) {
      setVoiceError(e.message || 'Could not start the call');
    }
  }

  // Operator takeover: cuts the AI's mic and voice off entirely so a
  // human dispatcher can carry on the same call themselves. There's no
  // "un-take-over" — you either let the AI run the call or a person
  // does, never both at once.
  function takeOverCall() {
    conversation.endSession().catch(() => {});
  }

  function sendManualMessage(e) {
    e.preventDefault();
    const text = manualText.trim();
    if (!text) return;
    onLiveTranscript({ from: 'dispatcher', text });
    setManualText('');
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [call.transcript.length]);

  const totalQuestions = call.questions.length;
  const askedTexts = new Set(call.transcript.filter(m => m.from === 'dispatcher').slice(1).map(m => m.text));
  const remaining = call.questions.filter(q => !askedTexts.has(q.q));

  const assignedIds = new Set(unitsForCall.map(u => u.unitId));
  const available = allResponders.filter(r => !r.busy && !assignedIds.has(r.id));

  function toggle(id) {
    setSelected(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function dispatchSelected() {
    if (selected.size === 0) return;
    onDispatchUnits(Array.from(selected));
    setSelected(new Set());
  }

  return (
    <div className="fade-in" style={{
      position: 'absolute', top: 12, right: 12, width: 360, maxHeight: 'calc(100% - 24px)',
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
          {isCitizenReport ? 'REPORT OPEN' : 'LINE 1 · CONNECTED'} {formatClock(connected)}
        </div>

        {!isCitizenReport && (
          <>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              {conversation.status === 'connected' ? (
                <button
                  onClick={takeOverCall}
                  title="Ends the AI's mic and voice — you'll continue the call yourself"
                  style={{
                    flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--danger, #e5484d)',
                    background: 'transparent', color: 'var(--danger, #e5484d)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer'
                  }}
                >🧑‍✈️ Take over from AI {conversation.isSpeaking ? '· AI speaking' : '· listening'}</button>
              ) : (
                <button
                  onClick={startVoiceCall}
                  disabled={conversation.status === 'connecting'}
                  style={{
                    flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--accent)',
                    background: 'var(--accent-tint)', color: 'var(--accent)', fontWeight: 700, fontSize: 12.5,
                    cursor: conversation.status === 'connecting' ? 'wait' : 'pointer'
                  }}
                >🎙 {conversation.status === 'connecting' ? 'Connecting…' : (hadVoiceCall ? 'Resume AI on this call' : 'Start voice call')}</button>
              )}
            </div>
            {hadVoiceCall && conversation.status !== 'connected' && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-muted)' }}>
                You've taken over — the AI is off the line. Talk to the caller directly and log it below, or resume the AI above.
              </div>
            )}
            {voiceError && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger, #e5484d)' }}>{voiceError}</div>
            )}
          </>
        )}
      </div>

      {/* transcript */}
      <div ref={scrollRef} style={{ flex: '0 0 auto', overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 160 }}>
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

      {/* remaining questions — scripted fallback for when you're not using the mic;
          for a citizen report there are no scripted questions, just the log box below */}
      {(isCitizenReport || hadVoiceCall || remaining.length > 0) && conversation.status !== 'connected' && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
          {(isCitizenReport || hadVoiceCall) && (
            <form onSubmit={sendManualMessage} style={{ display: 'flex', gap: 6, marginBottom: remaining.length > 0 ? 10 : 0 }}>
              <input
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder={isCitizenReport ? 'Log a note on this call…' : "Type what you're telling the caller…"}
                style={{
                  flex: 1, height: 32, borderRadius: 8, border: '1px solid var(--line-strong)',
                  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12.5, padding: '0 10px'
                }}
              />
              <button
                type="submit"
                disabled={!manualText.trim()}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12.5,
                  cursor: manualText.trim() ? 'pointer' : 'not-allowed'
                }}
              >Log</button>
            </form>
          )}
          {remaining.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>
                No mic? Ask manually — {totalQuestions - remaining.length}/{totalQuestions} details gathered
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 90, overflowY: 'auto' }}>
                {remaining.map(item => (
                  <button
                    key={item.q}
                    onClick={() => onAskQuestion(item)}
                    style={{
                      textAlign: 'left', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line-strong)',
                      background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 12.5, cursor: 'pointer'
                    }}
                  >{item.q}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* units already assigned to this call */}
      {unitsForCall.length > 0 && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>
            RESPONDING ({unitsForCall.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unitsForCall.map(u => (
              <div key={u.unitId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', fontSize: 12.5
              }}>
                <span>{u.unitId} <span style={{ color: 'var(--ink-muted)' }}>· {TYPE_LABEL[u.type]}</span></span>
                <span style={{ color: u.status === 'On scene' ? 'var(--status)' : 'var(--ink-secondary)' }}>
                  {u.status === 'On scene' ? 'On scene' : formatEta(u.etaSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* pick units to dispatch */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>AVAILABLE UNITS — select any number</div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {TYPE_ORDER.map(type => {
            const units = available.filter(r => r.type === type);
            if (units.length === 0) return null;
            return (
              <div key={type}>
                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', margin: '6px 0 3px', letterSpacing: 0.4 }}>
                  {TYPE_LABEL[type].toUpperCase()}
                </div>
                {units.map(u => (
                  <label key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
                    background: selected.has(u.id) ? 'var(--accent-tint)' : 'transparent', cursor: 'pointer', fontSize: 12.5
                  }}>
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                    <span style={{ flex: 1 }}>{u.id}</span>
                    <span style={{ color: 'var(--ink-muted)', fontSize: 11.5 }}>~{estimateEtaMinutes(u, call)} min</span>
                  </label>
                ))}
              </div>
            );
          })}
          {available.length === 0 && (
            <div style={{ color: 'var(--ink-muted)', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>
              No free units right now.
            </div>
          )}
        </div>
        <button
          onClick={dispatchSelected}
          disabled={selected.size === 0}
          style={{
            marginTop: 10, width: '100%', height: 38, borderRadius: 9, border: 'none',
            cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
            background: 'var(--status)', color: '#04241a', fontWeight: 700, fontSize: 13
          }}
        >
          Dispatch {selected.size > 0 ? `${selected.size} unit${selected.size > 1 ? 's' : ''}` : 'selected units'}
        </button>
      </div>

      {!isCitizenReport && (
        <div style={{ maxHeight: 140, overflowY: 'auto', padding: '0 4px 8px', flexShrink: 0 }}>
          <CallNotesPanel code={call.code} />
        </div>
      )}
    </div>
  );
}
