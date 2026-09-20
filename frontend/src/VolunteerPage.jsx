import { useCallback, useEffect, useState } from 'react';
import HomeShell from './components/HomeShell.jsx';
import VolunteerFeed from './components/VolunteerFeed.jsx';
import VolunteerAdmin from './components/VolunteerAdmin.jsx';
import { getVolunteerEvents } from './api.js';
import './volunteer.css';

const TABS = [
  { id: 'feed', label: 'Community feed' },
  { id: 'manage', label: 'Manage posts' }
];

// The volunteer section of the operator hub, also reused as the read-only
// "Community" page on the user side. Two views over the same posts:
//   feed    what residents see — posts from Police, EMS and Fire, with sign-up
//   manage  what staff use — publish, feature, copy an invite, view sign-ups, delete
// The posts are loaded once here and shared, so publishing in one tab shows up
// in the other without a second fetch. Data lives on the backend
// (/api/volunteer/*), so nothing is lost by leaving for the hub and coming back.
//
// `readOnly` is how a user (as opposed to an operator) sees this same page:
// the "Manage posts" tab never renders, so there's no way to publish, feature,
// or delete a post, and the feed itself drops the "Sign up" button — a user
// can browse what's posted but can't make any change or addition to the page.
export default function VolunteerPage({ onBack, readOnly = false }) {
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

  return (
    <HomeShell onBack={onBack} subtitle="Community volunteers" maxWidth={1040}>
      <div className="vol-page">
        <div className="gl-head">
          <h1 className="gl-h1">Community volunteers</h1>
          <p className="gl-lede">
            {readOnly
              ? 'Police, Fire, and EMS post volunteer opportunities here. Browse what\u2019s open — this view is read-only.'
              : 'Police, Fire, and EMS post volunteer opportunities here. Once a post is up, anyone can sign up for it right away.'}
          </p>
        </div>

        {!readOnly && (
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
        )}

        <div id="vol-tabpanel" role="tabpanel" aria-labelledby={`vol-tab-${tab}`}>
          {readOnly || tab === 'feed'
            ? <VolunteerFeed events={events} error={error} onRetry={load} onSignedUp={load} readOnly={readOnly} />
            : <VolunteerAdmin events={events} error={error} onRetry={load} onChanged={load} onViewFeed={() => setTab('feed')} />}
        </div>
      </div>
    </HomeShell>
  );
}
