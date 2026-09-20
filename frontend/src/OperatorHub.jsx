import HomeShell from './components/HomeShell.jsx';
import HomeCard from './components/HomeCard.jsx';
import { ConsoleIcon, CubeIcon, PeopleIcon } from './components/HomeIcons.jsx';

// Where an operator lands after passing the password gate on the start screen.
// Three ways forward; each is just a `view` name that main.jsx knows how to render.
const OPTIONS = [
  {
    id: 'operator',
    icon: <ConsoleIcon />,
    tone: 'accent',
    title: 'Operator Dashboard',
    desc: 'Live dispatch console — 911 call queue, unit map and dispatch.'
  },
  {
    id: 'scan',
    icon: <CubeIcon />,
    tone: 'status',
    title: 'Scan Dashboard',
    desc: 'Turn a floor plan into a walkable 3D model of a building.'
  },
  {
    id: 'volunteer',
    icon: <PeopleIcon />,
    tone: 'danger',
    title: 'Volunteer',
    desc: 'Community volunteer posts from Police, EMS and Fire — publish opportunities and manage sign-ups.'
  }
];

export default function OperatorHub({ onSelect, onSignOut }) {
  return (
    <HomeShell
      maxWidth={1060}
      footerLeft="Signed in as operator"
      footerRight={<button className="gl-linkbtn" onClick={onSignOut}>Sign out</button>}
    >
      <div className="gl-head">
        <h1 className="gl-h1">Operator access</h1>
        <p className="gl-lede">Where would you like to go?</p>
      </div>

      <div className="gl-grid" style={{ '--cols': 3 }}>
        {OPTIONS.map(opt => (
          <HomeCard
            key={opt.id}
            tone={opt.tone}
            icon={opt.icon}
            title={opt.title}
            desc={opt.desc}
            tag={opt.soon ? 'COMING SOON' : undefined}
            soon={opt.soon}
            onClick={() => onSelect(opt.id)}
          />
        ))}
      </div>
    </HomeShell>
  );
}
