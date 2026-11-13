// Full-screen toggle: the whole presentation fills the screen (no browser or Claude chrome around it).
// Browsers allow it only from a click; inside a frame that forbids it the request is refused → short hint.
import { useEffect, useState } from 'react';
import { Icon } from './icons';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const doc = document as FsDoc;
const current = () => document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
const root = () => document.documentElement as FsEl;
/** Element full screen exists in this browser (not on iPhone Safari, for example). */
export const fullscreenSupported = () => !!(root().requestFullscreen || root().webkitRequestFullscreen);

export default function FullscreenButton({ className, label, hint }: { className: string; label: string; hint: string }) {
  const [on, setOn] = useState(() => !!current());
  const [msg, setMsg] = useState(false);
  useEffect(() => {
    const f = () => setOn(!!current());
    document.addEventListener('fullscreenchange', f);
    document.addEventListener('webkitfullscreenchange', f);
    return () => { document.removeEventListener('fullscreenchange', f); document.removeEventListener('webkitfullscreenchange', f); };
  }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(false), 4500); return () => clearTimeout(t); }, [msg]);
  if (!fullscreenSupported()) return null;
  const toggle = async () => {
    try {
      if (current()) { await (document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.()); return; }
      const el = root();
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    } catch {
      setMsg(true);
    }
  };
  return (
    <>
      <button className={className + (on ? ' on' : '')} title={label} aria-label={label} onClick={toggle}>
        <Icon n={on ? 'shrink' : 'expand'} />
      </button>
      {msg && <div className="fs-toast" role="status">{hint}</div>}
    </>
  );
}
