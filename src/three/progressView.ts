// Live construction view of the complex: every block drawn as built on the chosen date — pit and piles, the
// monolithic frame floor by floor, aerated-block walls, facade from the top down — with a working tower crane
// and a progress badge. Blocks whose exterior is finished keep their normal model (ComplexScene shows it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCKS, FLOORS, FLOOR_H, GROUND_H, type BlockDef } from '../data/blocks';
import { PHASES, progressAt, type Progress } from '../data/progress';

const TOP_Y = GROUND_H + (FLOORS - 1) * FLOOR_H;
const fy0 = (f: number) => (f === 1 ? 0 : GROUND_H + (f - 2) * FLOOR_H);
const fy1 = (f: number) => (f === 1 ? GROUND_H : fy0(f) + FLOOR_H);

/** box with UVs in metres (u along the face, v up) so tiling textures keep their real size */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const u = ny > 0.5 ? p.getX(i) : nx > 0.5 ? p.getZ(i) : p.getX(i);
    const v = ny > 0.5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u, v);
  }
  return g;
}

function latticeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#e8b923'; g.lineWidth = 6;
  g.strokeRect(3, 3, 58, 58);
  g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function aeratedTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4dfd2'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2;
  for (let r = 0; r < 2; r++) { g.beginPath(); g.moveTo(0, r * 32); g.lineTo(128, r * 32); g.stroke(); for (let x = r ? 32 : 0; x < 128; x += 64) { g.beginPath(); g.moveTo(x, r * 32); g.lineTo(x, r * 32 + 32); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / 1.2, 1 / 0.4);   // 600 × 200 blocks
  return t;
}
/** finished facade: plaster with dark window openings, one bay 3.2 m × one floor */
function facadeTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2efe8'; g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#4f6a80'; g.fillRect(24, 22, 80, 56);
  g.fillStyle = '#c9b48a'; g.fillRect(0, 0, 128, 7);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / 3.2, 1 / FLOOR_H); t.offset.y = -GROUND_H / FLOOR_H;
  return t;
}

type Crane = { pivot: THREE.Group; phase: number; speed: number };

export class ProgressView {
  readonly group = new THREE.Group();
  readonly labels = new THREE.Group();          // goes into the overlay scene
  private body = new THREE.Group();
  private cranes: Crane[] = [];
  private t = 0;
  private mats = {
    conc: new THREE.MeshStandardMaterial({ color: '#b9b7b1', roughness: 0.9 }),
    form: new THREE.MeshStandardMaterial({ color: '#c58b3c', roughness: 0.8 }),
    wall: new THREE.MeshStandardMaterial({ map: aeratedTex(), roughness: 0.95 }),
    facade: new THREE.MeshStandardMaterial({ map: facadeTex(), roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: '#5a5d61', roughness: 0.9 }),
    pit: new THREE.MeshStandardMaterial({ color: '#7a5d43', roughness: 1 }),
    ghost: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ color: '#e3b878', transparent: true, opacity: 0.7 }),
    crane: new THREE.MeshStandardMaterial({ map: latticeTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
    cab: new THREE.MeshStandardMaterial({ color: '#e8b923', roughness: 0.5 }),
    weight: new THREE.MeshStandardMaterial({ color: '#8d8f91', roughness: 0.9 }),
    cable: new THREE.LineBasicMaterial({ color: '#333333' }),
  };
  private badgeCache = new Map<string, THREE.CanvasTexture>();
  readonly state = new Map<number, Progress>();

  constructor() { this.group.add(this.body); }

  /** exterior finished → the normal block model stays */
  static finished(p: Progress) { return p.facade >= FLOORS - 1e-3 && p.windows >= FLOORS - 1e-3; }

  update(mi: number, lang: 'uz' | 'ru' = 'uz') {
    this.body.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    this.body.clear(); this.labels.children.forEach((o) => (o as THREE.Sprite).material.dispose()); this.labels.clear(); this.cranes = [];
    const byMat = new Map<keyof ProgressView['mats'], THREE.BufferGeometry[]>();
    const put = (m: keyof ProgressView['mats'], g: THREE.BufferGeometry, M: THREE.Matrix4) => { g.applyMatrix4(M); let a = byMat.get(m); if (!a) byMat.set(m, (a = [])); a.push(g); };
    const edges: number[] = [];
    for (const def of BLOCKS) {
      const p = progressAt(def.id, mi);
      this.state.set(def.id, p);
      this.badge(def, p, lang);
      if (ProgressView.finished(p)) continue;
      const M = new THREE.Matrix4().makeTranslation(def.x, 0, def.z).multiply(new THREE.Matrix4().makeRotationY(def.rot));
      this.block(def, p, M, put, edges);
    }
    for (const [m, list] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), this.mats[m]);
      mesh.castShadow = m !== 'ghost'; mesh.receiveShadow = m !== 'ghost';
      this.body.add(mesh);
      list.forEach((g) => g.dispose());
    }
    const e = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edges, 3)), this.mats.edge);
    this.body.add(e);
  }

  private block(def: BlockDef, p: Progress, M: THREE.Matrix4, put: (m: keyof ProgressView['mats'], g: THREE.BufferGeometry, M: THREE.Matrix4) => void, edges: number[]) {
    const w = def.w / 2, d = def.d / 2;
    // the volume still to be built: a faint glass box with golden edges
    const builtTop = p.frame >= 1 ? fy1(Math.floor(p.frame)) : 0;
    if (builtTop < TOP_Y + 0.8) {
      put('ghost', box(-w, builtTop, -d, w, TOP_Y + 0.8, d), M);
      const eg = new THREE.EdgesGeometry(box(-w, builtTop, -d, w, TOP_Y + 0.8, d)).applyMatrix4(M);
      edges.push(...(eg.getAttribute('position').array as Float32Array)); eg.dispose();
    }
    // pit, piles and raft
    if (p.stage < 2.2) put('pit', box(-w - 3, -0.03, -d - 3, w + 3, 0.03, d + 3), M);
    if (p.stage > 0 && p.stage < 2) {
      const n = Math.floor(Math.min(1, p.stage) * 40);
      for (let i = 0; i < n; i++) {
        const x = -w + 1 + ((i % 8) / 7) * (def.w - 2), z = -d + 1 + (Math.floor(i / 8) / 4) * (def.d - 2);
        put('conc', new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8).translate(x, 0.3, z), M);
      }
    }
    if (p.stage >= 1) {
      const k = Math.min(1, p.stage - 1);
      put('conc', box(-w - 1, 0, -d - 1, -w - 1 + (def.w + 2) * k, 0.35, d + 1), M);
    }
    // frame: slabs and columns floor by floor, the floor in progress with formwork
    const nx = Math.max(2, Math.round(def.w / 6) + 1), nz = Math.max(2, Math.round(def.d / 6) + 1);
    const full = Math.floor(p.frame + 1e-6);
    for (let f = 1; f <= Math.min(FLOORS, full + 1); f++) {
      const part = f <= full ? 1 : p.frame - full; if (part <= 0.02) break;
      const y0 = fy0(f), y1 = fy1(f), h = (y1 - y0 - 0.25) * part;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = -w + 0.35 + (i / (nx - 1)) * (def.w - 0.7), z = -d + 0.35 + (j / (nz - 1)) * (def.d - 0.7);
        put('conc', box(x - 0.25, y0, z - 0.25, x + 0.25, y0 + h, z + 0.25), M);
      }
      // core walls (lifts and stair) in the middle
      put('conc', box(-2.6, y0, -1.6, 2.6, y0 + h, 1.6), M);
      if (f <= full) put('conc', box(-w, y1 - 0.25, -d, w, y1, d), M);
      else put('form', box(-w, y0 + h, -d, w, y0 + h + 0.12, d), M);     // formwork table of the next slab
    }
    // walls (bottom up) and facade (top down, once the frame is complete)
    for (let f = 1; f <= FLOORS; f++) {
      const y0 = fy0(f), y1 = fy1(f) - 0.25;
      const facade = f > FLOORS - p.facade;
      if (facade && f <= full) put('facade', box(-w - 0.08, y0, -d - 0.08, w + 0.08, y1 + 0.25, d + 0.08), M);
      else if (f <= p.walls && f <= full) put('wall', box(-w + 0.05, y0, -d + 0.05, w - 0.05, y1, d - 0.05), M);
    }
    if (p.roof && full >= FLOORS) put('roof', box(-w - 0.4, TOP_Y, -d - 0.4, w + 0.4, TOP_Y + 0.8, d + 0.4), M);
    // tower crane while the frame and walls go up
    if (p.stage > 0.6 && p.stage < 6.5) this.crane(def, p, M);
  }

  private crane(def: BlockDef, p: Progress, M: THREE.Matrix4) {
    const builtTop = p.frame >= 1 ? fy1(Math.floor(p.frame)) : 0;
    const H = Math.max(24, builtTop + 14);
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix.copy(M).multiply(new THREE.Matrix4().makeTranslation(0, 0, -(def.d / 2 + 4)));
    const lat = (sx: number, sy: number, sz: number) => {
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(sx, sz) / 1.6, uv.getY(i) * sy / 1.6);
      const m = new THREE.Mesh(geo, this.mats.crane); m.castShadow = true; return m;
    };
    // mast: lattice in the horizontal direction too
    const mast = new THREE.Mesh(box(-0.8, 0, -0.8, 0.8, H, 0.8), this.mats.crane);
    {
      const uv = mast.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 1.6);
    }
    mast.castShadow = true;
    g.add(mast);
    const base = new THREE.Mesh(box(-2.5, 0, -2.5, 2.5, 1, 2.5), this.mats.weight); g.add(base);
    const pivot = new THREE.Group(); pivot.position.y = H; g.add(pivot);
    const jib = lat(44, 1.4, 1.4); jib.position.set(22 - 2, 1.2, 0); pivot.add(jib);
    const cj = lat(14, 1.2, 1.4); cj.position.set(-7 - 1, 1.2, 0); pivot.add(cj);
    const w8 = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2), this.mats.weight); w8.position.set(-12, 0.2, 0); pivot.add(w8);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), this.mats.cab); cab.position.set(1.6, -0.2, 1.6); pivot.add(cab);
    const top = lat(1.4, 6, 1.4); top.position.set(0, 4, 0); pivot.add(top);
    const trolleyX = 14 + ((def.id * 7) % 20);
    const hookY = Math.max(2, builtTop + 3) - H;
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(trolleyX, 0.6, 0), new THREE.Vector3(trolleyX, hookY, 0)]), this.mats.cable);
    pivot.add(cable);
    const load = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.2), this.mats.form); load.position.set(trolleyX, hookY - 0.4, 0); pivot.add(load);
    this.body.add(g);
    this.cranes.push({ pivot, phase: def.id * 1.7, speed: 0.12 + (def.id % 5) * 0.03 });
  }

  /** badge above the block: progress ring in the phase colour, percent and block number */
  private badge(def: BlockDef, p: Progress, lang: 'uz' | 'ru') {
    const key = `${def.id}-${p.pct}-${p.phase}-${lang}`;
    let tex = this.badgeCache.get(key);
    if (!tex) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 300;
      const g = c.getContext('2d')!;
      const col = PHASES[p.phase].color;
      g.fillStyle = 'rgba(14,51,38,.92)'; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
      g.lineWidth = 18; g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = col; g.lineCap = 'round'; g.beginPath(); g.arc(128, 128, 96, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.01, p.pct / 100)); g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 64px Montserrat, system-ui, sans-serif'; g.fillText(p.pct + '%', 128, 118);
      g.font = '600 32px Montserrat, system-ui, sans-serif'; g.fillStyle = '#e3b878'; g.fillText(lang === 'ru' ? `блок ${def.id}` : `${def.id}-blok`, 128, 172);
      g.fillStyle = col; g.beginPath(); g.roundRect(18, 252, 220, 44, 22); g.fill();
      g.fillStyle = '#10261e'; g.font = '700 24px Montserrat, system-ui, sans-serif';
      const name = PHASES[p.phase].name[lang === 'ru' ? 1 : 0];
      g.fillText(name.length > 17 ? name.slice(0, 16) + '…' : name, 128, 275);
      tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      this.badgeCache.set(key, tex);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false, sizeAttenuation: false }));
    s.scale.set(0.062, 0.062 * 300 / 256, 1); s.renderOrder = 10;   // constant size on screen
    s.center.set(0.5, 0);
    s.position.set(def.x, TOP_Y + 6, def.z);
    this.labels.add(s);
  }

  tick(dt: number) {
    this.t += dt;
    for (const c of this.cranes) c.pivot.rotation.y = c.phase + Math.sin(this.t * c.speed + c.phase) * 1.4;
  }

  dispose() {
    this.body.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.badgeCache.forEach((t) => t.dispose());
  }
}
