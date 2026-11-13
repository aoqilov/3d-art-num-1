// Satellite map of the neighbourhood with numbered pins, the site marker and a dashed line to the chosen place.
import { CATS, PLACES, SAT, distance, type Place } from '../../data/nearby';
import type { Lang } from './i18n';

export function NearbyMap({ lang, active, onPick, list }: { lang: Lang; active: string | null; onPick: (id: string) => void; list: Place[] }) {
  const a = PLACES.find((p) => p.id === active);
  const [cx, cy] = SAT.centre;
  return (
    <div className="nmap">
      <img src="sat.jpg" alt="" />
      <svg viewBox={`0 0 ${SAT.w} ${SAT.h}`}>
        {a && (
          <g>
            <line x1={cx} y1={cy} x2={a.px[0]} y2={a.px[1]} className="route" />
            <text x={(cx + a.px[0]) / 2} y={(cy + a.px[1]) / 2 - 10} className="rlabel">{distance(a).m} m · {distance(a).min} {lang === 'uz' ? 'daq' : 'мин'}</text>
          </g>
        )}
        <circle cx={cx} cy={cy} r={34} className="site-ring" />
        <circle cx={cx} cy={cy} r={11} className="site" />
        <text x={cx} y={cy - 44} className="slabel">OBOD MASKAN</text>
        {list.map((p) => {
          const n = PLACES.indexOf(p) + 1;
          const on = p.id === active;
          return (
            <g key={p.id} className={'pin' + (on ? ' on' : '')} onClick={() => onPick(p.id)}>
              <circle cx={p.px[0]} cy={p.px[1]} r={on ? 17 : 13} style={{ fill: CATS[p.cat].color }} />
              <text x={p.px[0]} y={p.px[1] + 5}>{n}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
