// "Shaxmatka" in 3D: every flat of the block as a solid volume coloured by sales status; filtered-out flats fade out.
import * as THREE from 'three';
import { FLOOR_H, FLOORS, planFor, type Poly } from './plan';
import type { Status } from './aptData';

export type VolState = Status | 'dim';
const COL: Record<Status, string> = { free: '#4fbf7f', reserved: '#e8b04b', sold: '#e0675f' };

function extrude(p: Poly, h: number) {
  const sh = new THREE.Shape(p.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of p.holes) sh.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  return g;
}

export function buildAptVolumes() {
  const group = new THREE.Group();
  const H = 2.62;
  const mats = {
    free: new THREE.MeshStandardMaterial({ color: COL.free, roughness: 0.45 }),
    reserved: new THREE.MeshStandardMaterial({ color: COL.reserved, roughness: 0.45 }),
    sold: new THREE.MeshStandardMaterial({ color: COL.sold, roughness: 0.45 }),
    dim: new THREE.MeshStandardMaterial({ color: '#c9d3ce', roughness: 0.6, transparent: true, opacity: 0.16, depthWrite: false }),
  };
  const hot = Object.fromEntries((['free', 'reserved', 'sold'] as Status[]).map((k) => [k, new THREE.MeshStandardMaterial({ color: COL[k], roughness: 0.4, emissive: COL[k], emissiveIntensity: 0.45 })])) as Record<Status, THREE.MeshStandardMaterial>;
  const selMat = new THREE.MeshStandardMaterial({ color: '#e9b949', roughness: 0.35, emissive: '#c98a1c', emissiveIntensity: 0.55 });
  const meshes: THREE.Mesh[] = [];
  const edgePos: number[] = [];
  for (let s = 2; s <= FLOORS; s++) {
    const p = planFor(s);
    p.apts.forEach((a, i) => {
      const g = extrude(a.outline, H);
      const m = new THREE.Mesh(g, mats.dim);
      m.position.y = (s - 1) * FLOOR_H + 0.2;
      m.userData.pick = { storey: s, index: i, label: a.label };
      m.castShadow = true; m.receiveShadow = true;
      meshes.push(m); group.add(m);
      const e = new THREE.EdgesGeometry(g, 30);
      const P = e.getAttribute('position');
      for (let k = 0; k < P.count; k++) edgePos.push(P.getX(k), P.getY(k) + m.position.y, P.getZ(k));
    });
  }
  const edges = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3)),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
  group.add(edges);
  // core, corridors and the shop floor as a pale glass mass so the flats read in context
  const restMat = new THREE.MeshStandardMaterial({ color: '#eef2ef', roughness: 0.7, transparent: true, opacity: 0.22, depthWrite: false });
  const shopMat = new THREE.MeshStandardMaterial({ color: '#e2c785', roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
  for (let s = 1; s <= FLOORS; s++) {
    for (const r of planFor(s).rest) {
      const m = new THREE.Mesh(extrude(r, H), s === 1 ? shopMat : restMat);
      m.position.y = (s - 1) * FLOOR_H + 0.2;
      group.add(m);
    }
  }
  const roof = new THREE.Mesh(extrude(planFor(3).footprint, 0.25), new THREE.MeshStandardMaterial({ color: '#f1efe9', transparent: true, opacity: 0.35, depthWrite: false }));
  roof.position.y = FLOORS * FLOOR_H;
  group.add(roof);
  group.visible = false;

  const paint = (state: (s: number, i: number) => VolState, hotKey: string | null, selKey: string | null) => {
    for (const m of meshes) {
      const { storey, index } = m.userData.pick;
      const st = state(storey, index);
      const key = `${storey}-${index}`;
      m.material = key === selKey ? selMat : st === 'dim' ? mats.dim : key === hotKey ? hot[st] : mats[st];
      m.castShadow = st !== 'dim';
    }
  };
  // energy heat map: any colour per flat (material cache by colour)
  const byColor = new Map<string, THREE.MeshStandardMaterial>();
  const paintColor = (color: (s: number, i: number) => string, selKey: string | null) => {
    for (const m of meshes) {
      const { storey, index } = m.userData.pick;
      const c = color(storey, index), sel = `${storey}-${index}` === selKey;
      const k = c + (sel ? '*' : '');
      let mat = byColor.get(k);
      if (!mat) { mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: sel ? '#ffffff' : c, emissiveIntensity: sel ? 0.35 : 0.12 }); byColor.set(k, mat); }
      m.material = mat; m.castShadow = true;
    }
  };
  return { group, meshes, paint, paintColor };
}
