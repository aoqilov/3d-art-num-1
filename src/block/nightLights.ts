// Evening lighting of the type-4 block, kept discreet like a real residential facade:
//  • small bronze up/down wall lights on the solid piers between the window columns, each throwing a warm
//    scallop of light up and down the wall; dense on the lower storeys, thinning out and dimming going up;
//  • a soft warm wash from the ground (canopy downlights, ground floods) that fades with height;
//  • lit windows, the parapet LED crown, accent lines on the arch frame, the canopy downlight strip.
// Everything follows the night factor 0..1.
import * as THREE from 'three';
import { diffuseColor, exp, float, materialEmissive, positionWorld, select, uniform, vec3 } from 'three/tsl';
import { nodes } from '../three/gpu';
import { TREE_NIGHT } from '../three/glbTrees';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CUT, prep, type MatName } from './materials';
import { BLOCK_W, FLOOR_H, FLOORS, SLAB, pointInPoly, planFor, type Rect } from './plan';
import { ROOF_Z } from './facade';

/** Night factor of the facade wash (shared by every facade material). */
export const FACADE_NIGHT = uniform(0);
/** Facade materials and how strongly the ground wash catches them (ornament a little more). */
const GLOW: Partial<Record<MatName, number>> = {
  facade: 1, facade_mint: 1, facade_white: 1, brick: 1, spandrel: 0.6, slab_edge: 0.8, sill: 1, frame_light: 1,
  lattice_white: 1, pilaster: 1.5, pilaster_tile: 1.5, lattice_gold: 2.2,
};
/** Adds the night facade wash to the facade materials (an emissive term, no extra lights): ground floods and
 *  canopy downlights, strongest on the shop fronts and fading out by mid-height. */
export function facadeGlow(lib: Record<MatName, THREE.Material>) {
  const ny = positionWorld.y;
  const g = select(ny.lessThan(FLOOR_H), float(0.3), float(0.035).add(exp(ny.sub(FLOOR_H).div(-14)).mul(0.17)));
  for (const [name, extra] of Object.entries(GLOW) as [MatName, number][]) {
    const m = lib[name] as THREE.MeshStandardMaterial;
    if (!m || m.userData.glow) continue;
    m.userData.glow = true;
    nodes(m).emissiveNode = materialEmissive.add(diffuseColor.rgb.mul(vec3(1.0, 0.78, 0.56)).mul(g).mul(FACADE_NIGHT.mul(extra)));
    m.needsUpdate = true;
  }
}

function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildNightLights() {
  const group = new THREE.Group();
  const paneMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [CUT] });
  const panes: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const warm = ['#ffd49a', '#ffe2b8', '#fff0d6', '#ffc982', '#f6e6c8', '#ffe9cc', '#fff5e8'].map((c) => new THREE.Color(c));
  const add = (r: Rect, z0: number, z1: number, storey: number, idx: number, always = false) => {
    const plan = planFor(storey);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const inApt = (x: number, y: number) => plan.rooms.some((q) => (q.apt !== null || q.kind === 'shop') && q.kind !== 'balcony' && pointInPoly(x, y, q.poly));
    let px: number, py: number, rotY: number, w: number;
    if (r.axis === 'x') {
      const outside = inApt(cx, r.y1 + 0.25) ? -1 : 1; // offset toward the non-room side
      px = cx; py = outside < 0 ? r.y0 - 0.025 : r.y1 + 0.025; rotY = 0; w = r.x1 - r.x0;
    } else {
      const outside = inApt(r.x1 + 0.25, cy) ? -1 : 1;
      px = outside < 0 ? r.x0 - 0.025 : r.x1 + 0.025; py = cy; rotY = Math.PI / 2; w = r.y1 - r.y0;
    }
    if (!always && hash(storey * 131 + idx, 7) > 0.72) return;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(px, (storey - 1) * FLOOR_H + (z0 + z1) / 2, py),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(Math.max(0.1, w - 0.12), z1 - z0 - 0.1, 1),
    );
    panes.push({ m, c: warm[Math.floor(hash(storey, idx) * warm.length)] });
  };
  for (let s = 1; s <= FLOORS; s++) {
    const p = planFor(s);
    const sill = s === 1 ? 0.35 : 1.05, head = s === 1 ? 2.75 : 2.5;
    p.windows.forEach((w, i) => add(w, sill, head, s, i, s === 1));
    p.openings.forEach((o, i) => {
      if (o.kind === 'lift') return;
      const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      const bal = p.rooms.some((q) => q.kind === 'balcony' && (o.axis === 'x'
        ? pointInPoly(cx, o.y0 - 0.2, q.poly) || pointInPoly(cx, o.y1 + 0.2, q.poly)
        : pointInPoly(o.x0 - 0.2, cy, q.poly) || pointInPoly(o.x1 + 0.2, cy, q.poly)));
      if (bal) add(o, SLAB, 2.5, s, 1000 + i);
    });
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  const inst = new THREE.InstancedMesh(plane, paneMat, panes.length);
  panes.forEach((p, i) => { inst.setMatrixAt(i, p.m); inst.setColorAt(i, p.c); });
  inst.frustumCulled = false;
  group.add(inst);

  // LED crown along the roof edge, accent lines on the arch frame, canopy downlight strip
  const ledMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [CUT] });
  const goldMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [CUT] });
  const strip = (mat: THREE.Material, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(x1 - x0, 0.02), z1 - z0, Math.max(y1 - y0, 0.02)), mat);
    m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
    group.add(m);
  };
  const fp = planFor(3).footprint.outer;
  for (let i = 0; i < fp.length; i++) {
    const [ax, ay] = fp[i], [bx, by] = fp[(i + 1) % fp.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.3) continue;
    let nx = (by - ay) / L, ny = -(bx - ax) / L;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (pointInPoly(mx + nx * 0.05, my + ny * 0.05, planFor(3).footprint)) { nx = -nx; ny = -ny; }
    const o = 0.035;
    strip(ledMat, Math.min(ax, bx) + nx * o - 0.01, Math.min(ay, by) + ny * o - 0.01, Math.max(ax, bx) + nx * o + 0.01, Math.max(ay, by) + ny * o + 0.01, ROOF_Z + 1.12, ROOF_Z + 1.18);
    strip(ledMat, Math.min(ax, bx) + nx * o - 0.01, Math.min(ay, by) + ny * o - 0.01, Math.max(ax, bx) + nx * o + 0.01, Math.max(ay, by) + ny * o + 0.01, ROOF_Z - 0.06, ROOF_Z);
  }
  const cx = BLOCK_W / 2, bx0 = 12.42, bx1 = 17.32, fy = -1.47, PW = 0.75, IN = 0.29;
  for (const x of [bx0 - PW, bx0 + IN, bx1 - IN, bx1 + PW]) strip(goldMat, x - 0.02, fy - 0.06, x + 0.02, fy - 0.02, 5.7, 21.05);
  strip(goldMat, bx0 - PW, fy - 0.16, bx1 + PW, fy - 0.12, 21.05, 21.1);
  strip(ledMat, 0, -1.52, cx - 3.1, -1.48, 3.0, 3.06);
  strip(ledMat, cx + 3.1, -1.52, BLOCK_W, -1.48, 3.0, 3.06);
  strip(goldMat, cx - 2.4, -1.53, cx + 2.4, -1.5, 3.68, 3.72);

  // vertical LED lines on the piers from the canopy to the parapet, each washing the wall beside it
  const ll = ledLines();
  group.add(ll.group);

  // the portal: warm light in the arch and on the entrance
  const portal = [new THREE.PointLight('#ffc98a', 0, 16, 2), new THREE.PointLight('#ffc98a', 0, 14, 2)];
  portal[0].position.set(cx, 2.6, -2.4); portal[1].position.set(cx, 9, -2.6);
  group.add(...portal);

  // bollards along the pavement: the posts stand by day too (`fixtures`), heads and light pools glow at night
  const bl = bollards();
  group.add(bl.glow);

  const set = (n: number) => {
    paneMat.opacity = n * 0.92;
    ll.set(n); bl.set(n);
    FACADE_NIGHT.value = n;
    TREE_NIGHT.value = n;
    ledMat.opacity = n;
    goldMat.opacity = n;
    portal[0].intensity = 60 * n; portal[1].intensity = 45 * n;
    group.visible = n > 0.01;
  };
  set(0);
  return { group, set, decals: ll.decals, fixtures: bl.posts };
}

/** Soft light of an LED line on the wall: a bright core and a wider glow across, fading at both ends. */
function washTexture() {
  const W = 64, H = 64, d = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = Math.abs((i + 0.5) / W - 0.5) * 2, y = (j + 0.5) / H;          // x: 0 centre … 1 edge; y: 0 bottom … 1 top
    const across = 0.75 * Math.exp(-x / 0.1) + 0.35 * Math.exp(-x / 0.4);
    const ends = Math.min(1, y / 0.04) * Math.min(1, (1 - y) / 0.03);
    const k = (j * W + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.min(1, across * ends * (0.85 + 0.15 * (1 - y))) * 255);
  }
  const t = new THREE.DataTexture(d, W, H);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Vertical LED lines on the solid piers of the outer walls, canopy to parapet, as in the client's night render. */
function ledLines() {
  const plan = planFor(3), fp = plan.footprint, ring = fp.outer;
  const piers: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 0.6) continue;
    const tx = (bx - ax) / L, ty = (by - ay) / L;
    let nx = ty, ny = -tx;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (pointInPoly(mx + nx * 0.05, my + ny * 0.05, fp)) { nx = -nx; ny = -ny; }
    // what is not wall along this edge: windows, doors (with frames) and balcony railings
    const blocked: [number, number][] = [];
    const along = (x: number, y: number) => (x - ax) * tx + (y - ay) * ty;
    const near = (x: number, y: number) => Math.abs((x - ax) * nx + (y - ay) * ny) < 0.4;
    for (const r of [...plan.windows, ...plan.openings.filter((o) => o.kind !== 'lift')]) {
      const cs: [number, number][] = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]];
      if (!cs.some(([x, y]) => near(x, y))) continue;
      const ss = cs.map(([x, y]) => along(x, y));
      blocked.push([Math.min(...ss) - 0.08, Math.max(...ss) + 0.08]);
    }
    for (const rl of plan.rails) {
      const [p, q] = rl.axis === 'h' ? [[rl.lo, rl.off], [rl.hi, rl.off]] : [[rl.off, rl.lo], [rl.off, rl.hi]];
      if (!near(p[0], p[1]) || !near(q[0], q[1])) continue;
      const a = along(p[0], p[1]), b = along(q[0], q[1]);
      blocked.push([Math.min(a, b) - 0.1, Math.max(a, b) + 0.1]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let s0 = 0.12;
    const free: [number, number][] = [];
    for (const [b0, b1] of [...blocked, [L - 0.12, L - 0.12] as [number, number]]) {
      if (b0 > s0) free.push([s0, Math.min(b0, L - 0.12)]);
      s0 = Math.max(s0, b1);
    }
    for (const [f0, f1] of free) {
      const w = f1 - f0;
      if (w < 0.5) continue;
      const n = Math.max(1, Math.floor(w / 4.2));
      for (let k = 0; k < n; k++) {
        const sc = f0 + (w * (k + 0.5)) / n;
        const x = ax + tx * sc, y = ay + ty * sc;
        // street facade: the ornamental pilasters and the lattice arch frame have their own accents
        if (ny < -0.5 && y < 0.6 && x > 11.4 && x < 18.3) continue;   // the portal frame has its own gold lines
        piers.push({ x, y, nx, ny });
      }
    }
  }
  const Z0 = 3.75, Z1 = ROOF_Z + 1.15, H = Z1 - Z0, QW = 1.7;
  const washParts: THREE.BufferGeometry[] = [], lineParts: THREE.BufferGeometry[] = [];
  for (const p of piers) {
    const M = new THREE.Matrix4().makeRotationY(Math.atan2(p.nx, p.ny)).setPosition(p.x, Z0 + H / 2, p.y);   // local +z → wall normal
    const q = new THREE.PlaneGeometry(QW, H); q.translate(0, 0, 0.014); q.applyMatrix4(M); washParts.push(q);
    const l = new THREE.BoxGeometry(0.035, H, 0.03); l.translate(0, 0, 0.02); l.applyMatrix4(M); l.deleteAttribute('uv'); lineParts.push(l.toNonIndexed());
  }
  const group = new THREE.Group(); group.name = 'led-lines';
  const washMat = new THREE.MeshBasicMaterial({ map: washTexture(), color: '#ffc27e', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [CUT], polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decals = new THREE.Mesh(mergeGeometries(washParts, false)!, washMat);
  decals.name = 'led-wash'; decals.renderOrder = 3; decals.frustumCulled = false;
  // brighter than white on purpose: the Ultra renderer's bloom makes the lines glow
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.7, 2.05, 1.3), transparent: true, opacity: 0, clippingPlanes: [CUT] });
  const lines = new THREE.Mesh(mergeGeometries(lineParts, false)!, lineMat);
  [...washParts, ...lineParts].forEach((g) => g.dispose());
  group.add(lines, decals);
  const set = (n: number) => { washMat.opacity = 0.9 * n; lineMat.opacity = n; group.visible = n > 0.01; };
  set(0);
  return { group, set, decals };
}

/** Light pool of a bollard on the paving. */
function poolTexture() {
  const S = 64, d = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const r = Math.hypot((i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5) * 2;
    const k = (j * S + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.max(0, 1 - r) ** 1.6 * 255);
  }
  const t = new THREE.DataTexture(d, S, S); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

/** Low bollard lights along the pavement in front of the block and along its ends. */
function bollards() {
  const cx = BLOCK_W / 2, D = planFor(3).footprint.outer.reduce((m, [, y]) => Math.max(m, y), 0);
  const at: [number, number][] = [];
  for (let x = -5; x <= BLOCK_W + 5; x += 3.6) if (Math.abs(x - cx) > 3.2) at.push([x, -4.3]);
  for (let y = 0.5; y <= D; y += 4.5) at.push([-4.3, y], [BLOCK_W + 4.3, y]);
  const postParts: THREE.BufferGeometry[] = [], headParts: THREE.BufferGeometry[] = [], poolParts: THREE.BufferGeometry[] = [];
  for (const [x, y] of at) {
    postParts.push(new THREE.CylinderGeometry(0.055, 0.065, 0.78, 10).translate(x, 0.39, y));
    headParts.push(new THREE.CylinderGeometry(0.068, 0.068, 0.1, 10).translate(x, 0.73, y));
    poolParts.push(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2).translate(x, 0.035, y));
  }
  const posts = new THREE.Mesh(mergeGeometries(postParts, false)!, prep(new THREE.MeshStandardMaterial({ color: '#2f2a26', roughness: 0.45, metalness: 0.6 }), false));
  posts.name = 'bollards'; posts.castShadow = true;
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.5), transparent: true, opacity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffc98a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const glow = new THREE.Group(); glow.name = 'bollard-glow';
  glow.add(new THREE.Mesh(mergeGeometries(headParts, false)!, headMat), new THREE.Mesh(mergeGeometries(poolParts, false)!, poolMat));
  [...postParts, ...headParts, ...poolParts].forEach((g) => g.dispose());
  const set = (n: number) => { headMat.opacity = n; poolMat.opacity = 0.55 * n; glow.visible = n > 0.01; };
  return { posts, glow, set };
}
