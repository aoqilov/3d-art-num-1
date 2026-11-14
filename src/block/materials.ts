// Shared material library for the type-4 block. Colours sampled from the architect's render.
import * as THREE from 'three';
import { attribute, frontFacing, output, select, texture, uv, vec2, vec4 } from 'three/tsl';
import { nodes } from '../three/gpu';
import { brickTex, latticeTex, plasterTex, roofTex, screenTex, signAtlas, tileTex, woodTex } from './textures';

export type MatName =
  | 'facade' | 'facade_mint' | 'facade_white' | 'brick' | 'paint' | 'paint_public' | 'tile_wall' | 'jamb' | 'cap'
  | 'ceiling' | 'floor_base' | 'floor_wood' | 'floor_tile' | 'floor_deck' | 'floor_stone' | 'floor_shop'
  | 'glass' | 'frame' | 'frame_light' | 'spandrel' | 'slab_edge' | 'rail' | 'rail_panel' | 'steel' | 'roof' | 'pilaster' | 'pilaster_tile'
  | 'lattice_white' | 'lattice_dark' | 'lattice_gold' | 'canopy' | 'sill' | 'door_wood' | 'door_entry' | 'stair'
  | 'granite' | 'sign';

export const COLORS = {
  mint: '#98d0ae',
  white: '#f1eee8',
  spandrel: '#5b6479',
  pilaster: '#c9ae94',
  brick: '#b49d82',
  gold: '#caa865',
  canopy: '#5b5d61',
};

let lib: Record<MatName, THREE.Material> | null = null;

/** Shared horizontal section plane: keeps geometry below `constant` (storey cutaway). */
export const CUT = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
/** colour of the cut (back) faces, like a plan section */
const CAPC = new THREE.Color().setRGB(0.184, 0.192, 0.208, THREE.SRGBColorSpace);
/** Make a material respect the cutaway and paint cut (back) faces like a plan section. */
export function prep<T extends THREE.Material>(m: T, cap = true): T {
  if (m.userData.prepped) return m;
  m.userData.prepped = true;
  m.clippingPlanes = [CUT];          // becomes a mask node in the renderer (three/gpu.ts), shadows included
  if (cap) {
    m.side = THREE.DoubleSide;
    nodes(m).outputNode = select(frontFacing, output, vec4(CAPC.r, CAPC.g, CAPC.b, 1));
    m.needsUpdate = true;
  }
  return m;
}

/** Ambient occlusion baked in Blender (tools/blender/block1.py): one map on the geometry's `uvb` set.
 *  White until the model arrives; enableBakedAO() switches the facade materials over to it. */
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;
export const BAKE_AO = texture(white);
const bakeable: THREE.Material[] = [];
function baked<T extends THREE.Material>(m: T): T { bakeable.push(m); return m; }
/** only for geometry that carries the `uvb` set (the Blender model) */
/** true for the materials that take the baked occlusion (the Blender model's opaque surfaces) */
export const isBaked = (m: THREE.Material) => bakeable.includes(m);
export function enableBakedAO() {
  for (const m of bakeable) { nodes(m).aoNode = BAKE_AO.sample(attribute('uvb', 'vec2')).g; m.needsUpdate = true; }
}

/** Balusters of a balcony railing (1.6 cm bars every 11 cm) painted on a see-through panel. As geometry they
 *  were thinner than a pixel a few metres away and shimmered as the camera moved; as a mipmapped texture they fade
 *  into a light veil with distance and stay crisp up close. Panel UVs are metres along the rail × height. */
function balusterTex() {
  const W = 64, H = 4, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bar = (W * 0.016) / 0.11;
  g.fillStyle = '#ffffff'; g.fillRect((W - bar) / 2, 0, bar, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.11, 1); t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
function railPanel() {
  const map = balusterTex();
  const m = new THREE.MeshStandardMaterial({ color: '#2d3038', alphaMap: map, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.5 });
  // shadows only where a bar is (the faint far-away veil casts none)
  nodes(m).maskShadowNode = texture(map, uv().mul(vec2(map.repeat.x, map.repeat.y))).g.greaterThan(0.5);
  return m;
}

function std(p: THREE.MeshStandardMaterialParameters) {
  return baked(new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...p }));
}

export function materials(): Record<MatName, THREE.Material> {
  if (lib) return lib;
  const plaster = plasterTex();
  const wood = woodTex(); wood.repeat.set(0.5, 0.5);
  const bathTile = tileTex('#d9d6d0', 'bath'); bathTile.repeat.set(1 / 1.2, 1 / 1.2);
  const stone = tileTex('#cfc8bd', 'stone'); stone.repeat.set(1 / 1.2, 1 / 1.2);
  const deck = tileTex('#a9a29a', 'deck', false); deck.repeat.set(1 / 1.2, 1 / 1.2);
  const wallTile = tileTex('#e8e4de', 'walltile'); wallTile.repeat.set(1 / 1.2, 1 / 1.2);
  const brick = brickTex();
  const sign = signAtlas().tex;
  const roof = roofTex(); roof.repeat.set(0.25, 0.25);
  const latW = screenTex(); latW.repeat.set(5.5, 5.5);
  const latD = latticeTex('#363b39', null, 'dark'); latD.repeat.set(3, 3);
  const latG = latticeTex('#4f4233', '#e0cda6', 'gold'); latG.repeat.set(2, 2);
  const latP = latticeTex('#fbf7f0', '#bfa184', 'pil'); latP.repeat.set(2.2, 2.2);

  lib = {
    facade: std({ color: COLORS.white, map: plaster }),
    facade_mint: std({ color: COLORS.mint, map: plaster }),
    facade_white: std({ color: COLORS.white, map: plaster }),
    brick: std({ color: '#ffffff', map: brick, roughness: 0.95 }),
    paint: std({ color: '#efe9e1', map: plaster, roughness: 0.95 }),
    paint_public: std({ color: '#e4e2dc', map: plaster }),
    tile_wall: std({ color: '#ffffff', map: wallTile, roughness: 0.45 }),
    jamb: std({ color: '#f4f1eb', roughness: 0.9 }),
    cap: std({ color: '#3a3c40', roughness: 1 }),
    ceiling: std({ color: '#f7f5f1', roughness: 1 }),
    floor_base: std({ color: '#b9b4ab', roughness: 1 }),
    floor_wood: std({ color: '#ffffff', map: wood, roughness: 0.6 }),
    floor_tile: std({ color: '#ffffff', map: bathTile, roughness: 0.4 }),
    floor_deck: std({ color: '#ffffff', map: deck, roughness: 0.9 }),
    floor_stone: std({ color: '#ffffff', map: stone, roughness: 0.5 }),
    floor_shop: std({ color: '#d2d0cb', map: plaster, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#3d6f95', metalness: 0.3, roughness: 0.04, transparent: true, opacity: 0.88,
      envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide,
    }),
    frame: std({ color: '#4a505c', roughness: 0.5, metalness: 0.3 }),
    frame_light: std({ color: '#e9e9e6', roughness: 0.6 }),
    spandrel: std({ color: COLORS.spandrel, roughness: 0.55, metalness: 0.15 }),
    slab_edge: std({ color: '#5d6270', roughness: 0.6 }),
    rail: std({ color: '#2d3038', roughness: 0.45, metalness: 0.5 }),
    rail_panel: railPanel(),
    steel: std({ color: '#b9bcc0', roughness: 0.3, metalness: 0.8 }),
    roof: std({ color: '#ffffff', map: roof, roughness: 1 }),
    pilaster: std({ color: '#ffffff', map: latP, roughness: 0.85 }),
    pilaster_tile: std({ color: COLORS.pilaster, roughness: 0.8 }),
    lattice_white: std({ color: '#ffffff', map: latW, side: THREE.DoubleSide, roughness: 0.8 }),
    lattice_dark: std({ color: '#ffffff', map: latD, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 }),
    lattice_gold: std({ color: '#ffffff', map: latG, roughness: 0.5, metalness: 0.35 }),
    canopy: std({ color: COLORS.canopy, roughness: 0.6, metalness: 0.2 }),
    sill: std({ color: '#f3f1ec', roughness: 0.5 }),
    door_wood: std({ color: '#d9cbb8', roughness: 0.6 }),
    door_entry: std({ color: '#3d3a38', roughness: 0.5, metalness: 0.4 }),
    stair: std({ color: '#cbc6be', map: plaster, roughness: 0.8 }),
    granite: std({ color: '#2b2c2f', roughness: 0.35, metalness: 0.1 }),
    sign: std({ color: '#e2bd72', map: sign, alphaTest: 0.45, roughness: 0.4, metalness: 0.5, emissive: '#ffc873', emissiveMap: sign, emissiveIntensity: 0.6 }),
  };
  // named: the Unreal export (tools/unreal) keeps the names, its scripts find the facade, the glass … by them
  for (const [k, m] of Object.entries(lib)) m.name ||= k;
  return lib;
}
