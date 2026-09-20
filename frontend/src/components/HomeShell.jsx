import { useEffect, useState } from 'react';
import '../home.css';
import BackButton from './BackButton.jsx';
import { BrandMark } from './HomeIcons.jsx';

// The clock block from the dashboard's nav, so the two look like one product.
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="gl-clock">
      <div>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div className="gl-clock-time">{now.toLocaleTimeString([], { hour12: false })}</div>
    </div>
  );
}

// Frame shared by every home page: dashboard-style top bar, the map-toned canvas
// with its grid and ping, and a status strip along the bottom.
export default function HomeShell({
  subtitle = 'Emergency dispatch for Blacksburg, VA',
  onBack,
  maxWidth = 960,
  footerLeft = 'Blacksburg, VA · 24060',
  footerRight = null,
  children
}) {
  return (
    <div className="gl-home">
      <header className="gl-topbar">
        <div className="gl-topbar-inner">
          {onBack && <BackButton onClick={onBack} />}
          <div className="gl-badge"><BrandMark /></div>
          <div>
            <div className="gl-brand">Gridline</div>
            <div className="gl-sub">{subtitle}</div>
          </div>
          <Clock />
        </div>
      </header>

      <main className="gl-canvas">
        <div className="gl-ping" aria-hidden="true"><i /><i /><i /></div>
        <div className="gl-content" style={{ maxWidth }}>{children}</div>
      </main>

      <footer className="gl-statusbar">
        <span>{footerLeft}</span>
        {footerRight}
      </footer>
    </div>
  );
}
