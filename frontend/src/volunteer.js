// Small shared helpers for the volunteer page (feed + manage tabs).

// Which department a post is tagged as. Must match VolunteerStore.FACTIONS on the backend.
export const FACTIONS = ['Police', 'EMS', 'Fire'];

// Categories offered when staff publish a post. Categories already in use on
// existing posts are merged in, so nothing published earlier ever drops out.
export const DEFAULT_CATEGORIES = [
  'Community Outreach', 'Neighborhood Safety', 'Youth Programs', 'Health & Safety',
  'Fire Prevention', 'Special Events', 'Search & Rescue', 'Administrative Support', 'General'
];

// "2026-10-06" -> { month: 'OCT', day: '6' }. Parsed by hand rather than via
// new Date('2026-10-06'), which reads as UTC and shows the previous day in US timezones.
export function fmtDate(dateStr) {
  const parts = (dateStr || '').split('-');
  if (parts.length !== 3) return { month: '--', day: '--' };
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return { month: '--', day: '--' };
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate())
  };
}

// "17:30" -> "5:30 PM"
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

// "OCT 6 · 5:00 PM · Riverside Park Pavilion"
export function whenWhere(evt) {
  const { month, day } = fmtDate(evt.date);
  return [`${month} ${day}`, fmtTime(evt.time), evt.location].filter(Boolean).join(' · ');
}

// A ready-to-paste invite for one post. Nothing is sent from here — there is no
// outbound email/SMS in this project — so staff get a correctly formatted draft
// to drop into whatever they already use to reach volunteers.
export function buildInviteText(evt, link) {
  const when = [evt.date, evt.time].filter(Boolean).join(' at ');
  const faction = evt.faction || 'Police';
  const spotsLine = evt.remaining > 0
    ? `${evt.remaining} of ${evt.capacity} spots are still open.`
    : 'This one is currently full, but keep an eye out for the next one.';
  return `Subject: Volunteers needed — ${evt.title}

Hi neighbor,

${faction} is looking for volunteers for "${evt.title}."

When: ${when || 'TBD'}
Where: ${evt.location || 'TBD'}
${evt.description ? '\n' + evt.description + '\n' : ''}
${spotsLine}

Sign up here: ${link}

Thank you for considering it — every bit of help makes a difference.
— Gridline Community Engagement · ${faction}`;
}
