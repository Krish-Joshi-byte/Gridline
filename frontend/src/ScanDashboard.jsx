import { useEffect, useRef } from 'react';
import BackButton from './components/BackButton.jsx';

// The Gridline Scan studio (floor plan -> walkable 3D model) is a single
// self-contained HTML file with its own renderer, extractor and stylesheet — it
// makes no network requests at all. It's served as a static asset from
// public/scan/ and framed here rather than merged into the React tree because
// it injects global CSS resets and expects to own the whole window; the iframe
// keeps those from touching the dispatcher UI, and lets the studio be updated
// by dropping in a new file. See README ("Scan dashboard").
const STUDIO_SRC = `${import.meta.env.BASE_URL}scan/gridline-studio.html`;

// While the operator is on another screen this component stays mounted (so the
// loaded model isn't lost) but hidden. Browsers only throttle *cross-origin*
// hidden frames — a same-origin one like this keeps its requestAnimationFrame
// loop running at full rate — so a hidden studio would keep rendering a 3D scene
// behind the dispatch console all shift. The frame is ours and same-origin, so
// park its animation loop while hidden and release it when shown again. If the
// frame isn't reachable or ready, this does nothing and the frame just runs.
function setFramePaused(frame, paused) {
  try {
    const win = frame && frame.contentWindow;
    if (!win || typeof win.requestAnimationFrame !== 'function') return;
    if (paused && !win.__gridlineParked) {
      const real = win.requestAnimationFrame;
      const parked = [];
      win.__gridlineParked = { real, parked };
      win.requestAnimationFrame = cb => { parked.push(cb); return parked.length; };
    } else if (!paused && win.__gridlineParked) {
      const { real, parked } = win.__gridlineParked;
      win.requestAnimationFrame = real;
      delete win.__gridlineParked;
      parked.forEach(cb => real.call(win, cb));
    }
  } catch { /* cross-origin or not ready — leave the frame running */ }
}

// The studio follows the OS light/dark setting on its own, but the rest of
// Gridline is dark-only — a bright panel bolted onto a dark console looks broken.
// It exposes data-theme="dark" on its root for exactly this.
function forceDarkTheme(frame) {
  try { frame.contentDocument.documentElement.setAttribute('data-theme', 'dark'); } catch { /* leave the studio's own theme */ }
}

// The studio's walk mode reads W/A/S/D, which only reach it once the frame has
// keyboard focus.
function focusFrame(frame) {
  try { frame?.contentWindow?.focus(); } catch { /* leave focus alone */ }
}

export default function ScanDashboard({ onBack, active = true }) {
  const frameRef = useRef(null);

  useEffect(() => {
    const frame = frameRef.current;
    setFramePaused(frame, !active);
    if (active) focusFrame(frame);
  }, [active]);

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      // Same colour the studio paints, so there's no white flash while it loads.
      background: '#0b0f14'
    }}>
      <div style={{ borderBottom: '1px solid var(--line)', background: '#000000', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px' }}>
          <BackButton onClick={onBack} />
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)',
            border: '1px solid var(--line-strong)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, flexShrink: 0, color: 'var(--accent)', fontWeight: 800
          }}>3D</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Gridline Scan</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
              Floor plans are processed in your browser and never uploaded.
            </div>
          </div>
        </div>
      </div>

      <iframe
        ref={frameRef}
        title="Gridline Scan — floor plan to 3D model"
        src={STUDIO_SRC}
        allow="fullscreen"
        // A frame that finishes loading while the screen is hidden (the operator
        // left before it was ready) has to be parked here, since the effect above
        // ran against the empty document that was there before it loaded.
        onLoad={e => {
          forceDarkTheme(e.currentTarget);
          if (active) focusFrame(e.currentTarget); else setFramePaused(e.currentTarget, true);
        }}
        style={{ flex: 1, minHeight: 0, width: '100%', border: 0, display: 'block' }}
      />
    </div>
  );
}
