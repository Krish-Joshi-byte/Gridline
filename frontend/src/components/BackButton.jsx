// The "‹ Menu" button used by every screen behind the operator hub, so they
// all look and behave the same.
export default function BackButton({ onClick, label = 'Menu' }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Back to ${label.toLowerCase()}`}
      style={{
        height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
        fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
        border: '1px solid var(--line-strong)', background: 'transparent', color: 'var(--ink-secondary)'
      }}
    >
      ‹ {label}
    </button>
  );
}
