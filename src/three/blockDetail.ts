// Real facade geometry for the blocks that have no detailed model (all but type 4). The block's box becomes the
// glazing plane (reflective glass with frames); in front of it stands a relief of piers and floor bands, so the
// windows are recessed and cast shadows. On top: balconies with railings, air conditioners, downpipes, roof
// plant (lift room, vents, parapet), shopfront piers with a sign fascia, and an entrance with canopy and steps.
// Everything of one block is merged by material into a handful of meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOORS, FLOOR_H, GROUND_H, type BlockDef } from '../data/blocks';

const TOWER_FLOORS = FLOORS - 1, TOP_Y = GROUND_H + TOWER_FLOORS * FLOOR_H;
export const BAY = 3.2, FB = 4;
const PROUD = 0.3;          // wall relief in front of the glass
const SILL = 0.9, HEAD = 2.4, PIER = 0.7;

export type Pal = { wall: string; window: string; band: string };

/** glazing of FB × FB bays: dark glass with a light frame, mullion and transom inside each window opening */
export function glassTexture(p: Pal) {
  const c = document.createElement('canvas'); c.width = 128 * FB; c.height = 96 * FB;
  const g = c.getContext('2d')!;
  g.fillStyle = p.window; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < FB; i++) for (let j = 0; j < FB; j++) {
    const x = i * 128, y = j * 96;
    const x0 = x + (PIER / 2 / BAY) * 128, x1 = x + 128 - (PIER / 2 / BAY) * 128, y0 = y + 96 * (1 - HEAD / FLOOR_H), y1 = y + 96 * (1 - SILL / FLOOR_H);
    // soft sky gradient in the glass, curtains in some windows
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if ((i * 7 + j * 3) % 5 < 2) { g.fillStyle = 'rgba(235,228,214,.32)'; g.fillRect(x0 + 3, y0 + 3, (x1 - x0) * ((i + j) % 2 ? 0.3 : 0.45), y1 - y0 - 6); }
    g.strokeStyle = '#eceae4'; g.lineWidth = 4; g.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    g.lineWidth = 3; g.beginPath(); g.moveTo(x + 64, y0); g.lineTo(x + 64, y1); g.moveTo(x0, y0 + 14); g.lineTo(x1, y0 + 14); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
/** the same windows lit at night: about 40 % of them, warm / cool, with frames, curtains and a darker ceiling */
export function litTexture(seed: number) {
  const c = document.createElement('canvas'); c.width = 128 * FB; c.height = 96 * FB;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  let sd = seed * 131 + 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const cols = ['#ffc478', '#ffd59a', '#ffe3b8', '#f2b765', '#cfdcff', '#ffcf8f'];
  for (let i = 0; i < FB; i++) for (let j = 0; j < FB; j++) {
    if (r() > 0.42) continue;
    const x = i * 128, y = j * 96;
    const x0 = x + (PIER / 2 / BAY) * 128, x1 = x + 128 - (PIER / 2 / BAY) * 128, y0 = y + 96 * (1 - HEAD / FLOOR_H), y1 = y + 96 * (1 - SILL / FLOOR_H);
    g.globalAlpha = 0.55 + r() * 0.45;
    g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(0,0,0,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (r() < 0.6) { g.fillStyle = 'rgba(0,0,0,.45)'; const cw = (x1 - x0) * (0.2 + r() * 0.3); g.fillRect(r() < 0.5 ? x0 : x1 - cw, y0, cw, y1 - y0); }   // curtain
    g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    g.lineWidth = 3; g.beginPath(); g.moveTo(x + 64, y0); g.lineTo(x + 64, y1); g.moveTo(x0, y0 + 14); g.lineTo(x1, y0 + 14); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** shopfront: full-height glass between slim frames, a door in every second bay (4 m bays) */
export function shopTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a7080'; g.fillRect(0, 0, 256, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(0.6, 'rgba(0,0,0,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.3)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#1c2228'; g.lineWidth = 5;
  for (const x of [0, 64, 128, 192, 256]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  g.beginPath(); g.moveTo(0, 30); g.lineTo(256, 30); g.stroke();
  g.fillStyle = '#b9b2a4'; g.fillRect(0, 118, 256, 10);                 // plinth
  g.fillStyle = '#c9a15a'; g.fillRect(150, 70, 4, 22); g.fillRect(166, 70, 4, 22);   // door handles
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

const SIGNS = ['#c0392b', '#1f6f8b', '#2e7d4f', '#d08a1e', '#6a4c93', '#e8e2d4'];

export type Detail = {
  group: THREE.Group;
  /** emissive at night: [material, intensity at full night] */
  night: [THREE.MeshStandardMaterial, number][];
  materials: THREE.Material[];
};

export function buildDetail(def: BlockDef, pal: Pal): Detail {
  const { w, d } = def, hw = w / 2, hd = d / 2;
  let sd = def.id * 9973 + 17; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const wallC = new THREE.Color(pal.wall);
  const M = {
    wall: new THREE.MeshStandardMaterial({ color: wallC, roughness: 0.92 }),
    band: new THREE.MeshStandardMaterial({ color: pal.band, roughness: 0.85 }),
    slab: new THREE.MeshStandardMaterial({ color: '#d7d3ca', roughness: 0.9 }),
    rail: new THREE.MeshStandardMaterial({ color: '#b4c6cf', roughness: 0.15, metalness: 0.35, envMapIntensity: 1.2 }),
    steel: new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.45, metalness: 0.6 }),
    ac: new THREE.MeshStandardMaterial({ color: '#e9e9e6', roughness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: '#6c7074', roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.8 }),
    glow: new THREE.MeshStandardMaterial({ color: '#fff1d6', roughness: 0.6, emissive: '#ffd9a0', emissiveIntensity: 0 }),
  };
  const signs = SIGNS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0 }));
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => { let a = parts.get(m); if (!a) parts.set(m, (a = [])); a.push(g); };

  // faces: side ±z (length w) and end ±x (length d). f(u, out) → local point: u along the face, out away from it
  const faces = [
    { len: w, half: hd, at: (u: number, o: number, s: number): [number, number] => [u, s * (hd + o)], axis: 'z' as const },
    { len: d, half: hw, at: (u: number, o: number, s: number): [number, number] => [s * (hw + o), u], axis: 'x' as const },
  ];
  /** box on a face: u0..u1 along it, o0..o1 outward, y0..y1 */
  const fbox = (f: (typeof faces)[number], s: number, u0: number, u1: number, y0: number, y1: number, o0: number, o1: number) => {
    const [ax, az] = f.at(u0, o0, s), [bx2, bz] = f.at(u1, o1, s);
    return bx(ax, y0, az, bx2, y1, bz);
  };
  // which long face looks at the courtyard (complex centre) — the entrance goes there
  const long = w >= d ? faces[0] : faces[1];
  const nrm = (s: number) => { const c = Math.cos(def.rot), sn = Math.sin(def.rot); const [lx, lz] = long.axis === 'z' ? [0, s] : [s, 0]; return [lx * c + lz * sn, -lx * sn + lz * c]; };
  const [n1x, n1z] = nrm(1);
  const entS = n1x * -def.x + n1z * -def.z > 0 ? 1 : -1;

  for (const f of faces) {
    const nb = Math.max(1, Math.round(f.len / BAY)), bw = f.len / nb, h = f.len / 2;
    for (const s of [-1, 1]) {
      // piers at the bay lines, floor bands between head and sill, thin slab edges in the accent colour
      for (let i = 0; i <= nb; i++) {
        const u = -h + i * bw, edge = i === 0 || i === nb;
        put(M.wall, fbox(f, s, edge ? u - (i === 0 ? PROUD : PIER / 2) : u - PIER / 2, edge ? u + (i === 0 ? PIER / 2 : PROUD) : u + PIER / 2, GROUND_H, TOP_Y, 0, PROUD));
      }
      for (let j = 0; j <= TOWER_FLOORS; j++) {
        const yb = GROUND_H + j * FLOOR_H;
        put(M.wall, fbox(f, s, -h, h, j === 0 ? GROUND_H : yb - (FLOOR_H - HEAD), j === TOWER_FLOORS ? TOP_Y : yb + SILL, 0, PROUD - 0.04));
        if (j > 0 && j < TOWER_FLOORS) put(M.band, fbox(f, s, -h - PROUD, h + PROUD, yb - 0.2, yb, 0, PROUD + 0.06));
      }
      // balconies on the long faces (every third bay), air conditioners under some of the other windows
      const balc = (i: number) => f === long && nb >= 3 && i % 3 === 1;
      for (let i = 0; i < nb; i++) {
        const uc = -h + (i + 0.5) * bw;
        for (let j = 0; j < TOWER_FLOORS; j++) {
          const yb = GROUND_H + j * FLOOR_H;
          if (balc(i)) {
            const a = uc - bw / 2 + 0.12, b = uc + bw / 2 - 0.12, D = 1.25;
            put(M.slab, fbox(f, s, a, b, yb - 0.16, yb, PROUD, D));
            put(M.rail, fbox(f, s, a, b, yb + 0.08, yb + 1.0, D - 0.05, D));                    // glass front
            put(M.rail, fbox(f, s, a, a + 0.05, yb + 0.08, yb + 1.0, PROUD, D)); put(M.rail, fbox(f, s, b - 0.05, b, yb + 0.08, yb + 1.0, PROUD, D));
            put(M.steel, fbox(f, s, a - 0.02, b + 0.02, yb + 1.0, yb + 1.06, D - 0.07, D + 0.02)); // handrail
            put(M.steel, fbox(f, s, a - 0.02, a + 0.05, yb + 1.0, yb + 1.06, PROUD, D)); put(M.steel, fbox(f, s, b - 0.05, b + 0.02, yb + 1.0, yb + 1.06, PROUD, D));
          } else if (rnd() < 0.3) {
            const x = uc + (rnd() - 0.5) * (bw - PIER - 1.1);
            put(M.ac, fbox(f, s, x - 0.42, x + 0.42, yb + 0.16, yb + 0.74, PROUD, PROUD + 0.32));
            put(M.steel, fbox(f, s, x - 0.3, x + 0.3, yb + 0.22, yb + 0.68, PROUD + 0.32, PROUD + 0.335));   // grille
          }
        }
      }
      // ground floor: stone piers every bay, sign fascia with shop signs, lamp line under it
      const ns = Math.max(1, Math.round(f.len / 4)), sw = f.len / ns, P0 = 0.3;   // podium is 0.3 wider than the tower
      for (let i = 0; i <= ns; i++) { const u = -h + i * sw; put(M.stone, fbox(f, s, u - 0.28, u + 0.28, 0, 3.35, P0, P0 + 0.22)); }
      put(M.stone, fbox(f, s, -h - P0 - 0.3, h + P0 + 0.3, 3.35, GROUND_H + 0.12, P0, P0 + 0.5));
      put(M.glow, fbox(f, s, -h, h, 3.3, 3.35, P0 + 0.3, P0 + 0.44));
      for (let i = 0; i < ns; i++) {
        if (rnd() < 0.25) continue;
        const uc = -h + (i + 0.5) * sw, sl = Math.min(sw - 0.9, 2.2 + rnd() * 1.2);
        put(signs[Math.floor(rnd() * signs.length)], fbox(f, s, uc - sl / 2, uc + sl / 2, 3.5, 4.05, P0 + 0.5, P0 + 0.58));
      }
      // warm light line under the roof edge
      put(M.glow, fbox(f, s, -h, h, TOP_Y - 0.12, TOP_Y - 0.04, PROUD, PROUD + 0.1));
    }
  }
  // downpipes at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(M.steel, bx(sx * (hw + PROUD + 0.02), GROUND_H, sz * (hd + PROUD + 0.02), sx * (hw + PROUD + 0.16), TOP_Y, sz * (hd + PROUD + 0.16)));

  // roof: parapet ring, membrane, lift machine room, vent shafts, a couple of antennas
  const RY = TOP_Y + 0.8;
  for (const sz of [-1, 1]) put(M.wall, bx(-hw - 0.4, RY, sz * (hd + 0.4), hw + 0.4, RY + 0.7, sz * (hd + 0.15)));
  for (const sx of [-1, 1]) put(M.wall, bx(sx * (hw + 0.4), RY, -hd - 0.4, sx * (hw + 0.15), RY + 0.7, hd + 0.4));
  put(M.roof, bx(-hw - 0.15, RY, -hd - 0.15, hw + 0.15, RY + 0.06, hd + 0.15));
  const lx = (rnd() - 0.5) * (w - 9), lz = (rnd() - 0.5) * (d - 7);
  put(M.wall, bx(lx - 3, RY, lz - 2.2, lx + 3, RY + 2.9, lz + 2.2));
  put(M.roof, bx(lx - 3.2, RY + 2.9, lz - 2.4, lx + 3.2, RY + 3.05, lz + 2.4));
  put(M.steel, bx(lx + 3, RY, lz - 0.5, lx + 3.06, RY + 2.1, lz + 0.5));
  for (let i = 0; i < 5; i++) {
    const x = (rnd() - 0.5) * (w - 3), z = (rnd() - 0.5) * (d - 3);
    if (Math.abs(x - lx) < 4.2 && Math.abs(z - lz) < 3.4) continue;
    put(M.ac, bx(x - 0.6, RY, z - 0.6, x + 0.6, RY + 1.0, z + 0.6));
    put(M.steel, bx(x - 0.7, RY + 1.0, z - 0.7, x + 0.7, RY + 1.08, z + 0.7));
  }
  put(M.steel, new THREE.CylinderGeometry(0.04, 0.04, 4, 6).translate(lx - 2, RY + 2.9 + 2, lz + 1.4));
  put(M.steel, new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6).translate(lx + 1.6, RY + 2.9 + 1.3, lz - 1.2));

  // entrance on the courtyard side: portal in the accent colour, canopy on two posts, steps, lamp under the canopy
  {
    const f = long, s = entS, P0 = 0.3, u = (rnd() - 0.5) * Math.max(0, f.len - 12);
    put(M.band, fbox(f, s, u - 2.3, u - 1.9, 0, 3.7, P0, P0 + 0.45)); put(M.band, fbox(f, s, u + 1.9, u + 2.3, 0, 3.7, P0, P0 + 0.45));
    put(M.band, fbox(f, s, u - 2.3, u + 2.3, 3.3, 3.75, P0, P0 + 0.45));
    put(M.steel, fbox(f, s, u - 1.1, u + 1.1, 0.3, 2.9, P0 + 0.02, P0 + 0.1));                       // door
    put(M.rail, fbox(f, s, u - 1.0, u - 0.05, 0.4, 2.8, P0 + 0.1, P0 + 0.12)); put(M.rail, fbox(f, s, u + 0.05, u + 1.0, 0.4, 2.8, P0 + 0.1, P0 + 0.12));
    put(M.slab, fbox(f, s, u - 2.8, u + 2.8, 2.95, 3.13, P0, P0 + 2.6));                               // canopy
    put(M.steel, fbox(f, s, u - 2.6, u - 2.48, 0.3, 2.95, P0 + 2.3, P0 + 2.42)); put(M.steel, fbox(f, s, u + 2.48, u + 2.6, 0.3, 2.95, P0 + 2.3, P0 + 2.42));
    put(M.glow, fbox(f, s, u - 1.6, u + 1.6, 2.9, 2.95, P0 + 0.6, P0 + 0.8));
    put(M.stone, fbox(f, s, u - 2.8, u + 2.8, 0, 0.3, P0, P0 + 2.6));                                  // landing
    put(M.stone, fbox(f, s, u - 3.1, u + 3.1, 0, 0.15, P0 + 2.6, P0 + 2.95));                          // step
  }

  const group = new THREE.Group();
  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
    mesh.castShadow = m !== M.glow; mesh.receiveShadow = true;
    mesh.raycast = () => {};
    group.add(mesh);
    list.forEach((g) => g.dispose());
  }
  return { group, night: [[M.glow, 2.2], ...signs.map((m) => [m, 0.9] as [THREE.MeshStandardMaterial, number])], materials: [...parts.keys()] };
}
