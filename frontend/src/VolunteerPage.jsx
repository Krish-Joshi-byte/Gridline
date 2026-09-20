import { useCallback, useEffect, useState } from 'react';
import HomeShell from './components/HomeShell.jsx';
import VolunteerFeed from './components/VolunteerFeed.jsx';
import VolunteerAdmin from './components/VolunteerAdmin.jsx';
import { getVolunteerEvents } from './api.js';
import './volunteer.css';

const TABS = [
  { id: 'feed', label: 'Feed preview' },
  { id: 'manage', label: 'Manage posts' }
];

// The volunteer section of the operator hub. Two views over the same posts:
//   feed    a read-only preview of what residents see — posts from Police, EMS
//           and Fire. No Sign up button here: signing up is a resident action
//           that happens on the public volunteer page, not the operator console.
//   manage  what staff use — publish, feature, copy an invite, view sign-ups, delete
// The posts are loaded once here and shared, so publishing shows up in the
// preview without a second fetch. Data lives on the backend (/api/volunteer/*),
// so nothing is lost by leaving for the hub and coming back.
//
// `mode` switches this between the two audiences that use the same data:
//   'operator' (default) — behind the password gate. Tabs, feed is preview-only.
//   'public'              — no gate, no tabs, no manage panel. Just the feed,
//                            with Sign up live. This is what residents get from
//                            the start screen or the /volunteer link.
export default function VolunteerPage({ onBack, mode = 'operator' }) {
  const [tab, setTab] = useState('feed');
  const [events, setEvents] = useState(null);   // null until the first load succeeds
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await getVolunteerEvents();
      list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setEvents(list);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (mode === 'public') {
    return (
      <HomeShell onBack={onBack} subtitle="Community volunteers" maxWidth={1040}>
        <div className="vol-page">
          <div className="gl-head">
            <h1 className="gl-h1">Community volunteers</h1>
            <p className="gl-lede">
              Police, Fire, and EMS post volunteer opportunities here. Once a post is up, anyone can sign up for it right away.
            </p>
          </div>
          <VolunteerFeed events={events} error={error} onRetry={load} onSignedUp={load} />
        </div>
      </HomeShell>
    );
  }

  return (
    <HomeShell onBack={onBack} subtitle="Community volunteers" maxWidth={1040}>
      <div className="vol-page">
        <div className="gl-head">
          <h1 className="gl-h1">Community volunteers</h1>
          <p className="gl-lede">
            Police, Fire, and EMS post volunteer opportunities here. Residents sign up on the public volunteer page —
            this console is for publishing and managing posts, not for staff to sign up themselves.
          </p>
        </div>

        <div className="vol-tabs" role="tablist" aria-label="Volunteer views">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              id={`vol-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="vol-tabpanel"
              className="vol-tab"
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        <div id="vol-tabpanel" role="tabpanel" aria-labelledby={`vol-tab-${tab}`}>
          {tab === 'feed'
            ? <VolunteerFeed events={events} error={error} onRetry={load} readOnly />
            : <VolunteerAdmin events={events} error={error} onRetry={load} onChanged={load} onViewFeed={() => setTab('feed')} />}
        </div>
      </div>
    </HomeShell>
  );
}
