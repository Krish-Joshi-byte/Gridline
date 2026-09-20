import HomeShell from './components/HomeShell.jsx';
import HomeCard from './components/HomeCard.jsx';
import { PinIcon, PeopleIcon } from './components/HomeIcons.jsx';

// Where a user lands after choosing "User" on the start screen. Two ways
// forward, styled the same way OperatorHub styles its own options:
//   citizen    the public report-an-emergency flow (no sign-in)
//   community  the same volunteer feed operators publish to, but read-only —
//              a user can browse posts, not publish or edit them.
const OPTIONS = [
  {
    id: 'citizen',
    icon: <PinIcon />,
    tone: 'accent',
    tag: 'NO SIGN-IN',
    title: 'Report an Emergency',
    desc: 'Send your location and a short description straight to dispatch.'
  },
  {
    id: 'community',
    icon: <PeopleIcon />,
    tone: 'danger',
    tag: 'VIEW ONLY',
    title: 'Community',
    desc: 'Browse volunteer posts from Police, EMS and Fire.'
  }
];

export default function UserHub({ onSelect, onBack }) {
  return (
    <HomeShell onBack={onBack} maxWidth={860}>
      <div className="gl-head">
        <h1 className="gl-h1">Where would you like to go?</h1>
      </div>

      <div className="gl-grid" style={{ '--cols': 2 }}>
        {OPTIONS.map(opt => (
          <HomeCard
            key={opt.id}
            tone={opt.tone}
            icon={opt.icon}
            tag={opt.tag}
            title={opt.title}
            desc={opt.desc}
            onClick={() => onSelect(opt.id)}
          />
        ))}
      </div>
    </HomeShell>
  );
}
