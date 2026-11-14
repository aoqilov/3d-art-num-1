// A block's own page: the real surroundings of the complex view around it — photo ground, streets, the courtyard
// with its furniture and lamps, the neighbourhood, the other blocks (the Blender model), the outer city — placed in
// this block's frame (complex → block). Around the block an open zone without trees, so the camera sees it from
// every side; whatever still stands between the camera and the block (a neighbouring block, a house, a tree) is
// hidden whole: each of them carries its centre, top and radius ('bc'), and the mask drops the object when the line
// of sight to the block passes through it (its shadow stays). The thinned-out veil before was a dotted mess without
// the Ultra renderer's temporal blending and left half buildings standing.
import * as THREE from 'three';
import { Fn, attribute, bool, dot, float, modelWorldMatrix, uniform, vec2, vec4 } from 'three/tsl';
import { BLOCKS, blockTheta } from '../data/blocks';
import { BLOCK_D, BLOCK_W } from './plan';
import { Context, Courtyard, loadContext, loadCourtyard, loadLocalEdits } from '../three/context';
import { Yard, loadYard } from '../three/yard';
import { OuterCity, loadOuter } from '../three/outer';
import { groundMaterial } from '../three/ground';
import { layoutCourtyard, t4Blocks, t4Matrix } from '../three/courtLayout';
import { mergedBlock } from './blockMerge';
import { loadBlockGlb } from '../three/blockGlb';
import { BAKE_AO, isBaked, materials } from './materials';
import { nodes } from '../three/gpu';
import { inPoly } from '../three/densify';

/** open zone: metres around the block's footprint without trees */
const OPEN = 20;
/** beyond this distance from the block the light card trees stand in for the GLB models */
const LOD_R = 200;

export class BlockSurroundings {
  /** everything placed in the complex frame; its matrix turns the complex into this block's frame */
  readonly group = new THREE.Group();
  readonly ground = groundMaterial();
  readonly groundMesh: THREE.Mesh;
  ctx: Context | null = null;
  court: Courtyard | null = null;
  yard: Yard | null = null;
  outer: OuterCity | null = null;
  blocks: THREE.InstancedMesh | null = null;
  /** the tree groups (neighbourhood, courtyard), for the views that hide trees */
  readonly trees: THREE.Object3D[] = [];
  /** resolves when the neighbourhood, courtyard and blocks are in; the outer city follows */
  readonly ready: Promise<void>;
  readonly outerReady: Promise<boolean>;
  private glassNight: THREE.MeshPhysicalMaterial | null = null;
  private night = 0;
  private toBlock: THREE.Matrix4;
  // see-through corridor between the camera and the block (in this block's frame)
  private fadeCam = uniform(new THREE.Vector3());
  private fadeTo = uniform(new THREE.Vector3());
  private fadeOn = uniform(0);
  readonly mask: unknown;
  readonly maskShadow = bool(true);         // shadows stay whole

  constructor(readonly blockId: number, private changed: () => void) {
    const def = BLOCKS.find((b) => b.id === blockId)!;
    this.toBlock = new THREE.Matrix4().makeRotationY(-blockTheta(def)).multiply(new THREE.Matrix4().makeTranslation(-def.x, 0, -def.z));
    this.group.matrixAutoUpdate = false; this.group.matrix.copy(this.toBlock);

    const cam = this.fadeCam, to = this.fadeTo, on = this.fadeOn;
    // keep a fragment unless its object (centre on the ground, top, radius in 'bc', object frame) stands in the line
    // of sight: seen from above, the sight line passes within the object's radius (+3 m), between the camera and
    // the block (an object reaching the block's own surroundings stays), and below its top there
    this.mask = Fn(() => {
      const bc = attribute('bc', 'vec4');
      const c = modelWorldMatrix.mul(vec4(bc.x, 0, bc.z, 1)).xyz;
      const top = bc.y, r = bc.w;
      const d = to.sub(cam), dxz = vec2(d.x, d.z), cxz = vec2(c.x.sub(cam.x), c.z.sub(cam.z));
      const Lxz = dxz.length().max(1);
      const t = dot(cxz, dxz).div(Lxz.mul(Lxz));
      const across = cxz.sub(dxz.mul(t)).length();
      const height = cam.y.add(d.y.mul(t));
      const blocks = on.greaterThan(0.5)
        .and(t.greaterThan(r.add(2).div(Lxz).negate()))                 // also when the camera stands in it
        .and(t.lessThan(float(1).sub(r.add(6).div(Lxz))))
        .and(across.lessThan(r.add(3)))
        .and(height.lessThan(top.add(3)));
      return blocks.not();
    })();

    // the free land: earth and grass photo textures (ground.ts), as in the complex view
    this.groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.ground.material);
    this.groundMesh.rotation.x = -Math.PI / 2; this.groundMesh.position.y = -0.05;
    this.groundMesh.receiveShadow = true;

    this.addBlocks(def.id);
    // block frame → complex frame, for the open zone test
    const v = new THREE.Vector3();
    const keepOut = (x: number, z: number) => {
      v.set(x, 0, z).applyMatrix4(this.toBlock);
      return Math.abs(v.x) < BLOCK_W / 2 + OPEN && Math.abs(v.z) < BLOCK_D / 2 + OPEN;
    };
    this.ready = (async () => {
      const r = await loadContext();
      if (!r) return;
      const ctx = (this.ctx = new Context(r.data, changed, { keepOut, lod: { x: def.x, z: def.z, r: LOD_R } }));
      ctx.build(r.file, loadLocalEdits());
      ctx.setMask(this.mask, this.maskShadow);
      this.group.add(ctx.group);
      this.trees.push(ctx.trees);
      const court = await loadCourtyard();
      const yd = court ? await loadYard() : null;
      if (court) {
        const cut = layoutCourtyard(court, yd, t4Blocks().map(t4Matrix), keepOut);
        this.court = new Courtyard(court, r.data.site, cut);
        this.court.glb?.setMask(this.mask, this.maskShadow);
        this.group.add(this.court.group);
        this.trees.push(this.court.trees);
        if (yd) { this.yard = new Yard(yd); this.court.group.add(this.yard.group); }
      }
      this.setNight(this.night);
      changed();
    })();
    // the outer city: grey boxes out to ~1.8 km, no shadows (far beyond the shadow cascades)
    this.outerReady = this.ready.then(() => loadOuter()).then((od) => {
      if (!od) return false;
      this.outer = new OuterCity(od);
      this.outer.group.traverse((o) => { o.castShadow = false; });
      this.group.add(this.outer.group);
      changed();
      return true;
    });
  }

  /** the other blocks: one instanced mesh, the drawn exterior until the Blender model arrives */
  private addBlocks(self: number) {
    const others = t4Blocks().filter((b) => b.id !== self);
    if (!others.length) return;
    const mb = mergedBlock(true);
    if (!mb.geometry.getAttribute('uvb')) mb.geometry.setAttribute('uvb', new THREE.BufferAttribute(new Float32Array(mb.geometry.getAttribute('position').count * 2), 2));
    const lib = materials();
    // own copies: the storey cutaway (clipping plane) is for this block only; the see-through mask for these
    const own = new Map<THREE.Material, THREE.Material>();
    const copy = (m: THREE.Material) => {
      let c = own.get(m);
      if (c) return c;
      c = m.clone();
      c.clippingPlanes = null;
      const src = m as unknown as Record<string, unknown>, dst = nodes(c);
      for (const k of Object.keys(src)) if (k.endsWith('Node') && k !== 'outputNode' && k !== 'maskNode' && k !== 'maskShadowNode' && src[k]) dst[k] = src[k];
      // the model's baked occlusion on these copies only (the block's own geometry has no second UV set)
      if (isBaked(m)) dst.aoNode = BAKE_AO.sample(attribute('uvb', 'vec2')).g;
      dst.maskNode = this.mask; dst.maskShadowNode = this.maskShadow;
      if (m === lib.glass) {                          // warm glazing after dark, as in the complex view
        const g = c as THREE.MeshPhysicalMaterial;
        g.emissive.set('#ffcf8f'); g.emissiveIntensity = 0; this.glassNight = g;
      }
      own.set(m, c);
      return c;
    };
    // each block's centre, top and radius in this page's frame, for hiding the whole block (the mask above); on an
    // own geometry object sharing the buffers — the Blender model's geometry is shared with the complex view
    const mats = others.map((b) => this.toBlock.clone().multiply(t4Matrix(b)));
    const centres = new Float32Array(mats.flatMap((M) => {
      const c = new THREE.Vector3(BLOCK_W / 2, 0, BLOCK_D / 2).applyMatrix4(M);
      const r = Math.max(...[[0, -2], [BLOCK_W, -2], [0, BLOCK_D + 2], [BLOCK_W, BLOCK_D + 2]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(M).distanceTo(c)));
      return [c.x, 52, c.z, r];
    }));
    const withCentres = (src: THREE.BufferGeometry) => {
      const g = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(src.attributes)) g.setAttribute(n, a);
      g.setIndex(src.index); g.groups = src.groups;
      g.setAttribute('bc', new THREE.InstancedBufferAttribute(centres, 4));
      return g;
    };
    const inst = new THREE.InstancedMesh(withCentres(mb.geometry), (mb.materials as THREE.Material[]).map(copy), others.length);
    mats.forEach((M, i) => inst.setMatrixAt(i, M));
    inst.castShadow = inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.blocks = inst;
    void loadBlockGlb().then((g) => {
      if (!g || this.blocks !== inst) return;
      const ms = g.names.map((n) => lib[n as keyof typeof lib]);
      if (ms.some((x) => !x)) return;
      inst.geometry = withCentres(g.geometry);
      inst.material = ms.map(copy);
      if (g.ao) BAKE_AO.value = g.ao;
      inst.computeBoundingSphere();
      this.changed();
    });
  }

  /** 0 day … 1 night: lit windows, street and path lamps, warm glazing of the other blocks */
  setNight(n: number) {
    this.night = n;
    this.ctx?.setNight(n);
    this.court?.setNight(n);
    if (this.glassNight) this.glassNight.emissiveIntensity = 0.55 * n;
  }
  /** the see-through corridor: from the camera to the point of the block nearest the orbit target; off = none */
  setFade(on: boolean, camera?: THREE.Vector3, target?: THREE.Vector3) {
    this.fadeOn.value = on ? 1 : 0;
    if (!on || !camera || !target) return;
    this.fadeCam.value.copy(camera);
    this.fadeTo.value.set(
      THREE.MathUtils.clamp(target.x, -BLOCK_W / 2, BLOCK_W / 2),
      THREE.MathUtils.clamp(target.y, 3, 45),
      THREE.MathUtils.clamp(target.z, -BLOCK_D / 2, BLOCK_D / 2),
    );
  }
  setTreesVisible(v: boolean) { this.trees.forEach((t) => (t.visible = v)); }

  /**
   * A camera spot (this block's frame) that does not stand inside a house, another block or a tree crown: the
   * given one, or the nearest clear one turning around the block (up to ±60°) and then nearer / further out.
   */
  clearSpot(pos: THREE.Vector3) {
    const ctx = this.ctx;
    if (!ctx) return pos;
    const toComplex = this.toBlock.clone().invert();
    const blocks = t4Blocks().filter((b) => b.id !== this.blockId).map((b) => t4Matrix(b).invert());
    const trees = [...ctx.treeSpots, ...(this.court?.treeSpots ?? [])];
    const houses = ctx.data.buildings.map((b) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < b.p.length; i += 2) { x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]); }
      return { p: b.p, h: b.f * 3 + 3, x0, x1, z0, z1 };
    });
    const c = new THREE.Vector3(), l = new THREE.Vector3();
    const blocked = (p: THREE.Vector3) => {
      c.copy(p).applyMatrix4(toComplex);
      const m = 2.5;
      for (const hs of houses) {
        if (p.y > hs.h || c.x < hs.x0 - m || c.x > hs.x1 + m || c.z < hs.z0 - m || c.z > hs.z1 + m) continue;
        if (inPoly(c.x, c.z, hs.p) || inPoly(c.x + m, c.z, hs.p) || inPoly(c.x - m, c.z, hs.p) || inPoly(c.x, c.z + m, hs.p) || inPoly(c.x, c.z - m, hs.p)) return true;
      }
      for (const inv of blocks) { l.copy(c).applyMatrix4(inv); if (p.y < 52 && l.x > -4 && l.x < BLOCK_W + 4 && l.z > -4 && l.z < BLOCK_D + 4) return true; }
      if (p.y < 16) for (const t of trees) if ((t.x - c.x) ** 2 + (t.z - c.z) ** 2 < 16) return true;
      return false;
    };
    const r0 = Math.hypot(pos.x, pos.z), a0 = Math.atan2(pos.z, pos.x), q = new THREE.Vector3();
    for (const k of [1, 0.85, 1.15, 0.7, 1.3]) for (const d of [0, 8, -8, 16, -16, 24, -24, 32, -32, 45, -45, 60, -60]) {
      const a = a0 + (d * Math.PI) / 180;
      q.set(Math.cos(a) * r0 * k, pos.y, Math.sin(a) * r0 * k);
      if (!blocked(q)) return q.clone();
    }
    return pos;
  }
}
