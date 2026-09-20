import { useState } from 'react';
import VolunteerSignupModal from './VolunteerSignupModal.jsx';
import { FactionTag, PostImage } from './VolunteerBits.jsx';
import { whenWhere } from '../volunteer.js';

// The resident-facing side: a blog-style feed of posts from Police, EMS and
// Fire, filterable by department and category, with Sign up on every post that
// still has room.
//
// `readOnly` is the user-side "Community" view: browsing and filtering still
// work, but there's no Sign up button and so no sign-up modal — viewing only,
// no way to add or change anything on the page.
export default function VolunteerFeed({ events, error, onRetry, onSignedUp, readOnly = false }) {
  const [factionPick, setFactionPick] = useState('All');
  const [categoryPick, setCategoryPick] = useState('All');
  const [signupFor, setSignupFor] = useState(null);

  if (events === null) {
    return (
      <div className="gl-panel vol-empty">
        {error ? (
          <>
            <div className="vol-empty-title">Couldn't load posts</div>
            <p className="vol-empty-text">{error}. Make sure the backend is running, then try again.</p>
            <button className="vol-btn" onClick={onRetry}>Try again</button>
          </>
        ) : <p className="vol-empty-text">Loading posts…</p>}
      </div>
    );
  }

  // Filters only offer what exists. If the pick has since disappeared (its last
  // post was deleted), fall back to "All" instead of stranding the list empty.
  const factions = ['All', ...new Set(events.map(e => e.faction).filter(Boolean))];
  const faction = factions.includes(factionPick) ? factionPick : 'All';
  const inFaction = faction === 'All' ? events : events.filter(e => e.faction === faction);
  const categories = ['All', ...new Set(inFaction.map(e => e.category).filter(Boolean))];
  const category = categories.includes(categoryPick) ? categoryPick : 'All';
  const visible = category === 'All' ? inFaction : inFaction.filter(e => e.category === category);
  const urgent = events.filter(e => e.featured && e.remaining > 0);

  return (
    <>
      {error && <div className="vol-msg" data-kind="error" role="alert">{error}</div>}

      {urgent.length > 0 && (
        <section className="vol-urgent" aria-label="Urgently need volunteers">
          <div className="vol-urgent-label">Urgently need volunteers</div>
          {urgent.map(evt => (
            <div className="vol-urgent-row" key={evt.id}>
              <FactionTag faction={evt.faction} />
              <span className="vol-urgent-title">{evt.title}</span>
              <span className="vol-urgent-meta">{whenWhere(evt)}</span>
              <span className="vol-urgent-spots">{evt.remaining} of {evt.capacity} spots open</span>
            </div>
          ))}
        </section>
      )}

      <div className="vol-filters">
        <div className="vol-filter-group">
          <span className="vol-filter-label">Department</span>
          <div className="vol-chips">
            {factions.map(f => (
              <button
                key={f}
                className="vol-chip"
                data-faction={f === 'All' ? undefined : f}
                aria-pressed={f === faction}
                onClick={() => { setFactionPick(f); setCategoryPick('All'); }}
              >{f === 'All' ? 'All departments' : f}</button>
            ))}
          </div>
        </div>
        <div className="vol-filter-group">
          <span className="vol-filter-label">Category</span>
          <div className="vol-chips">
            {categories.map(c => (
              <button key={c} className="vol-chip" aria-pressed={c === category} onClick={() => setCategoryPick(c)}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="vol-count">
        {visible.length > 0 && `${visible.length} post${visible.length === 1 ? '' : 's'}`}
      </div>

      {visible.length === 0 ? (
        <div className="gl-panel vol-empty">
          <div className="vol-empty-title">No posts right now</div>
          <p className="vol-empty-text">Check back soon — Police, Fire, and EMS post new opportunities regularly.</p>
        </div>
      ) : (
        <div className="vol-feed">
          {visible.map(evt => {
            const full = evt.remaining <= 0;
            return (
              <article className="vol-post" data-faction={evt.faction} data-featured={evt.featured ? '' : undefined} key={evt.id}>
                <PostImage url={evt.imageUrl} className="vol-post-image" />
                <div className="vol-post-main">
                  <div className="vol-tags">
                    <FactionTag faction={evt.faction} />
                    <span className="vol-tag">{evt.category || 'General'}</span>
                    {evt.featured && <span className="vol-tag vol-tag-urgent">Urgent need</span>}
                  </div>
                  <h3 className="vol-post-title">{evt.title}</h3>
                  <p className="vol-post-meta">{whenWhere(evt)}</p>
                  {evt.description && <p className="vol-post-body">{evt.description}</p>}
                  <div className="vol-post-footer">
                    <span className="vol-spots" data-full={full ? '' : undefined}>
                      {full ? 'Full' : <><strong>{evt.remaining}</strong> of {evt.capacity} spots open</>}
                    </span>
                    {!readOnly && (
                      <button className="vol-btn" data-variant="primary" disabled={full} onClick={() => setSignupFor(evt)}>
                        {full ? 'Full' : 'Sign up'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!readOnly && signupFor && (
        <VolunteerSignupModal event={signupFor} onClose={() => setSignupFor(null)} onSignedUp={onSignedUp} />
      )}
    </>
  );
}
