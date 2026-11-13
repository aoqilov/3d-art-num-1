// Interior furniture placed exactly where the architect's plan symbols are (furn_t4.json),
// modelled procedurally in the palette of the PDF's interior renders. One merged mesh per material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import raw from './data/furn_t4.json';
import { SLAB, type FloorPlan } from './plan';
import { prep } from './materials';

type Side = 'n' | 's' | 'w' | 'e';
type Item = { t: string; x0: number; y0: number; x1: number; y1: number; back: Side; room?: string | null };
const FURN = raw as unknown as Record<'2' | '3', Item[]>;

export type FMat = 'linen' | 'duvet' | 'head' | 'woodL' | 'woodD' | 'leather' | 'fabric' | 'cabinet' | 'cabinetD' | 'stone'
  | 'black' | 'steel' | 'porcelain' | 'mirror' | 'lamp' | 'rug' | 'water';

let mats: Record<FMat, THREE.Material> | null = null;
/** Shared furniture materials (the PRO build adds texture sets to them). */
export function furnitureMaterials() { return fmats(); }
function fmats() {
  if (mats) return mats;
  const S = (color: string, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    prep(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
  mats = {
    linen: S('#f3f0ea', 0.95), duvet: S('#d7cfc2', 0.95), head: S('#8a7d70', 0.9),
    woodL: S('#c49a6c', 0.6), woodD: S('#4e3626', 0.5), leather: S('#7a4f36', 0.55),
    fabric: S('#8f8e8a', 0.95), cabinet: S('#eeebe5', 0.5), cabinetD: S('#5f6266', 0.45),
    stone: S('#d9d6d0', 0.3), black: S('#18191b', 0.25, 0.2), steel: S('#c4c7ca', 0.25, 0.85),
    porcelain: S('#fbfbf9', 0.15), mirror: S('#cfd8de', 0.02, 1), lamp: S('#f6e7c8', 0.6, 0, { emissive: '#f3d6a0', emissiveIntensity: 0.6 }),
    rug: S('#b9b1a6', 1), water: S('#dfe9ee', 0.1),
  };
  return mats;
}

class Acc {
  parts = new Map<FMat, THREE.BufferGeometry[]>();
  add(m: FMat, g: THREE.BufferGeometry, mat4: THREE.Matrix4) {
    const gg = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(mat4);
    if (!gg.getAttribute('uv')) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.getAttribute('position').count * 2), 2));
    let a = this.parts.get(m);
    if (!a) this.parts.set(m, (a = []));
    a.push(gg);
  }
}

// Local frame: u along the back wall (0..W), v away from the wall (0..D), h up from finished floor.
function frame(it: Item) {
  const W = it.back === 'n' || it.back === 's' ? it.x1 - it.x0 : it.y1 - it.y0;
  const D = it.back === 'n' || it.back === 's' ? it.y1 - it.y0 : it.x1 - it.x0;
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  if (it.back === 'n') m.makeTranslation(it.x0, SLAB, it.y0);
  if (it.back === 's') { m.makeTranslation(it.x1, SLAB, it.y1); rot.makeRotationY(Math.PI); }
  if (it.back === 'w') { m.makeTranslation(it.x0, SLAB, it.y1); rot.makeRotationY(Math.PI / 2); }
  if (it.back === 'e') { m.makeTranslation(it.x1, SLAB, it.y0); rot.makeRotationY(-Math.PI / 2); }
  m.multiply(rot);
  return { W, D, m };
}

const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
const rbox = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)).translate(w / 2, h / 2, d / 2);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);

function builder(acc: Acc, base: THREE.Matrix4) {
  const box = (m: FMat, u: number, h: number, v: number, w: number, hh: number, d: number) =>
    acc.add(m, BOX, base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(u, h, v), new THREE.Quaternion(), new THREE.Vector3(w, hh, d))));
  const rb = (m: FMat, u: number, h: number, v: number, w: number, hh: number, d: number, r = 0.04) =>
    acc.add(m, rbox(w, hh, d, r), base.clone().multiply(new THREE.Matrix4().makeTranslation(u, h, v)));
  const cyl = (m: FMat, u: number, h: number, v: number, r: number, hh: number) =>
    acc.add(m, CYL, base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(u, h, v), new THREE.Quaternion(), new THREE.Vector3(r * 2, hh, r * 2))));
  return { box, rb, cyl };
}

function legs(b: ReturnType<typeof builder>, m: FMat, W: number, D: number, h: number, t = 0.045, inset = 0.04) {
  for (const [u, v] of [[inset, inset], [W - inset - t, inset], [inset, D - inset - t], [W - inset - t, D - inset - t]]) b.box(m, u, 0, v, t, h, t);
}

function makeItem(acc: Acc, it: Item, all: Item[]) {
  const { W, D, m } = frame(it);
  const b = builder(acc, m);
  switch (it.t) {
    case 'bed': {
      b.rb('head', 0.02, 0, 0, W - 0.04, 1.05, 0.1, 0.03);
      b.box('woodD', 0.03, 0, 0.1, W - 0.06, 0.3, D - 0.12);
      b.rb('linen', 0.05, 0.3, 0.12, W - 0.1, 0.24, D - 0.18, 0.06);
      b.rb('duvet', 0.02, 0.48, D * 0.36, W - 0.04, 0.08, D * 0.62, 0.04);
      for (const u of [0.1, W / 2 + 0.03]) b.rb('linen', u, 0.54, 0.16, W / 2 - 0.13, 0.13, 0.42, 0.06);
      b.box('rug', -0.35, 0, D * 0.45, W + 0.7, 0.012, D * 0.75);
      break;
    }
    case 'nightstand': {
      b.box('woodL', 0, 0, 0.02, W, 0.48, D - 0.02);
      b.box('woodD', 0.02, 0.24, D - 0.005, W - 0.04, 0.01, 0.006);
      b.cyl('steel', W / 2, 0.48, D / 2, 0.06, 0.28);
      b.cyl('lamp', W / 2, 0.72, D / 2, 0.13, 0.2);
      break;
    }
    case 'wardrobe': {
      b.box('cabinet', 0, 0, 0, W, 2.32, D);
      const n = Math.max(2, Math.round(W / 0.5));
      for (let i = 1; i < n; i++) b.box('cabinetD', (W * i) / n - 0.004, 0.02, D, 0.008, 2.28, 0.006);
      for (let i = 0; i < n; i++) b.box('steel', (W * (i + 0.5)) / n - 0.01, 0.95, D + 0.005, 0.02, 0.3, 0.02);
      break;
    }
    case 'tv': {
      const w = Math.min(1.25, W);
      const u0 = (W - w) / 2;
      b.box('black', u0, 1.05, 0.03, w, 0.7, 0.045);
      if (it.room === 'living' || it.room === 'hall') {
        b.box('woodD', Math.max(0, u0 - 0.2), 0.12, 0.01, Math.min(W, w + 0.4), 0.38, 0.4);
        b.box('woodL', Math.max(0, u0 - 0.2), 0.5, 0.01, Math.min(W, w + 0.4), 0.025, 0.4);
      }
      break;
    }
    case 'table': {
      b.box('woodD', 0, 0.72, 0, W, 0.045, D);
      legs(b, 'black', W, D, 0.72, 0.05, 0.08);
      b.cyl('lamp', W / 2, 0.765, D / 2, 0.06, 0.12);
      break;
    }
    case 'chair': {
      b.rb('leather', 0.02, 0.43, 0.02, W - 0.04, 0.07, D - 0.04, 0.025);
      b.rb('leather', 0.03, 0.5, 0.0, W - 0.06, 0.42, 0.06, 0.025);
      legs(b, 'black', W, D, 0.43, 0.03, 0.05);
      break;
    }
    case 'sofa': {
      b.rb('fabric', 0, 0, 0, W, 0.42, D, 0.05);
      b.rb('fabric', 0, 0.42, 0, W, 0.42, 0.2, 0.06);
      b.rb('fabric', 0, 0.42, 0, 0.18, 0.22, D, 0.05);
      b.rb('fabric', W - 0.18, 0.42, 0, 0.18, 0.22, D, 0.05);
      for (let i = 0; i < 2; i++) b.rb('duvet', 0.2 + (i * (W - 0.4)) / 2, 0.42, 0.2, (W - 0.44) / 2, 0.1, D - 0.24, 0.05);
      break;
    }
    case 'armchair': {
      b.rb('fabric', 0, 0, 0, W, 0.4, D, 0.05);
      b.rb('fabric', 0, 0.4, 0, W, 0.4, 0.16, 0.05);
      b.rb('fabric', 0, 0.4, 0, 0.12, 0.2, D, 0.04); b.rb('fabric', W - 0.12, 0.4, 0, 0.12, 0.2, D, 0.04);
      break;
    }
    case 'coffee': { b.box('stone', 0, 0.36, 0, W, 0.04, D); legs(b, 'black', W, D, 0.36, 0.03, 0.04); break; }
    case 'pouf': { b.cyl('woodL', W / 2, 0, D / 2, Math.min(W, D) / 2 - 0.02, 0.5); break; }
    case 'counter': {
      b.box('cabinet', 0, 0.1, 0, W, 0.76, D - 0.02);
      b.box('cabinetD', 0.02, 0, 0.06, W - 0.04, 0.1, D - 0.1);
      b.box('stone', 0, 0.86, 0, W, 0.04, D);
      b.box('stone', 0, 0.9, 0, W, 0.56, 0.015);                      // backsplash
      b.box('cabinet', 0, 1.46, 0, W, 0.72, 0.34);                    // wall cabinets
      const doors = Math.max(1, Math.round(W / 0.6));
      for (let i = 1; i < doors; i++) {
        b.box('cabinetD', (W * i) / doors - 0.003, 0.14, D - 0.02, 0.006, 0.68, 0.006);
        b.box('cabinetD', (W * i) / doors - 0.003, 1.48, 0.34, 0.006, 0.68, 0.006);
      }
      // hob / sink / washer from plan symbols lying inside this run
      const inside = (t: string) => all.filter((o) => o.t === t && (o.x0 + o.x1) / 2 >= it.x0 - 0.05 && (o.x0 + o.x1) / 2 <= it.x1 + 0.05 && (o.y0 + o.y1) / 2 >= it.y0 - 0.05 && (o.y0 + o.y1) / 2 <= it.y1 + 0.05);
      const toU = (o: Item) => {
        const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
        return it.back === 'n' ? cx - it.x0 : it.back === 's' ? it.x1 - cx : it.back === 'w' ? it.y1 - cy : cy - it.y0;
      };
      const burners = inside('burner');
      let hobU: number | null = null;
      if (burners.length) {
        hobU = burners.map(toU).reduce((a, c) => a + c, 0) / burners.length;
        const u0 = Math.min(Math.max(hobU - 0.3, 0), W - 0.6);
        b.box('black', u0, 0.9, 0.06, 0.6, 0.008, 0.5);
        for (const [du, dv] of [[0.15, 0.15], [0.45, 0.15], [0.15, 0.37], [0.45, 0.37]]) b.cyl('cabinetD', u0 + du, 0.905, 0.06 + dv, 0.07, 0.006);
        b.box('steel', u0 + 0.02, 1.62, 0.0, 0.56, 0.3, 0.4);        // hood
      }
      const washers = inside('washer');
      for (const w of washers) {
        const u = Math.min(Math.max(toU(w) - 0.3, 0), W - 0.6);
        b.box('porcelain', u, 0.02, 0.02, 0.6, 0.84, D - 0.03);
        b.cyl('steel', u + 0.3, 0.42, D - 0.005, 0.17, 0.02);
      }
      if (W > 1.2 && !(washers.length && burners.length && W < 1.8)) {
        const su = hobU === null ? W / 2 : hobU > W / 2 ? Math.max(0.3, hobU - 1.05) : Math.min(W - 0.3, hobU + 1.05);
        b.box('steel', su - 0.25, 0.9, 0.08, 0.5, 0.01, 0.42);
        b.cyl('steel', su, 0.9, 0.06, 0.015, 0.3);
      }
      break;
    }
    case 'tub': {
      b.rb('porcelain', 0, 0, 0, W, 0.55, D, 0.05);
      b.rb('water', 0.07, 0.4, 0.07, W - 0.14, 0.16, D - 0.14, 0.05);
      b.cyl('steel', W - 0.12, 0.55, 0.04, 0.02, 0.18);
      break;
    }
    case 'toilet': {
      b.rb('porcelain', 0.03, 0.4, 0.0, W - 0.06, 0.38, 0.16, 0.03);
      b.rb('porcelain', 0.06, 0, 0.12, W - 0.12, 0.42, D - 0.14, 0.12);
      break;
    }
    case 'basin': {
      b.box('woodL', 0, 0.35, 0, W, 0.45, D);
      b.rb('porcelain', 0.02, 0.8, 0.02, W - 0.04, 0.08, D - 0.02, 0.03);
      b.box('mirror', 0.05, 1.1, 0.0, W - 0.1, 0.75, 0.02);
      b.cyl('steel', W / 2, 0.88, 0.05, 0.015, 0.2);
      break;
    }
    default: break;
  }
}

export function buildFurniture(_plan: FloorPlan, storey: number): THREE.Object3D | null {
  if (storey < 2) return null;
  const items = FURN[storey === 2 ? '2' : '3'];
  const acc = new Acc();
  for (const it of items) makeItem(acc, it, items);
  const M = fmats();
  const g = new THREE.Group();
  for (const [m, parts] of acc.parts) {
    const geo = mergeGeometries(parts, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, M[m]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
