// Outer surroundings (public/context/outer.json, tools/outer/merge.mjs): the city beyond the inner neighbourhood —
// every building's footprint extruded to its CADMapper height, all in one mesh. The material draws the rest
// (facadeMaterial): plaster / panel / brick by building, storeys and windows on the walls (glass, some curtains,
// lit ones at night), flat bitumen roofs on the tall ones, tin on the houses — so from above the city is not a
// field of grey boxes (the owner compared it with a competitor's Unreal fly-over).
// ?edit=2: click (Shift+click adds) to mark buildings; marks are kept in this browser and exported as JSON
// (outer-picks.json) — the owner picks the ones worth detailing.
import * as THREE from 'three';
import { attribute, float, floor, fract, fwidth, hash, max, mix, normalWorld, positionWorld, select, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { nodes } from './gpu';

type Outer = { buildings: number[][]; roads?: number[][] };
const KEY = 'om-outer-picks';
// vertex colours tint the material for the marks: white = as drawn
const GREY = new THREE.Color('#ffffff'), PICK = new THREE.Color('#ffc46b'), HOVER = new THREE.Color('#ffe2a6');

const NIGHT = uniform(0);
const rnd = (id: number) => { const s = Math.sin(id * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

/** walls: storeys of windows along the wall ('fac'.x = metres along the outline), filtered so that a distant wall
 *  turns into its average instead of shimmering; roofs: bitumen or tin */
function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 });
  const fac = attribute('fac', 'vec3');                     // metres along the walls, building height, random
  const u = fac.x, H = fac.y, r = fac.z, y = positionWorld.y;
  const low = H.lessThan(5.5);                               // one-storey houses of the mahalla
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL node types do not chain through select()
  const pal = (k: any, c: [number, number, number][], w: number[]) => {
    let out: any = vec3(...c[c.length - 1]), acc = 0;
    const edges = w.map((x) => (acc += x));
    for (let i = c.length - 2; i >= 0; i--) out = select(k.lessThan(edges[i]), vec3(...c[i]), out);
    return out;
  };
  const k1 = fract(r.mul(7.13)), k2 = fract(r.mul(3.71));
  // linear colours: white and cream plaster, beige, pale yellow, grey panel, light blue-grey, brick
  const tall = pal(k1, [[0.70, 0.68, 0.63], [0.66, 0.58, 0.44], [0.46, 0.46, 0.44], [0.56, 0.50, 0.41], [0.50, 0.55, 0.57], [0.34, 0.19, 0.13]], [0.28, 0.2, 0.2, 0.12, 0.1]);
  const house = pal(k1, [[0.68, 0.66, 0.60], [0.62, 0.54, 0.40], [0.55, 0.47, 0.37], [0.36, 0.21, 0.14], [0.66, 0.60, 0.42]], [0.35, 0.22, 0.18, 0.13]);
  const wall = select(low, house, tall).mul(mix(0.78, 1, smoothstep(0, 1.4, y))).mul(mix(0.9, 1.06, k2));
  // storeys (3 m; houses 3.4 m) and window columns (3–3.8 m; houses 4.2 m)
  const fh = select(low, float(3.4), float(3.0)), sp = select(low, float(4.2), float(3.0).add(r.mul(0.8)));
  const fy = y.sub(0.2).div(fh), fx = u.div(sp);
  const wy = fract(fy), wx = fract(fx);
  const dY = max(fwidth(fy), 1e-4), dX = max(fwidth(fx), 1e-4);
  const pulse = (f: typeof wy, a: number, b: number, d: typeof dY) => smoothstep(float(a).sub(d), float(a).add(d), f).sub(smoothstep(float(b).sub(d), float(b).add(d), f));
  let win: any = pulse(wy, 0.3, 0.8, dY).mul(pulse(wx, 0.28, 0.72, dX));
  win = mix(win, float(0.22), smoothstep(0.2, 0.6, max(dX, dY)));             // too small to draw: the average
  win = win.mul(step(0.6, y)).mul(step(y, H.sub(0.45)));                      // no windows in the plinth, parapet
  const cell = hash(floor(fx).mul(17).add(floor(fy).mul(131)).add(r.mul(9973)));
  const glass = mix(vec3(0.03, 0.04, 0.05), vec3(0.32, 0.29, 0.25), step(0.72, cell));      // ~28 % curtains
  const roofC = select(low,
    pal(k2, [[0.42, 0.44, 0.45], [0.22, 0.30, 0.25], [0.36, 0.20, 0.15], [0.30, 0.31, 0.32]], [0.4, 0.25, 0.2]),     // tin
    mix(vec3(0.16, 0.16, 0.16), vec3(0.34, 0.33, 0.31), k2));                                                         // bitumen / concrete
  const isRoof = normalWorld.y.greaterThan(0.5);
  nodes(m).colorNode = select(isRoof, roofC, mix(wall, glass, win));
  nodes(m).roughnessNode = select(isRoof, float(0.85), mix(float(0.9), float(0.15), win));
  // night: a share of the windows lit, warm
  const lit = step(0.8, hash(floor(fx).mul(29).add(floor(fy).mul(57)).add(r.mul(4211)))).mul(win).mul(select(isRoof, float(0), float(1)));
  nodes(m).emissiveNode = vec3(1.0, 0.72, 0.42).mul(lit).mul(NIGHT).mul(1.6);
  return m;
}

export async function loadOuter(): Promise<Outer | null> {
  try { const r = await fetch('context/outer.json'); return r.ok ? await r.json() : null; } catch { return null; }
}

export class OuterCity {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  /** building id per triangle, first vertex and vertex count per building (for colouring) */
  private triId: Uint32Array;
  private vRange = new Map<number, [number, number]>();
  private colors: THREE.BufferAttribute;
  picks = new Set<number>();
  private hover = -1;

  constructor(data: Outer) {
    const pos: number[] = [], idx: number[] = [], tri: number[] = [], fac: number[] = [];
    for (const b of data.buildings) {
      const id = b[0], h = b[1], ring: [number, number][] = [];
      for (let i = 2; i + 1 < b.length; i += 2) ring.push([b[i], b[i + 1]]);
      if (ring.length < 3) continue;
      // counter-clockwise in x, z (outward walls)
      let a = 0; for (let i = 0; i < ring.length; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; a += x0 * z1 - x1 * z0; }
      if (a > 0) ring.reverse();
      const v0 = pos.length / 3, r = rnd(id);
      // walls: own vertices per wall (flat shading); 'fac' = metres along the outline, height, random
      let s = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], k = pos.length / 3;
        const s1 = s + Math.hypot(x1 - x0, z1 - z0);
        pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, h, z0);
        fac.push(s, h, r, s1, h, r, s1, h, r, s, h, r);
        idx.push(k, k + 1, k + 2, k, k + 2, k + 3); tri.push(id, id);
        s = s1;
      }
      // flat roof
      const k = pos.length / 3;
      for (const [x, z] of ring) { pos.push(x, h, z); fac.push(0, h, r); }
      const faces = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [p, q, r] of faces) { idx.push(k + p, k + r, k + q); tri.push(id); }
      this.vRange.set(id, [v0, pos.length / 3 - v0]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('fac', new THREE.Float32BufferAttribute(fac, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const col = new Float32Array(pos.length).fill(1);
    this.colors = new THREE.BufferAttribute(col, 3);
    g.setAttribute('color', this.colors);
    this.triId = new Uint32Array(tri);
    this.mesh = new THREE.Mesh(g, facadeMaterial());
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.name = 'outer-city';
    this.group.add(this.mesh);
    if (data.roads?.length) this.group.add(roads(data.roads));
    try { for (const id of JSON.parse(localStorage.getItem(KEY) ?? '[]')) this.picks.add(id); } catch { /* storage blocked */ }
    for (const id of this.picks) this.paint(id);
  }

  /** 0 day … 1 night: a share of the windows lit */
  setNight(n: number) { NIGHT.value = n; }

  private paint(id: number) {
    const r = this.vRange.get(id); if (!r) return;
    const c = id === this.hover ? HOVER : this.picks.has(id) ? PICK : null;
    // vertex colour multiplies the grey: white = grey, the marks are tinted
    const k = c ? [c.r / GREY.r, c.g / GREY.g, c.b / GREY.b] : [1, 1, 1];
    for (let i = r[0]; i < r[0] + r[1]; i++) this.colors.setXYZ(i, k[0], k[1], k[2]);
    this.colors.needsUpdate = true;
  }
  /** building id under a ray, or -1 */
  pick(ray: THREE.Raycaster) {
    const hit = ray.intersectObject(this.mesh, false)[0];
    return hit && hit.faceIndex !== undefined && hit.faceIndex !== null ? this.triId[hit.faceIndex] : -1;
  }
  setHover(id: number) {
    if (id === this.hover) return;
    const old = this.hover; this.hover = id;
    if (old >= 0) this.paint(old);
    if (id >= 0) this.paint(id);
  }
  toggle(id: number, add: boolean) {
    if (!add) { const old = [...this.picks]; this.picks.clear(); old.forEach((o) => this.paint(o)); }
    if (this.picks.has(id) && add) this.picks.delete(id); else this.picks.add(id);
    this.paint(id); this.save();
  }
  clear() { const old = [...this.picks]; this.picks.clear(); old.forEach((o) => this.paint(o)); this.save(); }
  private save() { try { localStorage.setItem(KEY, JSON.stringify([...this.picks])); } catch { /* storage blocked */ } }
  /** outer-picks.json: the marked ids with their outline and height (for detailing them later) */
  exportPicks(data: Outer) {
    const by = new Map(data.buildings.map((b) => [b[0], b]));
    return { note: 'Buildings of public/context/outer.json marked with ?edit=2', picks: [...this.picks].map((id) => by.get(id)).filter(Boolean) };
  }
}

// ---------------------------------------------------------------- streets of the outer city
// From the CADMapper centre lines: carriageway (major 9 m, minor 5.5 m) of worn asphalt over a wider band of
// interlocking pavers (the sidewalks), dashed centre line on the major roads. Round joints fill the bends; where
// two streets cross, the asphalt (higher) covers the other street's sidewalk band. Photo textures as the inner
// streets (tools/ground/roads.mjs), world-metre UVs.
const ROAD = [{ w: 9, walk: 3.5 }, { w: 5.5, walk: 1.6 }];
function tex(name: string, kind: 'a' | 'n') {
  const t = new THREE.TextureLoader().load(`pro/tex/${name}_${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  t.colorSpace = kind === 'a' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}
function ribbons(lines: number[][], half: (cls: number) => number, y: number, tile: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const v = (x: number, z: number) => { pos.push(x, y, z); uv.push(x / tile, -z / tile); return pos.length / 3 - 1; };
  for (const l of lines) {
    const hw = half(l[0]);
    if (hw <= 0) continue;
    const p: [number, number][] = [];
    for (let i = 1; i + 1 < l.length; i += 2) p.push([l[i], l[i + 1]]);
    for (let i = 0; i + 1 < p.length; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.05) continue;
      const nx = (-(z1 - z0) / L) * hw, nz = ((x1 - x0) / L) * hw;
      const a = v(x0 + nx, z0 + nz), b = v(x0 - nx, z0 - nz), c = v(x1 - nx, z1 - nz), d = v(x1 + nx, z1 + nz);
      idx.push(a, c, b, a, d, c);
    }
    for (const [x, z] of p) {                         // round joint (and end cap)
      const c = v(x, z), N = 10, first = pos.length / 3;
      for (let k = 0; k < N; k++) v(x + Math.cos((k / N) * Math.PI * 2) * hw, z + Math.sin((k / N) * Math.PI * 2) * hw);
      for (let k = 0; k < N; k++) idx.push(c, first + ((k + 1) % N), first + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}
function roads(lines: number[][]) {
  const grp = new THREE.Group(); grp.name = 'outer-roads';
  const mat = (name: string) => new THREE.MeshStandardMaterial({ map: tex(name, 'a'), normalMap: tex(name, 'n'), roughness: 0.9 });
  const walk = new THREE.Mesh(ribbons(lines, (c) => ROAD[c].w / 2 + ROAD[c].walk, 0.02, 1.92), mat('ph_pavers'));
  const road = new THREE.Mesh(ribbons(lines, (c) => ROAD[c].w / 2, 0.03, 3.0), mat('ph_asphalt'));
  // dashed centre line on the major roads, clear of the junctions (ends of the runs)
  const dash: number[][] = [];
  for (const l of lines) {
    if (l[0] !== 0) continue;
    for (let i = 1; i + 3 < l.length; i += 2) {
      const x0 = l[i], z0 = l[i + 1], x1 = l[i + 2], z1 = l[i + 3], L = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 12; t + 3 < L - 12; t += 9) dash.push([1, x0 + ((x1 - x0) * t) / L, z0 + ((z1 - z0) * t) / L, x0 + ((x1 - x0) * (t + 3)) / L, z0 + ((z1 - z0) * (t + 3)) / L]);
    }
  }
  const paint = new THREE.Mesh(ribbons(dash, () => 0.07, 0.036, 1), new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.6 }));
  for (const m of [walk, road, paint]) { m.receiveShadow = true; m.raycast = () => {}; grp.add(m); }
  return grp;
}
