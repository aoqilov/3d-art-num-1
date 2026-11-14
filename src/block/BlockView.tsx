import { useEffect, useMemo, useRef, useState } from 'react';
import RenderStats from '../three/RenderStats';
import { DEFAULT_HOUR, STOPS, fmtStop, stopName } from '../three/timeStops';
import { BlockScene, PRO, type AptPick, type EnergyPick, type ProState, type WalkState } from './BlockScene';
import { EnergyCard, EnergyPanel } from './ui/EnergyPanel';
import { FLOORS, planFor } from './plan';
import { aptInfo, aptRooms, usd, type Status } from './aptData';
import { BLOCKS, TYPE4 } from '../data/blocks';
import { APARTMENTS } from '../data/apartments';
import { Icon } from './ui/icons';
import FullscreenButton from './ui/Fullscreen';
import ModeSwitch from './ui/ModeSwitch';
import { SECTIONS, T, type Lang, type Sec } from './ui/i18n';
import { EngCard, EngPanel, MODE_LABEL } from './ui/EngPanel';
import { SYS_ORDER, type EngInfo, type Sys } from './engineering';
import { ConCard, ConPanel } from './ui/ConPanel';
import { LAYERS, STAGE_MAX, type ConPick, type Layer } from './construction';
import { TODAY_M, progressAt } from '../data/progress';
import { PlanSvg, floorPage, typePage } from './ui/PlanSvg';
import { Lightbox, type Shot } from './ui/Lightbox';
import { Drawing } from './ui/Drawing';
import { NearbyMap } from './ui/NearbyMap';
import { Joy } from './ui/Joy';
import { ADDRESS, CATS, PLACES, distance, type Cat } from '../data/nearby';
import { PLAN_SIZE } from '../data/blocks';
import { GALLERY, GAL_CATS, render3d, type GalCat } from '../data/gallery';
import './ui/block.css';

type Apt = { storey: number; index: number; label: string; num: number; rooms: number; area: number; price: number; status: Status };
const STC: Record<Status, string> = { free: 'var(--free)', reserved: 'var(--reserved)', sold: 'var(--sold)' };

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

/** All flats of a block: real mix for type-4, demo for the others. */
function blockApts(blockId: number): Apt[] {
  if (TYPE4.includes(blockId)) {
    const out: Apt[] = [];
    for (let s = 2; s <= FLOORS; s++) planFor(s).apts.forEach((a, i) => out.push({ storey: s, index: i, label: a.label, ...aptInfo(blockId, s, i, a.label) }));
    return out;
  }
  return APARTMENTS.filter((a) => a.block === blockId).map((a, i) => ({ storey: a.floor, index: i, label: a.area.toFixed(2), num: a.num, rooms: a.rooms, area: a.area, price: a.price, status: a.status }));
}

export default function BlockView({ blockId, sec, onSec, onBack }: { blockId: number; sec: Sec; onSec: (s: Sec) => void; onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BlockScene | null>(null);
  const [lang, setLang] = useState<Lang>(() => (store.get('om-lang') === 'ru' ? 'ru' : 'uz'));
  const t = T[lang];
  const [hour, setHour] = useState<number>(DEFAULT_HOUR);
  const [rot, setRot] = useState(false);
  const [storey, setStorey] = useState<number | null>(null);
  const [sel, setSel] = useState<Apt | null>(null);
  const [hover, setHover] = useState<{ p: AptPick; x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [lbox, setLbox] = useState<{ items: Shot[]; start: number } | null>(null);
  const [drw, setDrw] = useState<{ storey: number; apt: number | null } | null>(null);
  const drwLabel = lang === 'ru' ? 'Чертёж с размерами' : 'O‘lchamli chizma';
  const [place, setPlace] = useState<string | null>(null);
  const [fCat, setFCat] = useState<Cat | null>(null);
  const [gCat, setGCat] = useState<GalCat | null>(null);
  const [walk, setWalk] = useState<WalkState | null>(null);
  const [pro, setPro] = useState<ProState | null>(null);
  // engineering view (type-4 blocks): schematic MEP networks
  const [eng, setEng] = useState(false);
  const [engSys, setEngSys] = useState<Sys[]>([...SYS_ORDER]);
  const [engInfo, setEngInfo] = useState<EngInfo | null>(null);
  // construction view
  const [con, setCon] = useState(false);
  const [conPick, setConPick] = useState<ConPick | null>(null);
  const [conLayers, setConLayers] = useState<Layer[]>(LAYERS.map((l) => l.id));
  const [conStage, setConStage] = useState(STAGE_MAX);
  const [conExplode, setConExplode] = useState(0);
  const [conCut, setConCut] = useState(0);
  // energy view
  const [en, setEn] = useState(false);
  const [enView, setEnView] = useState<'flats' | 'thermal'>('flats');
  const [enSeason, setEnSeason] = useState<'winter' | 'summer'>('winter');
  const [enInsul, setEnInsul] = useState(true);
  const [enPick, setEnPick] = useState<EnergyPick | null>(null);
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem('om-walk') || '{}') as { third?: boolean; h?: number; w?: number }; } catch { return {}; } }, []);
  const [third, setThird] = useState(!!saved.third);
  const [bodyH, setBodyH] = useState(saved.h ?? 175);
  const [bodyW, setBodyW] = useState(saved.w ?? 45);
  const [wasd, setWasdOn] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem('om-walk', JSON.stringify({ third, h: bodyH, w: bodyW })); } catch { /* private mode */ } }, [third, bodyH, bodyW]);
  useEffect(() => { scene.current?.setThird(third); }, [third]);
  useEffect(() => { const id = setTimeout(() => scene.current?.setBody(bodyH / 100, bodyW / 100), 120); return () => clearTimeout(id); }, [bodyH, bodyW]);
  const toggleWasd = () => { const on = !wasd; setWasdOn(on); scene.current?.setWasd(on); };
  const touch = useMemo(() => matchMedia('(pointer: coarse)').matches, []);
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(store.get('om-favs') || '[]'); } catch { return []; } });
  const [fRooms, setFRooms] = useState<number[]>([]);
  const [fStatus, setFStatus] = useState<Status[]>(['free']);
  const [fArea, setFArea] = useState<[number, number]>([0, 999]);
  const [fFloor, setFFloor] = useState<[number, number]>([2, 16]);
  const [fPrice, setFPrice] = useState<[number, number]>([0, 1e9]);
  const detailed = TYPE4.includes(blockId);
  const apts = useMemo(() => blockApts(blockId), [blockId]);
  const lim = useMemo(() => {
    const ar = apts.map((a) => a.area), pr = apts.map((a) => a.price);
    return { a: [Math.floor(Math.min(...ar)), Math.ceil(Math.max(...ar))] as [number, number], p: [Math.floor(Math.min(...pr) / 1000) * 1000, Math.ceil(Math.max(...pr) / 1000) * 1000] as [number, number] };
  }, [apts]);
  const match = (a: Apt) => (!fRooms.length || fRooms.includes(a.rooms)) && (!fStatus.length || fStatus.includes(a.status))
    && a.area >= Math.max(fArea[0], lim.a[0]) && a.area <= Math.min(fArea[1], lim.a[1]) && a.storey >= fFloor[0] && a.storey <= fFloor[1]
    && a.price >= Math.max(fPrice[0], lim.p[0]) && a.price <= Math.min(fPrice[1], lim.p[1]);
  const matched = useMemo(() => apts.filter(match), [apts, fRooms, fStatus, fArea, fFloor, fPrice]);

  useEffect(() => {
    const s = new BlockScene(host.current!, {
      onPick: (p) => {
        if (!p) return setSel(null);
        const a = blockApts(blockId).find((x) => x.storey === p.storey && x.index === p.index) ?? null;
        setSel(a);
      },
      onHover: (p, x, y) => setHover(p ? { p, x, y } : null),
      onWalk: (w) => setWalk(w),
      onPro: (p) => setPro(p),
      onEng: (i) => setEngInfo(i),
      onCon: (p) => setConPick(p),
      onEnergy: (p) => setEnPick(p),
    }, blockId);
    scene.current = s;
    (window as unknown as { __block: BlockScene }).__block = s;
    s.setHour(DEFAULT_HOUR, true);
    return () => s.dispose();
  }, [blockId]);

  // section → camera / cutaway
  useEffect(() => {
    const s = scene.current; if (!s) return;
    setSel(null);
    if (sec !== 'bino' && eng) { setEng(false); setEngInfo(null); s.setEngineering(false); }
    if (sec !== 'bino' && con) { setCon(false); setConPick(null); s.setConstruction(false); }
    if (sec !== 'bino' && en) { setEn(false); setEnPick(null); s.setEnergy(false); }
    s.setAptMode(sec === 'kvartiralar');
    s.setContext(sec === 'joylashuv' || sec === 'yaqin');
    if (sec === 'qavatlar') { const f = storey ?? 9; setStorey(f); s.setStorey(f); return; }
    setStorey(null); s.setStorey(null);
    if (sec === 'bino' || sec === 'galereya') s.view('render');
    if (sec === 'kvartiralar') s.view('aerial');
    if (sec === 'joylashuv' || sec === 'yaqin') s.viewSite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);
  useEffect(() => { scene.current?.setHour(hour); }, [hour]);
  useEffect(() => { scene.current?.setEngSystems(engSys); }, [engSys, eng]);
  useEffect(() => { scene.current?.setEngLang(lang); }, [lang]);
  useEffect(() => { scene.current?.conLayers(conLayers); }, [conLayers, con]);
  useEffect(() => { scene.current?.conStage(conStage); }, [conStage, con]);
  useEffect(() => { scene.current?.conExplode(conExplode); }, [conExplode, con]);
  useEffect(() => { scene.current?.conCut(conCut); }, [conCut, con]);
  useEffect(() => { if (en) scene.current?.setEnergy(true, { view: enView, season: enSeason, insul: enInsul }); }, [en, enView, enSeason, enInsul]);
  useEffect(() => { setEnPick(null); scene.current?.energySelect(null); }, [enView]);
  /** 0 normal, 1 engineering, 2 construction, 3 energy */
  const setMode = (m: number) => {
    const s = scene.current; if (!s) return;
    setEngInfo(null); setConPick(null); setSel(null); setEnPick(null);
    s.setEngineering(m === 1, lang); setEng(m === 1);
    s.setConstruction(m === 2); setCon(m === 2);
    s.setEnergy(m === 3, { view: enView, season: enSeason, insul: enInsul }); setEn(m === 3);
    setStorey(null); s.setStorey(null);
    if (m === 1) s.setEngSystems(engSys);
    s.view(m === 0 ? 'render' : 'aerial');
  };
  const mode = eng ? 1 : con ? 2 : en ? 3 : 0;
  useEffect(() => {
    if (sec !== 'kvartiralar') return;
    const ok = new Map(matched.map((a) => [`${a.storey}-${a.index}`, a.status]));
    scene.current?.paintApts((st, i) => ok.get(`${st}-${i}`) ?? 'dim', sel);
  }, [matched, sec, sel]);
  useEffect(() => { scene.current?.setAutoRotate(rot); }, [rot]);
  useEffect(() => { store.set('om-lang', lang); }, [lang]);
  useEffect(() => { store.set('om-favs', JSON.stringify(favs)); }, [favs]);
  useEffect(() => {
    const s = scene.current; if (!s || !sel || !detailed) return;
    if (sec === 'kvartiralar') { s.focusApt(sel.storey, sel.index); return; }
    if (s.currentStorey() !== sel.storey) { setStorey(sel.storey); s.setStorey(sel.storey); }
    s.selectApt(sel.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, detailed]);

  const beginWalk = (a: Apt) => {
    setSel(null); setHover(null);
    if (sec !== 'qavatlar') { onSec('qavatlar'); setTimeout(() => scene.current?.startWalk(a.storey, a.index), 80); }
    else scene.current?.startWalk(a.storey, a.index);
  };
  const beginHall = (f: number) => {
    setSel(null); setHover(null);
    if (sec !== 'qavatlar') { onSec('qavatlar'); setTimeout(() => scene.current?.startHall(f), 80); }
    else scene.current?.startHall(f);
  };
  const exitWalk = () => {
    const r = scene.current?.stopWalk(); if (!r) return;
    setStorey(r.storey);
    const a = r.apt === null ? undefined : blockApts(blockId).find((x) => x.storey === r.storey && x.index === r.apt);
    if (a) setTimeout(() => setSel(a), 30);
  };
  useEffect(() => {
    if (!walk) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !scene.current?.recentlyLocked()) { if (bodyOpen) setBodyOpen(false); else exitWalk(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  const pickStorey = (f: number | null) => { setSel(null); setStorey(f); scene.current?.setStorey(f); };
  const openApt = (a: Apt) => { if (sec !== 'qavatlar' && sec !== 'kvartiralar') onSec('qavatlar'); setSel(a); };
  const favKey = (a: Apt) => `${blockId}-${a.storey}-${a.index}`;
  const def = BLOCKS.find((b) => b.id === blockId)!;
  const count = (list: Apt[], st: Status) => list.filter((a) => a.status === st).length;

  const timeIcons: [string, number][] = [['sunrise', 7], ['sun', 13], ['sunset', 19], ['moon', 23]];

  return (
    <>
    <RenderStats place="bottom" />
    <div className={'bm sec-' + sec + (walk ? ' walking' : '') + (eng || con || en ? ' eng' : '')}>
      <div ref={host} className="vp" />

      <header className="b-top">
        <div className="b-brand glass">
          <img src="logo.png" alt="Art House" />
          <div><b>OBOD MASKAN<ModeSwitch /></b><span>{t.block(blockId)} · {detailed ? t.type4 : t.generic}</span></div>
        </div>
        <div className="b-right">
          <div className="b-lang glass">
            {(['uz', 'ru'] as Lang[]).map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </div>
          <button className="b-back glass" onClick={onBack}><Icon n="back" /> <span>{t.back}</span></button>
          <FullscreenButton className="b-fs glass" label={t.fullscreen} hint={t.fsHint} />
        </div>
      </header>

      <p className="b-credit">Daraxtlar: 00amza, 99.Miles (Sketchfab, CC BY 4.0)</p>
      {sec === 'bino' && (
        <div className="b-time glass">
          <div className="hours" role="group">
            {STOPS.map((h) => <button key={h} className={'hr' + (h === hour ? ' on' : '')} title={stopName(h, lang)} aria-pressed={h === hour} onClick={() => setHour(h)}>{fmtStop(h)}</button>)}
          </div>
          <div className="stop-name">{stopName(hour, lang)}</div>
          {detailed && (
            <div className="b-mode">
              {MODE_LABEL[lang].map((l, i) => <button key={l} className={i === mode ? 'on' : ''} onClick={() => setMode(i)}>{l}</button>)}
            </div>
          )}
        </div>
      )}
      {eng && sec === 'bino' && (
        <div className="eng-col">
          <EngPanel lang={lang} systems={engSys} setSystems={setEngSys} storey={storey} setStorey={(f) => { setEngInfo(null); pickStorey(f); }} />
          {engInfo && <EngCard lang={lang} info={engInfo} onClose={() => setEngInfo(null)} />}
        </div>
      )}
      {con && sec === 'bino' && (
        <div className="eng-col">
          <ConPanel lang={lang} c={{ layers: conLayers, setLayers: setConLayers, stage: conStage, setStage: setConStage, explode: conExplode, setExplode: setConExplode, cut: conCut, setCut: setConCut, quantities: scene.current?.conQuantities() ?? [], today: progressAt(blockId, TODAY_M).stage }} />
          {conPick && <ConCard lang={lang} pick={conPick} onClose={() => setConPick(null)} />}
        </div>
      )}

      {en && sec === 'bino' && (
        <div className="eng-col">
          <EnergyPanel lang={lang} blockId={blockId} c={{ view: enView, setView: setEnView, season: enSeason, setSeason: setEnSeason, insul: enInsul, setInsul: setEnInsul }} />
          {enPick && <EnergyCard lang={lang} blockId={blockId} pick={enPick} insul={enInsul} onClose={() => { setEnPick(null); scene.current?.energySelect(null); }} />}
        </div>
      )}

      {hover && (storey || sec === 'kvartiralar') && (
        <div className="b-tip glass" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {(() => { const a = apts.find((x) => x.storey === hover.p.storey && x.index === hover.p.index); return a ? <><i className={'sq ' + a.status} /> <b>{a.area.toFixed(2)} m²</b> · {a.rooms}-{t.roomsShort} · {usd(a.price)}</> : null; })()}
        </div>
      )}

      {/* side panel per section */}
      <aside className={'b-panel glass' + (collapsed ? ' collapsed' : '')}>
        <div className="phead" onClick={() => innerWidth < 760 && setCollapsed(!collapsed)}>
          <i className="grab" />
          <h3>{t.sec[sec]}</h3>
        </div>
        <div className="pbody">
          {sec === 'bino' && <BinoPanel />}
          {sec === 'qavatlar' && <FloorsPanel />}
          {sec === 'kvartiralar' && <AptsPanel />}
          {sec === 'raqamlar' && <StatsPanel />}
          {sec === 'joylashuv' && <SitePanel />}
          {sec === 'yaqin' && <NearbyPanel />}
          {sec === 'galereya' && <GalleryPanel />}
        </div>
      </aside>

      {sel && (
        <div className="b-card glass">
          <div className="chead">
            <div>
              <span className="badge" style={{ background: STC[sel.status] }}>{t[sel.status]}</span>
              <h2>{t.aptN(sel.num)}</h2>
            </div>
            <div style={{ display: 'flex' }}>
              <button className={'icbtn fav' + (favs.includes(favKey(sel)) ? ' on' : '')} title={t.fav}
                onClick={() => setFavs((f) => (f.includes(favKey(sel)) ? f.filter((x) => x !== favKey(sel)) : [...f, favKey(sel)]))}><Icon n="heart" /></button>
              <button className="icbtn" title={t.close} onClick={() => setSel(null)}><Icon n="close" /></button>
            </div>
          </div>
          <div className="facts" style={{ marginTop: 12 }}>
            <div><b>{sel.area.toFixed(2)}</b><span>m²</span></div>
            <div><b>{sel.rooms}</b><span>{t.roomsShort}</span></div>
            <div><b>{sel.storey}</b><span>{t.floor}</span></div>
          </div>
          {detailed && <PlanSvg storey={sel.storey} index={sel.index} />}
          <div className="price"><b>{usd(sel.price)}</b><span>$1 000 {t.perM2}</span></div>
          {detailed && (
            <>
              <h4>{t.roomList}</h4>
              <ul className="rooms">{aptRooms(sel.storey, sel.index).map((r, i) => <li key={i}><span>{r.name}</span><span>{r.area.toFixed(1)} m²</span></li>)}</ul>
              <div className="actions">
                <button className="btn gold" onClick={() => beginWalk(sel)}><Icon n="walk" />{t.walk}</button>
                <button className="btn" onClick={() => { const a = sel; onSec('qavatlar'); setTimeout(() => setSel({ ...a }), 60); }}><Icon n="plan" />{t.onPlan}</button>
                <button className="btn" onClick={() => setDrw({ storey: sel.storey, apt: sel.index })}><Icon n="ruler" />{drwLabel}</button>
                {typePage(sel.storey, sel.label) && (() => {
                  const r = render3d(sel.storey, sel.label);
                  const items: Shot[] = [
                    ...(r ? [{ src: r.src, thumb: r.thumb, title: `${r[lang]} · ${t.render3d}` }] : []),
                    { src: typePage(sel.storey, sel.label)!, title: `${sel.label} m² · ${t.typePlan}` },
                    { src: floorPage(sel.storey), title: t.floorPlanPdf(sel.storey) },
                  ];
                  return <button className="btn" onClick={() => setLbox({ start: 0, items })}><Icon n="galereya" />{r ? t.render3d : t.typePlan}</button>;
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {sec === 'yaqin' && (
        <div className="b-map glass">
          <NearbyMap lang={lang} active={place} onPick={setPlace} list={PLACES.filter((p) => !fCat || p.cat === fCat)} />
          <div className="mnote">{t.mapNote}</div>
        </div>
      )}
      {walk && (() => {
        const a = walk.apt === null ? undefined : blockApts(blockId).find((x) => x.storey === walk.storey && x.index === walk.apt);
        const lift = walk.lift;
        const inCab = lift && lift.phase !== 'call' && lift.phase !== 'open' && lift.phase !== 'leave';
        const pad = (f: number, s2: number, tr: number, n: string) => (
          <button onPointerDown={(e) => { e.preventDefault(); scene.current?.walkPad(f, s2, tr); }} onPointerUp={() => scene.current?.walkPad(0, 0, 0)}
            onPointerLeave={() => scene.current?.walkPad(0, 0, 0)} onPointerCancel={() => scene.current?.walkPad(0, 0, 0)} onContextMenu={(e) => e.preventDefault()}><Icon n={n} /></button>
        );
        return (
          <>
            <div className="w-top glass">
              {a
                ? <div><b>{t.aptN(a.num)}</b><span>{`${a.rooms}-${t.roomsShort} · ${a.area.toFixed(2)} m² · ${t.floorN(walk.storey)}`}</span></div>
                : <div><b>{inCab ? t.liftWord : t.places[walk.place]}</b><span>{t.floorN(inCab ? lift.floor : walk.storey)}</span></div>}
              {a && walk.room && <em>{t.roomN[walk.room] ?? ''}</em>}
            </div>
            <div className="w-map glass">
              <PlanSvg storey={walk.storey} index={walk.apt} me={walk} onPick={(x, y) => scene.current?.walkTo(x, y)} />
            </div>
            {lift?.phase === 'call' && <div className="w-toast glass"><Icon n="lift" />{t.liftComing}</div>}
            {inCab && (
              <div className="w-lift glass">
                <div className="disp"><span>{t.liftWord}</span><b>{lift.floor}</b><i>{lift.phase === 'move' || lift.phase === 'close' ? (lift.to > lift.floor ? '▲' : lift.to < lift.floor ? '▼' : '') : ''}</i></div>
                <p>{t.liftPick}</p>
                <div className="keys">
                  {Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((n) => (
                    <button key={n} className={(n === lift.to && lift.to !== walk.storey ? 'on' : '') + (n === lift.floor ? ' cur' : '')} disabled={lift.phase !== 'select'} onClick={() => scene.current?.liftGo(n)}>{n}</button>
                  ))}
                </div>
                {lift.phase === 'select' && <button className="btn" onClick={() => scene.current?.liftLeave()}><Icon n="back" />{t.liftOut}</button>}
              </div>
            )}
            {walk.locked && <div className="w-cross" />}
            {walk.door && !lift && !walk.climbing && (
              <button className="w-door" onClick={() => scene.current?.toggleDoor()}>
                {!touch && <kbd>E</kbd>}<span>{walk.door.open ? t.doorClose(walk.door.num) : t.doorOpen(walk.door.num)}</span>
              </button>
            )}
            {wasd && !walk.locked && !touch && <div className="w-lockhint glass">{walk.lockFailed ? t.lockFail : t.lockHint}</div>}
            {bodyOpen && (
              <div className="w-body glass">
                <div className="w-body-h"><b>{t.bodyTitle}</b><button className="ic" onClick={() => setBodyOpen(false)}><Icon n="close" /></button></div>
                <label><span>{t.height}</span><input type="range" min={140} max={210} value={bodyH} onChange={(e) => setBodyH(+e.target.value)} />
                  <input type="number" min={140} max={210} value={bodyH} onChange={(e) => setBodyH(Math.max(140, Math.min(210, +e.target.value || 175)))} /><em>{t.cm}</em></label>
                <label><span>{t.width}</span><input type="range" min={35} max={70} value={bodyW} onChange={(e) => setBodyW(+e.target.value)} />
                  <input type="number" min={35} max={70} value={bodyW} onChange={(e) => setBodyW(Math.max(35, Math.min(70, +e.target.value || 45)))} /><em>{t.cm}</em></label>
                <div className="w-body-fig">
                  <svg viewBox="0 0 60 120" className="fig"><g style={{ transform: `scale(${bodyW / 45}, ${bodyH / 175})`, transformOrigin: '30px 118px' }}>
                    <circle cx="30" cy="16" r="9" /><path d="M17 30h26a5 5 0 0 1 5 5v30h-6v53h-7V82h-2v36h-7V65h-6V35a5 5 0 0 1 5-5z" /></g></svg>
                  <div><p>{t.eyeLevel(Math.round(bodyH * 0.935))}</p><p className="note">{t.bodyNote}</p></div>
                </div>
              </div>
            )}
            <div className="w-tools glass">
              <div className="w-seg">
                <button className={!third ? 'on' : ''} onClick={() => setThird(false)}><Icon n="eye" />{t.first}</button>
                <button className={third ? 'on' : ''} onClick={() => setThird(true)}><Icon n="person" />{t.third}</button>
              </div>
              {!touch && <button className={'tbtn' + (wasd ? ' on' : '')} onClick={toggleWasd}><Icon n="keys" />{t.wasd}</button>}
              <button className={'tbtn' + (bodyOpen ? ' on' : '')} onClick={() => setBodyOpen(!bodyOpen)}><Icon n="ruler" />{t.body}<small>{bodyH}×{bodyW}</small></button>
              <button className={'tbtn' + (walk.lights ? ' on' : '')} onClick={() => scene.current?.setLights(!walk.lights)}><Icon n="bulb" />{t.lights}<small>{walk.lights ? 'ON' : 'OFF'}</small></button>
            </div>
            <div className="w-bar glass">
              <button className="btn" onClick={exitWalk}><Icon n="back" />{t.walkExit}</button>
              {walk.nearLift !== null && !lift && <button className="btn gold" onClick={() => scene.current?.callLift(walk.nearLift!)}><Icon n="lift" />{t.callLift}</button>}
              {walk.stair?.up && <button className="btn gold" onClick={() => scene.current?.stairGo(1)}><Icon n="up" />{t.stairUp}</button>}
              {walk.stair?.down && <button className="btn" onClick={() => scene.current?.stairGo(-1)}><Icon n="down" />{t.stairDown}</button>}
              {walk.spots > 0 && !lift && !walk.climbing && walk.nearLift === null && !walk.stair && (
                <button className="btn gold" onClick={() => scene.current?.nextView()}><Icon n="window" />{t.winView}{walk.spot >= 0 ? ` ${walk.spot + 1}/${walk.spots}` : ''}</button>
              )}
              <div className="w-time">
                {timeIcons.map(([n, h]) => <button key={n} className={'ic' + (hour === h ? ' on' : '')} onClick={() => setHour(h)}><Icon n={n} /></button>)}
              </div>
            </div>
            <div className="w-hint">{touch ? t.walkHintTouch : t.walkHintDesk}</div>
            {touch && !lift && !walk.climbing && <Joy onMove={(f, s2) => scene.current?.walkPad(f, s2, 0)} />}
          </>
        );
      })()}
      {drw && <Drawing lang={lang} blockId={blockId} storey={drw.storey} apt={drw.apt} onClose={() => setDrw(null)} />}
      {lbox && <Lightbox items={lbox.items} start={lbox.start} onClose={() => setLbox(null)} />}

      <nav className="b-nav glass">
        {SECTIONS.map((s) => (
          <button key={s} className={sec === s ? 'on' : ''} onClick={() => { setCollapsed(false); onSec(s); }}>
            <Icon n={s} /> <span>{t.sec[s]}</span>
          </button>
        ))}
      </nav>
      <div className="b-hint glass">{t.hint}</div>
      <div className="b-demo">{t.demo}</div>
      {pro && (
        <div className={'pro-panel glass' + (walk ? ' in-walk' : '')}>
          <div className="pro-h"><b>PRO</b><span>{t.proTitle}</span></div>
          <label className="pro-row"><input type="checkbox" checked={pro.ao} onChange={(e) => scene.current?.proSet({ ao: e.target.checked })} /><span>{t.proAO}</span></label>
          <label className="pro-row"><input type="checkbox" checked={pro.bloom} onChange={(e) => scene.current?.proSet({ bloom: e.target.checked })} /><span>{t.proBloom}</span></label>
          <div className="pro-st">
            {!pro.ready ? t.proLoading : t.proRaster}
          </div>
        </div>
      )}
    </div>
    </>
  );

  function BinoPanel() {
    const n = apts.length;
    return (
      <>
        <div className="facts">
          <div><b>16</b><span>{t.stats.floors}</span></div>
          <div><b>{n}</b><span>{t.apts}</span></div>
          <div><b>{detailed ? 3 : '—'}</b><span>{t.shops}</span></div>
        </div>
        <div className="statbar">
          {(['free', 'reserved', 'sold'] as Status[]).map((st) => <div key={st} style={{ background: STC[st], width: (count(apts, st) / n) * 100 + '%' }}>{count(apts, st)}</div>)}
        </div>
        <div className="legend">{(['free', 'reserved', 'sold'] as Status[]).map((st) => <span key={st}><i className={st} />{t[st]}</span>)}</div>
        <h4>{t.views}</h4>
        <div className="views">
          <button className="btn" onClick={() => scene.current?.view('render')}>{t.vRender}</button>
          <button className="btn" onClick={() => scene.current?.view('court')}>{t.vCourt}</button>
          <button className="btn" onClick={() => scene.current?.view('side')}>{t.vSide}</button>
          <button className="btn" onClick={() => scene.current?.view('top')}>{t.vTop}</button>
        </div>
        <div className="actions">
          {detailed && <button className="btn gold" onClick={() => beginHall(1)}><Icon n="walk" />{t.podyezd}</button>}
          <button className={'btn' + (rot ? ' on' : '')} onClick={() => setRot(!rot)}><Icon n="rotate" />{t.autoRotate}</button>
        </div>
        <p className="note">{detailed ? '1-blok PDF chizmalaridan 1:1: devorlar, derazalar, balkonlar va fasad renderdan.' : t.needPdf}</p>
      </>
    );
  }

  function FloorsPanel() {
    if (!detailed) return <div className="empty"><Icon n="qavatlar" size={34} /><span>{t.needPdf}</span></div>;
    const list = storey && storey > 1 ? apts.filter((a) => a.storey === storey) : [];
    return (
      <>
        <p className="note" style={{ marginTop: 0 }}>{t.pickFloor}</p>
        <div className="fls" style={{ marginTop: 10 }}>
          {Array.from({ length: FLOORS }, (_, i) => FLOORS - i).map((f) => {
            const fa = apts.filter((a) => a.storey === f);
            const on = storey === f;
            return (
              <div key={f}>
                <button className={'fl' + (on ? ' on' : '')} onClick={() => pickStorey(on ? null : f)}>
                  <b>{f}</b>
                  <span>{f === 1 ? t.shopFloor : t.floorInfo(fa.length, count(fa, 'free'))}</span>
                  <span className="bars">{fa.map((a, k) => <i key={k} style={{ background: STC[a.status] }} />)}</span>
                </button>
                {on && (
                  <div className="actions" style={{ marginTop: 8 }}>
                    <button className="btn gold" onClick={() => beginHall(f)}><Icon n="walk" />{f === 1 ? t.podyezd : t.hallWalk}</button>
                    <button className="btn" onClick={() => setLbox({ start: 0, items: [{ src: floorPage(f), title: t.floorPlanPdf(f) }] })}><Icon n="plan" />{t.floorPlanPdf(f)}</button>
                    <button className="btn" onClick={() => setDrw({ storey: f, apt: null })}><Icon n="ruler" />{drwLabel}</button>
                  </div>
                )}
                {on && f === 1 && <p className="note">{t.shopsNote}</p>}
                {on && f > 1 && (
                  <div className="alist">
                    {list.map((a) => (
                      <button key={a.index} className={'aitem' + (sel?.index === a.index && sel.storey === a.storey ? ' on' : '')} onClick={() => setSel(a)}>
                        <i className={'sq ' + a.status} /><span className="n">№ {a.num}</span><span>{a.rooms}-{t.roomsShort}</span><span className="ar">{a.area.toFixed(2)}</span><span className="ar">{usd(a.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function AptsPanel() {
    const tog = <V,>(arr: V[], v: V, set: (x: V[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const reset = () => { setFRooms([]); setFStatus(['free']); setFArea([0, 999]); setFFloor([2, 16]); setFPrice([0, 1e9]); };
    const list = [...matched].sort((x, y) => x.storey - y.storey || x.num - y.num);
    return (
      <>
        <h4>{t.rooms}</h4>
        <div className="chips">{[1, 2, 3].map((r) => <button key={r} className={'chip' + (fRooms.includes(r) ? ' on' : '')} onClick={() => tog(fRooms, r, setFRooms)}>{r}-{t.roomsShort}</button>)}</div>
        <h4>{t.status}</h4>
        <div className="chips">{(['free', 'reserved', 'sold'] as Status[]).map((st) => <button key={st} className={'chip' + (fStatus.includes(st) ? ' on' : '')} onClick={() => tog(fStatus, st, setFStatus)}><i className={'sq ' + st} />{t[st]}</button>)}</div>
        <h4>{t.area}, m²</h4>
        <Range2 min={lim.a[0]} max={lim.a[1]} step={1} value={[Math.max(fArea[0], lim.a[0]), Math.min(fArea[1], lim.a[1])]} onChange={setFArea} fmt={(v) => String(v)} />
        <h4>{t.floor}</h4>
        <Range2 min={2} max={16} step={1} value={fFloor} onChange={setFFloor} fmt={(v) => String(v)} />
        <h4>{t.price}</h4>
        <Range2 min={lim.p[0]} max={lim.p[1]} step={1000} value={[Math.max(fPrice[0], lim.p[0]), Math.min(fPrice[1], lim.p[1])]} onChange={setFPrice} fmt={(v) => '$' + Math.round(v / 1000) + 'k'} />
        <div className="frow"><span>{t.found(list.length, apts.length)}</span><button className="link" onClick={reset}>{t.reset}</button></div>
        <div className="alist">
          {list.slice(0, 160).map((a) => (
            <button key={a.storey + '-' + a.index} className={'aitem' + (sel && sel.storey === a.storey && sel.index === a.index ? ' on' : '')} onClick={() => setSel(a)}>
              <i className={'sq ' + a.status} /><span className="n">{t.floorN(a.storey)}</span><span>{a.rooms}-{t.roomsShort}</span><span className="ar">{a.area.toFixed(2)}</span><span className="ar">{usd(a.price)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  function SitePanel() {
    const px = ((def.x + PLAN_SIZE.w / 2) / PLAN_SIZE.w) * 100, py = ((def.z + PLAN_SIZE.d / 2) / PLAN_SIZE.d) * 100;
    return (
      <>
        <div className="addr"><Icon n="joylashuv" /><span>{ADDRESS[lang]}</span></div>
        <div className="siteplan"><div><img src="plan.jpg" alt="" /><i style={{ left: px + '%', top: py + '%' }} /></div></div>
        <p className="note">{t.siteNote(blockId)}</p>
        <div className="stats" style={{ marginTop: 10 }}>
          <div className="stat"><b>3,22 ga</b><span>{t.stats.site}</span></div>
          <div className="stat"><b>20</b><span>{t.stats.blocks}</span></div>
        </div>
      </>
    );
  }

  function NearbyPanel() {
    const cats = Object.keys(CATS) as Cat[];
    const list = PLACES.filter((p) => !fCat || p.cat === fCat).sort((a, b) => distance(a).m - distance(b).m);
    return (
      <>
        <div className="chips">
          <button className={'chip' + (!fCat ? ' on' : '')} onClick={() => setFCat(null)}>{t.all}</button>
          {cats.map((c) => <button key={c} className={'chip' + (fCat === c ? ' on' : '')} onClick={() => setFCat(fCat === c ? null : c)}><i className="sq" style={{ background: CATS[c].color }} />{CATS[c][lang]}</button>)}
        </div>
        <ul className="infra" style={{ marginTop: 12 }}>
          {list.map((p) => {
            const d = distance(p);
            return (
              <li key={p.id} className={place === p.id ? 'on' : ''} onClick={() => setPlace(p.id)}>
                <b style={{ background: CATS[p.cat].color }}>{PLACES.indexOf(p) + 1}</b>
                <em>{p[lang]}</em>
                <span className="dist">{d.m >= 1000 ? (d.m / 1000).toFixed(1) + ' km' : d.m + ' m'}</span>
                <span className="min">{d.min} {lang === 'uz' ? 'daq' : 'мин'}</span>
              </li>
            );
          })}
        </ul>
        <p className="note">{t.walkNote}</p>
      </>
    );
  }

  function GalleryPanel() {
    const all = GALLERY.filter((g) => detailed || !g.type4);
    const cats = (Object.keys(GAL_CATS) as GalCat[]).filter((c) => all.some((g) => g.cat === c));
    const list = all.filter((g) => !gCat || g.cat === gCat);
    const open = (i: number) => setLbox({ start: i, items: list.map((g) => ({ src: g.src, thumb: g.thumb, title: g[lang] })) });
    return (
      <>
        <div className="chips">
          <button className={'chip' + (!gCat ? ' on' : '')} onClick={() => setGCat(null)}>{t.all} <small>{all.length}</small></button>
          {cats.map((c) => <button key={c} className={'chip' + (gCat === c ? ' on' : '')} onClick={() => setGCat(gCat === c ? null : c)}>{GAL_CATS[c][lang]} <small>{all.filter((g) => g.cat === c).length}</small></button>)}
        </div>
        <div className="ggrid">
          {list.map((g, i) => (
            <button key={g.id} className={i === 0 && !gCat ? 'wide' : ''} onClick={() => open(i)}>
              <img src={g.thumb} alt="" loading="lazy" />
              <span>{g[lang]}</span>
            </button>
          ))}
        </div>
        <p className="note">{t.galNote}</p>
      </>
    );
  }

  function StatsPanel() {
    const mix = [1, 2, 3].map((r) => apts.filter((a) => a.rooms === r).length);
    const areas = apts.map((a) => a.area);
    return (
      <>
        <h4>{t.stats.complex}</h4>
        <div className="stats">
          <div className="stat"><b>20</b><span>{t.stats.blocks}</span></div>
          <div className="stat"><b>1 735</b><span>{t.stats.flats}</span></div>
          <div className="stat"><b>3,22 ga</b><span>{t.stats.site}</span></div>
          <div className="stat"><b>9 000 m²</b><span>{t.stats.green}</span></div>
          <div className="stat"><b>400</b><span>{t.stats.parking}</span></div>
          <div className="stat"><b>2027</b><span>{t.stats.handover}</span></div>
        </div>
        <h4>{t.stats.blockT} {blockId}</h4>
        <div className="stats">
          <div className="stat"><b>16</b><span>{t.stats.floors}</span></div>
          <div className="stat"><b>3,0 m</b><span>{t.stats.height}</span></div>
          <div className="stat"><b>{apts.length}</b><span>{t.stats.flats}</span></div>
          <div className="stat"><b>{detailed ? '29,7×18,1' : `${Math.max(def.w, def.d).toFixed(0)}×${Math.min(def.w, def.d).toFixed(0)}`} m</b><span>{lang === 'uz' ? 'gabarit' : 'габарит'}</span></div>
          <div className="stat"><b>{Math.min(...areas).toFixed(2)}</b><span>m² · {t.stats.minA}</span></div>
          <div className="stat"><b>{Math.max(...areas).toFixed(2)}</b><span>m² · {t.stats.maxA}</span></div>
        </div>
        <h4>{t.stats.mix}</h4>
        <div className="mix">
          {mix.map((n, i) => <div key={i}><span>{i + 1}-{t.roomsShort}</span><i style={{ width: (n / apts.length) * 100 + '%' }} /><b>{n}</b></div>)}
        </div>
      </>
    );
  }
}

function Range2({ min, max, step, value, onChange, fmt }: { min: number; max: number; step: number; value: [number, number]; onChange: (v: [number, number]) => void; fmt: (v: number) => string }) {
  const [a, b] = value;
  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <div className="range2">
      <div className="vals"><span>{fmt(a)}</span><span>{fmt(b)}</span></div>
      <div className="track">
        <div className="fill" style={{ left: pct(a) + '%', width: pct(b) - pct(a) + '%' }} />
        <input type="range" min={min} max={max} step={step} value={a} onChange={(e) => onChange([Math.min(+e.target.value, b), b])} />
        <input type="range" min={min} max={max} step={step} value={b} onChange={(e) => onChange([a, Math.max(+e.target.value, a)])} />
      </div>
    </div>
  );
}
