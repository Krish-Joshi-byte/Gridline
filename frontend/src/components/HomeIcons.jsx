// Small line icons for the home pages — SVG rather than emoji so they render the
// same everywhere and can take the card's accent colour via currentColor.
const base = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
};

// Gridline's mark: a location on a grid.
export const BrandMark = () => (
  <svg {...base} width="20" height="20">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity=".45" />
    <circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none" />
  </svg>
);

export const PinIcon = () => (
  <svg {...base}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
);
export const ConsoleIcon = () => (
  <svg {...base}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="M6.5 10.5h3l1.5-3 2.5 5.5 1.5-2.5h2.5" /></svg>
);
export const CubeIcon = () => (
  <svg {...base}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" /></svg>
);
export const PeopleIcon = () => (
  <svg {...base}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.3" /><path d="M16.5 14.2c2.6.2 4.5 2 4.5 4.8" /></svg>
);
export const LockIcon = () => (
  <svg {...base}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);

export const PhoneIcon = () => (
  <svg {...base}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
);
export const KeyboardIcon = () => (
  <svg {...base}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9" /></svg>
);
export const CheckIcon = () => (
  <svg {...base}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const AlertIcon = () => (
  <svg {...base}><path d="M12 3.5l9.5 16.5h-19L12 3.5z" /><path d="M12 10v4.5M12 17.5h.01" /></svg>
);
