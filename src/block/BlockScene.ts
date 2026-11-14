// Single-block viewer: exterior 1:1 from drawings, storey cutaway with apartment picking.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildStorey } from './floorGeom';
import { buildFacade, mintStorey, ROOF_Z } from './facade';
import { CUT, materials, prep, type MatName } from './materials';
import { BLOCK_D, BLOCK_W, FLOOR_H, FLOORS, SLAB, planFor, polyBounds, type FloorPlan } from './plan';
import { buildFurniture, furnitureMaterials } from './furniture';
import { Engineering, type EngInfo, type Sys } from './engineering';
import { CloudDome } from '../three/clouds';
import { Construction, LAYERS, STAGE_MAX, type ConPick, type Layer } from './construction';
import { aptEnergy, energyRange, heatColor, thermalSkin } from './energy';
import { mergedBlock } from './blockMerge';
import { buildNightLights, facadeGlow, FACADE_NIGHT } from './nightLights';
import { buildAptVolumes, type VolState } from './aptVolumes';
import { BLOCKS, TYPE4, PLAN_SIZE, blockTheta } from '../data/blocks';
import { FloorGrid, LIFTS, gridFor, type Place, type ViewSpot } from './walk';
import { Avatar } from './avatar';
import { EntryDoors } from './entryDoors';
import { Lighting } from './lighting';
import type { RoomKind } from './plan';
import { PMREMGenerator } from 'three/webgpu';
import { createRenderer, keepAboveGround, orbitDamping, type Renderer } from '../three/gpu';
import { DEFAULT_HOUR, HourGlide } from '../three/timeStops';
import { TREE_NIGHT } from '../three/glbTrees';
import { BlockSurroundings } from './surroundings';
import { LAMP_COUNT, LAMP_LIGHTS } from '../three/lamps';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import { renderStats } from '../three/stats';
import { SUN_DAY, daylight, sunDir } from '../three/sun';

export type AptPick = { storey: number; index: number; label: string };
export type LiftPhase = 'call' | 'open' | 'board' | 'select' | 'close' | 'move' | 'arrive' | 'leave';
export type WalkState = {
  storey: number; apt: number | null; place: Place; room: RoomKind | null; x: number; y: number; yaw: number;
  spot: number; spots: number; nearLift: number | null; stair: { up: boolean; down: boolean } | null;
  lift: { id: number; phase: LiftPhase; floor: number; to: number } | null; climbing: boolean;
  locked: boolean; lockFailed: boolean; lights: boolean;
  /** flat entrance door within reach (E opens / closes it) */
  door: { num: number; open: boolean } | null;
};
type Ride =
  | { kind: 'lift'; id: number; phase: LiftPhase; t: number; from: number; to: number; pts: [number, number][] }
  | { kind: 'stair'; pts: [number, number, number][]; seg: number; to: number };
type Callbacks = { onPick: (a: AptPick | null) => void; onHover: (a: AptPick | null, x: number, y: number) => void; onWalk?: (w: WalkState | null) => void; onPro?: (p: ProState) => void; onEng?: (i: EngInfo | null, x: number, y: number) => void; onCon?: (p: ConPick | null) => void; onEnergy?: (p: EnergyPick | null) => void };
export type EnergyPick = { storey: number; index: number } | { mat: string; storey: number };

/** High-end renderer of the PRO (sales office) build: HDR sky, PBR textures, AO, bloom. */
export type ProState = { pt: boolean; samples: number; target: number; busy: boolean; canPT: boolean; ao: boolean; bloom: boolean; ready: boolean };
export interface ProRenderer {
  frame(changed: boolean): boolean;                       // draw; true = keep calling (progressive render)
  /** moving: a frame of a time glide (the classic sky is then computed at a lower resolution) */
  hour(i: { sunDir: THREE.Vector3; nightF: number; dusk: number; dayK: number; hour: number; moving?: boolean }): void;
  resize(w: number, h: number): void;
  furniture(g: THREE.Object3D): void;
  set(o: Partial<{ pt: boolean; ao: boolean; bloom: boolean }>): void;
  dispose(): void;
}
export type ProInternals = {
  renderer: Renderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight;
  isCut: () => boolean; redraw: () => void; emit: (p: ProState) => void; hidden: () => THREE.Object3D[];
  /** Real lights of the lit fixtures around the visitor (path tracer); the raster pool is flagged userData.pool. */
  lights?: () => THREE.Light[];
  /** True during the walk: interior exposure and bloom instead of the night-sky settings. */
  interior?: () => boolean;
  /** drawn on top of the finished frame (block numbers of the complex view) */
  overlay?: THREE.Scene;
  /** the cloud layer (composited over the sky by the Ultra renderer) */
  clouds?: { mesh: THREE.Mesh; setCover(c: number): void };
  /** rotation from this scene's frame to the complex frame (the physical sky is placed on the earth) */
  worldToComplex?: THREE.Matrix4;
  /** the physical atmosphere (sky, sun, haze); otherwise the classic sky texture and fog */
  atmosphere?: boolean;
};
export const PRO: { create?: (i: ProInternals) => ProRenderer; sunLight?: (distance: number) => THREE.DirectionalLight } = {};

const cut = CUT;

function prepMaterials() {
  const lib = materials();
  for (const [name, m] of Object.entries(lib)) prep(m as THREE.Material, name !== 'glass' && name !== 'lattice_white' && name !== 'lattice_dark' && name !== 'rail_panel');
  facadeGlow(lib);
  return lib;
}

const SKY = document.createElement('canvas'); SKY.width = 4; SKY.height = 256;
function paintSky(top: string, mid: string, bottom: string) {
  const g = SKY.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
}
function skyTexture() {
  paintSky('#3f6fa8', '#86a9cc', '#dfe7ea');
  const t = new THREE.CanvasTexture(SKY); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lerpC = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

export class BlockScene {
  private renderer: Renderer;
  /** the WebGPU backend initialises asynchronously; nothing is drawn before */
  private ready = false;
  private scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private block = new THREE.Group();
  private storeys: THREE.Mesh[] = [];
  private decor: THREE.Object3D[] = [];
  private whole!: THREE.Mesh;
  private picks = new THREE.Group();
  private outlines = new THREE.Group();   // gold border on the cut wall tops of the hovered / selected flat
  private furniture = new THREE.Group();
  private ray = new THREE.Raycaster();
  private raf = 0;
  private ro: ResizeObserver;
  private storey: number | null = null;
  private hovered: AptPick | null = null;
  private selected: AptPick | null = null;
  private down = { x: 0, y: 0 };
  private goal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private dirty = true;
  /**
   * Draws only when something changed, but keeps drawing until this time: the first frames came before the
   * atmosphere, the materials and the models were ready, and the Ultra view stayed on a black frame until the
   * mouse moved. 6 s after opening, a few seconds after each load (the atmosphere's tables: ProRenderer).
   */
  private awake = 0;
  private wake(ms: number) { this.dirty = true; this.awake = Math.max(this.awake, performance.now() + ms); }

  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private night = buildNightLights();
  private vols: ReturnType<typeof buildAptVolumes> | null = null;
  private aptMode = false;
  private trees: THREE.Object3D[] = [];
  private ctx: THREE.Group | null = null;
  private ctxCentre = new THREE.Vector3();
  private volState: (s: number, i: number) => VolState = () => 'dim';
  private volHot: string | null = null;
  private generic: THREE.Object3D | null = null;
  // first-person walk
  private walk: { grid: FloorGrid; storey: number; x: number; y: number; z: number; yaw: number; pitch: number;
    path: [number, number][]; endYaw: number | null; apt: number | null; place: Place; room: RoomKind | null;
    spots: ViewSpot[]; spotsOf: number | null; spot: number; sent: number; ride: Ride | null } | null = null;
  private keys = new Set<string>();
  private pad = { f: 0, s: 0, t: 0 };
  private last = performance.now();
  private ring: THREE.Mesh | null = null;
  private lamp = new THREE.PointLight('#ffe0b5', 0, 11, 1.4);
  /** Soft inter-reflection stand-in while fixtures light the interior at night (raster only). */
  private bounce = new THREE.AmbientLight('#fff1e4', 0);
  private ctxBoxes = new Map<number, THREE.Object3D[]>();
  private ctxGhost: THREE.MeshStandardMaterial | null = null;
  private ctxSprites: THREE.Sprite[] = [];
  private doorYaw = 0;
  private drag = { x: 0, y: 0, moved: 0 };
  private nightF = 0;
  // visitor: first / third person, body size, game-style WASD with mouse look
  private avatar = new Avatar();
  private third = false;
  private body = { h: 1.75, w: 0.45 };
  private wasd = false;
  private locked = false;
  private lockFailed = false;
  private unlockedAt = 0;
  private camDist = 2.6;
  // lifts: landing doors on every storey (instanced) + one cabin per lift
  private liftDoors: THREE.InstancedMesh | null = null;
  private entryDoors: EntryDoors | null = null;
  // engineering view (schematic MEP networks; building ghosted)
  private eng: Engineering | null = null;
  private engOn = false;
  private ghostSaved = new Map<THREE.Material, { t: boolean; o: number; d: boolean }>();
  // construction view (structure and materials, stages, rebar)
  private con: Construction | null = null;
  private conOn = false;
  private clouds = new CloudDome();
  // energy view: flats as a heat map, or the construction model in thermal-camera colours
  private enOn = false;
  private en = { view: 'flats' as 'flats' | 'thermal', insul: true, season: 'winter' as 'winter' | 'summer', sel: null as string | null };
  private grass: THREE.Mesh | null = null;
  /** the real surroundings (surroundings.ts): ground, streets, courtyard, neighbourhood, other blocks, outer city */
  private sur: BlockSurroundings | null = null;
  private lighting: Lighting | null = null;
  private lightsOverride: boolean | null = null;
  private doorOpen = new Map<string, number>();
  private doorAnim = new Map<string, { a: number; b: number; t: number; d: number }>();
  private cabins: THREE.Group[] = [];
  private cabinLeaves: THREE.Mesh[][] = [];
  readonly detailed: boolean;
  hour = DEFAULT_HOUR;
  /** the hour glides between the time stops (timeStops.ts) */
  private glide = new HourGlide(DEFAULT_HOUR);
  private pro: ProRenderer | null = null;
  private proWants = false;

  constructor(private el: HTMLElement, private cb: Callbacks, readonly blockId = 1) {
    this.detailed = TYPE4.includes(blockId);
    this.renderer = createRenderer({ antialias: !PRO.create });   // Ultra: TRAA instead of MSAA
    // Ultra: every street and path lamp of the surroundings is a real light; clustered (Forward+) lighting keeps them cheap
    const lamps = !!PRO.create && !location.search.includes('nolamps');     // ?nolamps: without them (comparison)
    LAMP_LIGHTS.real = lamps; LAMP_COUNT.n = 0;
    if (lamps) (this.renderer as unknown as { lighting: unknown }).lighting = new ClusteredLighting(1024);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    el.appendChild(this.renderer.domElement);

    // mirrors reflect an interior of their own, so they stay bright at night when the sky light is dimmed
    const mirror = furnitureMaterials().mirror as THREE.MeshStandardMaterial;
    mirror.envMapIntensity = 0.85; mirror.color.set('#dfe5e8');
    void this.renderer.init().then(() => {
      const room = new PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      mirror.envMap = room; mirror.needsUpdate = true;
      if (!this.pro) this.scene.environment = room;        // PRO lights the scene with its sky instead
      this.ready = true; this.wake(6000);
    });
    THREE.DefaultLoadingManager.onStart = THREE.DefaultLoadingManager.onProgress = () => this.wake(6000);
    this.scene.environmentIntensity = 0.55;
    this.scene.background = skyTexture();
    this.scene.add(this.clouds.mesh);
    this.scene.fog = new THREE.Fog('#dfe7ea', 260, 700);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.3, 4000);   // the outer city reaches ~1.8 km
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.6; // allow the low, looking-up street view of the render
    this.controls.minDistance = 6;
    this.controls.maxDistance = 520;
    this.controls.addEventListener('start', () => { this.goal = null; this.userMoved = true; });
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.view('render', true);

    this.addLights();
    this.buildBlock();
    this.addGround();
    this.scene.add(this.block);
    this.block.add(this.picks, this.outlines, this.furniture);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY }; this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKey);
    this.scene.add(this.lamp, this.bounce);
    this.scene.add(this.avatar.group);
    this.avatar.setSize(this.body.h, this.body.w);
    document.addEventListener('pointerlockchange', this.onLock);
    document.addEventListener('pointerlockerror', this.onLockError);
    document.addEventListener('mousemove', this.onLockMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointermove', this.onMove);
    if (PRO.create) {
      this.pro = PRO.create({
        renderer: this.renderer, scene: this.scene, camera: this.camera, sun: this.sun, hemi: this.hemi,
        isCut: () => CUT.constant < 1e3 || this.aptMode,
        redraw: () => (this.dirty = true),
        emit: (p) => this.cb.onPro?.(p),
        hidden: () => [this.ring, this.picks, this.outlines, this.night.decals].filter(Boolean) as THREE.Object3D[],   // scallop decals: raster only
        interior: () => !!this.walk,
        clouds: this.clouds, atmosphere: true,
        worldToComplex: new THREE.Matrix4().makeRotationY(blockTheta(BLOCKS.find((b) => b.id === this.blockId)!)),
        lights: () => {
          const w = this.walk; if (!this.lighting || !w) return [];
          const g = w.grid;
          return this.lighting.allLights({ storey: w.storey, x: w.x, y: w.y, apt: w.apt, sees: (a, b, c, d) => g.sees(a, b, c, d) });
        },
      });
    }
    this.applyHour(this.hour);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.loop();
  }

  private addLights() {
    this.hemi = new THREE.HemisphereLight('#dfeaf6', '#8a8f7c', 0.75);
    this.scene.add(this.hemi);
    // Ultra: the atmosphere's sun (colour and strength from the air it crosses); otherwise a plain light
    const sun = PRO.sunLight ? PRO.sunLight(125) : new THREE.DirectionalLight('#ffeacc', 3.4);
    sun.color.set('#ffeacc'); sun.intensity = 3.4;
    this.sun = sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    // Ultra: cascaded shadows (sharp at the camera, the neighbours and trees further out too); otherwise one map over
    // the block and its nearest neighbours
    const s = PRO.create ? 42 : 95;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 20, far: 300 });
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.04;
    sun.target.position.set(0, 20, 0);
    this.scene.add(sun, sun.target);
    if (PRO.create && !location.search.includes('nocsm')) {
      const csm = new CSMShadowNode(sun, { cascades: 3, maxFar: 600, mode: 'practical', lightMargin: 150 });
      csm.fade = true;
      (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = csm;
    }
  }

  /** The real surroundings of the complex view around this block (surroundings.ts). */
  private addGround() {
    const sur = (this.sur = new BlockSurroundings(this.blockId, () => this.wake(4000)));
    this.grass = sur.groundMesh;
    this.scene.add(sur.groundMesh, sur.group);
    if (sur.blocks) this.scene.add(sur.blocks);
    void sur.ready.then(() => {
      this.trees = [...sur.trees];
      const site = !!this.ctx?.visible;
      this.trees.forEach((t) => (t.visible = !site && (!this.aptMode || !!this.walk)));
      sur.setNight(this.nightF);
      if (this.lastView && !this.userMoved && !this.walk && !this.ctx?.visible) this.view(this.lastView, true);
      this.dirty = true;
    });
    // the haze moves out so the outer city shows (classic sky; the physical one has its own aerial perspective)
    void sur.outerReady.then((ok) => { if (ok && !this.pro) { const f = this.scene.fog as THREE.Fog; f.near = 600; f.far = 2600; } this.dirty = true; });
  }
  /** the real surroundings, or (site view) the master-plan picture with pale blocks */
  private showSur(v: boolean) {
    const s = this.sur; if (!s) return;
    s.group.visible = v; if (s.blocks) s.blocks.visible = v;
  }

  private meshFrom(geometry: THREE.BufferGeometry, mats: MatName[], storey: number) {
    const lib = prepMaterials();
    const arr = mats.map((m) => (m === 'facade' ? (mintStorey(storey) ? lib.facade_mint : lib.facade_white) : lib[m]));
    const mesh = new THREE.Mesh(geometry, arr);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildBlock() {
    if (!this.detailed) { this.buildGeneric(); return; }
    const s1 = buildStorey(planFor(1), 1);
    const s2 = buildStorey(planFor(2), 2);
    const s3 = buildStorey(planFor(3), 3);
    for (let s = 1; s <= FLOORS; s++) {
      const src = s === 1 ? s1 : s === 2 ? s2 : s3;
      const m = this.meshFrom(src.geometry, src.mats, s);
      m.position.y = (s - 1) * FLOOR_H;
      m.userData.storey = s;
      this.storeys.push(m);
      this.block.add(m);
    }
    const fac = buildFacade();
    const lib = prepMaterials();
    const dm = this.meshFrom(fac.main.geometry, fac.main.mats, 16);
    this.decor.push(dm); this.block.add(dm);
    for (const e of fac.extra) {
      const m = new THREE.Mesh(e.geometry, lib[e.mat]);
      m.castShadow = e.mat !== 'glass'; m.receiveShadow = true;
      this.decor.push(m); this.block.add(m);
    }
    const mg = mergedBlock(false);
    this.whole = new THREE.Mesh(mg.geometry, mg.materials);
    this.whole.castShadow = this.whole.receiveShadow = true;
    this.block.add(this.whole);
    this.block.add(this.night.group, this.night.fixtures);
    this.buildLifts();
    this.entryDoors = new EntryDoors(this.blockId);
    this.block.add(this.entryDoors.group);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.lighting = PRO.create ? new Lighting(12, 4) : coarse ? new Lighting(4, 1) : new Lighting(8, 2);
    if (PRO.create) { this.lighting.gain = 0.5; this.lighting.lensGain = 0.55; }   // neutral tone mapping + bloom
    this.block.add(this.lighting.group, this.lighting.rig);
    this.block.position.set(-BLOCK_W / 2, 0, -BLOCK_D / 2);
    this.applyMode();
  }

  /** Blocks without drawings yet: massing with the complex's facade language (same footprint as the master plan). */
  private buildGeneric() {
    const def = BLOCKS.find((b) => b.id === this.blockId)!;
    const W = Math.max(def.w, def.d), D = Math.min(def.w, def.d);
    const lib = prepMaterials();
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(W, 45, D), [lib.facade_white, lib.facade_white, lib.roof, lib.ceiling, lib.facade_white, lib.facade_white]);
    tower.position.y = 3 + 22.5;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 3, D + 0.4), lib.brick);
    pod.position.y = 1.5;
    g.add(tower, pod);
    // window strips on both long sides
    const strip = new THREE.BoxGeometry(1.4, 45, 0.04);
    const n = Math.floor(W / 3.2);
    for (let i = 0; i < n; i++) for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(strip, lib.spandrel);
      m.position.set(-W / 2 + (W / n) * (i + 0.5), 3 + 22.5, sz * (D / 2 + 0.021));
      g.add(m);
    }
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.generic = g;
    this.scene.add(g);
    this.whole = new THREE.Mesh();
  }

  private applyMode() {
    if (!this.detailed) return;
    if (this.liftDoors) this.liftDoors.visible = !this.aptMode;
    if (this.entryDoors) this.entryDoors.group.visible = !this.aptMode;
    if (this.lighting) this.lighting.group.visible = !this.aptMode;
    this.cabins.forEach((c) => (c.visible = !!this.walk));
    if (this.walk) {
      this.whole.visible = true; this.decor.forEach((d) => (d.visible = false));
      this.storeys.forEach((m) => (m.visible = false));
      this.night.group.visible = false;
      return;
    }
    this.night.group.visible = true;
    const s = this.storey;
    if (this.aptMode) {
      this.whole.visible = false; this.decor.forEach((d) => (d.visible = false));
      this.storeys.forEach((m) => (m.visible = false));
      this.night.group.visible = false;
      return;
    }
    this.whole.visible = s === null && !this.conOn && !this.enOn;
    this.furniture.visible = !this.engOn && !this.conOn && !this.enOn;
    if (this.conOn || this.enOn) {
      this.decor.forEach((d) => (d.visible = false));
      this.storeys.forEach((m) => (m.visible = false));
      if (this.entryDoors) this.entryDoors.group.visible = false;
      if (this.liftDoors) this.liftDoors.visible = false;
      if (this.lighting) this.lighting.group.visible = false;
      this.night.group.visible = false;
      return;
    }
    if (this.engOn) {
      if (this.entryDoors) this.entryDoors.group.visible = false;
      if (this.liftDoors) this.liftDoors.visible = false;
      if (this.lighting) this.lighting.group.visible = false;
      this.night.group.visible = false;
    }
    this.entryDoors?.show(s !== null ? [s] : []);
    this.lighting?.show(s);
    this.storeys.forEach((m) => { m.visible = s !== null && m.userData.storey <= s; m.castShadow = s !== null && m.userData.storey >= s - 1; });
    this.decor.forEach((d) => (d.visible = s !== null));
  }

  // ---------- public API ----------
  view(kind: 'render' | 'aerial' | 'court' | 'top' | 'side', instant = false) {
    const V = {
      // spots in the real surroundings: on the verge in front of the street facade, over the courtyard
      render: { pos: new THREE.Vector3(20, 1.7, -55), target: new THREE.Vector3(-2, 23, 0) },
      aerial: { pos: new THREE.Vector3(-70, 80, -85), target: new THREE.Vector3(0, 18, 0) },
      court: { pos: new THREE.Vector3(-25, 18, 70), target: new THREE.Vector3(0, 18, 0) },
      top: { pos: new THREE.Vector3(-18, 125, -40), target: new THREE.Vector3(0, 10, 0) },
      side: { pos: new THREE.Vector3(-95, 30, 8), target: new THREE.Vector3(0, 22, 0) },
    }[kind];
    // in the real surroundings: a spot clear of houses, the other blocks and tree crowns (taken again once they load)
    const pos = (this.sur?.clearSpot(V.pos) ?? V.pos).clone();
    // within the orbit's tilt limit (an unreachable goal would keep pulling the camera for ever)
    const sp = new THREE.Spherical().setFromVector3(pos.clone().sub(V.target));
    sp.phi = Math.min(sp.phi, this.controls.maxPolarAngle - 0.01);
    pos.setFromSpherical(sp).add(V.target);
    this.lastView = kind; this.userMoved = false;
    if (instant) { this.goal = null; this.camera.position.copy(pos); this.controls.target.copy(V.target); this.controls.update(); }
    else this.goal = { pos: pos.clone(), target: V.target.clone() };
    this.dirty = true;
  }
  private lastView: Parameters<BlockScene['view']>[0] | null = null;
  private userMoved = false;
  private goalFrames = 0;

  currentStorey() { return this.storey; }

  /** Site context: master plan on the ground and the other 19 blocks as pale silhouettes, aligned to this block. */
  setContext(on: boolean) {
    if (on && !this.ctx) this.ctx = this.buildContext();
    if (on) this.ctxStyle(false);
    if (this.ctx) this.ctx.visible = on;
    this.showSur(!on);
    if (on) this.trees.forEach((t) => (t.visible = false));
    else if (!this.aptMode) this.trees.forEach((t) => (t.visible = true));
    this.dirty = true;
  }
  private buildContext() {
    const def = BLOCKS.find((b) => b.id === this.blockId)!;
    const g = new THREE.Group();
    const m = new THREE.Matrix4().makeRotationY(-blockTheta(def)).multiply(new THREE.Matrix4().makeTranslation(-def.x, 0, -def.z));
    g.matrixAutoUpdate = false; g.matrix.copy(m);
    const tex = new THREE.TextureLoader().load('plan_ctx.jpg', () => (this.dirty = true));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(PLAN_SIZE.w, PLAN_SIZE.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    plan.rotation.x = -Math.PI / 2; plan.position.y = 0.04; plan.receiveShadow = true;
    g.add(plan);
    const ghost = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.8, transparent: true, opacity: 0.55 });
    this.ctxGhost = ghost;
    const edgeM = new THREE.LineBasicMaterial({ color: '#c9a564' });
    for (const b of BLOCKS) {
      if (b.id === this.blockId) continue;
      const geo = facadeBox(b.w, 49, b.d);
      const box = new THREE.Mesh(geo, ghost);
      box.userData.ghost = true;
      box.position.set(b.x, 24.5, b.z); box.rotation.y = b.rot; box.castShadow = true;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeM);
      e.position.copy(box.position); e.rotation.copy(box.rotation);
      g.add(box, e);
      this.ctxBoxes.set(b.id, [box, e]);
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d')!;
      x.fillStyle = '#0e3326'; x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill();
      x.lineWidth = 6; x.strokeStyle = '#e2c785'; x.stroke();
      x.fillStyle = '#fff'; x.font = '700 54px Montserrat, system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(b.id), 64, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
      sp.scale.set(8, 8, 1); sp.position.set(b.x, 56, b.z); sp.renderOrder = 10;
      g.add(sp);
      this.ctxSprites.push(sp);
    }
    // north arrow on the ground (master plan is north-up)
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = '#e2c785'; x.beginPath(); x.moveTo(128, 18); x.lineTo(190, 200); x.lineTo(128, 165); x.lineTo(66, 200); x.closePath(); x.fill();
    x.fillStyle = '#0e3326'; x.font = '700 70px Montserrat, system-ui'; x.textAlign = 'center'; x.fillText('N', 128, 150);
    const nt = new THREE.CanvasTexture(c); nt.colorSpace = THREE.SRGBColorSpace;
    const n = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: nt, transparent: true }));
    n.rotation.x = -Math.PI / 2; n.position.set(0, 0.08, -PLAN_SIZE.d / 2 - 22);
    g.add(n);
    this.ctxCentre.set(0, 0, 0).applyMatrix4(m);
    this.scene.add(g);
    return g;
  }
  /** Site view look: master-plan picture with the other blocks as pale see-through massing (the window view shows
   *  the real surroundings instead, surroundings.ts). */
  private ctxStyle(solid: boolean) {
    if (!this.ctx || !this.ctxGhost || solid) return;
    this.ctxGhost.transparent = true; this.ctxGhost.opacity = 0.55; this.ctxGhost.color.set('#f4f2ec'); this.ctxGhost.needsUpdate = true;
    for (const [, objs] of this.ctxBoxes) { objs.forEach((o) => (o.visible = true)); (objs[0] as THREE.Mesh).material = this.ctxGhost; }
    for (const sp of this.ctxSprites) { sp.material.depthTest = false; sp.material.needsUpdate = true; }
  }

  /** Camera over the whole complex with this block in it. */
  viewSite() {
    if (!this.ctx) this.ctx = this.buildContext();
    const c = this.ctxCentre;
    this.goal = { pos: new THREE.Vector3(c.x * 0.5 - 40, 230, c.z * 0.5 + 190), target: new THREE.Vector3(c.x * 0.5, 0, c.z * 0.5) };
    this.dirty = true;
  }

  /** Apartments ("shaxmatka") mode: building replaced by status-coloured flat volumes. */
  setAptMode(on: boolean) {
    if (!this.detailed) return;
    if (on && !this.vols) { this.vols = buildAptVolumes(); this.block.add(this.vols.group); }
    this.aptMode = on;
    if (on) { this.storey = null; CUT.constant = 1e4; this.picks.clear(); this.outlines.clear(); this.furniture.clear(); }
    if (this.vols) this.vols.group.visible = on;
    this.trees.forEach((t) => (t.visible = !on));
    this.applyMode();
    this.applyHour(this.hour);
    this.repaintVols();
  }
  paintApts(state: (s: number, i: number) => VolState, hot: { storey: number; index: number } | null) {
    this.volState = state;
    this.volHot = hot ? `${hot.storey}-${hot.index}` : null;
    this.repaintVols();
  }
  private repaintVols() {
    if (!this.vols) return;
    const hk = this.hovered && this.aptMode ? `${this.hovered.storey}-${this.hovered.index}` : null;
    this.vols.paint(this.volState, hk, this.volHot);
    this.dirty = true;
  }
  /** Fly to one flat volume (apartments mode). */
  focusApt(storey: number, index: number) {
    const plan = planFor(storey);
    const o = plan.apts[index].outline.outer;
    const cx = o.reduce((a, p) => a + p[0], 0) / o.length - BLOCK_W / 2, cz = o.reduce((a, p) => a + p[1], 0) / o.length - BLOCK_D / 2;
    const y = (storey - 1) * FLOOR_H + 1.4;
    const side = cz < 0 ? -1 : 1;
    this.goal = { pos: new THREE.Vector3(cx - 24, y + 20, cz + side * 52), target: new THREE.Vector3(cx, y, cz) };
    this.dirty = true;
  }

  /** Dollhouse close-up inside one flat: cut at its storey and drop the camera just above the walls. */
  enterApt(storey: number, index: number) {
    if (!this.detailed) return;
    if (this.storey !== storey) this.setStorey(storey);
    this.selectApt(index);
    const plan = planFor(storey);
    const b = plan.apts[index].rooms.map((ri) => polyBounds(plan.rooms[ri].poly)).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }));
    const cx = (b.x0 + b.x1) / 2 - BLOCK_W / 2, cz = (b.y0 + b.y1) / 2 - BLOCK_D / 2;
    const y = (storey - 1) * FLOOR_H;
    const side = cz < 0 ? -1 : 1;
    this.goal = { pos: new THREE.Vector3(cx - 1.5, y + 7.5, cz + side * 4.5), target: new THREE.Vector3(cx, y + 0.6, cz) };
    this.dirty = true;
  }

  // ---------- lifts ----------
  private buildLifts() {
    const lib = prepMaterials();
    const n = FLOORS * LIFTS.length * 2;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lib.steel, n);
    inst.castShadow = false; inst.receiveShadow = true; inst.frustumCulled = false;
    this.liftDoors = inst; this.block.add(inst);
    for (let st = 1; st <= FLOORS; st++) for (const l of LIFTS) this.setDoor(st, l.id, 0);
    // cabins
    const steel = new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 0.55, roughness: 0.38, envMapIntensity: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6a4c', roughness: 0.55 });
    const mirror = new THREE.MeshStandardMaterial({ color: '#7d8590', metalness: 0.6, roughness: 0.22, envMapIntensity: 0.35 });
    const brushed = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d')!;
      x.fillStyle = '#b4b9be'; x.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 64; i++) { x.fillStyle = `rgba(${i % 3 ? 255 : 60},${i % 3 ? 255 : 60},${i % 3 ? 255 : 60},${0.04 + Math.random() * 0.06})`; x.fillRect(i, 0, 1, 256); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: brushed, metalness: 0.5, roughness: 0.42, envMapIntensity: 0.5 });
    const seam = new THREE.MeshBasicMaterial({ color: '#1c1f22' });
    const floor = new THREE.MeshStandardMaterial({ color: '#2f3033', roughness: 0.35, metalness: 0.1 });
    const ceil = new THREE.MeshStandardMaterial({ color: '#f4f1ea', emissive: '#fff4dc', emissiveIntensity: 0.55 });
    const trim = new THREE.MeshStandardMaterial({ color: '#c9a564', metalness: 0.8, roughness: 0.3 });
    const panel = new THREE.MeshStandardMaterial({ color: '#1d2024', roughness: 0.4, metalness: 0.4, emissive: '#e2c785', emissiveIntensity: 0.25 });
    const H = 2.45;
    for (const l of LIFTS) {
      const g = new THREE.Group();
      const c = l.cab, w = c.x1 - c.x0, d = c.y1 - c.y0, cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      const plane = (mat: THREE.Material, pw: number, ph: number, x: number, y: number, z: number, ry: number, rx = 0) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat); m.position.set(x, z, y); m.rotation.set(rx, ry, 0, 'YXZ'); g.add(m); return m;
      };
      const z0 = SLAB + 0.01;
      plane(floor, w, d, cx, cy, z0, 0, -Math.PI / 2);
      plane(ceil, w, d, cx, cy, z0 + H, 0, Math.PI / 2);
      plane(mirror, d, H, c.x0, cy, z0 + H / 2, Math.PI / 2);                 // back wall faces +x
      plane(wood, w, H, cx, c.y0, z0 + H / 2, 0);                             // faces +y
      plane(wood, w, H, cx, c.y1, z0 + H / 2, Math.PI);                       // faces -y
      const dh = 2.15, dy0 = l.door.y0 + 0.02, dy1 = l.door.y1 - 0.02;
      if (dy0 - c.y0 > 0.01) plane(steel, dy0 - c.y0, H, c.x1, (c.y0 + dy0) / 2, z0 + H / 2, -Math.PI / 2);
      if (c.y1 - dy1 > 0.01) plane(steel, c.y1 - dy1, H, c.x1, (dy1 + c.y1) / 2, z0 + H / 2, -Math.PI / 2);
      plane(steel, dy1 - dy0, H - dh, c.x1, (dy0 + dy1) / 2, z0 + dh + (H - dh) / 2, -Math.PI / 2);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, d - 0.3), trim); rail.position.set(c.x0 + 0.06, z0 + 0.92, cy); g.add(rail);
      const pan = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.02), panel); pan.position.set(c.x1 - 0.2, z0 + 1.15, c.y1 - 0.012); g.add(pan);
      const leaves: THREE.Mesh[] = [];
      for (let k = 0; k < 2; k++) {
        const lf = new THREE.Mesh(new THREE.BoxGeometry(0.025, dh, (dy1 - dy0) / 2 + 0.004), leafMat); lf.position.set(c.x1 - 0.03, z0 + dh / 2, 0);
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.006, dh), seam); sm.rotation.y = -Math.PI / 2; sm.position.set(-0.0135, 0, k === 0 ? (dy1 - dy0) / 4 : -(dy1 - dy0) / 4); lf.add(sm);
        g.add(lf); leaves.push(lf);
      }
      g.visible = false;
      this.block.add(g); this.cabins.push(g); this.cabinLeaves.push(leaves);
      this.placeCabin(l.id, 1, 0);
    }
  }
  /** Landing doors of one lift on one storey: 0 closed … 1 open (leaves slide into the wall). */
  private setDoor(st: number, id: number, a: number) {
    const l = LIFTS[id], inst = this.liftDoors; if (!inst) return;
    this.doorOpen.set(`${st}-${id}`, a);
    const head = st === 1 ? 2.55 : 2.3, h = head - SLAB, span = l.door.y1 - l.door.y0, lw = span / 2 + 0.015;
    const m = new THREE.Matrix4(), base = (st - 1) * FLOOR_H;
    for (let k = 0; k < 2; k++) {
      const yc = k === 0 ? l.door.y0 + span / 4 - a * span / 2 : l.door.y1 - span / 4 + a * span / 2;
      m.makeScale(0.03, h, lw).setPosition(l.door.x, base + SLAB + h / 2, yc);
      inst.setMatrixAt(((st - 1) * LIFTS.length + id) * 2 + k, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (this.walk?.ride?.kind === 'lift' && this.walk.ride.id === id) this.cabinDoor(id, a);
    this.dirty = true;
  }
  private cabinDoor(id: number, a: number) {
    const l = LIFTS[id], span = l.door.y1 - l.door.y0 - 0.04;
    this.cabinLeaves[id].forEach((lf, k) => (lf.position.z = k === 0 ? l.door.y0 + 0.02 + span / 4 - a * span / 2 : l.door.y1 - 0.02 - span / 4 + a * span / 2));
  }
  private placeCabin(id: number, st: number, door: number) {
    this.cabins[id].position.y = (st - 1) * FLOOR_H;
    this.cabinDoor(id, door);
  }
  private animDoor(st: number, id: number, to: number, d = 1.1) {
    const k = `${st}-${id}`;
    this.doorAnim.set(k, { a: this.doorOpen.get(k) ?? 0, b: to, t: 0, d });
  }
  private tickDoors(dt: number) {
    for (const [k, an] of this.doorAnim) {
      an.t = Math.min(an.d, an.t + dt);
      const u = an.t / an.d, e = u * u * (3 - 2 * u);
      const [st, id] = k.split('-').map(Number);
      this.setDoor(st, id, an.a + (an.b - an.a) * e);
      if (an.t >= an.d) this.doorAnim.delete(k);
    }
  }

  // ---------- first-person walk ----------
  /** Inside a flat. */
  startWalk(storey: number, index: number) {
    if (!this.detailed || storey < 2) return;
    const p = gridFor(storey, this.radius()).startApt(index);
    this.beginWalk(storey, p.x, p.y, p.yaw);
  }
  /** On a storey's lift hall; storey 1 starts in the courtyard in front of the entrance. */
  startHall(storey: number) {
    if (!this.detailed) return;
    const g = gridFor(storey, this.radius());
    const p = storey === 1 ? g.startYard() : g.startHall();
    this.beginWalk(storey, p.x, p.y, p.yaw);
  }
  private beginWalk(storey: number, x: number, y: number, yaw: number) {
    this.storey = null; this.selected = null; this.hovered = null; this.goal = null;
    this.walk = { grid: gridFor(storey, this.radius()), storey, x, y, z: 0, yaw, pitch: -0.05, path: [], endYaw: null, apt: null, place: 'corridor', room: null, spots: [], spotsOf: -2, spot: -1, sent: 0, ride: null };
    this.whereNow();
    CUT.constant = 1e4;
    this.picks.clear(); this.outlines.clear();
    this.setFurniture(storey);
    if (this.vols) this.vols.group.visible = false;
    this.aptMode = false;
    this.applyMode();
    for (const l of LIFTS) this.placeCabin(l.id, storey, 0);
    this.setContext(false);
    this.trees.forEach((t) => (t.visible = true));
    this.controls.enabled = false; this.controls.autoRotate = false;
    this.camera.near = 0.05; this.camera.fov = this.walkFov();
    const g = materials().glass as THREE.MeshPhysicalMaterial;
    g.opacity = 0.14; g.envMapIntensity = 0.5; g.color.set('#8fa6b6');
    if (!this.ring) {
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.23, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f3d58e', transparent: true, opacity: 0.85, depthWrite: false }));
      this.ring.renderOrder = 6; this.scene.add(this.ring);
    }
    this.ring.visible = false;
    this.renderer.domElement.style.cursor = 'grab';
    this.avatar.group.visible = this.third;
    this.resize();
    this.applyHour(this.hour);
    this.emitWalk(true);
  }
  private eye() { return this.body.h * 0.935; }
  private radius() { return Math.max(0.12, (this.body.w / 2) * 0.9); }
  /** Third person: the visitor's figure is shown and the camera follows it from behind. */
  setThird(on: boolean) { this.third = on; this.avatar.group.visible = on && !!this.walk; this.dirty = true; }
  /** Visitor's height and shoulder width (m): eye level, figure size and which passages fit. */
  setBody(h: number, w: number) {
    this.body = { h: Math.max(1.2, Math.min(2.2, h)), w: Math.max(0.3, Math.min(0.75, w)) };
    this.avatar.setSize(this.body.h, this.body.w);
    const wk = this.walk;
    if (wk && !wk.ride) {
      wk.grid = gridFor(wk.storey, this.radius());
      const p = wk.grid.nearest(wk.x, wk.y); if (p) { wk.x = p[0]; wk.y = p[1]; }
      wk.path = [];
    }
    this.dirty = true;
  }
  /** Game-style control: the mouse is captured (pointer lock) and turns the view, W A S D walk, Shift runs. */
  setWasd(on: boolean) {
    this.wasd = on; this.lockFailed = false;
    if (on && this.walk) this.lock();
    if (!on && document.pointerLockElement) document.exitPointerLock();
    this.emitWalk(true);
  }
  /** Esc that only released the mouse must not also close the walk. */
  recentlyLocked() { return this.locked || performance.now() - this.unlockedAt < 500; }
  private lock() {
    const el = this.renderer.domElement as HTMLCanvasElement & { requestPointerLock(): Promise<void> | void };
    try { const r = el.requestPointerLock(); if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.onLockError()); } catch { this.onLockError(); }
  }
  private onLock = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (was && !this.locked) this.unlockedAt = performance.now();
    if (this.ring) this.ring.visible = false;
    this.emitWalk(true);
  };
  private onLockError = () => { this.lockFailed = true; this.locked = false; this.emitWalk(true); };
  private onLockMove = (e: MouseEvent) => {
    const w = this.walk; if (!w || !this.locked) return;
    const k = 0.0024 * (this.camera.fov / 72);
    w.yaw -= e.movementX * k; w.pitch = Math.max(-1.25, Math.min(1.1, w.pitch - e.movementY * k));
    w.endYaw = null; this.dirty = true;
  };

  /** Wider lens on a portrait phone, where the horizontal view would otherwise be a narrow slot. */
  private walkFov() { const r = this.el.clientWidth / Math.max(1, this.el.clientHeight); return r < 0.8 ? 88 : r < 1.2 ? 80 : 72; }
  private setFurniture(storey: number) {
    this.furniture.clear();
    const f = storey >= 2 ? buildFurniture(planFor(storey), storey) : null;
    if (f) { f.position.y = (storey - 1) * FLOOR_H; this.furniture.add(f); this.pro?.furniture(f); }
  }
  /** Leave the walk; returns where the visitor was (storey and flat). */
  stopWalk() {
    if (!this.walk) return null;
    const { storey, apt } = this.walk;
    this.walk = null;
    this.avatar.group.visible = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.doorAnim.clear();
    this.entryDoors?.closeAll();
    for (let st = 1; st <= FLOORS; st++) for (const l of LIFTS) this.setDoor(st, l.id, 0);
    this.setBuildingVisible(true);
    this.controls.enabled = true;
    this.camera.near = 0.3; this.camera.fov = 46;
    const g = materials().glass as THREE.MeshPhysicalMaterial;
    g.opacity = 0.9; g.envMapIntensity = 2.2; g.color.set('#14181d');
    if (this.ring) this.ring.visible = false;
    this.lamp.intensity = 0; this.bounce.intensity = 0;
    this.setContext(false);
    const st = Math.max(1, storey);
    this.camera.position.set(-14, (st - 1) * FLOOR_H + 22, -26);
    this.controls.target.set(0, (st - 1) * FLOOR_H, 0);
    this.resize();
    this.setStorey(st);
    if (apt !== null) this.selectApt(apt);
    this.applyHour(this.hour);
    this.cb.onWalk?.(null);
    return { storey: st, apt };
  }
  isWalking() { return !!this.walk; }
  walkPad(f: number, s: number, t: number) { this.pad = { f, s, t }; if (this.walk && !this.walk.ride && (f || s)) this.walk.path = []; this.dirty = true; }
  walkTo(x: number, y: number, endYaw: number | null = null) {
    const w = this.walk; if (!w || w.ride) return false;
    const p = w.grid.nearest(x, y); if (!p) return false;
    const path = w.grid.path(w.x, w.y, p[0], p[1]); if (!path) return false;
    w.path = path; w.endYaw = endYaw; this.dirty = true;
    return true;
  }
  /** Next window / balcony of the flat (or of the air balcony in the public part): walk up to it and look out. */
  nextView() {
    const w = this.walk; if (!w || w.ride || !w.spots.length) return;
    w.spot = (w.spot + 1) % w.spots.length;
    const sp = w.spots[w.spot];
    if (!this.walkTo(sp.x, sp.y, sp.yaw)) { w.x = sp.x; w.y = sp.y; w.yaw = sp.yaw; this.whereNow(); }
    w.pitch = -0.04;
    this.dirty = true;
    this.emitWalk(true);
  }

  /** Call a lift to this storey: it arrives, opens, the visitor steps in and picks a floor. */
  callLift(id: number) {
    const w = this.walk; if (!w || w.ride) return;
    const l = LIFTS[id];
    w.path = []; w.endYaw = null;
    const cab: [number, number] = [(l.cab.x0 + l.cab.x1) / 2 + 0.1, (l.cab.y0 + l.cab.y1) / 2];
    const front = w.grid.nearest(l.front[0], l.front[1]) ?? l.front;
    const toFront = w.grid.path(w.x, w.y, front[0], front[1]) ?? [front];
    w.ride = { kind: 'lift', id, phase: 'call', t: 0, from: w.storey, to: w.storey, pts: [...toFront, [l.door.x + 0.1, cab[1]], cab] };
    this.placeCabin(id, w.storey, 0);
    this.emitWalk(true);
  }
  /** Floor button inside the cabin. Same floor = step out. */
  liftGo(to: number) {
    const w = this.walk, r = w?.ride; if (!w || !r || r.kind !== 'lift' || r.phase !== 'select') return;
    if (to === w.storey) { this.liftLeave(); return; }
    r.to = to; r.phase = 'close'; r.t = 0;
    this.animDoor(w.storey, r.id, 0);
    setTimeout(() => gridFor(to, this.radius()), 300); // build the target floor's walk grid while the doors close
    this.emitWalk(true);
  }
  liftLeave() {
    const w = this.walk, r = w?.ride; if (!w || !r || r.kind !== 'lift' || (r.phase !== 'select')) return;
    const l = LIFTS[r.id];
    const out = w.grid.nearest(l.front[0] + 0.4, l.front[1]) ?? l.front;
    r.phase = 'leave'; r.t = 0; r.pts = [[l.door.x + 0.2, (l.door.y0 + l.door.y1) / 2], out];
    this.emitWalk(true);
  }
  /** Climb or descend one storey along the switchback stair (typical floors 2–16). */
  stairGo(dir: 1 | -1) {
    const w = this.walk; if (!w || w.ride) return;
    const to = w.storey + dir;
    if (to < 2 || to > FLOORS || !w.grid.stair) return;
    const st = w.grid.stair, b = (Math.min(w.storey, to) - 1) * FLOOR_H + SLAB;
    const up: [number, number, number][] = [
      [st.x1, st.yF + 0.35, b], [st.x1, st.yF, b], [st.x1, st.yM, b + FLOOR_H / 2], [st.x1, st.yM - 0.6, b + FLOOR_H / 2],
      [st.x0, st.yM - 0.6, b + FLOOR_H / 2], [st.x0, st.yM, b + FLOOR_H / 2], [st.x0, st.yF, b + FLOOR_H], [st.x0, st.yF + 0.6, b + FLOOR_H],
    ];
    const pts = dir > 0 ? up : up.slice().reverse();
    const zNow = (w.storey - 1) * FLOOR_H + SLAB;
    w.path = []; w.endYaw = null;
    w.ride = { kind: 'stair', pts: [[w.x, w.y, zNow], ...pts], seg: 0, to };
    this.emitWalk(true);
  }

  private setBuildingVisible(v: boolean) {
    this.whole.visible = v; this.furniture.visible = v;
    if (this.liftDoors) this.liftDoors.visible = v;
    if (this.entryDoors) this.entryDoors.group.visible = v;
    if (this.lighting) this.lighting.group.visible = v;
    if (this.walk) this.showSur(v);
    this.trees.forEach((t) => (t.visible = v));
    this.cabins.forEach((c, i) => (c.visible = v || (this.walk?.ride?.kind === 'lift' && this.walk.ride.id === i)));
  }
  private whereNow() {
    const w = this.walk!;
    const p = w.grid.where(w.x, w.y);
    const changed = p.apt !== w.apt || p.place !== w.place || (p.room?.kind ?? null) !== w.room;
    w.apt = p.apt; w.place = p.place; w.room = p.room?.kind ?? null;
    if (w.spotsOf !== w.apt) { w.spots = w.grid.viewSpots(w.apt); w.spotsOf = w.apt; w.spot = -1; }
    return changed;
  }
  private emitWalk(force = false) {
    const w = this.walk; if (!w || !this.cb.onWalk) return;
    const now = performance.now();
    if (!force && now - w.sent < 90) return;
    w.sent = now;
    let nearLift: number | null = null;
    if (!w.ride && (w.place === 'lifthall' || w.place === 'entrance')) {
      let bd = 3.2;
      for (const l of LIFTS) { const d = Math.hypot(l.front[0] - w.x, l.front[1] - w.y); if (d < bd) { bd = d; nearLift = l.id; } }
    }
    const r = w.ride;
    const lift = r?.kind === 'lift' ? { id: r.id, phase: r.phase, floor: Math.max(1, Math.min(FLOORS, Math.round((this.cabins[r.id].position.y) / FLOOR_H) + 1)), to: r.to } : null;
    const stair = !r && w.place === 'stair' && w.grid.stair ? { up: w.storey < FLOORS, down: w.storey > 2 } : null;
    const dn = !r && this.entryDoors ? this.entryDoors.near({ storey: w.storey, x: w.x, y: w.y, yaw: w.yaw }) : null;
    this.cb.onWalk({ storey: w.storey, apt: w.apt, place: w.place, room: w.room, x: w.x, y: w.y, yaw: w.yaw, spot: w.spot, spots: w.spots.length, nearLift, stair, lift, climbing: r?.kind === 'stair', locked: this.locked, lockFailed: this.lockFailed, lights: this.aptLightsOn(), door: dn && { num: dn.num, open: dn.open } });
  }
  private floorHit(cx: number, cy: number, raw = false): [number, number] | null {
    const w = this.walk; if (!w) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const d = this.ray.ray.direction, o = this.ray.ray.origin;
    const fy = (w.storey - 1) * FLOOR_H + SLAB;
    if (d.y > -0.02) return null;
    const t = (fy - o.y) / d.y;
    const x = o.x + d.x * t + BLOCK_W / 2, y = o.z + d.z * t + BLOCK_D / 2;
    if (raw) return [x, y];
    if (!w.grid.inside(x, y) || !w.grid.sees(w.x, w.y, x, y)) return null;
    return [x, y];
  }
  /** Move along a list of plan points, ignoring the grid (lift boarding / leaving). */
  private follow(pts: [number, number][], dt: number, speed = 1.3) {
    const w = this.walk!;
    if (!pts.length) return true;
    const [tx, ty] = pts[0];
    const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy), sp = speed * dt;
    if (d <= sp) { w.x = tx; w.y = ty; pts.shift(); } else { w.x += (dx / d) * sp; w.y += (dy / d) * sp; }
    if (d > 0.25) w.yaw = turnTo(w.yaw, Math.atan2(-dx, -dy), 3.4 * dt);
    return !pts.length;
  }
  private updateRide(dt: number) {
    const w = this.walk!, r = w.ride!;
    if (r.kind === 'stair') {
      const [ax, ay, az] = r.pts[r.seg], [bx, by, bz] = r.pts[r.seg + 1];
      const L = Math.hypot(bx - ax, by - ay, bz - az) || 1e-3;
      const cur = Math.hypot(w.x - ax, w.y - ay);
      const hl = Math.hypot(bx - ax, by - ay);
      const step = 0.95 * dt * (hl / L || 1);
      const dx = bx - w.x, dy = by - w.y, d = Math.hypot(dx, dy);
      if (d <= step || hl < 1e-3) { w.x = bx; w.y = by; w.z = bz - ((w.storey - 1) * FLOOR_H + SLAB); r.seg++; }
      else { w.x += (dx / d) * step; w.y += (dy / d) * step; w.z = az + (bz - az) * ((cur + step) / hl) - ((w.storey - 1) * FLOOR_H + SLAB); }
      if (hl > 0.2) w.yaw = turnTo(w.yaw, Math.atan2(-(bx - ax), -(by - ay)), 3.2 * dt);
      w.pitch += ((bz > az + 0.1 ? 0.18 : bz < az - 0.1 ? -0.32 : -0.05) - w.pitch) * Math.min(1, dt * 3);
      if (r.seg >= r.pts.length - 1) {
        const zAbs = (w.storey - 1) * FLOOR_H + SLAB + w.z;
        w.storey = r.to; w.z = zAbs - ((w.storey - 1) * FLOOR_H + SLAB);
        if (Math.abs(w.z) < 0.05) w.z = 0;
        w.grid = gridFor(w.storey, this.radius()); w.ride = null; w.pitch = -0.05;
        this.setFurniture(w.storey);
        for (const l of LIFTS) this.placeCabin(l.id, w.storey, 0);
        w.spotsOf = -2; this.whereNow(); this.emitWalk(true);
      }
      return;
    }
    // lift
    r.t += dt;
    const cab = this.cabins[r.id];
    switch (r.phase) {
      case 'call': if (r.t > 1.4) { r.phase = 'open'; r.t = 0; this.animDoor(w.storey, r.id, 1); this.emitWalk(true); } break;
      case 'open': if (r.t > 1.1) { r.phase = 'board'; r.t = 0; this.emitWalk(true); } break;
      case 'board': if (this.follow(r.pts, dt)) { w.yaw = turnTo(w.yaw, -Math.PI / 2, 4 * dt); if (Math.abs(angDiff(w.yaw, -Math.PI / 2)) < 0.01) { r.phase = 'select'; r.t = 0; this.emitWalk(true); } } break;
      case 'select': w.yaw = turnTo(w.yaw, -Math.PI / 2, 2 * dt); break;
      case 'close':
        if (r.t > 1.15) {
          r.phase = 'move'; r.t = 0; r.from = w.storey;
          this.setBuildingVisible(false);
          this.emitWalk(true);
        }
        break;
      case 'move': {
        const dur = 1.6 + Math.abs(r.to - r.from) * 0.55, u = Math.min(1, r.t / dur), e = u * u * (3 - 2 * u);
        cab.position.y = ((r.from - 1) + (r.to - r.from) * e) * FLOOR_H;
        this.emitWalk();
        if (u >= 1) {
          w.storey = r.to; w.grid = gridFor(w.storey, this.radius());
          this.setFurniture(w.storey);
          for (const l of LIFTS) if (l.id !== r.id) this.placeCabin(l.id, w.storey, 0);
          this.placeCabin(r.id, w.storey, 0);
          this.setBuildingVisible(true);
          r.phase = 'arrive'; r.t = 0; this.animDoor(w.storey, r.id, 1);
          w.spotsOf = -2; this.whereNow(); this.emitWalk(true);
        }
        break;
      }
      case 'arrive': if (r.t > 1.1) { r.phase = 'select'; r.t = 0; this.liftLeave(); } break;
      case 'leave':
        if (this.follow(r.pts, dt)) {
          const st = w.storey, id = r.id;
          w.ride = null;
          setTimeout(() => { if (!this.walk?.ride || this.walk.ride.kind !== 'lift' || this.walk.ride.id !== id) this.animDoor(st, id, 0); }, 900);
          const p = w.grid.nearest(w.x, w.y); if (p) { w.x = p[0]; w.y = p[1]; }
          this.whereNow(); this.emitWalk(true);
        }
        break;
    }
  }
  private updateWalk(dt: number) {
    const w = this.walk!;
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    const f = Math.max(-1, Math.min(1, this.pad.f + k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown')));
    const s = Math.max(-1, Math.min(1, this.pad.s + k('KeyD') - k('KeyA')));
    const turn = this.pad.t + k('ArrowLeft') - k('ArrowRight');   // E is the door key, not a turn
    const run = k('ShiftLeft') || k('ShiftRight') ? 1.9 : 1;
    const px = w.x, py = w.y, pz = w.z;
    let moved = false;
    if (turn) { w.yaw += turn * 1.7 * dt; moved = true; }
    if (w.ride) { this.updateRide(dt); moved = true; }
    else if (f || s) {
      w.path = []; w.endYaw = null;
      const sp = 1.45 * run * dt;
      const dx = (-Math.sin(w.yaw) * f + Math.cos(w.yaw) * s) * sp, dy = (-Math.cos(w.yaw) * f - Math.sin(w.yaw) * s) * sp;
      const [nx, ny] = w.grid.step(w.x, w.y, dx, dy);
      if (!this.doorBlocks(w.storey, nx, ny)) { w.x = nx; w.y = ny; }
      else if (!this.doorBlocks(w.storey, nx, w.y)) w.x = nx;
      else if (!this.doorBlocks(w.storey, w.x, ny)) w.y = ny;
      moved = true;
    } else if (w.path.length) {
      const [tx, ty] = w.path[0];
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy), sp = 1.7 * dt;
      const nx = d <= sp ? tx : w.x + (dx / d) * sp, ny = d <= sp ? ty : w.y + (dy / d) * sp;
      if (this.doorBlocks(w.storey, nx, ny)) { w.path = []; w.endYaw = null; this.emitWalk(true); }   // stop at a closed door
      else if (d <= sp) { w.x = tx; w.y = ty; w.path.shift(); } else { w.x = nx; w.y = ny; }
      if (d > 0.3 && (w.path.length > 1 || w.endYaw === null)) w.yaw = turnTo(w.yaw, Math.atan2(-dx, -dy), 3.2 * dt);
      moved = true;
    } else if (w.endYaw !== null) {
      w.yaw = turnTo(w.yaw, w.endYaw, 3 * dt);
      if (Math.abs(angDiff(w.yaw, w.endYaw)) < 0.002) w.endYaw = null;
      moved = true;
    }
    if (this.doorAnim.size) { this.tickDoors(dt); moved = true; }
    const riding = w.ride?.kind === 'lift' && w.ride.phase === 'move';
    this.entryDoors?.show([w.storey - 1, w.storey, w.storey + 1]);
    if (this.lighting) {
      this.lighting.show(w.storey);
      const cab = w.ride?.kind === 'lift' && w.ride.phase !== 'call' && w.ride.phase !== 'open';
      const g = w.grid;
      if (this.lighting.update(dt, { walker: riding || cab ? null : { storey: w.storey, x: w.x, y: w.y, sees: (a, b, c, d) => g.sees(a, b, c, d) }, aptOn: this.aptLightsOn(), nightF: this.nightF, rig: true })) moved = true;
    }
    if (this.entryDoors?.update(dt, riding ? null : { storey: w.storey, x: w.x, y: w.y, r: this.radius(), apt: w.apt })) moved = true;
    if (moved && !w.ride) { if (this.whereNow()) this.emitWalk(true); else this.emitWalk(); this.doorYaw = w.yaw; }
    else if (!w.ride && Math.abs(angDiff(w.yaw, this.doorYaw)) > 0.08) { this.emitWalk(true); this.doorYaw = w.yaw; }   // mouse look: the door in view may change
    const r = w.ride;
    const base = r?.kind === 'lift' && r.phase === 'move' ? this.cabins[r.id].position.y + SLAB : (w.storey - 1) * FLOOR_H + SLAB + w.z;
    const eye = this.eye();
    const stepped = Math.hypot(w.x - px, w.y - py, w.z - pz);
    if (this.third) {
      this.avatar.group.visible = true;
      this.avatar.update(w.x - BLOCK_W / 2, base, w.y - BLOCK_D / 2, w.yaw, stepped, dt);
      this.placeThird(w, base, eye);
      if (stepped > 0) moved = true;
    } else {
      this.avatar.group.visible = false;
      this.camera.position.set(w.x - BLOCK_W / 2, base + eye, w.y - BLOCK_D / 2);
      this.camera.rotation.set(w.pitch, w.yaw, 0, 'YXZ');
    }
    const inCab = r?.kind === 'lift' && r.phase !== 'call' && r.phase !== 'open';
    this.lamp.position.set(w.x - BLOCK_W / 2, base + (inCab ? 2.3 : FLOOR_H - SLAB - 0.35), w.y - BLOCK_D / 2);
    this.lamp.distance = inCab ? 4 : 11;
    const lit = w.apt === null || this.aptLightsOn();     // fixtures carry the light; the lamp is just a soft bounce fill
    const pro = this.pro ? 0.5 : 1;
    this.lamp.intensity = inCab ? 0.9 : (2.0 + (lit ? 1.2 : 9) * this.nightF) * (lit ? pro : 1);
    this.bounce.intensity = inCab ? 0 : this.nightF * (lit ? 0.7 : 0.25) * pro;
    return moved;
  }
  /** Third-person camera: behind and a little above the head, pulled in front of walls, under the ceiling. */
  private placeThird(w: NonNullable<BlockScene['walk']>, base: number, eye: number) {
    const fx = -Math.sin(w.yaw), fy = -Math.cos(w.yaw), cp = Math.cos(w.pitch), sp = Math.sin(w.pitch);
    const head = new THREE.Vector3(w.x - BLOCK_W / 2, base + eye + 0.08, w.y - BLOCK_D / 2);
    let d = this.camDist;
    const r = w.ride;
    const inCab = r?.kind === 'lift' && r.phase !== 'call' && r.phase !== 'open' && r.phase !== 'leave';
    const backX = (t: number) => w.x - fx * cp * t, backY = (t: number) => w.y - fy * cp * t;
    if (inCab) {
      const c = LIFTS[r.id].cab, m = 0.14;
      for (let t = 0.05; t <= d; t += 0.05) { const x = backX(t), y = backY(t); if (x < c.x0 + m || x > c.x1 + 0.4 || y < c.y0 + m || y > c.y1 - m) { d = t - 0.05; break; } }
    } else if (r?.kind === 'stair' && w.grid.stair) {
      const b = w.grid.stair.room.poly.outer, xs = b.map((q) => q[0]), ys = b.map((q) => q[1]);
      const x0 = Math.min(...xs) + 0.15, x1 = Math.max(...xs) - 0.15, y0 = Math.min(...ys) + 0.15, y1 = Math.max(...ys) - 0.15;
      for (let t = 0.05; t <= d; t += 0.05) { const x = backX(t), y = backY(t); if (x < x0 || x > x1 || y < y0 || y > y1) { d = t - 0.05; break; } }
    } else if (w.place !== 'yard') {
      for (let t = 0.1; t <= d; t += 0.05) if (!w.grid.inside(backX(t), backY(t))) { d = Math.max(0, t - 0.22); break; }
    }
    d = Math.max(0.25, d);
    const outdoors = w.place === 'yard';
    const ceil = outdoors ? 40 : r?.kind === 'lift' ? 2.3 : r?.kind === 'stair' ? FLOOR_H + 1.2 : FLOOR_H - SLAB - 0.18;
    const cam = new THREE.Vector3(head.x - fx * cp * d, head.y + 0.22 - sp * d, head.z - fy * cp * d);
    cam.y = Math.max(base + 0.4, Math.min(cam.y, base + ceil));
    this.camera.position.copy(cam);
    this.camera.lookAt(head.x + fx * cp * 1.6, head.y + sp * 1.6, head.z + fy * cp * 1.6);
  }
  private onWheel = (e: WheelEvent) => {
    if (!this.walk) return;
    e.preventDefault();
    if (this.third) this.camDist = Math.max(0.8, Math.min(4.5, this.camDist + e.deltaY * 0.004));
    else { this.camera.fov = Math.max(40, Math.min(85, this.camera.fov + e.deltaY * 0.03)); this.camera.updateProjectionMatrix(); }
    this.dirty = true;
  };
  private onKey = (e: KeyboardEvent) => {
    if (!this.walk || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'KeyE' || e.code === 'KeyF') {           // open / close the door in reach
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) this.toggleDoor();
      return;
    }
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    if (!codes.includes(e.code)) return;
    e.preventDefault();
    if (e.type === 'keydown') this.keys.add(e.code); else this.keys.delete(e.code);
    this.dirty = true;
  };

  setAutoRotate(on: boolean) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 0.8; }

  /** Open / close the flat entrance door within reach (E key or the on-screen prompt). */
  toggleDoor() {
    const w = this.walk; if (!w || w.ride || !this.entryDoors) return null;
    const r = this.entryDoors.toggle({ storey: w.storey, x: w.x, y: w.y, yaw: w.yaw });
    if (r) { this.dirty = true; this.emitWalk(true); }
    return r;
  }
  /** a closed door stops the visitor; someone already standing in the doorway can always step out */
  private doorBlocks(storey: number, x: number, y: number) {
    const d = this.entryDoors, w = this.walk; if (!d || !w) return false;
    const r = this.radius() * 0.8;
    return d.blocks(storey, x, y, r) && !d.blocks(storey, w.x, w.y, r);
  }

  /** Flats' lights: on after dusk unless the visitor switched them. */
  private aptLightsOn() { return this.lightsOverride ?? this.nightF > 0.3; }
  setLights(on: boolean) { this.lightsOverride = on; this.dirty = true; this.emitWalk(true); }
  /** Time of day (one of the stops of timeStops.ts): glides there over ~1.5 s; instant = jump. */
  setHour(h: number, instant = false) {
    this.glide.set(h, instant);
    if (instant) this.applyHour(h);
    this.dirty = true;
  }
  /** Real sun over Tashkent on 21 June (sun.ts), turned into this block's frame; sky, ambient, evening lights. */
  private applyHour(h: number) {
    this.hour = h;
    const def = BLOCKS.find((b) => b.id === this.blockId)!;
    const dir = sunDir(SUN_DAY, ((h % 24) + 24) % 24).applyAxisAngle(new THREE.Vector3(0, 1, 0), -blockTheta(def));
    const { el, nightF, dusk, dayK } = daylight(dir);
    const low = THREE.MathUtils.clamp(el / 25, 0, 1);
    this.sun.position.copy(dir).multiplyScalar(125);
    this.clouds.setSun(this.sun.position, { dayK, dusk, nightF });
    this.sun.intensity = 3.4 * dayK * (0.35 + 0.65 * low);
    this.sun.color.set(lerpC('#ff9f5a', '#fff0d8', low));
    this.hemi.intensity = 0.15 + 0.6 * dayK;
    this.hemi.color.set(lerpC('#dfeaf6', '#41507a', nightF));
    this.scene.environmentIntensity = 0.08 + 0.47 * dayK;
    if (nightF > 0.5) paintSky(lerpC('#26385e', '#060b1c', nightF), lerpC('#4a5a80', '#14213e', nightF), lerpC('#c08a6a', '#2b3550', nightF));
    else if (dusk > 0.05) paintSky(lerpC('#3f6fa8', '#30467a', dusk), lerpC('#86a9cc', '#e09a6e', dusk), lerpC('#dfe7ea', '#f6c48a', dusk));
    else paintSky('#3f6fa8', '#86a9cc', '#dfe7ea');
    (this.scene.background as THREE.Texture).needsUpdate = true;
    (this.scene.fog as THREE.Fog).color.set(lerpC('#dfe7ea', '#1a2440', nightF));
    this.renderer.toneMappingExposure = 1.05 - 0.15 * nightF;
    this.night.set(this.aptMode ? 0 : nightF);
    this.nightF = nightF;
    this.lamp.intensity = this.walk ? 2.2 + 9 * nightF : 0;
    TREE_NIGHT.value = 0;                 // no uplights under every tree of the district (the block stands in an open zone)
    this.sur?.setNight(nightF);
    this.pro?.hour({ sunDir: dir, nightF, dusk, dayK, hour: h });
    this.dirty = true;
    if (this.walk) this.emitWalk(true);
  }
  /** PRO build only: AO / bloom switches (the pt flag is ignored: path tracing was removed). */
  proSet(o: Partial<{ pt: boolean; ao: boolean; bloom: boolean }>) { this.pro?.set(o); this.dirty = true; }
  isPro() { return !!this.pro; }
  private draw(changed: boolean) {
    // see-through corridor to the block: not inside, not in the site view, not from inside the open zone
    const out = this.camera.position.distanceTo(this.controls.target) > 12 && Math.hypot(this.camera.position.x, this.camera.position.z) > 30;
    this.sur?.setFade(!this.walk && !this.ctx?.visible && out, this.camera.position, this.controls.target);
    renderStats.view = this.walk ? 'xonadon ichi' : 'blok';
    renderStats.effects = this.pro ? ['SSGI', 'TRAA', 'Bloom', 'Fizik atmosfera', 'AgX tonemap', 'CSM soyalar', 'Klasterli chiroqlar'] : ['Oddiy soyalar', 'MSAA'];
    renderStats.lights = this.pro ? LAMP_COUNT.n : 0;
    renderStats.begin(this.renderer);
    if (this.pro) this.proWants = this.pro.frame(changed);
    else this.renderer.render(this.scene, this.camera);
    renderStats.end(this.renderer);
  }

  /** Cut the building above storey s (null = whole building). */
  /** Engineering view: the building turns to glass, the schematic networks show inside. */
  setEngineering(on: boolean, lang: 'uz' | 'ru' = 'uz') {
    if (!this.detailed || on === this.engOn) return;
    this.engOn = on;
    if (on && !this.eng) { this.eng = new Engineering(lang); this.block.add(this.eng.group); }
    if (this.eng) { this.eng.group.visible = on; this.eng.setStorey(this.storey); }
    this.ghost(on, this.storey === null ? 0.07 : 0.28);
    this.applyMode();
    this.buildPicks();
    this.dirty = true;
  }
  /** Construction view: the building as built from its parts; the real model and the ground step aside. */
  setConstruction(on: boolean) {
    if (!this.detailed || on === this.conOn) return;
    this.conOn = on;
    if (on && !this.con) { this.con = new Construction(); this.block.add(this.con.group); }
    if (this.con) { this.con.group.visible = on; if (!on) this.con.clearPick(); }
    // see the foundation through the ground
    if (this.sur) this.sur.group.visible = !on && !this.ctx?.visible;
    for (const o of [this.grass] as THREE.Mesh[]) {
      if (!o) continue;
      const m = o.material as THREE.MeshStandardMaterial;
      m.transparent = on; m.opacity = on ? 0.35 : 1; m.depthWrite = !on; m.needsUpdate = true;
    }
    this.applyMode();
    this.buildPicks();
    this.dirty = true;
  }
  /** Energy view (type-4 blocks). */
  setEnergy(on: boolean, o: Partial<{ view: 'flats' | 'thermal'; insul: boolean; season: 'winter' | 'summer' }> = {}) {
    if (!this.detailed) return;
    Object.assign(this.en, o);
    this.enOn = on;
    const flats = on && this.en.view === 'flats', thermal = on && this.en.view === 'thermal';
    if (flats && !this.vols) { this.vols = buildAptVolumes(); this.block.add(this.vols.group); }
    if (this.vols) this.vols.group.visible = flats || this.aptMode;
    if (thermal && !this.con) { this.con = new Construction(); this.block.add(this.con.group); }
    if (this.con) {
      if (thermal) {
        this.con.setLayers(LAYERS.map((l) => l.id)); this.con.setStage(STAGE_MAX); this.con.setExplode(0); this.con.setCut(0);
        this.con.setThermal(thermalSkin(this.en.insul));
      } else this.con.setThermal(null);
      this.con.group.visible = thermal || this.conOn;
    }
    if (!on) this.en.sel = null;
    if (flats) this.paintEnergy();
    this.applyMode();
    this.buildPicks();
    this.dirty = true;
  }
  energySelect(storey: number | null, index = 0) { this.en.sel = storey === null ? null : `${storey}-${index}`; this.paintEnergy(); }
  private paintEnergy() {
    if (!this.vols || !this.enOn) return;
    const winter = this.en.season === 'winter', ins = this.en.insul;
    const val = (s: number, i: number) => { const a = aptEnergy(this.blockId, s, i, ins); return (winter ? a.heat : a.cool) / a.area; };
    // a fixed scale so the insulation switch shows the change in colour
    const [lo, hi] = energyRange(this.blockId, this.en.season);
    this.vols.paintColor((s, i) => heatColor(val(s, i), lo, hi), this.en.sel);
    this.dirty = true;
  }
  conQuantities() { return this.con?.quantities ?? []; }
  conLayers(l: Layer[]) { this.con?.setLayers(l); this.dirty = true; }
  conStage(p: number) { this.con?.setStage(p); this.dirty = true; }
  conExplode(e: number) { this.con?.setExplode(e); this.dirty = true; }
  conCut(f: number) { this.con?.setCut(f); this.dirty = true; }
  setEngSystems(s: Sys[]) { this.eng?.setSystems(new Set(s)); this.dirty = true; }
  setEngLang(l: 'uz' | 'ru') { this.eng?.setLang(l); this.dirty = true; }
  /** opacity: the whole building almost glass; a cut storey keeps its walls readable */
  private ghost(on: boolean, opacity = 0.07) {
    const mats = [...Object.values(materials()), ...Object.values(furnitureMaterials())] as THREE.Material[];
    for (const m of mats) {
      if (on) {
        if (!this.ghostSaved.has(m)) this.ghostSaved.set(m, { t: m.transparent, o: m.opacity, d: m.depthWrite });
        const g = this.ghostSaved.get(m)!;
        m.transparent = true; m.opacity = Math.min(g.o, opacity); m.depthWrite = false;
      } else {
        const g = this.ghostSaved.get(m); if (!g) continue;
        m.transparent = g.t; m.opacity = g.o; m.depthWrite = g.d;
      }
      m.needsUpdate = true;
    }
    if (!on) this.ghostSaved.clear();
  }

  setStorey(s: number | null) {
    if (!this.detailed) return;
    this.storey = s;
    this.eng?.setStorey(s);
    if (this.engOn) this.ghost(true, s === null ? 0.07 : 0.28);
    this.selected = null;
    cut.constant = s === null ? 1e4 : (s - 1) * FLOOR_H + 1.75;
    this.applyMode();
    this.buildPicks();
    if (s !== null) {
      const y = (s - 1) * FLOOR_H;
      this.goal = { pos: new THREE.Vector3(-14, y + 30, -30), target: new THREE.Vector3(0, y, 0) };
    }
    this.dirty = true;
  }

  private buildPicks() {
    this.picks.clear();
    this.outlines.clear();
    this.furniture.clear();
    if (this.storey === null || this.engOn || this.conOn || this.enOn) return;
    const s = this.storey;
    const plan: FloorPlan = planFor(s);
    const y = (s - 1) * FLOOR_H + SLAB + 0.02;
    plan.apts.forEach((a, i) => {
      for (const ri of a.rooms) {
        const r = plan.rooms[ri];
        const shape = new THREE.Shape(r.poly.outer.map(([x, z]) => new THREE.Vector2(x, z)));
        const g = new THREE.ShapeGeometry(shape);
        g.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e3b878', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        m.position.y = y;
        m.userData.pick = { storey: s, index: i, label: a.label } as AptPick;
        m.renderOrder = 5;
        this.picks.add(m);
      }
      // border ribbon just above the section cut, where the cut walls show from above
      const o = a.outline.outer, w = 0.16, pos: number[] = [];
      const yc = (s - 1) * FLOOR_H + 1.75 + 0.03;
      for (let k = 0; k < o.length; k++) {
        const [ax, az] = o[k], [bx, bz] = o[(k + 1) % o.length];
        const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz * w / 2, nz = tx * w / 2;
        const sx = ax - tx * w / 2, sz = az - tz * w / 2, ex = bx + tx * w / 2, ez = bz + tz * w / 2;
        pos.push(sx + nx, yc, sz + nz, ex + nx, yc, ez + nz, ex - nx, yc, ez - nz, sx + nx, yc, sz + nz, ex - nx, yc, ez - nz, sx - nx, yc, sz - nz);
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const rib = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffb23e', side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.95 }));
      rib.userData.apt = i; rib.visible = false; rib.renderOrder = 6;
      this.outlines.add(rib);
    });
    const f = buildFurniture(plan, s);
    if (f) { f.position.y = (s - 1) * FLOOR_H; this.furniture.add(f); this.pro?.furniture(f); }
  }

  private paintPicks() {
    for (const o of this.picks.children as THREE.Mesh[]) {
      const p = o.userData.pick as AptPick;
      const mat = o.material as THREE.MeshBasicMaterial;
      const sel = this.selected && this.selected.index === p.index;
      const hov = this.hovered && this.hovered.index === p.index;
      mat.opacity = sel ? 0.55 : hov ? 0.45 : 0;
      mat.color.set(sel ? '#f29a1f' : '#ffbe55');
    }
    for (const r of this.outlines.children as THREE.Mesh[]) {
      const i = r.userData.apt as number;
      const sel = this.selected?.index === i, hov = this.hovered?.index === i;
      r.visible = sel || hov;
      (r.material as THREE.MeshBasicMaterial).color.set(sel ? '#f29a1f' : '#ffd27a');
    }
    this.dirty = true;
  }

  selectApt(index: number | null) {
    if (this.storey === null) return;
    const plan = planFor(this.storey);
    this.selected = index === null ? null : { storey: this.storey, index, label: plan.apts[index].label };
    this.paintPicks();
    if (index !== null) {
      // fly to the apartment
      const b = plan.apts[index].rooms.map((ri) => polyBounds(plan.rooms[ri].poly)).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }));
      const cx = (b.x0 + b.x1) / 2 - BLOCK_W / 2, cz = (b.y0 + b.y1) / 2 - BLOCK_D / 2;
      const y = (this.storey - 1) * FLOOR_H;
      const side = cz < 0 ? -1 : 1;
      this.goal = { pos: new THREE.Vector3(cx - 4, y + 13, cz + side * 10), target: new THREE.Vector3(cx, y + 0.5, cz) };
    }
  }

  /** Jump to the current camera goal (used for tests / reduced motion). */
  finish() {
    if (!this.goal) return;
    this.camera.position.copy(this.goal.pos); this.controls.target.copy(this.goal.target);
    this.goal = null; this.controls.update(); this.dirty = true;
  }
  setCamera(p: [number, number, number], t: [number, number, number]) {
    this.goal = null; this.camera.position.set(...p); this.controls.target.set(...t); this.controls.update(); this.dirty = true;
  }

  dispose() {
    THREE.DefaultLoadingManager.onStart = THREE.DefaultLoadingManager.onProgress = () => {};
    if (this.engOn) this.ghost(false);
    this.eng?.dispose(); this.con?.dispose(); this.clouds.dispose();
    cancelAnimationFrame(this.raf);
    FACADE_NIGHT.value = 0; TREE_NIGHT.value = 0;          // the facade materials are shared with the complex view (no night there)
    LAMP_LIGHTS.real = false;
    this.pro?.dispose();
    this.ro.disconnect();
    this.controls.dispose();
    removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKey);
    document.removeEventListener('pointerlockchange', this.onLock);
    document.removeEventListener('pointerlockerror', this.onLockError);
    document.removeEventListener('mousemove', this.onLockMove);
    if (document.pointerLockElement) document.exitPointerLock();
    const g = materials().glass as THREE.MeshPhysicalMaterial;
    g.opacity = 0.9; g.envMapIntensity = 2.2; g.color.set('#14181d');
    this.renderer.dispose();
    this.renderer.domElement.remove();
    cut.constant = 1e4;
  }

  // ---------- internals ----------
  private resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // desktop: the side panel covers ~370 px on the right, so centre the scene in the free area
    // (kept in userData too: the Ultra renderer's TRAA jitters on top of it)
    const v = this.walk ? null : w > 760 ? [w, h, 185, 0, w, h] : [w, h, 0, h * 0.2, w, h]; // mobile: bottom sheet covers ~45%
    this.camera.userData.baseView = v && { fullWidth: v[0], fullHeight: v[1], offsetX: v[2], offsetY: v[3], width: v[4], height: v[5] };
    if (v) this.camera.setViewOffset(v[0], v[1], v[2], v[3], v[4], v[5]); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.pro?.resize(w, h);
    this.dirty = true;
  }
  private pick(x: number, y: number): AptPick | null {
    if (this.aptMode && this.vols) {
      const r0 = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((x - r0.left) / r0.width) * 2 - 1, -((y - r0.top) / r0.height) * 2 + 1), this.camera);
      const live = this.vols.meshes.filter((m) => this.volState(m.userData.pick.storey, m.userData.pick.index) !== 'dim');
      const h = this.ray.intersectObjects(live, false)[0];
      return h ? (h.object.userData.pick as AptPick) : null;
    }
    if (!this.picks.children.length) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.picks.children, false)[0];
    return hit ? (hit.object.userData.pick as AptPick) : null;
  }
  private onUp = (e: PointerEvent) => {
    if (this.walk) {
      if (this.locked) return;
      if (this.wasd && !this.lockFailed && this.drag.moved <= 6) { this.lock(); return; }
      if (this.drag.moved > 6 || this.walk.ride) return;
      const raw = this.floorHit(e.clientX, e.clientY, true);
      const w = this.walk;
      if (raw && (w.place === 'lifthall' || w.place === 'entrance')) {
        const l = LIFTS.find((q) => raw[0] > q.cab.x0 && raw[0] < q.door.x + 0.2 && raw[1] > q.door.y0 - 0.3 && raw[1] < q.door.y1 + 0.3);
        if (l && Math.hypot(l.front[0] - w.x, l.front[1] - w.y) < 7) { this.callLift(l.id); return; }
      }
      const p = this.floorHit(e.clientX, e.clientY);
      if (p) this.walkTo(p[0], p[1]);
      return;
    }
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    if (this.enOn) {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      if (this.en.view === 'flats' && this.vols) {
        const h = this.ray.intersectObjects(this.vols.meshes, false)[0];
        const pk = h ? (h.object.userData.pick as AptPick) : null;
        this.en.sel = pk ? `${pk.storey}-${pk.index}` : null; this.paintEnergy();
        this.cb.onEnergy?.(pk ? { storey: pk.storey, index: pk.index } : null);
      } else if (this.con) {
        const pk = this.con.pickMat(this.ray);
        this.cb.onEnergy?.(pk ? { mat: pk.mat, storey: pk.storey } : null);
      }
      this.dirty = true;
      return;
    }
    if (this.conOn && this.con) {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      this.cb.onCon?.(this.con.pick(this.ray));
      this.dirty = true;
      return;
    }
    if (this.engOn && this.eng) {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      this.cb.onEng?.(this.eng.pick(this.ray), e.clientX, e.clientY);
      this.dirty = true;
      return;
    }
    const p = this.pick(e.clientX, e.clientY);
    this.cb.onPick(p);
  };
  private onMove = (e: PointerEvent) => {
    if (this.walk) {
      const w = this.walk;
      if (this.locked) return;
      if (e.buttons) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX; this.drag.y = e.clientY; this.drag.moved += Math.abs(dx) + Math.abs(dy);
        const k = (e.pointerType === 'touch' ? 0.006 : 0.0042) * (this.camera.fov / 72);
        w.yaw += dx * k; w.pitch = Math.max(-1.25, Math.min(1.1, w.pitch + dy * k));
        w.endYaw = null; this.dirty = true;
        if (this.ring) this.ring.visible = false;
        this.renderer.domElement.style.cursor = 'grabbing';
        return;
      }
      const p = e.pointerType === 'mouse' && !w.ride ? this.floorHit(e.clientX, e.clientY) : null;
      if (this.ring) {
        this.ring.visible = !!p && w.grid.nearest(p[0], p[1]) !== null;
        if (p) this.ring.position.set(p[0] - BLOCK_W / 2, (w.storey - 1) * FLOOR_H + SLAB + 0.015, p[1] - BLOCK_D / 2);
      }
      this.renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
      this.dirty = true;
      return;
    }
    if (e.buttons) return;
    if (this.engOn || this.conOn || this.enOn) return;
    const p = this.pick(e.clientX, e.clientY);
    const same = (p?.index ?? -1) === (this.hovered?.index ?? -1) && (p?.storey ?? -1) === (this.hovered?.storey ?? -1);
    if (!same) { this.hovered = p; if (this.aptMode) this.repaintVols(); else this.paintPicks(); }
    this.renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    this.cb.onHover(p, e.clientX, e.clientY);
  };
  /**
   * The orbit camera stays outside the block: zoomed or turned into a wall it stops 1.5 m before the face the line
   * from the target crosses (inside, it saw the walls' backs: a grey or black screen, and the Ultra renderer's
   * screen-space effects at point blank dropped to ~8 FPS). The box ends at the storey cutaway, so a floor plan
   * is still looked at from above; the flat view and the engineering view (see-through) are left free.
   */
  private keepOutOfBlock() {
    if (this.aptMode || this.engOn || this.goal) return false;
    const p = this.camera.position, t = this.controls.target, m = 1.5;
    const lo = [-BLOCK_W / 2 - m, -1e6, -BLOCK_D / 2 - 2 - m], hi = [BLOCK_W / 2 + m, Math.min(53, cut.constant) + m, BLOCK_D / 2 + 2 + m];
    const P = [p.x, p.y, p.z];
    if (P.some((v, i) => v <= lo[i] || v >= hi[i])) return false;
    const d = new THREE.Vector3().subVectors(p, t);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize();
    const O = [t.x, t.y, t.z], D = [d.x, d.y, d.z];
    let sIn = -Infinity, sOut = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(D[i]) < 1e-9) continue;
      let a = (lo[i] - O[i]) / D[i], b = (hi[i] - O[i]) / D[i];
      if (a > b) [a, b] = [b, a];
      sIn = Math.max(sIn, a); sOut = Math.min(sOut, b);
    }
    // target outside the box: stop in front of it; target inside: leave by the face behind the camera
    const s = sIn > 0 ? sIn : sOut;
    if (!Number.isFinite(s)) return false;
    p.copy(t).addScaledVector(d, s);
    return true;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.ready) return;
    if (now < this.awake) this.dirty = true;
    if (this.glide.tick(dt)) this.applyHour(this.glide.hour);
    if (this.walk) {
      if (this.updateWalk(dt)) this.dirty = true;
      if (!this.dirty && !this.proWants) return;
      const ch = this.dirty; this.dirty = false;
      this.draw(ch);
      return;
    }
    if (this.goal) {
      this.camera.position.lerp(this.goal.pos, 0.08);
      this.controls.target.lerp(this.goal.target, 0.08);
      if (this.camera.position.distanceTo(this.goal.pos) < 0.05 || ++this.goalFrames > 240) { this.goal = null; this.goalFrames = 0; }
      this.dirty = true;
    }
    this.controls.dampingFactor = orbitDamping(dt);
    this.controls.update();
    if (this.keepOutOfBlock()) this.dirty = true;
    if (this.engOn && this.eng?.update(dt)) this.dirty = true;
    if (this.lighting?.update(dt, { walker: null, aptOn: this.aptLightsOn(), nightF: this.nightF, rig: false })) this.dirty = true;
    if (keepAboveGround(this.camera.position, this.controls.target, 1.2)) this.dirty = true;
    if (!this.dirty && !this.proWants) return;
    const ch = this.dirty; this.dirty = false;
    this.draw(ch);
    const i = this.renderer.info.render;
    (window as unknown as { __stats: object }).__stats = { calls: i.calls, tris: i.triangles };
  };
}

void ROOF_Z;

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const turnTo = (a: number, b: number, max: number) => { const d = angDiff(a, b); return a + Math.max(-max, Math.min(max, d)); };

/** Box whose side faces carry UVs in storeys/bays (3.2 m × 3 m), so a window texture repeats at true scale. */
function facadeBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const widths = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) {
    const top = f === 2 || f === 3;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, top ? 0 : uv.getX(i) * Math.round(widths[f] / 3.2), top ? 0 : uv.getY(i) * Math.round(h / 3));
    }
  }
  return g;
}
