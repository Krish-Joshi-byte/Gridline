// One destination on a home page. Styled as the dashboard's call card at a
// larger size: a colour rail, a badge like the "911" one in the nav, and a small
// bold tag where the dashboard puts "OPEN". `tone` decides what the colour means:
// danger = emergency, accent = operator tooling, status = green/scan, anything else = neutral/not live.
export default function HomeCard({ icon, title, desc, tag, soon = false, tone = 'neutral', onClick }) {
  return (
    <button className="gl-card" data-tone={tone} onClick={onClick}>
      <div className="gl-card-top">
        <span className="gl-card-icon">{icon}</span>
        {tag && <span className="gl-tag" data-soon={soon ? '' : undefined}>{tag}</span>}
      </div>
      <div>
        <div className="gl-card-title">{title}</div>
        <div className="gl-card-desc">{desc}</div>
      </div>
    </button>
  );
}
