import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export type Shot = { src: string; title?: string; thumb?: string };

/** Full-screen image viewer with arrows, keyboard and thumbnails (Kamolon gallery). */
export function Lightbox({ items, start = 0, onClose }: { items: Shot[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const go = (d: number) => setI((v) => (v + d + items.length) % items.length);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { (strip.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [i]);
  const cur = items[i];
  return (
    <div className="lbox" onClick={onClose}>
      <div className="lwrap" onClick={(e) => e.stopPropagation()}>
        <button className="icbtn lx" onClick={onClose}><Icon n="close" /></button>
        <img src={cur.src} alt={cur.title ?? ''} />
        {cur.title && <div className="lcap">{cur.title} · {i + 1}/{items.length}</div>}
        {items.length > 1 && (
          <>
            <button className="lnav l" onClick={() => go(-1)}><Icon n="back" /></button>
            <button className="lnav r" onClick={() => go(1)}><span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}><Icon n="back" /></span></button>
            <div className="lthumbs" ref={strip}>
              {items.map((s, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)}><img src={s.thumb ?? s.src} alt="" loading="lazy" /></button>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
