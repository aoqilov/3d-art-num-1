// Dimensioned floor plan ("chizma") drawn from the extracted architect's plan: hatched walls, window and door
// symbols, structural axes with bubbles, three dimension chains on every side (openings, axes, overall), room
// names with areas and sizes, an apartment mode with its own chains, a title block, zoom / pan, SVG download
// and print. Sizes come from the PDF extraction (±2–3 cm) — the title block says so.
import { useMemo, useRef, useState } from 'react';
import { FLOORS, planFor, pointInPoly, polyBounds, type FloorPlan, type Poly, type Pt, type Room } from '../plan';
import { aptInfo } from '../aptData';
import { T, type Lang } from './i18n';
import { Icon } from './icons';

const XS = [0.45, 6.4, 12.35, 17.4, 23.4, 29.25], YS = [0.45, 7.7, 9.7, 17.6];
const AX_Y = ['А', 'Б', 'В', 'Г'];
const S = {
  uz: {
    title: 'O‘lchamli chizma', floor: (n: number) => `${n}-qavat rejasi`, apt: (n: number, a: string) => `Kvartira № ${n} · ${a} m²`,
    whole: 'Butun qavat', dims: 'O‘lchamlar', axes: 'O‘qlar', areas: 'Maydonlar', svg: 'SVG yuklab olish', print: 'Chop etish',
    rooms: 'Xonalar', total: 'Jami', live: 'Yashash maydoni', apts: 'Kvartiralar', mm: 'O‘lchamlar millimetrda, maydon m²da',
    note: 'Namunaviy: 1-blok PDF chizmasidan avtomatik olingan, aniqlik ±2–3 sm. Qurilish uchun emas.',
    lift: 'Lift', shop: 'Savdo', stair: 'Zina / koridor', scale: 'M 1:100', zoom: 'Sichqoncha g‘ildiragi — kattalashtirish, sudrash — surish',
  },
  ru: {
    title: 'Чертёж с размерами', floor: (n: number) => `План ${n} этажа`, apt: (n: number, a: string) => `Квартира № ${n} · ${a} м²`,
    whole: 'Весь этаж', dims: 'Размеры', axes: 'Оси', areas: 'Площади', svg: 'Скачать SVG', print: 'Печать',
    rooms: 'Помещения', total: 'Итого', live: 'Жилая площадь', apts: 'Квартиры', mm: 'Размеры в мм, площади в м²',
    note: 'Образец: автоматически получено из PDF чертежа блока 1, точность ±2–3 см. Не для строительства.',
    lift: 'Лифт', shop: 'Торговля', stair: 'Лестница / коридор', scale: 'М 1:100', zoom: 'Колесо — масштаб, перетаскивание — сдвиг',
  },
};

const P = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join('L') + 'Z';
const mm = (m: number) => String(Math.round(m * 100) * 10);

/** a point well inside the room for its label: bbox centre if inside, else the grid point farthest from the edges */
function labelPoint(p: Poly): Pt {
  const b = polyBounds(p), c: Pt = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const edgeDist = (x: number, y: number) => {
    let d = Infinity;
    for (const r of [p.outer, ...p.holes]) for (let i = 0; i < r.length; i++) {
      const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
      d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return d;
  };
  if (pointInPoly(c[0], c[1], p) && edgeDist(c[0], c[1]) > 0.6) return c;
  let best: Pt = c, bd = -1;
  for (let x = b.x0 + 0.1; x < b.x1; x += 0.2) for (let y = b.y0 + 0.1; y < b.y1; y += 0.2) {
    if (!pointInPoly(x, y, p)) continue;
    const d = edgeDist(x, y); if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}
const ringArea = (r: Pt[]) => { let s = 0; for (let i = 0; i < r.length; i++) { const [a, b] = r[i], [c, d] = r[(i + 1) % r.length]; s += a * d - c * b; } return Math.abs(s) / 2; };

/** dimension chain: breakpoints along one axis, drawn at `off` on the other axis; side −1 = text above/left */
function Chain({ pts, axis, off, side, from }: { pts: number[]; axis: 'x' | 'y'; off: number; side: -1 | 1; from?: number }) {
  const v = [...new Set(pts.map((p) => Math.round(p * 100) / 100))].sort((a, b) => a - b).filter((p, i, a) => i === 0 || p - a[i - 1] > 0.04);
  if (v.length < 2) return null;
  const L = (a: number, b: number) => (axis === 'x' ? { x1: a, y1: off, x2: b, y2: off } : { x1: off, y1: a, x2: off, y2: b });
  return (
    <g className="dim">
      <line {...L(v[0] - 0.25, v[v.length - 1] + 0.25)} />
      {v.map((p, i) => (
        <g key={i}>
          {from !== undefined && <line className="ext" {...(axis === 'x' ? { x1: p, y1: from, x2: p, y2: off + side * 0.2 } : { x1: from, y1: p, x2: off + side * 0.2, y2: p })} />}
          <line className="tick" {...(axis === 'x' ? { x1: p - 0.13, y1: off + 0.13, x2: p + 0.13, y2: off - 0.13 } : { x1: off - 0.13, y1: p + 0.13, x2: off + 0.13, y2: p - 0.13 })} />
        </g>
      ))}
      {v.slice(1).map((p, i) => {
        const a = v[i], m = (a + p) / 2, len = p - a, small = len < 0.75;
        if (len < 0.25) return null;
        const tx = axis === 'x' ? m : off + side * 0.16, ty = axis === 'x' ? off + side * 0.16 : m;
        return (
          <text key={i} x={tx} y={ty} className={small ? 'sm' : ''} textAnchor="middle" dominantBaseline={side < 0 ? 'text-after-edge' : 'text-before-edge'}
            transform={axis === 'y' ? `rotate(-90 ${tx} ${ty})` : undefined}>{mm(len)}</text>
        );
      })}
    </g>
  );
}

export function Drawing({ lang, blockId, storey: s0, apt: a0, onClose }: { lang: Lang; blockId: number; storey: number; apt: number | null; onClose: () => void }) {
  const t = S[lang], rn = T[lang].roomN;
  const [storey, setStorey] = useState(s0);
  const [apt, setApt] = useState<number | null>(s0 === 1 ? null : a0);
  const [show, setShow] = useState({ dims: true, axes: true, areas: true });
  const plan = planFor(storey);
  const fb = polyBounds(plan.footprint);
  const svgRef = useRef<SVGSVGElement>(null);

  // view box: whole floor with room for chains and bubbles, or the flat
  const base = useMemo(() => {
    if (apt !== null && plan.apts[apt]) {
      // the flat with its chains on the left and top, the title block below it; widened to the sheet's proportions
      const b = polyBounds(plan.apts[apt].outline);
      let x = b.x0 - 3.2, w = b.x1 - b.x0 + 4.4; const y = b.y0 - 3, h = b.y1 - b.y0 + 6.8;
      if (w < h * 1.35) { x -= (h * 1.35 - w) / 2; w = h * 1.35; }
      return { x, y, w, h };
    }
    return { x: fb.x0 - 5.6, y: fb.y0 - 5.6, w: fb.x1 - fb.x0 + 11.2, h: fb.y1 - fb.y0 + 11.2 };
  }, [storey, apt]);
  const [zoom, setZoom] = useState<{ k: number; cx: number; cy: number } | null>(null);
  const vb = zoom ? { w: base.w / zoom.k, h: base.h / zoom.k, x: zoom.cx - base.w / zoom.k / 2, y: zoom.cy - base.h / zoom.k / 2 } : base;
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const toPlan = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const onWheel = (e: React.WheelEvent) => {
    const q = toPlan(e), k0 = zoom?.k ?? 1, k = Math.max(1, Math.min(8, k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    if (k === 1) { setZoom(null); return; }
    const cx0 = zoom?.cx ?? base.x + base.w / 2, cy0 = zoom?.cy ?? base.y + base.h / 2;
    setZoom({ k, cx: q.x - (q.x - cx0) * (k0 / k), cy: q.y - (q.y - cy0) * (k0 / k) });
  };

  const mine = new Set(apt === null ? [] : plan.apts[apt]?.rooms ?? []);
  const roomName = (r: Room) => r.kind === 'lift' ? t.lift : r.kind === 'shop' ? t.shop : r.kind ? rn[r.kind] : r.apt === null && r.area > 8 ? t.stair : '';
  const kindAt = (x: number, y: number) => plan.rooms.find((r) => pointInPoly(x, y, r.poly));

  // chains of the whole floor: openings on each facade, axes, overall
  const chains = useMemo(() => {
    const W = plan.windows, near = 2.3;
    const top = W.filter((w) => w.axis === 'x' && (w.y0 + w.y1) / 2 < fb.y0 + near).flatMap((w) => [w.x0, w.x1]);
    const bot = W.filter((w) => w.axis === 'x' && (w.y0 + w.y1) / 2 > fb.y1 - near).flatMap((w) => [w.x0, w.x1]);
    const lef = W.filter((w) => w.axis === 'y' && (w.x0 + w.x1) / 2 < fb.x0 + near).flatMap((w) => [w.y0, w.y1]);
    const rig = W.filter((w) => w.axis === 'y' && (w.x0 + w.x1) / 2 > fb.x1 - near).flatMap((w) => [w.y0, w.y1]);
    return { top, bot, lef, rig };
  }, [storey]);

  // apartment chains: room boundaries along the top and the left of the flat
  const aptCh = useMemo(() => {
    if (apt === null || !plan.apts[apt]) return null;
    const b = polyBounds(plan.apts[apt].outline);
    const rooms = plan.apts[apt].rooms.map((i) => plan.rooms[i]).filter((r) => r.kind !== 'balcony');
    const xs = [b.x0, b.x1], ys = [b.y0, b.y1];
    for (const r of rooms) { const q = polyBounds(r.poly); xs.push(q.x0, q.x1); ys.push(q.y0, q.y1); }
    return { b, xs, ys };
  }, [storey, apt]);

  const download = () => {
    const svg = svgRef.current!.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', `${base.x} ${base.y} ${base.w} ${base.h}`);
    svg.setAttribute('width', String(Math.round(base.w * 40))); svg.setAttribute('height', String(Math.round(base.h * 40)));
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `obod-maskan-${blockId}-blok-${storey}-qavat${apt !== null ? '-kv' + (apt + 1) : ''}.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const print = () => {
    const w = open('', '_blank'); if (!w) return;
    const svg = svgRef.current!.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('viewBox', `${base.x} ${base.y} ${base.w} ${base.h}`);
    w.document.write(`<!doctype html><title>${t.title}</title><style>@page{size:A4 landscape;margin:10mm}body{margin:0}svg{width:100%;height:auto}</style>${svg.outerHTML}<script>onload=()=>print()<\/script>`);
    w.document.close();
  };

  const info = apt !== null && plan.apts[apt] ? aptInfo(blockId, storey, apt, plan.apts[apt].label) : null;
  const aptRoomsList = apt !== null && plan.apts[apt] ? plan.apts[apt].rooms.map((i) => plan.rooms[i]).filter((r) => r.kind) : [];
  const liveArea = aptRoomsList.filter((r) => r.kind === 'bedroom' || r.kind === 'living').reduce((a, r) => a + r.area, 0);
  // title block in the lower right corner of the sheet
  const tb = { w: Math.min(12, base.w * 0.45), x: 0, y: 0 };
  tb.x = base.x + base.w - tb.w - 0.3; tb.y = base.y + base.h - 2.9;

  return (
    <div className="drw-back" onClick={onClose}>
      <div className="drw glass" onClick={(e) => e.stopPropagation()}>
        <div className="drw-bar">
          <b>{t.title}</b>
          <select value={storey} onChange={(e) => { const v = +e.target.value; setStorey(v); setZoom(null); if (v === 1) setApt(null); else if (apt !== null && apt >= planFor(v).apts.length) setApt(null); }}>
            {Array.from({ length: FLOORS }, (_, i) => i + 1).map((f) => <option key={f} value={f}>{t.floor(f)}</option>)}
          </select>
          {(['dims', 'axes', 'areas'] as const).map((k) => (
            <label key={k} className="chk"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{t[k]}</label>
          ))}
          <span className="sp" />
          <button onClick={download}><Icon n="plan" />{t.svg}</button>
          <button onClick={print}>{t.print}</button>
          <button className="x" onClick={onClose} aria-label="×"><Icon n="close" /></button>
        </div>
        <div className="drw-body">
          <aside>
            <h4>{t.apts}</h4>
            <div className="drw-apts">
              <button className={apt === null ? 'on' : ''} onClick={() => { setApt(null); setZoom(null); }}>{t.whole}</button>
              {plan.apts.map((a, i) => {
                const n = aptInfo(blockId, storey, i, a.label);
                return <button key={i} className={apt === i ? 'on' : ''} onClick={() => { setApt(i); setZoom(null); }}>№ {n.num}<small>{n.rooms}-{T[lang].roomsShort} · {a.label}</small></button>;
              })}
            </div>
            {info && (
              <>
                <h4>{t.rooms}</h4>
                <table className="drw-rooms"><tbody>
                  {aptRoomsList.map((r) => { const q = polyBounds(r.poly); return <tr key={r.id}><td>{roomName(r)}</td><td>{mm(q.x1 - q.x0)}×{mm(q.y1 - q.y0)}</td><td>{r.area.toFixed(2)}</td></tr>; })}
                  <tr className="sum"><td>{t.live}</td><td /><td>{liveArea.toFixed(2)}</td></tr>
                  <tr className="sum"><td>{t.total}</td><td /><td>{info.area.toFixed(2)}</td></tr>
                </tbody></table>
              </>
            )}
            <p className="drw-note">{t.mm}. {t.zoom}.</p>
            <p className="drw-note warn">{t.note}</p>
          </aside>
          <svg ref={svgRef} className="drw-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onWheel={onWheel}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const q = toPlan(e); drag.current = { x: q.x, y: q.y, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 }; }}
            onPointerMove={(e) => { if (!drag.current || !zoom) return; const q = toPlan(e); setZoom({ ...zoom, cx: zoom.cx - (q.x - drag.current.x), cy: zoom.cy - (q.y - drag.current.y) }); }}
            onPointerUp={() => (drag.current = null)}>
            <defs>
              <pattern id="hatch" width="0.18" height="0.18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="0.18" height="0.18" fill="#fff" /><line x1="0" y1="0" x2="0" y2="0.18" stroke="#333" strokeWidth="0.03" />
              </pattern>
            </defs>
            <style>{SVG_CSS}</style>
            <rect x={base.x - 50} y={base.y - 50} width={base.w + 100} height={base.h + 100} fill="#fff" />
            {/* rooms */}
            {plan.rooms.map((r) => (
              <path key={r.id} d={P(r.poly.outer) + r.poly.holes.map(P).join('')} fillRule="evenodd"
                className={'rm ' + (mine.has(r.id) ? 'hl' : apt !== null ? 'dim' : r.kind === 'balcony' ? 'bal' : r.apt === null ? 'pub' : '')} />
            ))}
            {/* axes */}
            {show.axes && (
              <g className="axes">
                {XS.map((x, i) => (
                  <g key={'x' + i}>
                    <line x1={x} y1={fb.y0 - 4.3} x2={x} y2={fb.y1 + 4.3} />
                    {[fb.y0 - 4.8, fb.y1 + 4.8].map((y) => <g key={y}><circle cx={x} cy={y} r={0.48} /><text x={x} y={y} textAnchor="middle" dominantBaseline="central">{i + 1}</text></g>)}
                  </g>
                ))}
                {YS.map((y, i) => (
                  <g key={'y' + i}>
                    <line x1={fb.x0 - 4.3} y1={y} x2={fb.x1 + 4.3} y2={y} />
                    {[fb.x0 - 4.8, fb.x1 + 4.8].map((x) => <g key={x}><circle cx={x} cy={y} r={0.48} /><text x={x} y={y} textAnchor="middle" dominantBaseline="central">{AX_Y[i]}</text></g>)}
                  </g>
                ))}
              </g>
            )}
            {/* walls, windows, doors */}
            {plan.walls.map((w, i) => <path key={i} className="wall" fillRule="evenodd" d={P(w.outer) + w.holes.map(P).join('')} />)}
            {plan.windows.map((w, i) => <Window key={i} w={w} />)}
            {plan.glass.map((w, i) => <Window key={'g' + i} w={w} thin />)}
            {plan.openings.filter((o) => o.kind === 'door').map((o, i) => <Door key={i} o={o} kindAt={kindAt} />)}
            {/* room labels */}
            {show.areas && plan.rooms.map((r) => {
              const name = roomName(r); if (!name || r.area < 1.2) return null;
              if (apt !== null && !mine.has(r.id)) return null;
              const [x, y] = labelPoint(r.poly), q = polyBounds(r.poly);
              const rect = ringArea(r.poly.outer) / ((q.x1 - q.x0) * (q.y1 - q.y0)) > 0.85;
              const big = r.area > 6;
              return (
                <g key={r.id} className="lbl">
                  <text x={x} y={y - (big ? 0.28 : 0.12)} textAnchor="middle" className={big ? '' : 'sm'}>{name}</text>
                  <text x={x} y={y + (big ? 0.2 : 0.22)} textAnchor="middle" className={'ar' + (big ? '' : ' sm')}>{r.area.toFixed(2)}</text>
                  {apt !== null && rect && big && <text x={x} y={y + 0.62} textAnchor="middle" className="sz">{mm(q.x1 - q.x0)}×{mm(q.y1 - q.y0)}</text>}
                </g>
              );
            })}
            {/* dimension chains */}
            {show.dims && apt === null && (
              <>
                <Chain pts={[fb.x0, fb.x1, ...chains.top]} axis="x" off={fb.y0 - 1.1} side={-1} />
                <Chain pts={[fb.x0, fb.x1, ...XS]} axis="x" off={fb.y0 - 2.1} side={-1} />
                <Chain pts={[fb.x0, fb.x1]} axis="x" off={fb.y0 - 3.1} side={-1} />
                <Chain pts={[fb.x0, fb.x1, ...chains.bot]} axis="x" off={fb.y1 + 1.1} side={1} />
                <Chain pts={[fb.x0, fb.x1, ...XS]} axis="x" off={fb.y1 + 2.1} side={1} />
                <Chain pts={[fb.x0, fb.x1]} axis="x" off={fb.y1 + 3.1} side={1} />
                <Chain pts={[fb.y0, fb.y1, ...chains.lef]} axis="y" off={fb.x0 - 1.1} side={-1} />
                <Chain pts={[fb.y0, fb.y1, ...YS]} axis="y" off={fb.x0 - 2.1} side={-1} />
                <Chain pts={[fb.y0, fb.y1]} axis="y" off={fb.x0 - 3.1} side={-1} />
                <Chain pts={[fb.y0, fb.y1, ...chains.rig]} axis="y" off={fb.x1 + 1.1} side={1} />
                <Chain pts={[fb.y0, fb.y1, ...YS]} axis="y" off={fb.x1 + 2.1} side={1} />
                <Chain pts={[fb.y0, fb.y1]} axis="y" off={fb.x1 + 3.1} side={1} />
              </>
            )}
            {show.dims && aptCh && (
              <>
                <Chain pts={aptCh.xs} axis="x" off={aptCh.b.y0 - 1.0} side={-1} from={aptCh.b.y0} />
                <Chain pts={[aptCh.b.x0, aptCh.b.x1]} axis="x" off={aptCh.b.y0 - 1.9} side={-1} />
                <Chain pts={aptCh.ys} axis="y" off={aptCh.b.x0 - 1.0} side={-1} from={aptCh.b.x0} />
                <Chain pts={[aptCh.b.y0, aptCh.b.y1]} axis="y" off={aptCh.b.x0 - 1.9} side={-1} />
              </>
            )}
            {/* north arrow: the plan is turned 15° from north */}
            <g className="north" transform={`translate(${base.x + 1.4} ${base.y + base.h - 1.6}) rotate(-15)`}>
              <circle r={0.75} /><path d="M0 -0.7L0.28 0.35L0 0.15L-0.28 0.35Z" /><text y={-0.95} textAnchor="middle">N</text>
            </g>
            {/* title block */}
            <g className="tb">
              <rect x={tb.x} y={tb.y} width={tb.w} height={2.6} />
              <line x1={tb.x} y1={tb.y + 0.95} x2={tb.x + tb.w} y2={tb.y + 0.95} />
              <text x={tb.x + 0.25} y={tb.y + 0.62} className="h">OBOD MASKAN · {lang === 'ru' ? `блок ${blockId}` : `${blockId}-blok`}</text>
              <text x={tb.x + 0.25} y={tb.y + 1.45}>{info ? t.apt(info.num, plan.apts[apt!].label) + ' · ' + t.floor(storey) : t.floor(storey)}</text>
              <text x={tb.x + 0.25} y={tb.y + 1.95}>{t.scale} · {lang === 'ru' ? 'мм' : 'mm'} · {new Date().toISOString().slice(0, 10)}</text>
              <text x={tb.x + 0.25} y={tb.y + 2.4} className="w">{lang === 'ru' ? 'Образец — не для строительства' : 'Namunaviy — qurilish uchun emas'}</text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

function Window({ w, thin }: { w: FloorPlan['windows'][number]; thin?: boolean }) {
  const { x0, y0, x1, y1, axis } = w;
  const lines = axis === 'x' ? [0.3, 0.5, 0.7].map((k) => y0 + (y1 - y0) * k).map((y, i) => <line key={i} x1={x0} y1={y} x2={x1} y2={y} />)
    : [0.3, 0.5, 0.7].map((k) => x0 + (x1 - x0) * k).map((x, i) => <line key={i} x1={x} y1={y0} x2={x} y2={y1} />);
  return <g className={'win' + (thin ? ' thin' : '')}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />{lines}</g>;
}

function Door({ o, kindAt }: { o: FloorPlan['openings'][number]; kindAt: (x: number, y: number) => Room | undefined }) {
  const { x0, y0, x1, y1, axis } = o;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // the leaf opens into the more private room (bedroom, bath …), not into the corridor / hall
  const priv = (r?: Room) => (r?.kind === 'corridor' || r?.kind === 'hall' || !r?.kind ? 0 : 1);
  if (axis === 'x') {
    const L = x1 - x0, dir = priv(kindAt(cx, y1 + 0.3)) >= priv(kindAt(cx, y0 - 0.3)) ? 1 : -1, yy = dir > 0 ? y1 : y0;
    return <g className="door"><rect x={x0} y={y0} width={L} height={y1 - y0} className="gap" /><line x1={x0} y1={yy} x2={x0} y2={yy + dir * L} />
      <path d={`M${x0} ${yy + dir * L}A${L} ${L} 0 0 ${dir > 0 ? 0 : 1} ${x1} ${yy}`} /></g>;
  }
  const L = y1 - y0, dir = priv(kindAt(x1 + 0.3, cy)) >= priv(kindAt(x0 - 0.3, cy)) ? 1 : -1, xx = dir > 0 ? x1 : x0;
  return <g className="door"><rect x={x0} y={y0} width={x1 - x0} height={L} className="gap" /><line x1={xx} y1={y0} x2={xx + dir * L} y2={y0} />
    <path d={`M${xx + dir * L} ${y0}A${L} ${L} 0 0 ${dir > 0 ? 1 : 0} ${xx} ${y1}`} /></g>;
}

/** styles of the drawing, scoped to the svg (also inlined into the downloaded / printed SVG) */
const RAW_CSS = `
.rm{fill:#fff}.rm.pub{fill:#f3f1ec}.rm.bal{fill:#eef4f7}.rm.hl{fill:#fbf3e3}.rm.dim{fill:#f6f6f4}
.wall{fill:url(#hatch);stroke:#111;stroke-width:.035}
.win rect{fill:#fff;stroke:#111;stroke-width:.025}.win line{stroke:#111;stroke-width:.015}.win.thin rect{fill:#eef6fb}
.door .gap{fill:#fff;stroke:none}.door line,.door path{fill:none;stroke:#111;stroke-width:.02}
.axes line{stroke:#c0392b;stroke-width:.018;stroke-dasharray:.6 .15 .1 .15}.axes circle{fill:#fff;stroke:#c0392b;stroke-width:.03}
.axes text{font:600 .5px Montserrat,Arial,sans-serif;fill:#c0392b}
.dim line{stroke:#1d3a8a;stroke-width:.018}.dim .tick{stroke-width:.035}.dim .ext{stroke-width:.012;stroke-dasharray:.08 .06}
.dim text{font:500 .3px Montserrat,Arial,sans-serif;fill:#1d3a8a}.dim text.sm{font-size:.2px}
.lbl text{font:500 .3px Montserrat,Arial,sans-serif;fill:#333}.lbl text.ar{font-weight:700;fill:#111}.lbl text.sm{font-size:.22px}
.lbl text.sz{font-size:.22px;fill:#6b5a3a}
.north circle{fill:none;stroke:#333;stroke-width:.03}.north path{fill:#333}.north text{font:700 .36px Arial;fill:#333}
.tb rect{fill:#fff;stroke:#111;stroke-width:.04}.tb line{stroke:#111;stroke-width:.025}
.tb text{font:500 .3px Montserrat,Arial,sans-serif;fill:#111}.tb text.h{font-weight:700;font-size:.4px}.tb text.w{fill:#a0522d;font-size:.24px}
`;
export const SVG_CSS = RAW_CSS.split('}').filter((r) => r.trim()).map((r) => {
  const [sel, body] = r.split('{');
  return sel.split(',').map((x) => '.drw-svg ' + x.trim()).join(',') + '{' + body + '}';
}).join('\n');
