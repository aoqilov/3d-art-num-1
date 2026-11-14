// Outer surroundings (public/context/outer.json, tools/outer/merge.mjs): the city beyond the inner neighbourhood
// as plain grey boxes — every building's footprint extruded to its CADMapper height, all in one mesh.
// ?edit=2: click (Shift+click adds) to mark buildings; marks are kept in this browser and exported as JSON
// (outer-picks.json) — the owner picks the ones worth detailing.
import * as THREE from 'three';

type Outer = { buildings: number[][]; roads?: number[][] };
const KEY = 'om-outer-picks';
const GREY = new THREE.Color('#a4a4a0'), PICK = new THREE.Color('#e3b878'), HOVER = new THREE.Color('#f2dcae');

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
    const pos: number[] = [], idx: number[] = [], tri: number[] = [];
    for (const b of data.buildings) {
      const id = b[0], h = b[1], ring: [number, number][] = [];
      for (let i = 2; i + 1 < b.length; i += 2) ring.push([b[i], b[i + 1]]);
      if (ring.length < 3) continue;
      // counter-clockwise in x, z (outward walls)
      let a = 0; for (let i = 0; i < ring.length; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; a += x0 * z1 - x1 * z0; }
      if (a > 0) ring.reverse();
      const v0 = pos.length / 3;
      // walls: own vertices per wall (flat shading)
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length], k = pos.length / 3;
        pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, h, z0);
        idx.push(k, k + 1, k + 2, k, k + 2, k + 3); tri.push(id, id);
      }
      // flat roof
      const k = pos.length / 3;
      for (const [x, z] of ring) pos.push(x, h, z);
      const faces = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [p, q, r] of faces) { idx.push(k + p, k + r, k + q); tri.push(id); }
      this.vRange.set(id, [v0, pos.length / 3 - v0]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const col = new Float32Array(pos.length).fill(1);
    this.colors = new THREE.BufferAttribute(col, 3);
    g.setAttribute('color', this.colors);
    this.triId = new Uint32Array(tri);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: GREY, vertexColors: true, roughness: 0.9 }));
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.name = 'outer-city';
    this.group.add(this.mesh);
    if (data.roads?.length) this.group.add(roads(data.roads));
    try { for (const id of JSON.parse(localStorage.getItem(KEY) ?? '[]')) this.picks.add(id); } catch { /* storage blocked */ }
    for (const id of this.picks) this.paint(id);
  }

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
