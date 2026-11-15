// 360° rooms of a flat: equirectangular panoramas rendered in Blender Cycles (tools/interior/build.py →
// public/pano/apt<N>/<room>.jpg + rooms.json). A plain WebGL 2 viewer (the block scene keeps its WebGPU renderer):
// one full-screen triangle whose fragment shader turns each pixel into a view ray and reads the panorama.
// Drag to look, wheel to zoom, the rooms as tabs below, and a marker toward every other room: click to go there.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import type { Lang } from './i18n';

type Room = { id: string; name: string; kind: string; pos: [number, number]; yaw: number; file: string; links: string[] };
type Tour = { apt: number; label: string; rooms: Room[] };

const VS = `#version 300 es
in vec2 p; out vec2 q; void main() { q = p; gl_Position = vec4(p, 0., 1.); }`;
const FS = `#version 300 es
precision highp float;
in vec2 q; out vec4 o;
uniform sampler2D pano; uniform float yaw, pitch, tanh, aspect, fade;
void main() {
  vec3 d = normalize(vec3(q.x * tanh * aspect, q.y * tanh, 1.0));
  float cp = cos(pitch), sp = sin(pitch);
  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);          // look up / down
  float cy = cos(yaw), sy = sin(yaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);           // turn right
  float lon = atan(d.x, d.z), lat = asin(clamp(d.y, -1., 1.));
  vec2 uv = vec2(0.5 + lon / 6.2831853, 0.5 - lat / 3.1415927);
  o = vec4(texture(pano, uv).rgb * fade, 1.);
}`;

const T = {
  uz: { title: '360° ichki ko‘rinish', hint: 'Sichqoncha bilan aylantiring · g‘ildirak — yaqinlashtirish', note: 'Dizayn — namuna (mebel va bezak sotuvga kirmaydi)' },
  ru: { title: 'Интерьер 360°', hint: 'Вращайте мышью · колесо — приближение', note: 'Дизайн — пример (мебель и декор не входят в продажу)' },
};
const RU: Record<string, string> = { Mehmonxona: 'Гостиная', Oshxona: 'Кухня', Yotoqxona: 'Спальня', Koridor: 'Коридор', Dahliz: 'Холл' };
const roomName = (r: Room, lang: Lang) => (lang === 'ru' ? r.name.replace(/^\S+/, (w) => RU[w] ?? w) : r.name);

export function Pano360({ dir, lang, onClose }: { dir: string; lang: Lang; onClose: () => void }) {
  const t = T[lang];
  const cv = useRef<HTMLCanvasElement>(null);
  const [tour, setTour] = useState<Tour | null>(null);
  const [cur, setCur] = useState(0);
  const [spots, setSpots] = useState<{ id: string; x: number; y: number; name: string }[]>([]);
  const view = useRef({ yaw: 0, pitch: 0, fov: 80, fade: 0 });
  const api = useRef<{ load: (src: string) => void; draw: () => void } | null>(null);

  useEffect(() => { fetch(`${dir}/rooms.json`).then((r) => r.json()).then(setTour).catch(() => setTour(null)); }, [dir]);

  // WebGL setup once
  useEffect(() => {
    const c = cv.current!;
    const gl = c.getContext('webgl2', { antialias: false });
    if (!gl) return;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);     // no mipmaps: they seam at the wrap of the panorama
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([40, 38, 34]));
    const U = (n: string) => gl.getUniformLocation(prog, n);
    let raf = 0;
    const draw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = c.clientWidth * devicePixelRatio, h = c.clientHeight * devicePixelRatio;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        gl.viewport(0, 0, c.width, c.height);
        const v = view.current;
        gl.uniform1f(U('yaw'), v.yaw); gl.uniform1f(U('pitch'), v.pitch);
        gl.uniform1f(U('tanh'), Math.tan((v.fov * Math.PI) / 360)); gl.uniform1f(U('aspect'), c.width / c.height);
        gl.uniform1f(U('fade'), v.fade);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (v.fade < 1) { v.fade = Math.min(1, v.fade + 0.08); draw(); }
        place();
      });
    };
    const load = (src: string) => {
      const im = new Image();
      im.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
        view.current.fade = 0; draw();
      };
      im.src = src;
    };
    api.current = { load, draw };
    const ro = new ResizeObserver(() => draw());
    ro.observe(c);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); api.current = null; gl.getExtension('WEBGL_lose_context')?.loseContext(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // markers toward the other rooms: direction in the plan from this room's camera, as a longitude of its panorama
  const placeRef = useRef<() => void>(() => {});
  function place() { placeRef.current(); }
  placeRef.current = () => {
    if (!tour) return;
    const me = tour.rooms[cur], c = cv.current;
    if (!me || !c) return;
    const v = view.current, out: typeof spots = [];
    // the camera's forward in the plan (x east, y south): Blender rotation (90°, 0, yaw) looks along (−sin yaw, cos yaw)
    // in Blender's (x, y) = plan (x, −y)
    const fx = -Math.sin(me.yaw), fy = -Math.cos(me.yaw);
    const rx = -fy, ry = fx;                                      // the camera's right, in the plan
    for (const id of me.links) {
      const o = tour.rooms.find((r) => r.id === id);
      if (!o) continue;
      const dx = o.pos[0] - me.pos[0], dy = o.pos[1] - me.pos[1];
      const lon = Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy);
      const lat = -0.22;
      // into the view: inverse of the shader's turn and tilt
      let x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
      const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
      [x, z] = [x * cy - z * sy, x * sy + z * cy];
      const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
      [y, z] = [y * cp - z * sp, y * sp + z * cp];
      if (z <= 0.05) continue;
      const th = Math.tan((v.fov * Math.PI) / 360), asp = c.clientWidth / c.clientHeight;
      const sx = x / z / (th * asp), syy = y / z / th;
      if (Math.abs(sx) > 1.1 || Math.abs(syy) > 1.1) continue;
      out.push({ id, name: roomName(o, lang), x: (sx * 0.5 + 0.5) * c.clientWidth, y: (0.5 - syy * 0.5) * c.clientHeight });
    }
    setSpots((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
  };

  // room change
  useEffect(() => {
    if (!tour) return;
    const r = tour.rooms[cur];
    view.current.yaw = 0; view.current.pitch = -0.05;
    api.current?.load(`${dir}/${r.file}`);
  }, [tour, cur, dir]);

  // drag, wheel, keys
  useEffect(() => {
    const c = cv.current!;
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch }; c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = (view.current.fov / c.clientHeight) * (Math.PI / 180);
      view.current.yaw = drag.yaw - (e.clientX - drag.x) * k;
      view.current.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * k));
      api.current?.draw();
    };
    const up = () => { drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.fov = Math.max(35, Math.min(105, view.current.fov + e.deltaY * 0.05)); api.current?.draw(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') { view.current.yaw -= 0.15; api.current?.draw(); }
      if (e.key === 'ArrowRight') { view.current.yaw += 0.15; api.current?.draw(); }
    };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false }); addEventListener('keydown', key);
    return () => {
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up);
      c.removeEventListener('wheel', wheel); removeEventListener('keydown', key);
    };
  }, [onClose]);

  return (
    <div className="pano360">
      <canvas ref={cv} />
      {spots.map((s) => (
        <button key={s.id} className="pspot" style={{ left: s.x, top: s.y }} onClick={() => setCur(tour!.rooms.findIndex((r) => r.id === s.id))}>
          <i /><span>{s.name}</span>
        </button>
      ))}
      <div className="phead glass">
        <b>{t.title}</b>
        {tour && <span>{tour.label} m² · {roomName(tour.rooms[cur], lang)}</span>}
        <button className="icbtn" onClick={onClose}><Icon n="close" /></button>
      </div>
      {tour && (
        <div className="ptabs glass">
          {tour.rooms.map((r, i) => <button key={r.id} className={i === cur ? 'on' : ''} onClick={() => setCur(i)}>{roomName(r, lang)}</button>)}
        </div>
      )}
      <div className="phint">{t.hint} · {t.note}</div>
    </div>
  );
}
