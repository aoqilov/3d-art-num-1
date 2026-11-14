// One renderer for the whole app: three.js WebGPURenderer (falls back to WebGL 2 by itself where WebGPU is
// missing). Materials stay plain three.js materials; the renderer turns them into node materials on first use.
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { dot, positionWorld, uniform } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
type NodeMat = THREE.Material & { maskNode?: unknown; isNodeMaterial?: boolean };

/** `material.clippingPlanes` → a mask node (the WebGPU renderer clips only through ClippingGroup). The planes
 *  are read every frame, so moving a plane (storey cutaway) needs no rebuild; shadows are clipped too. */
const keepOf = new WeakMap<THREE.Plane, AnyNode>();
function keep(p: THREE.Plane) {
  let k = keepOf.get(p);
  if (!k) {
    const n = uniform(p.normal.clone()).onRenderUpdate(() => p.normal);
    const c = uniform(p.constant).onRenderUpdate(() => p.constant);
    k = dot(positionWorld, n).add(c).greaterThanEqual(0) as unknown as AnyNode;
    keepOf.set(p, k);
  }
  return k;
}
export function clipMask(planes: THREE.Plane[]) {
  let m: AnyNode | null = null;
  for (const p of planes) m = m ? (m.and(keep(p)) as unknown as AnyNode) : keep(p);
  return m;
}

export function createRenderer(o: { antialias: boolean }) {
  // trackTimestamp: GPU time per frame for the stats panel (WebGPU timestamp queries, ignored where missing)
  const r = new WebGPURenderer({ antialias: o.antialias, powerPreference: 'high-performance', trackTimestamp: true });
  const lib = r.library as unknown as { fromMaterial(m: THREE.Material): NodeMat | null };
  const from = lib.fromMaterial.bind(lib);
  lib.fromMaterial = (m) => {
    const nm = from(m);
    if (nm && m.clippingPlanes?.length && !nm.maskNode) nm.maskNode = clipMask(m.clippingPlanes);
    return nm;
  };
  const init = r.init.bind(r);
  r.init = async () => { await init(); patchBuilder(r); return r; };
  return r;
}

/** three r187: a varying that flows into a shader stage without variables of its own finds `vars[stage]`
 *  undefined (the atmosphere's nodes hit this); give that stage an empty list. */
function patchBuilder(r: WebGPURenderer) {
  const backend = (r as unknown as { backend: { createNodeBuilder(o: THREE.Object3D, r: WebGPURenderer): object } }).backend;
  const proto = Object.getPrototypeOf(backend.createNodeBuilder(new THREE.Object3D(), r)) as {
    getVaryings(this: { vars: Record<string, unknown[]> }, stage: string): unknown; __varsPatched?: boolean;
  };
  if (proto.__varsPatched) return;
  const orig = proto.getVaryings;
  proto.getVaryings = function (stage) {
    if ((stage === 'vertex' || stage === 'fragment') && !this.vars[stage]) this.vars[stage] = [];
    return orig.call(this, stage);
  };
  proto.__varsPatched = true;
}
export type Renderer = WebGPURenderer;

/** The scene graph types accept node-material properties on plain materials (the renderer copies them over). */
export const nodes = (m: THREE.Material) => m as unknown as Record<string, unknown>;

/**
 * OrbitControls damping for a frame of dt seconds. The stock factor (0.05 per frame) depends on the frame rate: at
 * 16 FPS the camera kept drifting ~4 s after the mouse was let go. Time based instead, a short tail (~0.2 s) at any
 * frame rate: the camera stops where it was put.
 */
export const orbitDamping = (dt: number) => 1 - Math.exp(-Math.max(dt, 1 / 240) / 0.06);

/**
 * The orbit camera never goes under the land (the ground is y = 0 in both views): the orbit target stays on or above
 * it — panning down dragged it below and the camera followed — and the camera is lifted along with it, so the view
 * keeps its angle; the camera itself stays at least `eye` metres up. True when something was moved.
 */
export function keepAboveGround(cam: THREE.Vector3, target: THREE.Vector3, eye: number) {
  let moved = false;
  if (target.y < 0) { cam.y -= target.y; target.y = 0; moved = true; }
  if (cam.y < eye) { cam.y = eye; moved = true; }
  return moved;
}
