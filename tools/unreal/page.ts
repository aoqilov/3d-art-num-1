// Runs inside the app page (tools/unreal/export.mjs injects it): turns the complex scene into files for Unreal.
//  - world.glb: every plain mesh baked to world space, merged per material and per 200 m tile (Unreal's distance
//    fields and culling like smaller pieces), identity transforms
//  - a_<name>.glb: each instanced thing once (a block, a tree variant, a hedge clump …), at its own origin
//  - scene.json: the instances (three.js matrices, metres, Y up), cameras, the sun for the 7 time stops
// Texture repeat / offset is baked into the UVs (no KHR_texture_transform needed on import).
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

type Save = (name: string, b64: string, last: boolean) => Promise<void>;
declare global { interface Window { __complex: any; __unrealSave: Save } }

const TILE = 200;
const MAX_TEX = 2048;

const slug = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'm';

// ---------- materials ----------
type Out = { mat: THREE.MeshStandardMaterial; uv: THREE.Matrix3 | null; colors: boolean; name: string };
const outMats = new Map<string, Out>();
const composed = new Map<string, THREE.Texture>();
let matN = 0;

/** roughness map without a metalness map: glTF reads metal from B, three used the constant — make B white once */
function roughOnly(t: THREE.Texture) {
  let c = composed.get(t.uuid);
  if (c) return c;
  const img = t.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = Math.min(img.width, MAX_TEX); cv.height = Math.min(img.height, MAX_TEX);
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  try { g.drawImage(img, 0, 0, cv.width, cv.height); } catch { return plain(t); }   // a data texture: as it is
  const d = g.getImageData(0, 0, cv.width, cv.height);
  for (let i = 2; i < d.data.length; i += 4) d.data[i] = 255;
  g.putImageData(d, 0, 0);
  c = new THREE.CanvasTexture(cv);
  c.flipY = t.flipY; c.colorSpace = THREE.NoColorSpace; c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.userData.mimeType = 'image/jpeg';
  composed.set(t.uuid, c);
  return c;
}
/** white, with the alpha map's green channel as alpha (three reads alpha maps from G) */
function alphaAsMap(t: THREE.Texture) {
  const img = t.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas');
  cv.width = Math.min(img.width, MAX_TEX); cv.height = Math.min(img.height, MAX_TEX);
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, cv.width, cv.height);
  const d = g.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i + 3] = d.data[i + 1]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; }
  g.putImageData(d, 0, 0);
  const c = new THREE.CanvasTexture(cv);
  c.flipY = t.flipY; c.colorSpace = THREE.SRGBColorSpace; c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.userData.mimeType = 'image/png';
  return c;
}
/** the texture as exported: no repeat (baked into the UVs), JPEG unless the alpha matters */
function plain(t: THREE.Texture | null, alpha = false) {
  if (!t || !t.image) return null;
  const k = t.uuid + (alpha ? 'a' : '');
  const hit = plainCache.get(k);
  if (hit) return hit;
  const c = t.clone();
  c.repeat.set(1, 1); c.offset.set(0, 0); c.rotation = 0; c.center.set(0, 0);
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.userData = { mimeType: alpha ? 'image/png' : 'image/jpeg' };
  c.name = t.name;
  plainCache.set(k, c);              // one clone per source: the file holds each image once
  return c;
}
const plainCache = new Map<string, THREE.Texture>();

function outMaterial(m: THREE.Material, hint: string): Out {
  let o = outMats.get(m.uuid);
  if (o) return o;
  const s = m as THREE.MeshPhysicalMaterial;
  const cut = (s.alphaTest ?? 0) > 0;
  const physical = (s as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial;
  const mat: THREE.MeshStandardMaterial = physical ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
  mat.color.copy(s.color ?? new THREE.Color(1, 1, 1));
  mat.opacity = s.opacity ?? 1;
  mat.transparent = !!s.transparent && !cut;
  mat.alphaTest = s.alphaTest ?? 0;
  mat.side = s.side ?? THREE.FrontSide;
  mat.roughness = s.roughness ?? 1;
  mat.metalness = s.metalness ?? 0;
  mat.vertexColors = !!s.vertexColors;
  // the glow as it is now (daytime: the night lights are off); the night is set up in Unreal
  const glow = s.emissive ? s.emissive.r + s.emissive.g + s.emissive.b > 0 && (s.emissiveIntensity ?? 1) > 0 : false;
  if (glow) { mat.emissive.copy(s.emissive).multiplyScalar(s.emissiveIntensity ?? 1); mat.emissiveIntensity = 1; } else mat.emissive.set(0, 0, 0);
  mat.map = plain(s.map ?? null, cut || mat.transparent);
  // an alpha map alone (the balcony rail panel's bars): glTF has none — a white map carrying it, cut out
  if (!s.map && s.alphaMap) { mat.map = alphaAsMap(s.alphaMap); mat.alphaTest = 0.5; mat.transparent = false; }
  mat.normalMap = plain(s.normalMap ?? null);
  if (s.normalScale) mat.normalScale.copy(s.normalScale);
  mat.emissiveMap = glow ? plain(s.emissiveMap ?? null) : null;
  mat.aoMap = plain(s.aoMap ?? null);
  if (s.roughnessMap && s.metalnessMap === s.roughnessMap) mat.roughnessMap = mat.metalnessMap = plain(s.roughnessMap);
  else if (s.roughnessMap) mat.roughnessMap = mat.metalnessMap = roughOnly(s.roughnessMap);
  else if (s.metalnessMap) mat.metalnessMap = plain(s.metalnessMap);
  if (physical) {
    const p = mat as THREE.MeshPhysicalMaterial;
    p.transmission = s.transmission ?? 0; p.ior = s.ior ?? 1.5; p.clearcoat = s.clearcoat ?? 0;
  }
  // the UV transform of the textures (they share it in this app); baked into the UVs
  const src = s.map ?? s.alphaMap ?? s.normalMap ?? s.roughnessMap ?? s.emissiveMap ?? null;
  let uv: THREE.Matrix3 | null = null;
  if (src && (src.repeat.x !== 1 || src.repeat.y !== 1 || src.offset.x || src.offset.y || src.rotation)) {
    src.updateMatrix(); uv = src.matrix.clone();
  }
  // the app's material name (block library) or where it was found; _vc: vertex colours (Unreal needs its own material)
  const name = `M${String(matN++).padStart(3, '0')}_${slug(m.name || hint)}${mat.vertexColors ? '_vc' : ''}`;
  mat.name = name;
  o = { mat, uv, colors: mat.vertexColors, name };
  outMats.set(m.uuid, o);
  return o;
}

// ---------- geometry ----------
type Soup = { pos: number[]; nor: number[]; uv: number[]; col: number[] | null };
const soup = (colors: boolean): Soup => ({ pos: [], nor: [], uv: [], col: colors ? [] : null });

const v = new THREE.Vector3(), n = new THREE.Vector3(), u2 = new THREE.Vector2();
/** triangles [start, start+count) of g (index space) appended to S, transformed by M (normals by N) */
function addTris(S: Soup, g: THREE.BufferGeometry, start: number, count: number, M: THREE.Matrix4 | null, uvM: THREE.Matrix3 | null, pick?: (cx: number, cz: number) => Soup) {
  const P = g.getAttribute('position'), Nn = g.getAttribute('normal'), U = g.getAttribute('uv'), C = g.getAttribute('color');
  const idx = g.index;
  const N = M ? new THREE.Matrix3().getNormalMatrix(M) : null;
  const flip = M ? M.determinant() < 0 : false;
  const end = Math.min(start + count, idx ? idx.count : P.count);
  const tri = [0, 0, 0];
  for (let i = start; i + 2 < end; i += 3) {
    for (let k = 0; k < 3; k++) tri[k] = idx ? idx.getX(i + k) : i + k;
    if (flip) { const t = tri[1]; tri[1] = tri[2]; tri[2] = t; }
    let T = S;
    if (pick) {
      let cx = 0, cz = 0;
      for (const j of tri) { v.fromBufferAttribute(P as THREE.BufferAttribute, j); if (M) v.applyMatrix4(M); cx += v.x; cz += v.z; }
      T = pick(cx / 3, cz / 3);
    }
    for (const j of tri) {
      v.fromBufferAttribute(P as THREE.BufferAttribute, j); if (M) v.applyMatrix4(M);
      T.pos.push(v.x, v.y, v.z);
      if (Nn) { n.fromBufferAttribute(Nn as THREE.BufferAttribute, j); if (N) n.applyMatrix3(N).normalize(); } else n.set(0, 1, 0);
      T.nor.push(n.x, n.y, n.z);
      if (U) { u2.fromBufferAttribute(U as THREE.BufferAttribute, j); if (uvM) u2.applyMatrix3(uvM); } else u2.set(0, 0);
      T.uv.push(u2.x, u2.y);
      if (T.col) { if (C) T.col.push(C.getX(j), C.getY(j), C.getZ(j)); else T.col.push(1, 1, 1); }
    }
  }
}
/** big arrays: push(...) overflows the stack past ~100k elements */
function concatSoups(list: Soup[]) {
  const total = list.reduce((a, s) => a + s.pos.length, 0);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(total), nor = new Float32Array(total), uv = new Float32Array((total / 3) * 2);
  const anyCol = list.some((s) => s.col);
  const col = anyCol ? new Float32Array(total) : null;
  let p = 0, q = 0;
  list.forEach((s, i) => {
    pos.set(s.pos, p); nor.set(s.nor, p); uv.set(s.uv, q);
    if (col) col.set(s.col ?? new Array(s.pos.length).fill(1), p);
    g.addGroup(p / 3, s.pos.length / 3, i);
    p += s.pos.length; q += s.uv.length;
  });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ix = new Uint32Array(total / 3); for (let i = 0; i < ix.length; i++) ix[i] = i;
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  return g;
}

// ---------- export ----------
function groupsOf(o: THREE.Mesh) {
  const g = o.geometry, ms = Array.isArray(o.material) ? o.material : [o.material];
  const total = g.index ? g.index.count : g.getAttribute('position').count;
  const gs = g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
  return gs.map((gr) => ({ start: gr.start, count: Math.min(gr.count, total - gr.start), mat: ms[gr.materialIndex ?? 0] }))
    .filter((x) => x.mat && x.mat.visible !== false && x.count > 0);
}
const hintOf = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.name) return q.name; return 'mesh'; };

async function glb(root: THREE.Object3D) {
  const ex = new GLTFExporter();
  return (await ex.parseAsync(root, { binary: true, maxTextureSize: MAX_TEX, onlyVisible: false })) as ArrayBuffer;
}
function b64(buf: ArrayBuffer) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
async function save(name: string, buf: ArrayBuffer | string) {
  const s = typeof buf === 'string' ? btoa(unescape(encodeURIComponent(buf))) : b64(buf);
  const CH = 8 * 1024 * 1024;
  for (let i = 0; i < s.length; i += CH) await window.__unrealSave(name, s.slice(i, i + CH), i + CH >= s.length);
}

export async function run() {
  const c = window.__complex;
  const scene: THREE.Scene = c.scene;
  scene.updateMatrixWorld(true);
  const skip = new Set<THREE.Object3D>([c.clouds?.mesh, c.floorBand].filter(Boolean));
  const stat = new Map<string, Map<string, Soup>>();    // material → tile → triangles
  const inst = new Map<string, { mesh: THREE.InstancedMesh; mats: Out[]; list: THREE.Matrix4[]; name: string }>();
  const log: string[] = [];

  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip.has(o)) return;
    if (m === c.base) return;                              // the 6 km ground: rebuilt in Unreal (landscape material)
    const gs = groupsOf(m);
    if (!gs.length) return;
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      const im = m as THREE.InstancedMesh;
      const key = im.geometry.uuid + '|' + gs.map((x) => x.mat.uuid).join(',');
      let e = inst.get(key);
      if (!e) {
        const name = im === c.inst ? 'blok' : `${slug(hintOf(im))}_${inst.size}`;
        e = { mesh: im, mats: gs.map((x) => outMaterial(x.mat, name)), list: [], name };
        inst.set(key, e);
      }
      const mi = new THREE.Matrix4();
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mi); e.list.push(new THREE.Matrix4().multiplyMatrices(im.matrixWorld, mi)); }
      return;
    }
    for (const gr of gs) {
      const om = outMaterial(gr.mat, hintOf(m));
      let tiles = stat.get(om.name);
      if (!tiles) stat.set(om.name, (tiles = new Map()));
      const pick = (x: number, z: number) => {
        const k = `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
        let s = tiles!.get(k); if (!s) tiles!.set(k, (s = soup(om.colors))); return s;
      };
      addTris(soup(om.colors), m.geometry, gr.start, gr.count, m.matrixWorld, om.uv, pick);
    }
  });

  // world.glb: one node per material and tile
  const world = new THREE.Group(); world.name = 'world';
  const byName = new Map([...outMats.values()].map((o) => [o.name, o]));
  let wt = 0;
  for (const [mn, tiles] of stat) for (const [tk, s] of tiles) {
    if (!s.pos.length) continue;
    const g = concatSoups([s]); g.clearGroups();
    const mesh = new THREE.Mesh(g, byName.get(mn)!.mat);
    mesh.name = `W_${tk.replace(/-/g, 'm')}_${mn}`;
    world.add(mesh); wt += s.pos.length / 9;
  }
  log.push(`world: ${world.children.length} pieces, ${Math.round(wt)} triangles`);
  await save('world.glb', await glb(world));

  // the instanced things, each once at its origin
  const instances: Record<string, number[][]> = {};
  for (const e of inst.values()) {
    const gs = groupsOf(e.mesh).map((gr, i) => ({ ...gr, out: e.mats[i] }));
    // see-through parts (the block's glazing) apart: Unreal's Nanite draws no translucent material, and opaque
    // glass hid the window frames behind it -> <name>_shaffof, its own mesh (no Nanite), same copies
    const clear = gs.filter((x) => x.out.mat.transparent);
    const sets = clear.length && clear.length < gs.length
      ? [[e.name, gs.filter((x) => !x.out.mat.transparent)], [e.name + '_shaffof', clear]] as const
      : [[e.name, gs]] as const;
    for (const [name, part] of sets) {
      const parts = part.map((gr) => { const s = soup(gr.out.colors); addTris(s, e.mesh.geometry, gr.start, gr.count, null, gr.out.uv); return s; });
      const g = concatSoups(parts);
      const mesh = new THREE.Mesh(g, part.map((x) => x.out.mat));
      mesh.name = 'A_' + name;
      const root = new THREE.Group(); root.add(mesh);
      await save(`a_${name}.glb`, await glb(root));
      instances['A_' + name] = e.list.map((M) => M.elements.map((x) => Math.round(x * 1e4) / 1e4));
      log.push(`A_${name}: ${e.list.length} copies, ${Math.round(g.index!.count / 3)} triangles, ${part.length} materials`);
    }
  }

  // the sun of the 7 time stops (the app's own solar position, scene axes) and the cameras
  const h0 = c.getHour();
  const sun: Record<string, number[]> = {};
  for (const h of [4, 7, 10, 13, 16, 19, 23]) { c.setHour(h, true); const p = c.sun.position.clone().normalize(); sun[h] = [p.x, p.y, p.z].map((x) => Math.round(x * 1e5) / 1e5); }
  c.setHour(h0, true);
  const cameras = {
    umumiy: { pos: [190, 170, 230], target: [0, 10, 10], vfov: 42 },
    hovli: { pos: [22, 32, 68], target: [-2, 2, 96], vfov: 42 },
    joriy: { pos: c.camera.position.toArray(), target: c.controls.target.toArray(), vfov: c.camera.fov },
  };
  const blocks = (c.blocks as { def: { id: number; x: number; z: number } }[]).map((b) => ({ id: b.def.id, x: b.def.x, z: b.def.z }));
  await save('scene.json', JSON.stringify({ units: 'm, three.js axes (Y up)', instances, sun, cameras, blocks, materials: [...outMats.values()].map((o) => o.name) }));
  log.push(`materials ${outMats.size}`);
  return log;
}
(window as unknown as { __unrealExport: typeof run }).__unrealExport = run;
