// Courtyard furniture from public/context/yard.json (tools/yard.py): sports court with fence and goals,
// playgrounds on rubber surfacing, parking rows with parked cars, gazebos, benches and bins, bike racks,
// hedges and flower patches on the planted beds, manhole covers. Static: merged by material or instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GlbForest, type GlbAt } from './glbTrees';
import { glbInstances, type GlbItem } from './glbInstances';

export type YardData = {
  court: number[] | null;          // cx, cz, deg, w, d
  play: number[][];                // cx, cz, deg, w, d
  parking: number[][];             // cx, cz, deg, bays
  gazebo: number[][]; bike: number[][];   // cx, cz, deg
  bench: number[][];               // x, z, yaw
  hedge: number[][];               // x, z, r
  flowers: number[][];             // x, z, r, scheme
  manhole: number[][];             // x, z, kind
  paths?: number[][];              // footpath polygons across the beds (flat x, z rings)
  cut?: number[][];                // trees standing on a path
};
export async function loadYard(): Promise<YardData | null> {
  try { const r = await fetch('context/yard.json'); return r.ok ? await r.json() : null; } catch { return null; }
}

const BED_Y = 0.16, PAVE_Y = 0.04;
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
/** thin bar between two points */
function bar(a: [number, number, number], b: [number, number, number], t = 0.07) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const g = new THREE.BoxGeometry(t, L, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const place = (cx: number, cz: number, deg: number) => new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY((-deg * Math.PI) / 180));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function courtTex(w: number, d: number) {
  const k = 40;
  return canvasTex(w * k, d * k, (g) => {
    const W = w * k, D = d * k, m = 1.2 * k;
    g.fillStyle = '#2f7d57'; g.fillRect(0, 0, W, D);
    g.fillStyle = '#3d6fa3'; g.fillRect(m, m, W - 2 * m, D - 2 * m);
    g.strokeStyle = '#fff'; g.lineWidth = 0.08 * k;
    g.strokeRect(m, m, W - 2 * m, D - 2 * m);
    g.beginPath(); g.moveTo(m, D / 2); g.lineTo(W - m, D / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, D / 2, 1.8 * k, 0, Math.PI * 2); g.stroke();
    for (const s of [0, 1]) {
      const y = s ? D - m : m, dir = s ? -1 : 1;
      g.strokeRect(W / 2 - 3 * k, s ? y - 2.6 * k : y, 6 * k, 2.6 * k);                   // goal area
      g.beginPath(); g.arc(W / 2, y + dir * 1.2 * k, 4.6 * k, s ? Math.PI : 0, s ? Math.PI * 2 : Math.PI); g.stroke();   // three-point arc
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * D, 3, 3); }
  });
}
function rubberTex(w: number, d: number) {
  const k = 32;
  return canvasTex(w * k, d * k, (g) => {
    const W = w * k, D = d * k;
    g.fillStyle = '#b5553c'; g.fillRect(0, 0, W, D);
    const cols = ['#3f8fc4', '#e8b93a', '#4fa36a', '#d9764a'];
    let sd = Math.round(w * 31 + d * 7); const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.ellipse(r() * W, r() * D, (1.2 + r() * 2) * k, (1 + r() * 1.6) * k, r() * 3, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.06})`; g.fillRect(r() * W, r() * D, 2, 2); }
    g.strokeStyle = '#8e8a82'; g.lineWidth = 0.3 * k; g.strokeRect(0, 0, W, D);
  });
}
function meshTex() {
  const t = canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64); g.strokeStyle = '#2f5a45'; g.lineWidth = 3;
    for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function flowerTex(scheme: number) {
  const sets = [['#e0483e', '#f2c230', '#fff'], ['#e58ab0', '#fff', '#c94f8a'], ['#8a63c9', '#c9b2f0', '#f2e9a0'], ['#f08a2c', '#f2d13a', '#e0483e']];
  return canvasTex(256, 256, (g) => {
    let sd = scheme * 97 + 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2, q = Math.sqrt(r()) * 120, x = 128 + Math.cos(a) * q, y = 128 + Math.sin(a) * q;
      g.fillStyle = r() < 0.45 ? ['#2f6b34', '#3f8040', '#507a2c'][Math.floor(r() * 3)] : sets[scheme][Math.floor(r() * 3)];
      g.beginPath(); g.arc(x, y, 3 + r() * 4, 0, Math.PI * 2); g.fill();
    }
  });
}
function manholeTex(grate: boolean) {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = '#3b3d40';
    if (grate) { g.fillRect(4, 4, 56, 56); g.fillStyle = '#17181a'; for (let x = 10; x < 56; x += 9) g.fillRect(x, 9, 4, 46); }
    else {
      g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#25272a'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos((i * Math.PI) / 4) * 24, 32 + Math.sin((i * Math.PI) / 4) * 24); g.stroke(); }
    }
  });
}

const CAR_COLORS = ['#f4f4f2', '#f4f4f2', '#f4f4f2', '#d9dbdd', '#b9bcc0', '#2a2c30', '#6b7076', '#22334d', '#8c1f1f', '#f4f4f2'];

export class Yard {
  readonly group = new THREE.Group();
  constructor(d: YardData) {
    const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
    const M = {
      steel: std('#3d4a45', { roughness: 0.5, metalness: 0.5 }), white: std('#f1f1ee'), wood: std('#9a6b3f', { roughness: 0.85 }), dark: std('#2c2f33'),
      red: std('#d6453a'), yellow: std('#eebf2e'), blue: std('#3a86c8'), green: std('#4c9a5c'), sand: std('#dcc9a0', { roughness: 1 }),
      asphalt: std('#44474c', { roughness: 0.95 }), line: std('#eeeeea'), roof: std('#5b3b2a', { roughness: 0.9 }), bin: std('#2f5a45'), curb: std('#c3bfb6'),
    };
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (m: THREE.Material, g: THREE.BufferGeometry, T: THREE.Matrix4) => { g.applyMatrix4(T); let a = parts.get(m); if (!a) parts.set(m, (a = [])); a.push(g.index ? g.toNonIndexed() : g); };
    const surf = (tex: THREE.Texture, w: number, dd: number, T: THREE.Matrix4, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, dd).rotateX(-Math.PI / 2).translate(0, y, 0).applyMatrix4(T), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      m.receiveShadow = true; this.group.add(m);
    };
    let sd = 11; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);

    // ---- sports court
    if (d.court) {
      const [cx, cz, deg, w, dd] = d.court, T = place(cx, cz, deg), hw = w / 2, hd = dd / 2, H = 3.2;
      surf(courtTex(w, dd), w, dd, T, PAVE_Y + 0.02);
      const net = new THREE.MeshStandardMaterial({ map: meshTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
      const panel = (x0: number, z0: number, x1: number, z1: number) => {
        const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(L, H);
        const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.6, uv.getY(i) * H / 0.6);
        g.rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, H / 2 + PAVE_Y, (z0 + z1) / 2).applyMatrix4(T);
        this.group.add(new THREE.Mesh(g, net));
      };
      panel(-hw, -hd, hw, -hd); panel(-hw, hd, hw, hd); panel(-hw, -hd, -hw, hd); panel(hw, -hd, hw, hd - 2.4);   // a gap for the gate
      for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd], [-hw, hd, hw, hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]]) {
        const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 3);
        for (let i = 0; i <= n; i++) put(M.steel, cyl(0.045, H, x0 + ((x1 - x0) * i) / n, PAVE_Y, z0 + ((z1 - z0) * i) / n, 8), T);
        put(M.steel, bar([x0, H + PAVE_Y, z0], [x1, H + PAVE_Y, z1], 0.05), T);
      }
      for (const s of [-1, 1]) {
        const z = s * (hd - 1.25);
        // goal
        put(M.white, bar([-1.5, 0, z], [-1.5, 2, z], 0.09), T); put(M.white, bar([1.5, 0, z], [1.5, 2, z], 0.09), T); put(M.white, bar([-1.5, 2, z], [1.5, 2, z], 0.09), T);
        put(M.white, bar([-1.5, 2, z], [-1.5, 0, z + s * 0.9], 0.05), T); put(M.white, bar([1.5, 2, z], [1.5, 0, z + s * 0.9], 0.05), T);
        // basketball hoop above it
        put(M.steel, bar([0, 0, z + s * 1.0], [0, 3.3, z + s * 1.0], 0.12), T); put(M.steel, bar([0, 3.3, z + s * 1.0], [0, 3.2, z - s * 0.1], 0.1), T);
        put(M.white, bx(-0.9, 2.75, z - s * 0.1, 0.9, 3.8, z - s * 0.14), T);
        put(M.red, new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2).translate(0, 3.05, z - s * 0.4), T);
      }
    }

    // ---- playgrounds
    for (const [cx, cz, deg, w, dd] of d.play) {
      const T = place(cx, cz, deg), hw = w / 2, hd = dd / 2, y = PAVE_Y + 0.03;
      surf(rubberTex(w, dd), w, dd, T, PAVE_Y + 0.02);
      // slide tower
      { const x = -hw + 2.6, z = -hd + 2.8;
        for (const [px, pz] of [[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]]) put(M.blue, cyl(0.06, 2.9, x + px, y, z + pz, 8), T);
        put(M.wood, bx(x - 0.8, y + 1.35, z - 0.8, x + 0.8, y + 1.45, z + 0.8), T);
        put(M.red, new THREE.ConeGeometry(1.35, 0.8, 4).rotateY(Math.PI / 4).translate(x, y + 3.3, z), T);
        put(M.yellow, bar([x + 0.8, y + 1.45, z], [x + 3.6, y + 0.15, z], 0.1).scale(1, 1, 7).translate(0, 0, -z * 6), T);   // chute
        for (const s of [-0.38, 0.38]) put(M.yellow, bar([x + 0.8, y + 1.7, z + s], [x + 3.6, y + 0.4, z + s], 0.05), T);
        for (let i = 0; i < 5; i++) put(M.steel, bar([x - 0.3, y + 0.25 + i * 0.25, z - 0.85], [x + 0.3, y + 0.25 + i * 0.25, z - 0.85 - 0.1 * (5 - i)], 0.04).translate(0, 0, 0), T);
        put(M.steel, bar([x - 0.3, y, z - 1.4], [x - 0.3, y + 1.45, z - 0.8], 0.05), T); put(M.steel, bar([x + 0.3, y, z - 1.4], [x + 0.3, y + 1.45, z - 0.8], 0.05), T);
      }
      // swing set
      { const x = hw - 3.2, z = -hd + 2.4, h = 2.4;
        for (const s of [-1.6, 1.6]) { put(M.green, bar([x + s, y + h, z], [x + s, y, z - 0.9], 0.08), T); put(M.green, bar([x + s, y + h, z], [x + s, y, z + 0.9], 0.08), T); }
        put(M.green, bar([x - 1.6, y + h, z], [x + 1.6, y + h, z], 0.09), T);
        for (const s of [-0.7, 0.7]) {
          put(M.dark, bar([x + s - 0.22, y + h, z], [x + s - 0.22, y + 0.5, z + 0.25], 0.02), T); put(M.dark, bar([x + s + 0.22, y + h, z], [x + s + 0.22, y + 0.5, z + 0.25], 0.02), T);
          put(M.red, bx(x + s - 0.26, y + 0.46, z + 0.13, x + s + 0.26, y + 0.5, z + 0.37), T);
        }
      }
      // sandbox
      { const x = -hw + 2.6, z = hd - 2.6, a = 1.6;
        put(M.sand, bx(x - a, y, z - a, x + a, y + 0.14, z + a), T);
        for (const [x0, z0, x1, z1] of [[-a, -a, a, -a + 0.18], [-a, a - 0.18, a, a], [-a, -a, -a + 0.18, a], [a - 0.18, -a, a, a]]) put(M.wood, bx(x + x0, y, z + z0, x + x1, y + 0.3, z + z1), T);
      }
      // carousel
      { const x = hw - 2.6, z = hd - 2.6;
        put(M.blue, cyl(1.1, 0.1, x, y + 0.22, z, 20), T); put(M.steel, cyl(0.07, 0.95, x, y, z, 8), T);
        for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2, px = x + Math.cos(a) * 0.95, pz = z + Math.sin(a) * 0.95; put(M.yellow, bar([px, y + 0.3, pz], [px, y + 0.95, pz], 0.04), T); put(M.yellow, bar([px, y + 0.95, pz], [x, y + 0.95, z], 0.04), T); }
      }
      // see-saw and spring riders in the middle
      put(M.steel, cyl(0.06, 0.5, 0, y, 0, 8), T); put(M.green, bar([-1.5, y + 0.75, 0], [1.5, y + 0.3, 0], 0.09).scale(1, 1, 2.6), T);
      for (const [px, pz, m] of [[-1.2, 2.2, M.red], [1.3, 2.4, M.yellow]] as [number, number, THREE.Material][]) {
        put(M.dark, cyl(0.05, 0.35, px, y, pz, 8), T); put(m, bx(px - 0.45, y + 0.35, pz - 0.12, px + 0.45, y + 0.75, pz + 0.12), T); put(M.dark, bar([px - 0.2, y + 0.8, pz - 0.2], [px - 0.2, y + 0.8, pz + 0.2], 0.03), T);
      }
      // low border
      for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd + 0.12], [-hw, hd - 0.12, hw, hd], [-hw, -hd, -hw + 0.12, hd], [hw - 0.12, -hd, hw, hd]]) put(M.curb, bx(x0, PAVE_Y, z0, x1, PAVE_Y + 0.12, z1), T);
    }

    // ---- parking: asphalt, bay lines, wheel stops, parked cars
    const cars: { m: THREE.Matrix4; c: string }[] = [];
    for (const [cx, cz, deg, n] of d.parking) {
      const T = place(cx, cz, deg), L = n * 2.6, hd = 2.6;
      put(M.asphalt, bx(-L / 2, PAVE_Y, -hd, L / 2, PAVE_Y + 0.02, hd), T);
      for (let i = 0; i <= n; i++) put(M.line, bx(-L / 2 + i * 2.6 - 0.06, PAVE_Y + 0.02, -hd + 0.2, -L / 2 + i * 2.6 + 0.06, PAVE_Y + 0.03, hd - 0.1), T);
      const nose = rnd() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * 2.6;
        put(M.curb, bx(x - 0.8, PAVE_Y + 0.02, nose * (hd - 0.55), x + 0.8, PAVE_Y + 0.14, nose * (hd - 0.4)), T);
        if (rnd() > 0.72) continue;
        const k = 0.92 + rnd() * 0.16, tall = rnd() < 0.3 ? 1.18 : 1;
        const m = T.clone().multiply(new THREE.Matrix4().makeTranslation(x + (rnd() - 0.5) * 0.2, PAVE_Y + 0.02, (rnd() - 0.5) * 0.3 - nose * 0.25))
          .multiply(new THREE.Matrix4().makeRotationY(nose > 0 ? -Math.PI / 2 : Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(k, tall, 1));
        cars.push({ m, c: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] });
      }
    }
    if (cars.length) {
      // a simple car, nose towards +x: painted body and roof, dark glass cabin, wheels, lights
      const body = mergeGeometries([bx(-2.15, 0.3, -0.86, 2.15, 0.92, 0.86), bx(-1.35, 1.38, -0.74, 0.75, 1.46, 0.74), bx(-1.5, 0.92, -0.8, -1.3, 1.4, 0.8), bx(0.72, 0.92, -0.78, 0.86, 1.4, 0.78)])!;
      const dark = mergeGeometries([bx(-1.4, 0.92, -0.79, 0.8, 1.38, 0.79), ...[[-1.35, -0.8], [1.35, -0.8], [-1.35, 0.8], [1.35, 0.8]].map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14).rotateX(Math.PI / 2).translate(x, 0.33, z)), bx(-2.2, 0.28, -0.8, 2.2, 0.42, 0.8)])!;
      const bodyM = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.45, envMapIntensity: 1.2 }), cars.length);
      const darkM = new THREE.InstancedMesh(dark, new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.25, metalness: 0.4 }), cars.length);
      const col = new THREE.Color();
      cars.forEach((c, i) => { bodyM.setMatrixAt(i, c.m); darkM.setMatrixAt(i, c.m); bodyM.setColorAt(i, col.set(c.c)); });
      for (const m of [bodyM, darkM]) { m.castShadow = m.receiveShadow = true; m.raycast = () => {}; this.group.add(m); }
    }

    // ---- gazebos
    for (const [cx, cz, deg] of d.gazebo) {
      const T = place(cx, cz, deg), a = 1.9;
      for (const [x, z] of [[-a, -a], [a, -a], [a, a], [-a, a]]) put(M.wood, bx(x - 0.08, PAVE_Y, z - 0.08, x + 0.08, 2.5, z + 0.08), T);
      put(M.roof, new THREE.ConeGeometry(3.25, 1.3, 4).rotateY(Math.PI / 4).translate(0, 3.15, 0), T);
      for (const [x0, z0, x1, z1] of [[-a, -a, a, -a], [-a, a, a, a], [-a, -a, -a, a]]) { put(M.wood, bar([x0, 0.9, z0], [x1, 0.9, z1], 0.06), T); put(M.wood, bar([x0, 0.45, z0], [x1, 0.45, z1], 0.05), T); }
      put(M.wood, bx(-a + 0.15, 0.42, -a + 0.15, a - 0.15, 0.48, -a + 0.6), T); put(M.wood, bx(-a + 0.15, 0.42, a - 0.6, a - 0.15, 0.48, a - 0.15), T);
      put(M.wood, bx(-0.6, 0.7, -0.45, 0.6, 0.76, 0.45), T); put(M.wood, bx(-0.06, PAVE_Y, -0.06, 0.06, 0.7, 0.06), T);
    }
    // ---- bike racks
    for (const [cx, cz, deg] of d.bike) {
      const T = place(cx, cz, deg);
      for (let i = 0; i < 5; i++) { const x = -1.3 + i * 0.65; put(M.steel, bar([x, PAVE_Y, -0.35], [x, 0.8, -0.35], 0.04), T); put(M.steel, bar([x, PAVE_Y, 0.35], [x, 0.8, 0.35], 0.04), T); put(M.steel, bar([x, 0.8, -0.35], [x, 0.8, 0.35], 0.04), T); }
    }
    // ---- benches with bins: the bench built in Blender (slats, steel frames; tools/yard_glb), the bin drawn here
    const benches: GlbItem[] = [];
    for (const [x, z, yaw] of d.bench) {
      const T = new THREE.Matrix4().makeTranslation(x, PAVE_Y, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
      benches.push({ m: T.clone() });          // its seat faces +z, like the drawn bench it replaces
      put(M.bin, cyl(0.2, 0.62, 1.35, 0.08, -0.05, 12), T); put(M.dark, cyl(0.03, 0.1, 1.35, 0, -0.05, 6), T);
    }
    this.group.add(glbInstances('orindiq', benches).group);
    for (const [m, list] of parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.castShadow = m !== M.asphalt && m !== M.line; mesh.receiveShadow = true; mesh.raycast = () => {};
      this.group.add(mesh); list.forEach((g) => g.dispose());
    }

    // ---- footpaths across the beds: red pavers with a light edging
    if (d.paths?.length) {
      const tex = (k: string) => { const t = new THREE.TextureLoader().load(`pro/tex/pavers_red_${k}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = k === 'a' ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; };
      const pm = new THREE.MeshStandardMaterial({ map: tex('a'), normalMap: tex('n'), roughness: 0.9 });
      const pos: number[] = [], uv: number[] = [];
      const edging: THREE.BufferGeometry[] = [];
      for (const ring of d.paths) {
        const pts = Array.from({ length: ring.length / 2 }, (_, k) => new THREE.Vector2(ring[k * 2], ring[k * 2 + 1]));
        for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) for (const i of [t[0], t[2], t[1]]) { pos.push(pts[i].x, BED_Y + 0.02, pts[i].y); uv.push(pts[i].x / 2, pts[i].y / 2); }
        // edging stones along the long sides
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length]; if (a.distanceTo(b) < 0.25) continue;
          edging.push(bar([a.x, BED_Y + 0.03, a.y], [b.x, BED_Y + 0.03, b.y], 0.1).toNonIndexed());
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, pm); m.receiveShadow = true; m.raycast = () => {}; this.group.add(m);
      if (edging.length) { const e = new THREE.Mesh(mergeGeometries(edging, false), M.curb); e.receiveShadow = true; e.raycast = () => {}; this.group.add(e); }
    }

    // ---- hedges: clipped leafy clumps along the bed edges (crossed leaf cards, instanced)
    if (d.hedge.length) {
      const cards: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const q = new THREE.PlaneGeometry(1.5, 1.5);
        q.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)));
        q.translate((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.9);
        const P = q.getAttribute('position'), N = q.getAttribute('normal'), v = new THREE.Vector3();
        for (let j = 0; j < P.count; j++) { v.set(P.getX(j), P.getY(j) + 0.5, P.getZ(j)).normalize(); N.setXYZ(j, v.x, v.y, v.z); }   // soft, volume-like shading
        cards.push(q);
      }
      const leafT = canvasTex(256, 256, (g) => {
        g.clearRect(0, 0, 256, 256);
        for (let i = 0; i < 700; i++) {
          const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 118;
          g.save(); g.translate(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); g.rotate(rnd() * 6.283);
          g.fillStyle = ['#3d6b2c', '#4c7d33', '#5a8c3a', '#2f5a26', '#6a9a42'][Math.floor(rnd() * 5)];
          g.beginPath(); g.ellipse(0, 0, 6 + rnd() * 5, 3 + rnd() * 2.5, 0, 0, 6.283); g.fill(); g.restore();
        }
      });
      const hmat = new THREE.MeshStandardMaterial({ map: leafT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
      const hm = new THREE.InstancedMesh(mergeGeometries(cards)!, hmat, d.hedge.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      d.hedge.forEach(([x, z, r], i) => {
        m4.makeTranslation(x, BED_Y + r * 0.8, z).multiply(new THREE.Matrix4().makeRotationY(rnd() * 6)).multiply(new THREE.Matrix4().makeScale(r * 1.35, r * 1.25, r * 1.35));
        hm.setMatrixAt(i, m4); hm.setColorAt(i, col.setScalar(0.8 + rnd() * 0.35));
      });
      hm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafT, alphaTest: 0.5 });
      hm.castShadow = hm.receiveShadow = true; hm.raycast = () => {}; this.group.add(hm);
      // clipped hedge clumps built in Blender (dense foliage, lumpy sides, loose leaves; 1 × 1 × 1 m, base at 0)
      // replace the card clumps above once loaded
      // every second point of a row, a clump half as wide again: the same hedge from half the clumps
      const items: GlbItem[] = d.hedge.filter((_, i) => i % 2 === 0).map(([x, z, r]) => ({
        m: new THREE.Matrix4().makeTranslation(x, BED_Y - 0.03, z)
          .multiply(new THREE.Matrix4().makeRotationY(Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.3))
          .multiply(new THREE.Matrix4().makeScale(r * 3.0, r * 1.8, r * 3.0)),
        tint: 0.85 + rnd() * 0.3,
      }));
      const hedge = glbInstances('buta_tosiq', items);
      hedge.ready.then((ok) => { if (!ok) return; this.group.remove(hm); this.group.add(hedge.group); });
    }
    // ---- bushes (Blender: searsia_lucida), flowers (gazania) in the beds, grass tufts around them
    if (d.flowers.length) {
      const list: GlbAt[] = [], bush: GlbItem[] = [], flowers: GlbItem[] = [];
      const turn = new THREE.Matrix4(), sc = new THREE.Matrix4();
      for (const [x, z, r] of d.flowers) {
        for (let k = 0; k < 2; k++) {
          const a = rnd() * 6.283, h = 0.75 + rnd() * 0.5;
          bush.push({ m: new THREE.Matrix4().makeTranslation(x + Math.cos(a) * (r + 0.8), BED_Y, z + Math.sin(a) * (r + 0.8)).multiply(turn.makeRotationY(rnd() * 6.283)).multiply(sc.makeScale(h, h, h)), tint: 0.9 + rnd() * 0.2 });
        }
        for (let k = 0; k < 3; k++) { const a = rnd() * 6.283; list.push({ x: x + Math.cos(a) * (r + 1.3), z: z + Math.sin(a) * (r + 1.3), y: BED_Y, kind: 'ot', s: 0.7 + rnd() * 0.6 }); }
        // about 2.5 flowering plants per square metre of bed, 1.6–2.4× the model's size
        const n = Math.round(Math.PI * r * r * 2.5);
        for (let k = 0; k < n; k++) {
          const a = rnd() * 6.283, q = Math.sqrt(rnd()) * r * 0.95, h = 1.6 + rnd() * 0.8;
          flowers.push({ m: new THREE.Matrix4().makeTranslation(x + Math.cos(a) * q, BED_Y + 0.01, z + Math.sin(a) * q).multiply(turn.makeRotationY(rnd() * 6.283)).multiply(sc.makeScale(h, h, h)) });
        }
      }
      const tufts = new GlbForest(list, 3);
      tufts.ready.then((ok) => { if (ok) this.group.add(tufts.group); });
      this.group.add(glbInstances('buta', bush).group);
      this.group.add(glbInstances('gul', flowers, { shadow: false }).group);
    }
    // ---- flower patches
    const fmat = [0, 1, 2, 3].map((s) => new THREE.MeshStandardMaterial({ map: flowerTex(s), alphaTest: 0.5, roughness: 1 }));
    for (const [x, z, r, s] of d.flowers) for (const [dy, k] of [[0.02, 1], [0.12, 0.8]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r * k, 20).rotateX(-Math.PI / 2).rotateY(rnd() * 6).translate(x, BED_Y + dy, z), fmat[s]);
      m.receiveShadow = true; m.raycast = () => {}; this.group.add(m);
    }
    // ---- manholes and drain grates
    const mm = [false, true].map((g) => new THREE.MeshStandardMaterial({ map: manholeTex(g), alphaTest: 0.5, roughness: 0.7, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    for (const [x, z, kind] of d.manhole) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(kind ? 0.5 : 0.7, kind ? 0.5 : 0.7).rotateX(-Math.PI / 2).rotateY(rnd() * 3).translate(x, PAVE_Y + 0.004, z), mm[kind]);
      m.receiveShadow = true; m.raycast = () => {}; this.group.add(m);
    }
  }
  dispose() { this.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); }
}
