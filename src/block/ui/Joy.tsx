// Touch joystick: forward/back and sideways steps, -1..1 each.
import { useRef, useState } from 'react';

export function Joy({ onMove }: { onMove: (f: number, s: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState<[number, number]>([0, 0]);
  const upd = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    setK([dx, dy]);
    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    onMove(dead(-dy), dead(dx));
  };
  const end = () => { setK([0, 0]); onMove(0, 0); };
  return (
    <div className="joy" ref={ref}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); upd(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) upd(e); }}
      onPointerUp={end} onPointerCancel={end} onContextMenu={(e) => e.preventDefault()}>
      <div className="joy-knob" style={{ transform: `translate(${k[0] * 36}px, ${k[1] * 36}px)` }} />
    </div>
  );
}
