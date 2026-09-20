import { useState } from 'react';

// Colour-coded department badge (Police blue, EMS green, Fire orange — the same
// three colours the dispatch map uses for those services).
export function FactionTag({ faction }) {
  const f = faction || 'Police';
  return <span className="vol-tag vol-faction" data-faction={f}>{f}</span>;
}

// A linked picture that simply disappears if the URL turns out not to load,
// rather than leaving a broken-image icon in the middle of a post.
export function PostImage({ url, className }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    <div className={className}>
      <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}
