// Mini floor plan straight from the extracted drawing, the chosen flat highlighted (Kamolon card style).
import { planFor, polyBounds } from '../plan';

const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z';

type Me = { x: number; y: number; yaw: number };
export function PlanSvg({ storey, index, fit, me, onPick }: { storey: number; index: number | null; fit?: boolean; me?: Me; onPick?: (x: number, y: number) => void }) {
  const p = planFor(storey);
  const mine = new Set(index === null ? [] : p.apts[index].rooms);
  let vb = me && storey === 1 ? '-0.6 -1.9 31 25' : '-0.6 -1.9 31 20.6';
  if (fit && index !== null) { const b = polyBounds(p.apts[index].outline); vb = `${b.x0 - 0.7} ${b.y0 - 0.7} ${b.x1 - b.x0 + 1.4} ${b.y1 - b.y0 + 1.4}`; }
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const svg = e.currentTarget, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM()!.inverse()); onPick(q.x, q.y);
  };
  const cone = (m: Me) => {
    const fx = -Math.sin(m.yaw), fy = -Math.cos(m.yaw), a = 0.55, r = 2.2;
    const pt = (s: number) => [m.x + r * (fx * Math.cos(s * a) - fy * Math.sin(s * a)), m.y + r * (fy * Math.cos(s * a) + fx * Math.sin(s * a))];
    const [l, rr] = [pt(-1), pt(1)];
    return `M${m.x} ${m.y}L${l[0]} ${l[1]}A${r} ${r} 0 0 1 ${rr[0]} ${rr[1]}Z`;
  };
  return (
    <svg className="plan2d" viewBox={vb} onClick={click} style={onPick ? { cursor: 'crosshair' } : undefined}>
      <path className="fp" d={path(p.footprint.outer)} />
      {p.rooms.map((r) => (
        <path key={r.id} className={mine.has(r.id) ? 'hl' : r.apt === null ? 'core' : 'oth'} d={path(r.poly.outer) + r.poly.holes.map(path).join('')} />
      ))}
      {p.walls.map((w, i) => <path key={i} className="walls" fillRule="evenodd" d={path(w.outer) + w.holes.map(path).join('')} />)}
      {me && <g className="me"><path className="cone" d={cone(me)} /><circle cx={me.x} cy={me.y} r={0.34} className="dot0" /><circle cx={me.x} cy={me.y} r={0.24} className="dot" /></g>}
    </svg>
  );
}

/** Plan pages of the Block-1 PDF: floor plans and one page per flat type (plan + 3D isometric). */
const TYPE_PAGE: Record<string, Record<string, number>> = {
  '2': { '54.40': 6, '63.56': 7, '40.73': 8, '64.03': 9, '41.46': 10, '71.35': 11, '34.96': 12 },
  '3': { '53.88': 14, '63.40': 15, '40.00': 16, '63.47': 17, '40.73': 18, '70.80': 19, '40.84': 20 },
};
export const floorPage = (storey: number) => `pdf/b1-p${storey === 1 ? 4 : storey === 2 ? 5 : 13}.jpg`;
export const typePage = (storey: number, label: string) => {
  const n = TYPE_PAGE[storey === 2 ? '2' : '3'][label];
  return n ? `pdf/b1-p${n}.jpg` : null;
};
