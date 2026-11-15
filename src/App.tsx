import { useEffect, useMemo, useRef, useState } from 'react';
import BlockView from './block/BlockView';
import { DEFAULT_HOUR, STOPS, STOP_NAMES, fmtStop } from './three/timeStops';
import FullscreenButton from './block/ui/Fullscreen';
import ModeSwitch from './block/ui/ModeSwitch';
import { Icon } from './block/ui/icons';
import { SECTIONS, type Sec } from './block/ui/i18n';
import { ComplexScene } from './three/ComplexScene';
import { BLOCKS, FLOORS, TOTAL_APARTMENTS, PRICE_PER_M2, TYPE4 } from './data/blocks';
import { APARTMENTS, blockStats, type Status } from './data/apartments';
import EditPanel from './three/EditPanel';
import RenderStats from './three/RenderStats';
import NearbyPanel from './three/NearbyPanel';
import { loaderClose, loaderReveal } from './loader';
import { blockInfo } from './data/blockInfo';
import { fmtHour } from './three/sun';
import { PHASES, REPORT_DATE, TODAY_M, T_MONTHS, complexProgress, monthLabel } from './data/progress';

const usd = (n: number) => '$' + n.toLocaleString('en-US').replace(/,/g, ' ');
const STATUS: Record<Status, string> = { free: 'Sotuvda', reserved: 'Bron', sold: 'Sotilgan' };

/** a row of the settings menu: name, a line of explanation, an on / off switch (a real checkbox underneath) */
function Switch({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sw">
      <span className="txt"><b>{label}</b><small>{sub}</small></span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tr" aria-hidden />
    </label>
  );
}


const parseHash = (): { id: number; sec: Sec } | null => {
  const m = location.hash.match(/^#blok-(\d+)(?:-([a-z]+))?$/);
  if (!m) return null;
  const sec = (SECTIONS as string[]).includes(m[2] ?? '') ? (m[2] as Sec) : 'bino';
  return { id: parseInt(m[1]), sec };
};

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const cur = useRef(route); cur.current = route;
  // another view (the complex ↔ a block, or another block): the loading clouds close over the old one first, the new
  // one parts them when it has arrived (loader.ts); a section of the same block page switches at once
  useEffect(() => {
    const f = () => {
      const r = parseHash();
      if ((r?.id ?? null) === (cur.current?.id ?? null)) setRoute(r);
      else void loaderClose().then(() => setRoute(parseHash()));
    };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);
  const go = (id: number | null, sec: Sec = 'bino') => {
    const apply = () => {
      const h = id === null ? '' : `blok-${id}${sec === 'bino' ? '' : '-' + sec}`;
      if (h) location.hash = h; else history.replaceState(null, '', location.pathname + location.search);
      setRoute(id === null ? null : { id, sec });
    };
    if (id === (cur.current?.id ?? null)) apply(); else void loaderClose().then(apply);
  };
  if (route) return <BlockView key={route.id} blockId={route.id} sec={route.sec} onSec={(s) => go(route.id, s)} onBack={() => go(null)} />;
  return <ComplexApp onOpen={(id) => go(id)} />;
}

function ComplexApp({ onOpen }: { onOpen: (id: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ComplexScene | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [plan, setPlan] = useState(true);
  const [ctx, setCtx] = useState(true);
  const [white, setWhite] = useState(false);
  const [court3D, setCourt3D] = useState(true);
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [ctxN, setCtxN] = useState<number | null | undefined>(undefined);
  const [live, setLive] = useState(() => location.search.includes('live=1'));
  // the right-hand panel folds away to the right edge (closed at first; the viewer's choice is remembered)
  const [panelOpen, setPanelOpen] = useState(() => { try { return localStorage.getItem('om-panel') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('om-panel', panelOpen ? '1' : '0'); } catch { /* private window */ } }, [panelOpen]);
  // the top bar of view settings folds up to the top edge the same way
  const [toolsOpen, setToolsOpen] = useState(() => { try { return localStorage.getItem('om-tools') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('om-tools', toolsOpen ? '1' : '0'); } catch { /* private window */ } }, [toolsOpen]);
  // the settings menu closes on a click anywhere else (it stood over the side panel), and on Esc
  const setWrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    const down = (e: PointerEvent) => { if (!setWrap.current?.contains(e.target as Node)) setToolsOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setToolsOpen(false); };
    addEventListener('pointerdown', down, true); addEventListener('keydown', key);
    return () => { removeEventListener('pointerdown', down, true); removeEventListener('keydown', key); };
  }, [toolsOpen]);
  const [mi, setMi] = useState(TODAY_M);
  const [playing, setPlaying] = useState(false);
  const editMode = useMemo(() => new URLSearchParams(location.search).get('edit') === '1', []);
  const outerMode = useMemo(() => new URLSearchParams(location.search).get('edit') === '2', []);
  const [outerN, setOuterN] = useState(0);
  useEffect(() => {
    if (!outerMode) return;
    const id = setInterval(() => { if (scene.current) { scene.current.setOuterEdit(setOuterN); clearInterval(id); } }, 200);
    return () => { clearInterval(id); scene.current?.setOuterEdit(null); };
  }, [outerMode]);
  const outerExport = () => {
    const d = scene.current?.outerExport(); if (!d) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d) + '\n'], { type: 'application/json' }));
    a.download = 'outer-picks.json'; a.click(); URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    const s = new ComplexScene(host.current!, {
      onSelect: (id) => { if (id) onOpen(id); else { setSelected(null); setFloor(null); } },
      onHover: (id, x, y) => setHover(id ? { id, x, y } : null),
      onContext: (n) => setCtxN(n),
    });
    scene.current = s;
    loaderReveal(s.loaded);
    (window as unknown as { __complex: ComplexScene }).__complex = s;
    return () => s.dispose();
  }, []);
  useEffect(() => { scene.current?.setSelected(selected); }, [selected]);
  useEffect(() => { scene.current?.setFloor(floor); }, [floor]);
  useEffect(() => { scene.current?.setPlanVisible(plan); }, [plan]);
  useEffect(() => { scene.current?.setContextVisible(ctx); }, [ctx, ctxN]);
  useEffect(() => { scene.current?.setCourtyard3D(court3D); }, [court3D, ctxN]);
  useEffect(() => { const id = requestAnimationFrame(() => scene.current?.setHour(hour)); return () => cancelAnimationFrame(id); }, [hour]);
  useEffect(() => { scene.current?.setContextStyle(white ? 'white' : 'real'); }, [white, ctxN]);
  useEffect(() => { const id = requestAnimationFrame(() => scene.current?.setProgress(live ? mi : null)); return () => cancelAnimationFrame(id); }, [live, Math.round(mi * 4)]);
  const miRef = useRef(mi); miRef.current = mi;
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const v = Math.min(T_MONTHS, miRef.current + ((now - last) / 1000) * 1.6); last = now;
      setMi(v);
      if (v >= T_MONTHS) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const cp = useMemo(() => complexProgress(mi), [Math.round(mi * 4)]);
  // live construction: the block pointed at in the view brings its card in the side panel into sight
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => { if (live && hover) cardRefs.current.get(hover.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [live, hover?.id]);

  const totals = useMemo(() => {
    const c = { free: 0, reserved: 0, sold: 0 };
    APARTMENTS.forEach((a) => c[a.status]++);
    return c;
  }, []);

  const stats = selected ? blockStats(selected) : null;
  const list = useMemo(
    () => (selected && floor ? APARTMENTS.filter((a) => a.block === selected && a.floor === floor) : []),
    [selected, floor],
  );

  return (
    <div className="app">
      <RenderStats place="top" />
      <NearbyPanel scene={scene} />
      <div ref={host} className="viewport" />
      {/* header in the block page's system (block/ui/block.css): brand · time of day · settings, dark glass */}
      <header className="top">
        <div className="brand c-glass">
          <img src="logo.png" alt="Art House" />
          <div><b>OBOD MASKAN<ModeSwitch /></b><span>Turar-joy majmuasi · 3D general plan</span></div>
        </div>

        <div className="c-time c-glass" role="group" aria-label="Kun vaqti" title="Kun vaqti (21-iyun, Toshkent): quyosh haqiqiy o‘rnida, kechasi chiroqlar yonadi">
          <div className="hours">
            {STOPS.map((h) => <button key={h} className={'hr' + (h === hour ? ' on' : '')} title={STOP_NAMES[h]} aria-pressed={h === hour} onClick={() => setHour(h)}>{fmtStop(h)}</button>)}
          </div>
          <div className="stop-name"><Icon n={hour <= 4 || hour >= 23 ? 'moon' : hour <= 7 ? 'sunrise' : hour >= 19 ? 'sunset' : 'sun'} size={14} /><span>{STOP_NAMES[hour]}</span><small>21-iyun · Toshkent</small></div>
        </div>

        <div className="c-right">
          <div className="c-set-wrap" ref={setWrap}>
            <button className={'c-set c-glass' + (toolsOpen ? ' on' : '')} onClick={() => setToolsOpen(!toolsOpen)} aria-expanded={toolsOpen} aria-controls="view-tools">
              <Icon n="sliders" size={18} /><span>Sozlamalar</span>{live && <i className="c-dot" title="Qurilish holati yoqilgan" />}<Icon n={toolsOpen ? 'up' : 'down'} size={16} />
            </button>
            <div id="view-tools" className={'c-menu c-glass' + (toolsOpen ? '' : ' shut')} aria-hidden={!toolsOpen} inert={!toolsOpen}>
              <h4>Ko‘rinish</h4>
              {ctxN ? <Switch label="3D hovli" sub="Ko‘kalamzorlashtirish va jihozlar" checked={court3D} onChange={setCourt3D} /> : null}
              {(!ctxN || !court3D) && <Switch label="General plan" sub="Hovlining chizma rasmi" checked={plan} onChange={setPlan} />}
              {ctxN !== null && <Switch label="Atrof" sub="Uylar, ko‘chalar, trotuarlar" checked={ctx} onChange={setCtx} />}
              {ctxN !== null && ctx && <Switch label="Oq maket" sub="Atrof oq rangda" checked={white} onChange={setWhite} />}
              <hr />
              <Switch label="Qurilish holati" sub="Bloklar qaysi bosqichda (namunaviy)" checked={live}
                onChange={(v) => { setLive(v); setSelected(null); if (v) { setPanelOpen(true); setToolsOpen(false); } }} />
              <p className="c-demo">DEMO · narx <b>{usd(PRICE_PER_M2)}/m²</b></p>
            </div>
          </div>
          <FullscreenButton className="fs-btn c-glass" label="To‘liq ekran" hint="Brauzer bu oynada to‘liq ekranga ruxsat bermadi — klaviaturada F11 ni bosing" />
        </div>
      </header>

      {/* in the live construction view the block's card opens instead (blockCards.ts) */}
      {hover && hover.id !== selected && !live && (
        <div className="tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {`${hover.id}-blok · ${blockStats(hover.id).free} ta sotuvda`}
        </div>
      )}

      {outerMode && (
        <div className="outer-edit">
          <b>edit=2 · tashqi shahar</b>
          <span>Binoni bosing (Shift — qo'shib tanlash). Tanlangan: <b>{outerN}</b></span>
          <div><button onClick={outerExport} disabled={!outerN}>JSON yuklab olish</button><button onClick={() => scene.current?.outerClear()} disabled={!outerN}>Tozalash</button></div>
        </div>
      )}
      {editMode && ctxN ? <EditPanel scene={scene} /> : (<>
      <button className={'panel-tab' + (panelOpen ? ' open' : '')} onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen} aria-controls="side-panel" title={panelOpen ? 'Panelni yopish' : 'Panelni ochish'}>
        <span aria-hidden>{panelOpen ? '›' : '‹'}</span>{!panelOpen && <b>{live ? 'Qurilish' : selected ? `${selected}-blok` : 'Majmua'}</b>}
      </button>
      <aside id="side-panel" className={'panel' + (panelOpen ? '' : ' shut')} aria-hidden={!panelOpen} inert={!panelOpen}>
        {live && !selected && (
          <>
            <h2>Qurilish jarayoni</h2>
            <p className="mock">Namunaviy jadval — qurilish maydonidan haftalik hisobot ulanganda haqiqiy holat ko‘rsatiladi.</p>
            <div className="kpis">
              <div><b>{cp.pct}%</b><span>majmua</span></div>
              <div><b>{cp.done}/{BLOCKS.length}</b><span>topshirildi</span></div>
              <div><b>{cp.ps.filter((p) => p.stage > 0 && !p.done).length}</b><span>qurilmoqda</span></div>
            </div>
            <div className="live-date">
              <button className="play" onClick={() => { if (!playing && mi >= T_MONTHS - 0.01) setMi(0); setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
              <div>
                <b>{monthLabel(mi)}</b>
                <input type="range" min={0} max={T_MONTHS} step={0.05} value={mi} onChange={(e) => { setPlaying(false); setMi(+e.target.value); }} />
                <div className="ticks"><span>{monthLabel(0)}</span><i style={{ left: (TODAY_M / T_MONTHS) * 100 + '%' }} title="bugun" /><span>{monthLabel(T_MONTHS)}</span></div>
              </div>
              <button className={'today' + (Math.abs(mi - TODAY_M) < 0.05 ? ' on' : '')} onClick={() => { setPlaying(false); setMi(TODAY_M); }}>Bugun</button>
            </div>
            <p className="hint">Oxirgi hisobot: {REPORT_DATE.split('-').reverse().join('.')}. Vaqtni suring yoki ▶ bosing — bloklar qanday qurilishini ko‘rasiz.</p>
            <div className="phases">{PHASES.slice(1).map((ph) => <span key={ph.color}><i style={{ background: ph.color }} />{ph.name[0]}</span>)}</div>
            {/* a card per block (the owner's sketch): block, cadastre, start · on sale · handover, progress — the
                block pointed at in the view (or at its tag) lights its card up and brings it into sight */}
            <div className="pcards">
              {BLOCKS.map((b, i) => {
                const p = cp.ps[i], info = blockInfo(b.id);
                return (
                  <button key={b.id} ref={(e) => { if (e) cardRefs.current.set(b.id, e); else cardRefs.current.delete(b.id); }}
                    className={'pcard' + (hover?.id === b.id ? ' on' : '')} style={{ '--c': PHASES[p.phase].color } as React.CSSProperties}
                    onClick={() => onOpen(b.id)} onMouseEnter={() => scene.current?.pointBlock(b.id)} onMouseLeave={() => scene.current?.pointBlock(null)}
                    title={TYPE4.includes(b.id) ? 'Blokka kirish — "Qurilish" rejimida shu bosqichni ko‘rish mumkin' : 'Blokka kirish'}>
                    <span className="hd"><b>{b.id}-blok</b>
                      {info.cadastre ? <span className="kad ok" title="Kadastrdan o‘tgan (namunaviy)">✓ Kadastr</span>
                        : <span className="kad" title="Kadastr rasmiylashtirilmoqda (namunaviy)">Kadastr jarayonda</span>}</span>
                    <span className="cells">
                      <span><small>Qurilish</small><b>{monthLabel(info.start)}</b></span>
                      <span><small>Sotuvga chiqdi</small><b>{monthLabel(info.sale)}</b></span>
                      <span><small>Tugash</small><b>{monthLabel(info.finish)}</b></span>
                    </span>
                    <span className="bar"><i style={{ width: p.pct + '%' }} /></span>
                    <span className="ft"><span>{p.done ? 'Topshirildi' : PHASES[p.phase].name[0]}{!p.done && p.stage > 0 && p.frame < 16 ? ` · ${Math.floor(p.frame)}/16 qavat` : ''}</span><b>{p.pct}%</b></span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {!live && !selected && (
          <>
            <h2>Majmua</h2>
            <div className="kpis">
              <div><b>{BLOCKS.length}</b><span>blok</span></div>
              <div><b>{FLOORS}</b><span>qavat</span></div>
              <div><b>{TOTAL_APARTMENTS}</b><span>xonadon</span></div>
            </div>
            <Bar c={totals} total={TOTAL_APARTMENTS} />
            <p className="hint">Blokni xaritada yoki ro‘yxatdan tanlang. Aylantirish: sudrang, yaqinlashtirish: g‘ildirak.</p>
            <div className="grid">
              {BLOCKS.map((b) => {
                const st = blockStats(b.id);
                return (
                  <button key={b.id} className="cell" onClick={() => onOpen(b.id)}>
                    <b>{b.id}</b><span>{st.free} ta</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {selected && stats && (
          <>
            <button className="back" onClick={() => setSelected(null)}>← Barcha bloklar</button>
            <h2>{selected}-blok</h2>
            {TYPE4.includes(selected) && <button className="go3d" onClick={() => onOpen(selected)}>3D bino: fasad va xonadonlar →</button>}
            <div className="kpis">
              <div><b>{FLOORS}</b><span>qavat</span></div>
              <div><b>{stats.total}</b><span>xonadon</span></div>
              <div><b>{usd(stats.minPrice)}</b><span>dan</span></div>
            </div>
            <Bar c={stats} total={stats.total} />

            <h3>Qavat</h3>
            <div className="floors">
              <button className={floor === null ? 'on' : ''} onClick={() => setFloor(null)}>Hammasi</button>
              {Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((f) => (
                <button key={f} className={floor === f ? 'on' : ''} onClick={() => setFloor(f)}>{f}</button>
              ))}
            </div>

            {floor === 1 && <p className="hint">1-qavat: savdo va tijorat maydonlari, xonadonlar yo‘q.</p>}
            {floor && floor > 1 && (
              <table>
                <thead><tr><th>№</th><th>Xona</th><th>m²</th><th>Narx</th><th></th></tr></thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id}>
                      <td>{a.num}</td><td>{a.rooms}</td><td>{a.area.toFixed(2)}</td><td>{usd(a.price)}</td>
                      <td><i className={'dot ' + a.status} title={STATUS[a.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!floor && <p className="hint">Qavatni tanlasangiz, bino shu qavatgacha kesilib ko‘rsatiladi.</p>}
          </>
        )}
      </aside>
      </>)}
      <p className="osm">Atrof: © OpenStreetMap mualliflari · Daraxtlar: 00amza, 99.Miles (Sketchfab, CC BY 4.0)</p>
    </div>
  );
}

function Bar({ c, total }: { c: Record<Status, number>; total: number }) {
  return (
    <div className="bar">
      <div className="track">
        <i className="free" style={{ width: (c.free / total) * 100 + '%' }} />
        <i className="reserved" style={{ width: (c.reserved / total) * 100 + '%' }} />
        <i className="sold" style={{ width: (c.sold / total) * 100 + '%' }} />
      </div>
      <div className="legend">
        <span><i className="dot free" /> Sotuvda {c.free}</span>
        <span><i className="dot reserved" /> Bron {c.reserved}</span>
        <span><i className="dot sold" /> Sotilgan {c.sold}</span>
      </div>
    </div>
  );
}
