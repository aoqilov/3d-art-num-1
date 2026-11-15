// "Yaqinda": what is around the complex out to 5 km (public/context/nearby.json, tools/nearby/fetch.mjs) — a left-edge
// panel under the Render one: radius (the rings in the view), kinds, a summary, the list with the distance and the
// time by road on foot and by car. A row or a pin in the view flies the camera there.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComplexScene } from './ComplexScene';
import { CAT, RADII, SUB, radiusLabel, type NearbyPlace } from './nearbyLayer';
import { LEFT_EVENT } from './RenderStats';

const KEY = 'om-nearby';
const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
const SHOW = 5;

let data: Promise<NearbyPlace[]> | null = null;
const load = () => (data ??= fetch('context/nearby.json').then((r) => r.json()).then((j) => j.places as NearbyPlace[]).catch(() => []));

export default function NearbyPanel({ scene }: { scene: React.MutableRefObject<ComplexScene | null> }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [radius, setRadius] = useState(1000);
  const [cats, setCats] = useState<Set<string>>(() => new Set(Object.keys(CAT)));
  const [sel, setSel] = useState<string | null>(null);
  const [more, setMore] = useState<Set<string>>(new Set());
  const rows = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => { void load().then(setPlaces); }, []);
  useEffect(() => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* blocked */ } }, [open]);
  useEffect(() => {
    if (open) dispatchEvent(new CustomEvent(LEFT_EVENT, { detail: 'nearby' }));
    const other = (e: Event) => { if ((e as CustomEvent).detail !== 'nearby') setOpen(false); };
    addEventListener(LEFT_EVENT, other);
    return () => removeEventListener(LEFT_EVENT, other);
  }, [open]);

  const inRadius = useMemo(() => places.filter((p) => p.m <= radius), [places, radius]);
  const shown = useMemo(() => inRadius.filter((p) => cats.has(p.cat)), [inRadius, cats]);
  const groups = useMemo(() => {
    const g = new Map<string, NearbyPlace[]>();
    for (const p of shown) { let a = g.get(p.sub); if (!a) g.set(p.sub, (a = [])); a.push(p); }
    return [...g].sort((a, b) => (SUB[a[0]]?.order ?? 99) - (SUB[b[0]]?.order ?? 99));
  }, [shown]);
  const catCount = (c: string) => inRadius.filter((p) => p.cat === c).length;

  // the view: rings and pins while the panel is open (the scene is made after this panel's first effects — wait for it)
  const [tries, retry] = useState(0);
  useEffect(() => {
    const s = scene.current;
    if (!s) { const id = setTimeout(() => retry((t) => t + 1), 200); return () => clearTimeout(id); }
    s.setNearby(open ? { radius, places: shown, selected: sel } : null);
    s.onNearbyPick = open ? (p) => { setSel(p.id); setMore((m) => new Set(m).add(p.sub)); s.focusNearby(p); } : null;
  }, [open, radius, shown, sel, scene, tries]);
  useEffect(() => () => { scene.current?.setNearby(null); }, [scene]);
  // the chosen row in sight (a pin was clicked)
  useEffect(() => { if (sel) rows.current.get(sel)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [sel, more]);

  const pickRadius = (r: number) => { setRadius(r); setSel(null); scene.current?.showRadius(r); };
  const pickPlace = (p: NearbyPlace) => { setSel(p.id); scene.current?.focusNearby(p); };
  const toggleCat = (c: string) => setCats((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n.size ? n : new Set(Object.keys(CAT)); });

  const summary = groups.slice(0, 6).map(([sub, l]) => `${l.length} ${sub.toLowerCase()}`).join(', ');

  return (
    <div className={'nb-dock' + (open ? '' : ' shut')}>
      <div className="nb-panel" aria-hidden={!open} inert={!open}>
        <div className="nb-head"><b>Yaqinda</b><span>Majmuadan {radiusLabel(radius)} radiusda</span></div>
        <div className="nb-radius" role="group" aria-label="Radius">
          {RADII.map((r) => <button key={r} className={r === radius ? 'on' : ''} aria-pressed={r === radius} onClick={() => pickRadius(r)}>{radiusLabel(r)}</button>)}
        </div>
        <div className="nb-cats">
          {Object.entries(CAT).map(([c, v]) => (
            <button key={c} className={cats.has(c) ? 'on' : ''} aria-pressed={cats.has(c)} style={{ '--c': v.color } as React.CSSProperties} onClick={() => toggleCat(c)}>
              <i />{v.label}<em>{catCount(c)}</em>
            </button>
          ))}
        </div>
        <p className="nb-sum">{shown.length ? `${radiusLabel(radius)} ichida: ${summary}${groups.length > 6 ? '…' : ''}` : places.length ? 'Bu radiusda tanlangan turdagi joy yo‘q.' : 'Yuklanmoqda…'}</p>
        <div className="nb-list">
          {groups.map(([sub, list]) => {
            const all = more.has(sub), cut = all ? list : list.slice(0, SHOW);
            return (
              <section key={sub}>
                <h5><span>{SUB[sub]?.glyph}</span>{sub}<em>{list.length}</em></h5>
                {cut.map((p) => (
                  <button key={p.id} ref={(el) => { if (el) rows.current.set(p.id, el); else rows.current.delete(p.id); }}
                    className={'nb-row' + (p.id === sel ? ' on' : '')} onClick={() => pickPlace(p)} style={{ '--c': CAT[p.cat]?.color } as React.CSSProperties}>
                    <b>{p.name || sub}</b>
                    <small>
                      <span title="To‘g‘ri chiziq bo‘yicha">{km(p.m)}</span>
                      {p.foot && <span title={`Piyoda, yo‘l bo‘yicha ${km(p.foot.m)}`}>🚶 {p.foot.min} daq</span>}
                      {p.car && <span title={`Mashinada, yo‘l bo‘yicha ${km(p.car.m)}`}>🚗 {km(p.car.m)} · {p.car.min} daq</span>}
                    </small>
                  </button>
                ))}
                {list.length > SHOW && <button className="nb-more" onClick={() => setMore((m) => { const n = new Set(m); if (all) n.delete(sub); else n.add(sub); return n; })}>{all ? 'Yig‘ish' : `Yana ${list.length - SHOW} ta`}</button>}
              </section>
            );
          })}
        </div>
        <p className="nb-note">Yo‘l bo‘yicha masofa va vaqt OpenStreetMap yo‘llarida, tirbandliksiz hisoblangan — taxminiy. Joylar: © OpenStreetMap mualliflari.</p>
      </div>
      <button className="nb-tab" onClick={() => { if (!open) scene.current?.showRadius(radius); setOpen(!open); }}aria-expanded={open} title={open ? 'Yaqinda panelini yopish' : 'Atrofda nimalar bor: maktab, bog‘cha, metro…'}>
        <span aria-hidden>{open ? '‹' : '›'}</span><b>Yaqinda</b>
      </button>
    </div>
  );
}
