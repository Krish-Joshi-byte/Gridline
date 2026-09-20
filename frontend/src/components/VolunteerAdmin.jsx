import { useState } from 'react';
import {
  createVolunteerEvent, updateVolunteerEvent, deleteVolunteerEvent, getVolunteerRegistrations
} from '../api.js';
import { FactionTag, PostImage } from './VolunteerBits.jsx';
import { FACTIONS, DEFAULT_CATEGORIES, buildInviteText } from '../volunteer.js';

const EMPTY_FORM = {
  title: '', description: '', faction: 'Police', imageUrl: '', category: 'Community Outreach',
  date: '', time: '', location: '', capacity: '10'
};

// The staff side: publish a post tagged Police / EMS / Fire, feature it, copy an
// invite draft, see who signed up, delete it. Reachable only from the operator hub.
export default function VolunteerAdmin({ events, error, onRetry, onChanged, onViewFeed }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [publishing, setPublishing] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);     // { kind: 'success' | 'error', text, link? }
  const [notice, setNotice] = useState(null);           // error from a list action
  const [signups, setSignups] = useState(null);         // { eventId, title, loading, items, error }
  const [invite, setInvite] = useState(null);           // { eventId, text, copied }

  const list = events || [];
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...list.map(e => e.category).filter(Boolean)])];
  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }));

  async function publish(e) {
    e.preventDefault();
    setPublishing(true);
    setCreateMsg(null);
    try {
      const created = await createVolunteerEvent({
        title: form.title.trim(),
        description: form.description.trim(),
        faction: form.faction,
        imageUrl: form.imageUrl.trim(),
        category: form.category,
        date: form.date,
        time: form.time,
        location: form.location.trim(),
        capacity: Number(form.capacity)
      });
      setCreateMsg({ kind: 'success', text: `Published "${created.title}."`, link: true });
      setForm(EMPTY_FORM);
      onChanged();
    } catch (err) {
      setCreateMsg({ kind: 'error', text: err.message });
    } finally {
      setPublishing(false);
    }
  }

  async function toggleFeatured(evt) {
    setNotice(null);
    try {
      await updateVolunteerEvent(evt.id, { featured: !evt.featured });
      onChanged();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function remove(evt) {
    if (!window.confirm(`Delete "${evt.title}"? This also removes its sign-ups.`)) return;
    setNotice(null);
    try {
      await deleteVolunteerEvent(evt.id);
      if (signups && signups.eventId === evt.id) setSignups(null);
      if (invite && invite.eventId === evt.id) setInvite(null);
      onChanged();
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function viewSignups(evt) {
    setSignups({ eventId: evt.id, title: evt.title, loading: true, items: null, error: null });
    try {
      const items = await getVolunteerRegistrations(evt.id);
      setSignups(prev => (prev && prev.eventId === evt.id ? { ...prev, loading: false, items } : prev));
    } catch (err) {
      setSignups(prev => (prev && prev.eventId === evt.id ? { ...prev, loading: false, error: err.message } : prev));
    }
  }

  async function toggleInvite(evt) {
    if (invite && invite.eventId === evt.id) { setInvite(null); return; }
    const text = buildInviteText(evt, window.location.origin);
    setInvite({ eventId: evt.id, text, copied: false });
    try {
      await navigator.clipboard.writeText(text);
      setInvite(prev => (prev && prev.eventId === evt.id ? { ...prev, copied: true } : prev));
    } catch { /* clipboard blocked — the draft is on screen to copy by hand */ }
  }

  return (
    <div className="vol-admin">
      <form className="gl-panel vol-form" onSubmit={publish}>
        <div className="vol-panel-title">Post a new opportunity</div>

        {createMsg && (
          <div className="vol-msg" data-kind={createMsg.kind} role={createMsg.kind === 'error' ? 'alert' : 'status'}>
            {createMsg.text}{' '}
            {createMsg.link && <button type="button" className="vol-inline-link" onClick={onViewFeed}>See it in the feed →</button>}
          </div>
        )}

        <label className="vol-field">
          <span>Title</span>
          <input className="vol-input" required maxLength={120} value={form.title} onChange={set('title')} />
        </label>
        <label className="vol-field">
          <span>Description</span>
          <textarea
            className="vol-input vol-textarea" maxLength={2000} value={form.description} onChange={set('description')}
            placeholder="What will volunteers actually be doing?"
          />
        </label>
        <label className="vol-field">
          <span>Department badge (posting as)</span>
          <select className="vol-input" value={form.faction} onChange={set('faction')}>
            {FACTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="vol-field">
          <span>Picture (image URL, optional)</span>
          <input className="vol-input" type="url" maxLength={1000} value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://example.com/photo.jpg" />
          {/* key resets the preview's "failed to load" state whenever the URL changes */}
          <PostImage key={form.imageUrl} url={form.imageUrl.trim()} className="vol-preview" />
        </label>
        <label className="vol-field">
          <span>Category</span>
          <select className="vol-input" value={form.category} onChange={set('category')}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="vol-row">
          <label className="vol-field">
            <span>Date</span>
            <input className="vol-input" type="date" required value={form.date} onChange={set('date')} />
          </label>
          <label className="vol-field">
            <span>Time</span>
            <input className="vol-input" type="time" value={form.time} onChange={set('time')} />
          </label>
        </div>
        <label className="vol-field">
          <span>Location</span>
          <input className="vol-input" maxLength={200} value={form.location} onChange={set('location')} placeholder="e.g. Precinct 3 Community Room" />
        </label>
        <label className="vol-field">
          <span>Volunteer capacity</span>
          <input className="vol-input" type="number" min="1" max="10000" required value={form.capacity} onChange={set('capacity')} />
        </label>
        <button type="submit" className="vol-btn vol-btn-full" data-variant="primary" disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish opportunity'}
        </button>
      </form>

      <div className="vol-admin-side">
        <section className="gl-panel">
          <div className="vol-panel-title">Current opportunities</div>
          <p className="vol-hint">
            <strong>Feature</strong> puts a post in the “Urgently need volunteers” banner.{' '}
            <strong>Copy invite</strong> makes an email/text draft you paste and send yourself — nothing is sent from here.
          </p>
          {notice && <div className="vol-msg" data-kind="error" role="alert">{notice}</div>}

          {events === null ? (error ? (
              <>
                <div className="vol-msg" data-kind="error" role="alert">Couldn't load posts: {error}</div>
                <button type="button" className="vol-btn vol-btn-sm" onClick={onRetry}>Try again</button>
              </>
            ) : <p className="vol-hint">Loading…</p>)
            : list.length === 0 ? <p className="vol-hint">No opportunities posted yet.</p>
            : list.map(evt => (
              <div className="vol-item" key={evt.id}>
                <div className="vol-item-top">
                  <PostImage url={evt.imageUrl} className="vol-thumb" />
                  <h4 className="vol-item-title">{evt.title}</h4>
                  <span className="vol-count-badge" title="Signed up / capacity">{evt.registered}/{evt.capacity}</span>
                </div>
                <div className="vol-item-sub">
                  <FactionTag faction={evt.faction} />
                  {[evt.date, evt.time, evt.location, evt.category].filter(Boolean).join(' · ')}
                </div>
                <div className="vol-item-actions">
                  <button className="vol-btn vol-btn-sm" onClick={() => viewSignups(evt)}>View sign-ups</button>
                  <button className="vol-btn vol-btn-sm" data-variant={evt.featured ? 'warn' : undefined} aria-pressed={evt.featured} onClick={() => toggleFeatured(evt)}>
                    {evt.featured ? '★ Featured' : '☆ Feature'}
                  </button>
                  <button className="vol-btn vol-btn-sm" aria-expanded={invite?.eventId === evt.id} onClick={() => toggleInvite(evt)}>Copy invite</button>
                  <button className="vol-btn vol-btn-sm" data-variant="danger" onClick={() => remove(evt)}>Delete</button>
                </div>
                {invite && invite.eventId === evt.id && (
                  <pre className="vol-invite">{invite.copied ? 'Copied to clipboard ✓\n\n' : ''}{invite.text}</pre>
                )}
              </div>
            ))}
        </section>

        <section className="gl-panel">
          <div className="vol-panel-title">Sign-ups</div>
          {!signups ? <p className="vol-hint">Choose “View sign-ups” on a post above.</p>
            : signups.loading ? <p className="vol-hint">Loading…</p>
            : signups.error ? <div className="vol-msg" data-kind="error" role="alert">{signups.error}</div>
            : signups.items.length === 0 ? <p className="vol-hint">No sign-ups yet for “{signups.title}.”</p>
            : (
              <>
                <p className="vol-hint">{signups.items.length} sign-up{signups.items.length === 1 ? '' : 's'} for “{signups.title}”</p>
                {signups.items.map(r => (
                  <div className="vol-reg" key={r.id}>
                    <div className="vol-reg-name">{r.name}</div>
                    <div className="vol-reg-meta">{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
                    {r.notes && <div className="vol-reg-meta">{r.notes}</div>}
                  </div>
                ))}
              </>
            )}
        </section>
      </div>
    </div>
  );
}
