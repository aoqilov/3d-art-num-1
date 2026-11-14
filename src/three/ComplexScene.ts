import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BLOCKS, FLOORS, FLOOR_H, GROUND_H, PLAN_SIZE, T4_LOOK, blockTheta, t4Fit, type BlockDef } from '../data/blocks';
import { mergedBlock } from '../block/blockMerge';
import { loadBlockGlb } from './blockGlb';
/** Blender model of the type-4 block (public/models/blok1.glb: bevelled corners, baked contact shadows), used for
 *  all 20 blocks. After a change to the exterior in the drawings: npm run model (~1 min), else the model lags behind. */
const BLOCK_GLB = !location.search.includes('noglb');      // ?noglb: the drawn geometry (before / after comparisons)
import { realTreesOk } from './trees';
import { PRO, type ProRenderer } from '../block/BlockScene';
import { SkyMap } from '../pro/sky';
import { SUN_DAY, daylight, sunDir } from './sun';
import { FACADE_NIGHT, facadeGlow } from '../block/nightLights';
import { BAKE_AO, enableBakedAO, materials } from '../block/materials';
import { createRenderer, keepAboveGround, orbitDamping, type Renderer } from './gpu';
import { DEFAULT_HOUR, HourGlide } from './timeStops';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import { LAMP_LIGHTS } from './lamps';
import { layoutCourtyard } from './courtLayout';
import { groundMaterial } from './ground';
import { OuterCity, loadOuter } from './outer';
import { renderStats } from './stats';
import { LAMP_COUNT } from './lamps';
import { BLOCK_D, BLOCK_W } from '../block/plan';
import { ProgressView } from './progressView';
import { CloudDome } from './clouds';
import { Yard, loadYard } from './yard';
import { buildDetail, glassTexture, litTexture, shopTexture } from './blockDetail';
import { Context, Courtyard, loadContext, loadCourtyard, loadLocalEdits, resolve, saveLocalEdits, siteGeometry, type CtxStyle, type Override, type Overrides } from './context';

export type SceneCallbacks = {
  onSelect: (id: number | null) => void;
  onHover: (id: number | null, x: number, y: number) => void;
  /** surroundings loaded (count of houses), or failed (null) */
  onContext?: (n: number | null) => void;
  /** edit mode: selection changed */
  onEditSelect?: (ids: string[]) => void;
  /** edit mode: house under the pointer */
  onEditHover?: (info: { id: string; floors: number; roof: string; est: boolean; edited: boolean } | null, x: number, y: number) => void;
};

type BlockObj = {
  def: BlockDef;
  group: THREE.Group;
  tower: THREE.Mesh;
  podium: THREE.Mesh;
  cap: THREE.Mesh;
  edges: THREE.LineSegments;
  materials: THREE.MeshStandardMaterial[];
  clipPlane: THREE.Plane;
  /** facade relief, balconies, roof plant … (blocks without the detailed model) */
  detail: THREE.Group | null;
};

const PALETTES = [
  { wall: '#efe6d3', window: '#4f6f86', band: '#c9b48a' },
  { wall: '#e9d9b4', window: '#56788c', band: '#b79a5f' },
  { wall: '#f2efe8', window: '#506a80', band: '#b9a47c' },
];

const TOWER_FLOORS = FLOORS - 1; // 2..16 above the commercial ground floor
const TOWER_H = TOWER_FLOORS * FLOOR_H;
const TOP_Y = GROUND_H + TOWER_H;

/** 4 × 4 bays per texture (so the lit windows at night do not repeat bay by bay) */
const FB = 4;
function facadeTexture(p: (typeof PALETTES)[number]) {
  const c = document.createElement('canvas');
  c.width = 128 * FB; c.height = 96 * FB;
  const g = c.getContext('2d')!;
  g.fillStyle = p.wall; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < FB; i++) for (let j = 0; j < FB; j++) {
    const x = i * 128, y = j * 96;
    // window
    g.fillStyle = p.window; g.fillRect(x + 24, y + 14, 80, 56);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 24, y + 14, 80, 18);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 62, y + 14, 4, 56);
    // balcony slab
    g.fillStyle = p.band; g.fillRect(x, y + 76, 128, 8);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y + 84, 128, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** the windows of facadeTexture lit at night, about 40 % of them */
function facadeLit(seed: number) {
  const c = document.createElement('canvas');
  c.width = 128 * FB; c.height = 96 * FB;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  let sd = seed; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const warm = ['#ffcf8f', '#ffdca8', '#ffe8c4', '#f7c27a', '#d9e6ff'];
  for (let i = 0; i < FB; i++) for (let j = 0; j < FB; j++) {
    if (r() > 0.4) continue;
    g.fillStyle = warm[Math.floor(r() * warm.length)]; g.fillRect(i * 128 + 24, j * 96 + 14, 80, 56);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function storefrontTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8cfbf'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#2c3e4d'; g.fillRect(6, 14, 116, 42);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(6, 14, 116, 12);
  g.fillStyle = '#b8ab94'; g.fillRect(0, 0, 128, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelSprite(n: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f4d3c'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#e3b878'; g.stroke();
  g.fillStyle = '#fff'; g.font = '700 58px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(9, 9, 1);
  s.renderOrder = 10;
  return s;
}

export class ComplexScene {
  private renderer: Renderer;
  /** the WebGPU backend initialises asynchronously; nothing is drawn before */
  private ready = false;
  private scene = new THREE.Scene();
  /** block numbers: drawn on top after the main pass (kept out of AO / bloom / tone mapping) */
  private overlay = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private ray = new THREE.Raycaster();
  private blocks: BlockObj[] = [];
  private type4: BlockDef[] = [];
  private inst: THREE.InstancedMesh | null = null;
  private instMats: THREE.Matrix4[] = [];
  private plan!: THREE.Mesh;
  private labels: THREE.Sprite[] = [];
  private clouds = new CloudDome();
  private yard: Yard | null = null;
  private prog: ProgressView | null = null;
  private progOn = false;
  private matVis = new Map<THREE.Material, boolean>();
  private lastT = performance.now();
  private floorBand: THREE.Mesh;
  private raf = 0;
  private selected: number | null = null;
  private hovered: number | null = null;
  private floor: number | null = null;
  private camGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  // draw on demand: only while something changes (camera, time of day, the UI, a load); the Ultra pipeline adds its
  // own frames until TRAA has settled. Otherwise the GPU idles.
  private dirty = true;
  private proWants = false;
  /** draw every frame until this time (ms): the start-up, any input on the page, loads */
  private awake = performance.now() + 10000;
  private wake(ms = 1500) { this.dirty = true; this.awake = Math.max(this.awake, performance.now() + ms); }
  /** any input on the page may change the scene through the UI (React → setSelected, setFloor …) */
  private onInput = () => this.wake();
  private static INPUT = ['pointerdown', 'pointerup', 'keydown', 'wheel', 'input', 'change'] as const;
  /** district trees further than this from the camera (per 160 m tile) cast no shadow (Context.lod) */
  treeShadowR = 260;
  // lighter image while the camera moves: when a full-resolution frame takes longer than ~30 ms (below ~33 FPS),
  // the frames of a movement are drawn at 0.75 of the resolution; standing still, full resolution again (TRAA
  // sharpens it). Never on a computer fast enough.
  private baseDpr = Math.min(window.devicePixelRatio, 2);
  private moveT = 0;
  private lastDraw = 0;
  /** smoothed full-resolution frame time (ms) */
  private fullMs = 0;
  private lowRes = false;
  private ro: ResizeObserver;
  private down = { x: 0, y: 0 };
  private hoverPending = false;
  private lastPtr = { x: 0, y: 0 };
  // surroundings
  private ctx: Context | null = null;
  private ctxVisible = true;
  private court: Courtyard | null = null;
  private court3D = true;
  private planOn = true;
  private fileOverrides: Overrides = {};
  private edits: Overrides = loadLocalEdits();
  private planFull!: THREE.BufferGeometry;
  private planSite: THREE.BufferGeometry | null = null;
  private base!: THREE.Mesh;
  private ground!: ReturnType<typeof groundMaterial>;
  // the city beyond the neighbourhood (grey boxes, outer.ts) and ?edit=2 marking of its buildings
  private outer: OuterCity | null = null;
  private outerData: Awaited<ReturnType<typeof loadOuter>> = null;
  private outerEdit: ((n: number) => void) | null = null;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  // time of day: real sun over Tashkent, physical sky as background and image-based light
  private hour = DEFAULT_HOUR;
  /** the hour glides between the time stops (timeStops.ts) */
  private glide = new HourGlide(DEFAULT_HOUR);
  private pro: ProRenderer | null = null;
  /** the light build's sky: one texture updated in place (sky.ts SkyMap) */
  private sky: SkyMap | null = null;
  private nightF = 0;
  private nightMats: THREE.MeshStandardMaterial[] = [];
  private glowMats: [THREE.MeshStandardMaterial, number][] = [];
  private glassNight: THREE.MeshPhysicalMaterial | null = null;
  // edit mode (?edit=1): pick houses instead of blocks
  private editing = false;
  private boxMode = false;
  private picked = new Set<string>();
  private boxEl: HTMLDivElement | null = null;
  private boxStart: { x: number; y: number } | null = null;

  constructor(private el: HTMLElement, private cb: SceneCallbacks) {
    this.renderer = createRenderer({ antialias: !PRO.create });   // Ultra: TRAA instead of MSAA
    // Ultra: every street and path lamp is a real light; clustered (Forward+) lighting keeps ~600 of them cheap
    LAMP_LIGHTS.real = !!PRO.create;
    if (PRO.create) (this.renderer as unknown as { lighting: unknown }).lighting = new ClusteredLighting(1024);
    this.renderer.setPixelRatio(this.baseDpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    el.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#cfdde6');
    this.scene.fog = new THREE.Fog('#cfdde6', 380, 900);

    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);     // the outer city reaches ~1.8 km
    this.camera.position.set(190, 170, 230);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 520;
    this.controls.target.set(0, 10, 10);

    this.controls.addEventListener('start', () => (this.camGoal = null));
    this.controls.addEventListener('change', () => { this.dirty = true; this.moveT = performance.now(); });
    ComplexScene.INPUT.forEach((t) => addEventListener(t, this.onInput, { capture: true, passive: true }));
    // textures and models load through the default manager; the scene changes a little after each file (parsing,
    // instancing), so keep drawing a while after the last one
    THREE.DefaultLoadingManager.onStart = THREE.DefaultLoadingManager.onProgress = () => this.wake(8000);
    this.addLights();
    this.addGround();
    BLOCKS.forEach((b) => this.addBlock(b));
    this.addType4();
    this.initContext();
    if (PRO.create) {
      // PRO build: HDR sky, PBR textures, AO, bloom
      this.pro = PRO.create({
        renderer: this.renderer, scene: this.scene, camera: this.camera, sun: this.sun, hemi: this.hemi,
        isCut: () => true, redraw: () => (this.dirty = true), emit: () => {}, overlay: this.overlay, clouds: this.clouds,
        hidden: () => [this.floorBand].filter(Boolean) as THREE.Object3D[],
      });
      // Ultra: cascaded shadows — sharp near the camera, still covering the whole district far away
      if (!location.search.includes('nocsm')) {        // ?nocsm: one plain shadow map (comparison, debugging)
        this.sun.shadow.mapSize.set(2048, 2048);
        const n = Number(new URLSearchParams(location.search).get('csm')) || 4;     // ?csm=3: fewer cascades (comparison)
        const csm = new CSMShadowNode(this.sun, { cascades: n, maxFar: 900, mode: 'practical', lightMargin: 300 });
        csm.fade = true;
        (this.sun.shadow as unknown as { shadowNode: unknown }).shadowNode = csm;
      }
    }
    this.applyHour(this.hour);
    void this.renderer.init().then(() => (this.ready = true));

    this.floorBand = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#e3b878', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.floorBand.visible = false;
    this.scene.add(this.floorBand);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerleave', () => this.setHover(null, 0, 0));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.loop();
  }

  // ---------- setup ----------
  private addLights() {
    this.scene.add(this.clouds.mesh);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#7d8b78', 1.0);
    this.scene.add(this.hemi);
    // Ultra: the atmosphere's sun (colour and strength from the air it crosses); otherwise a plain light
    const sun = (this.sun = new THREE.DirectionalLight('#fff3de', 2.2));
    sun.color.set('#fff3de'); sun.intensity = 2.2;
    sun.position.set(-120, 220, 140);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const s = 270;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 700 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun, sun.target);   // the target in the scene: its world matrix follows (shadows, the atmosphere sun)
  }

  private addGround() {
    // the free land between the streets and houses: earth and grass photo textures (ground.ts)
    this.ground = groundMaterial();
    const base = (this.base = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.ground.material));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.05;
    base.receiveShadow = true;
    this.scene.add(base);

    const tex = new THREE.TextureLoader().load('plan.jpg');
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.planFull = new THREE.PlaneGeometry(PLAN_SIZE.w, PLAN_SIZE.d);
    this.plan = new THREE.Mesh(
      this.planFull,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
    );
    this.plan.rotation.x = -Math.PI / 2;
    this.plan.position.set(0, 0.02, 0);
    this.plan.receiveShadow = true;
    this.scene.add(this.plan);
  }

  private addBlock(def: BlockDef) {
    const pal = PALETTES[def.id % PALETTES.length];
    const group = new THREE.Group();
    group.position.set(def.x, 0, def.z);
    group.rotation.y = def.rot;

    const { w, d } = def;
    const real = !T4_LOOK(def.id);
    const sideTex = real ? glassTexture(pal) : facadeTexture(pal);
    const endTex = sideTex.clone(); endTex.needsUpdate = true;
    sideTex.repeat.set(Math.max(1, Math.round(w / 3.2)) / FB, TOWER_FLOORS / FB);
    endTex.repeat.set(Math.max(1, Math.round(d / 3.2)) / FB, TOWER_FLOORS / FB);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#8a8f93', roughness: 0.9 });
    const mk = (map: THREE.Texture, k: number) => {
      const lit = real ? litTexture(def.id * 7 + k) : facadeLit(def.id * 7 + k); lit.repeat.copy(map.repeat);
      const m = new THREE.MeshStandardMaterial({ map, roughness: real ? 0.1 : 0.85, metalness: real ? 0.5 : 0, envMapIntensity: real ? 1.5 : 1, emissiveMap: lit, emissive: '#ffffff', emissiveIntensity: 0 });
      this.nightMats.push(m);
      return m;
    };
    const mSide = mk(sideTex, 1); // ±z faces (length w)
    const mEnd = mk(endTex, 2); // ±x faces (length d)
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
    const towerMats = [mEnd, mEnd, roofMat, roofMat, mSide, mSide];
    towerMats.forEach((m) => (m.clippingPlanes = [clipPlane]));

    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, TOWER_H, d), towerMats);
    tower.position.y = GROUND_H + TOWER_H / 2;
    tower.castShadow = tower.receiveShadow = true;

    const sf = real ? shopTexture() : storefrontTexture();
    const sf2 = sf.clone(); sf2.needsUpdate = true;
    sf.repeat.set(Math.max(1, Math.round(w / 4)), 1);
    sf2.repeat.set(Math.max(1, Math.round(d / 4)), 1);
    const shopP = real ? { roughness: 0.14, metalness: 0.3, envMapIntensity: 1.3, emissive: '#ffd9a0', emissiveIntensity: 0 } : { roughness: 0.7 };
    const podMat = [
      new THREE.MeshStandardMaterial({ map: sf2, ...shopP }),
      new THREE.MeshStandardMaterial({ map: sf2, ...shopP }),
      roofMat, roofMat,
      new THREE.MeshStandardMaterial({ map: sf, ...shopP }),
      new THREE.MeshStandardMaterial({ map: sf, ...shopP }),
    ];
    const podium = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, GROUND_H, d + 0.6), podMat);
    podium.position.y = GROUND_H / 2;
    podium.castShadow = podium.receiveShadow = true;

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.8, 0.8, d + 0.8),
      new THREE.MeshStandardMaterial({ color: '#d9cdb2', roughness: 0.8 }),
    );
    cap.position.y = TOP_Y + 0.4;
    cap.castShadow = true;
    (cap.material as THREE.Material).clippingPlanes = [clipPlane];

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 1.2, TOP_Y + 1.6, d + 1.2)),
      new THREE.LineBasicMaterial({ color: '#e3b878' }),
    );
    edges.position.y = (TOP_Y + 1.6) / 2;
    edges.visible = false;

    if (T4_LOOK(def.id)) {
      // real type-4 model is drawn by one InstancedMesh; keep the boxes as invisible pick/clip proxies
      for (const m of [...towerMats, ...podMat, cap.material as THREE.Material]) m.visible = false;
      tower.castShadow = podium.castShadow = cap.castShadow = false;
      this.type4.push(def);
    }
    if (real) for (const m of podMat) if (m !== roofMat) { m.emissiveMap = m.map; this.glowMats.push([m, 0.55]); }   // shop windows glow at night
    group.add(tower, podium, cap, edges);
    let detail: THREE.Group | null = null;
    if (real) {
      const dt = buildDetail(def, pal);
      detail = dt.group;
      dt.materials.forEach((m) => (m.clippingPlanes = [clipPlane]));
      this.glowMats.push(...dt.night);
      group.add(detail);
    }
    group.userData.blockId = def.id;
    tower.userData.blockId = podium.userData.blockId = def.id;
    this.scene.add(group);

    const label = labelSprite(def.id);
    label.position.set(def.x, TOP_Y + 8, def.z);
    label.material.toneMapped = false;
    this.overlay.add(label);
    this.labels.push(label);

    this.blocks.push({ def, group, tower, podium, cap, edges, clipPlane, detail, materials: [mSide, mEnd] });
  }

  /** Detailed type-4 blocks (1,2,12,13,15,16,18) as one InstancedMesh built from the drawings. */
  private addType4() {
    if (!this.type4.length) return;
    const mb = mergedBlock(true);
    if (BLOCK_GLB) {
      // the materials get the baked-occlusion input now, so the model's arrival swaps geometry only (no second
      // shader compile); the drawn placeholder reads the map's white corner through an empty second UV set
      mb.geometry.setAttribute('uvb', new THREE.BufferAttribute(new Float32Array(mb.geometry.getAttribute('position').count * 2), 2));
      enableBakedAO();
    }
    // facade wash at night (shared facade materials) and, for this view only, warm glazing after dark
    const lib = materials();
    facadeGlow(lib);
    const glass = lib.glass as THREE.MeshPhysicalMaterial;
    this.glassNight = glass.clone();
    this.glassNight.emissive.set('#ffcf8f');
    this.glassNight.emissiveIntensity = 0;
    const mats = (mb.materials as THREE.Material[]).map((m) => (m === glass ? this.glassNight! : m));
    const inst = new THREE.InstancedMesh(mb.geometry, mats, this.type4.length);
    const m = new THREE.Matrix4(), r = new THREE.Matrix4(), c = new THREE.Matrix4().makeTranslation(-BLOCK_W / 2, 0, -BLOCK_D / 2);
    this.type4.forEach((def, i) => {
      // long axis of the real block (29.7 m) along the footprint's long side; street facade faces outward
      r.makeRotationY(blockTheta(def));
      const [sx, sz] = t4Fit(def, BLOCK_W, BLOCK_D);      // blocks of other designs: the model fitted to the footprint
      m.makeTranslation(def.x, 0, def.z).multiply(r).multiply(new THREE.Matrix4().makeScale(sx, 1, sz)).multiply(c);
      inst.setMatrixAt(i, m);
      this.instMats.push(m.clone());
    });
    this.inst = inst;
    inst.castShadow = inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.scene.add(inst);
    // Blender model with baked contact shadows replaces the drawn geometry once it has arrived (desktop)
    if (BLOCK_GLB && realTreesOk()) void loadBlockGlb().then((g) => {
      if (!g || this.inst !== inst) return;
      const ms = g.names.map((n) => (n === 'glass' ? this.glassNight! : lib[n]));
      if (ms.some((x) => !x)) return;
      inst.geometry = g.geometry;
      inst.material = ms;
      if (g.ao) BAKE_AO.value = g.ao;
      inst.computeBoundingSphere();
      this.wake(3000);
    });
  }

  // ---------- public API ----------
  /** Time of day (one of the stops of timeStops.ts): glides there over ~1.5 s; instant = jump. */
  setHour(h: number, instant = false) {
    this.glide.set(h, instant);
    if (instant) this.applyHour(h);
  }
  /** Local time on 21 June: sun from the real solar position, sky, ambient light, warm low sun.
   *  moving: while gliding the light build draws its sky at a lower resolution (it is computed on the CPU). */
  private applyHour(h: number, moving = false) {
    this.hour = h; this.dirty = true;
    const dir = sunDir(SUN_DAY, ((h % 24) + 24) % 24), { el, nightF, dusk, dayK } = daylight(dir);
    this.sun.position.copy(dir).multiplyScalar(420);
    const low = THREE.MathUtils.clamp(el / 25, 0, 1);
    this.sun.intensity = 3.1 * dayK * (0.35 + 0.65 * low);
    this.sun.color.set('#ffb070').lerp(new THREE.Color('#fff3de'), low);
    this.hemi.intensity = 0.1 + 0.28 * dayK + 0.14 * nightF;   // moonlight keeps the night readable
    this.hemi.color.set('#dfe9f5').lerp(new THREE.Color('#3d4a70'), nightF);
    this.nightF = nightF; this.applyNight();
    this.clouds.setSun(dir, { dayK, dusk, nightF });
    if (this.pro) { this.pro.hour({ sunDir: dir, nightF, dusk, dayK, hour: h, moving }); return; }
    const sky = (this.sky ??= new SkyMap());
    const hz = sky.update({ sun: dir, night: nightF, gain: 0.55 }, moving);
    this.scene.background = sky.texture;
    (this.scene as unknown as { backgroundNode: unknown }).backgroundNode = sky.backgroundNode;   // see SkyMap.backgroundNode
    this.scene.environment = sky.texture;                  // the renderer prefilters it (PMREM) by itself
    this.scene.environmentIntensity = 0.1 + 0.42 * dayK + 0.12 * nightF;
    (this.scene.fog as THREE.Fog).color.setRGB(Math.min(1, hz[0]), Math.min(1, hz[1]), Math.min(1, hz[2]), THREE.LinearSRGBColorSpace);
    this.renderer.toneMappingExposure = 1.0 + 0.3 * nightF;
  }
  getHour() { return this.hour; }
  /** lit windows, street and path lamps, the evening wash on the type-4 facades */
  private applyNight() {
    const n = this.nightF;
    FACADE_NIGHT.value = n;
    this.nightMats.forEach((m) => (m.emissiveIntensity = 1.2 * n));
    this.glowMats.forEach(([m, k]) => (m.emissiveIntensity = k * n));
    if (this.glassNight) this.glassNight.emissiveIntensity = 0.55 * n;
    this.ctx?.setNight(n);
    this.court?.setNight(n);
  }
  isPro() { return !!this.pro; }

  setPlanVisible(v: boolean) { this.planOn = v; this.syncPlan(); }
  /** the 3D landscaping replaces the plan picture inside the site */
  setCourtyard3D(v: boolean) { this.court3D = v; this.syncPlan(); }
  private syncPlan() {
    const c3 = this.court3D && !!this.court;
    if (this.court) this.court.group.visible = c3;
    this.plan.visible = this.planOn && !c3;
  }

  // ---------- surroundings ----------
  private async initContext() {
    const r = await loadContext();
    if (!r) { this.cb.onContext?.(null); return; }
    this.fileOverrides = r.file;
    this.ctx = new Context(r.data, () => this.wake());
    this.wake(8000);
    void this.ctx.glb?.ready.then(() => this.wake(3000));
    this.ctx.build(this.fileOverrides, this.edits);
    this.planSite = siteGeometry(r.data.site, PLAN_SIZE.w, PLAN_SIZE.d);
    this.scene.add(this.ctx.group);
    this.setContextVisible(this.ctxVisible);
    const court = await loadCourtyard();
    const yd = court ? await loadYard() : null;
    // more lawn trees, a hedge instead of tall trees in front of the blocks (courtLayout.ts, shared with the block page)
    const cut = court ? layoutCourtyard(court, yd, this.instMats) : [];
    if (court) { this.court = new Courtyard(court, r.data.site, cut); this.scene.add(this.court.group); }
    if (yd && this.court) { this.yard = new Yard(yd); this.court.group.add(this.yard.group); }
    void this.court?.glb?.ready.then(() => this.wake(3000));
    this.wake(8000);
    this.syncPlan();
    this.applyNight();
    this.cb.onContext?.(r.data.buildings.length);
    // the outer city: grey boxes out to ~1.8 km; the haze moves out so they show
    const od = await loadOuter();
    if (od) {
      this.outerData = od; this.outer = new OuterCity(od);
      this.outer.group.visible = this.ctxVisible;
      this.scene.add(this.outer.group);
      const fog = this.scene.fog as THREE.Fog; fog.near = 600; fog.far = 2600;
      this.controls.maxDistance = this.outerEdit ? 2200 : 900;
      this.wake(3000);
    }
  }
  /** show the neighbourhood; the plan image is then clipped to the site so it does not cover the streets */
  setContextVisible(v: boolean) {
    this.ctxVisible = v;
    if (!this.ctx) return;
    this.ctx.group.visible = v;
    if (this.outer) this.outer.group.visible = v;
    this.plan.geometry = v && this.planSite ? this.planSite : this.planFull;
    (this.base.material as THREE.MeshStandardMaterial).color.set(v ? '#9c9684' : '#a9b59a');
  }
  setContextStyle(s: CtxStyle) {
    this.ctx?.setStyle(s); this.court?.setStyle(s); if (this.yard) this.yard.group.visible = s !== 'white';
    this.ground.setTextured(s !== 'white');
    (this.base.material as THREE.MeshStandardMaterial).color.set(s === 'white' ? '#e9e8e3' : this.ctxVisible ? '#9c9684' : '#a9b59a');
  }
  hasCourtyard() { return !!this.court; }

  setEditCallbacks(onSelect?: SceneCallbacks['onEditSelect'], onHover?: SceneCallbacks['onEditHover']) {
    this.cb.onEditSelect = onSelect; this.cb.onEditHover = onHover;
  }
  setEditMode(on: boolean) {
    this.editing = on;
    if (!on) { this.setBoxMode(false); this.picked.clear(); this.ctx?.showSelection(this.picked); }
  }
  /** drag a rectangle to select every house whose centre falls inside it */
  setBoxMode(on: boolean) {
    this.boxMode = on;
    this.controls.enabled = !on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  }
  /** apply a change to every selected house; floors may be relative (+1 / −1) */
  editSelected(ch: { dFloors?: number; floors?: number; roof?: Override['roof']; hidden?: boolean; reset?: boolean }) {
    if (!this.ctx) return;
    for (const b of this.ctx.data.buildings) {
      if (!this.picked.has(b.id)) continue;
      if (ch.reset) { delete this.edits[b.id]; continue; }
      const cur = resolve(b, this.fileOverrides, this.edits);
      const o: Override = { ...(this.edits[b.id] ?? {}) };
      if (ch.dFloors) o.floors = Math.max(1, Math.min(40, cur.floors + ch.dFloors));
      if (ch.floors !== undefined) o.floors = ch.floors;
      if (ch.roof) o.roof = ch.roof;
      if (ch.hidden !== undefined) o.hidden = ch.hidden;
      this.edits[b.id] = o;
    }
    saveLocalEdits(this.edits);
    this.ctx.build(this.fileOverrides, this.edits);
    this.ctx.showSelection(this.picked);
  }
  clearAllEdits() {
    this.edits = {};
    saveLocalEdits(this.edits);
    this.ctx?.build(this.fileOverrides, this.edits);
    this.ctx?.showSelection(this.picked);
  }
  editCount() { return Object.keys(this.edits).length; }
  /** overrides.json content: the file's overrides with this browser's edits on top */
  exportOverrides(): Overrides {
    const out: Overrides = JSON.parse(JSON.stringify(this.fileOverrides));
    for (const [id, o] of Object.entries(this.edits)) out[id] = { ...(out[id] ?? {}), ...o };
    return out;
  }
  /** summary of the selection for the edit panel */
  selectionInfo() {
    if (!this.ctx) return null;
    const sel = this.ctx.data.buildings.filter((b) => this.picked.has(b.id)).map((b) => ({ b, r: resolve(b, this.fileOverrides, this.edits) }));
    if (!sel.length) return null;
    const floors = [...new Set(sel.map((x) => x.r.floors))];
    const roofs = [...new Set(sel.map((x) => x.r.roof))];
    return { n: sel.length, floors: floors.length === 1 ? floors[0] : null, roof: roofs.length === 1 ? roofs[0] : null, hidden: sel.every((x) => x.r.hidden) };
  }
  private setPicked(ids: Iterable<string>, add: boolean) {
    if (!add) this.picked.clear();
    for (const id of ids) { if (add && this.picked.has(id)) this.picked.delete(id); else this.picked.add(id); }
    this.ctx?.showSelection(this.picked);
    this.cb.onEditSelect?.([...this.picked]);
  }
  private pickHouse(clientX: number, clientY: number) {
    if (!this.ctx || !this.ctx.group.visible) return -1;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.ctx.pick(this.ray);
  }
  /** ?edit=2: mark buildings of the outer city (cb gets the number of marks) */
  setOuterEdit(cb: ((n: number) => void) | null) {
    this.outerEdit = cb;
    this.controls.maxDistance = cb ? 2200 : this.outer ? 900 : 520;
    if (!cb) this.outer?.setHover(-1);
    cb?.(this.outer?.picks.size ?? 0);
  }
  outerClear() { this.outer?.clear(); this.outerEdit?.(0); }
  outerExport() { return this.outer && this.outerData ? this.outer.exportPicks(this.outerData) : null; }
  setLabelsVisible(v: boolean) { this.labels.forEach((l) => (l.visible = v)); }

  /** Selecting a block isolates it: every other block disappears and the orbit centre moves to it. */
  setSelected(id: number | null) {
    this.selected = id;
    this.blocks.forEach((b) => { b.group.visible = id === null || b.def.id === id; b.edges.visible = false; });
    this.labels.forEach((l) => (l.visible = id === null && !this.progOn));
    if (this.inst) {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      this.type4.forEach((d, i) => this.inst!.setMatrixAt(i, id === null || d.id === id ? this.instMats[i] : zero));
      this.inst.instanceMatrix.needsUpdate = true;
      this.inst.computeBoundingSphere();
    }
    if (id === null) {
      this.floorBand.visible = false;
      this.blocks.forEach((b) => (b.clipPlane.constant = 1000));
      this.controls.minDistance = 20;
      this.flyTo(new THREE.Vector3(190, 170, 230), new THREE.Vector3(0, 10, 10));
      return;
    }
    const b = this.blocks.find((x) => x.def.id === id)!;
    const c = new THREE.Vector3(b.def.x, 24, b.def.z);
    const dir = new THREE.Vector3(c.x, 0, c.z);
    if (dir.lengthSq() < 1) dir.set(1, 0, 1);
    dir.normalize().multiplyScalar(105);
    this.controls.minDistance = 12;
    this.flyTo(new THREE.Vector3(c.x + dir.x, 46, c.z + dir.z), c);
    this.setFloor(this.floor);
  }

  /** floor: 1..16 → cut the selected block above this floor and highlight it. null → whole building. */
  setFloor(f: number | null) {
    this.floor = f;
    this.blocks.forEach((b) => (b.clipPlane.constant = 1000));
    this.floorBand.visible = false;
    if (this.selected === null || f === null) return;
    const b = this.blocks.find((x) => x.def.id === this.selected)!;
    const bottom = f === 1 ? 0 : GROUND_H + (f - 2) * FLOOR_H;
    const top = f === 1 ? GROUND_H : bottom + FLOOR_H;
    b.clipPlane.constant = top + 0.01; // keep everything below `top`
    this.floorBand.visible = true;
    this.floorBand.scale.set(b.def.w + 1.4, top - bottom, b.def.d + 1.4);
    this.floorBand.position.set(b.def.x, (top + bottom) / 2, b.def.z);
    this.floorBand.rotation.y = b.def.rot;
  }

  // ---------- live construction progress ----------
  /** mi: month index on the construction timeline (null = off). Blocks under construction are drawn as built. */
  setProgress(mi: number | null, lang: 'uz' | 'ru' = 'uz') {
    const on = mi !== null;
    if (on && !this.prog) { this.prog = new ProgressView(); this.scene.add(this.prog.group); this.overlay.add(this.prog.labels); }
    if (this.prog) { this.prog.group.visible = on; this.prog.labels.visible = on; }
    this.progOn = on;
    if (on) this.prog!.update(mi!, lang);
    this.labels.forEach((l) => (l.visible = !on && this.selected === null));
    // blocks still being built hide their finished model (kept as invisible pick proxies)
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const b of this.blocks) {
      const p = on ? this.prog!.state.get(b.def.id) : undefined;
      const hide = !!p && !ProgressView.finished(p);
      for (const mesh of [b.tower, b.podium, b.cap]) {
        const ms = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
        for (const m of ms) {
          if (!this.matVis.has(m)) this.matVis.set(m, m.visible);
          m.visible = hide ? false : this.matVis.get(m)!;
        }
        mesh.castShadow = !hide && !T4_LOOK(b.def.id);
      }
      if (b.detail) b.detail.visible = !hide;
    }
    if (this.inst) {
      this.type4.forEach((d, i) => {
        const p = on ? this.prog!.state.get(d.id) : undefined;
        const hide = (!!p && !ProgressView.finished(p)) || (this.selected !== null && d.id !== this.selected);
        this.inst!.setMatrixAt(i, hide ? zero : this.instMats[i]);
      });
      this.inst.instanceMatrix.needsUpdate = true;
      this.inst.computeBoundingSphere();
    }
  }
  progressOf(id: number) { return this.progOn ? this.prog?.state.get(id) ?? null : null; }

  resetView() { this.setSelected(null); }
  /** Jump straight to the camera goal (tests / reduced motion). */
  finish() {
    if (!this.camGoal) return;
    this.camera.position.copy(this.camGoal.pos); this.controls.target.copy(this.camGoal.target); this.camGoal = null; this.controls.update();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    ComplexScene.INPUT.forEach((t) => removeEventListener(t, this.onInput, { capture: true }));
    THREE.DefaultLoadingManager.onStart = THREE.DefaultLoadingManager.onProgress = () => {};
    this.boxEl?.remove();
    this.ro.disconnect();
    this.controls.dispose();
    this.prog?.dispose(); this.clouds.dispose();
    LAMP_LIGHTS.real = false;
    this.pro?.dispose(); this.sky?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- internals ----------
  private flyTo(pos: THREE.Vector3, target: THREE.Vector3) {
    this.camGoal = { pos, target };
  }

  private resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pro?.resize(w, h);
    this.wake();
  }

  private outerPick(clientX: number, clientY: number) {
    if (!this.outer || !this.outer.group.visible) return -1;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.outer.pick(this.ray);
  }
  private pick(clientX: number, clientY: number): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const meshes = this.blocks.filter((b) => b.group.visible).flatMap((b) => [b.tower, b.podium]);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.userData.blockId as number) : null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
    if (this.editing && this.boxMode) {
      this.boxStart = { x: e.clientX, y: e.clientY };
      if (!this.boxEl) {
        this.boxEl = document.createElement('div');
        Object.assign(this.boxEl.style, { position: 'fixed', border: '2px dashed #e3b878', background: 'rgba(227,184,120,.15)', pointerEvents: 'none', zIndex: '4' });
        document.body.appendChild(this.boxEl);
      }
      this.drawBox(e.clientX, e.clientY);
    }
  };
  private drawBox(x: number, y: number) {
    if (!this.boxEl || !this.boxStart) return;
    const l = Math.min(x, this.boxStart.x), t = Math.min(y, this.boxStart.y);
    Object.assign(this.boxEl.style, { left: l + 'px', top: t + 'px', width: Math.abs(x - this.boxStart.x) + 'px', height: Math.abs(y - this.boxStart.y) + 'px', display: 'block' });
  }
  private onUp = (e: PointerEvent) => {
    if (this.editing && this.boxMode && this.boxStart && this.ctx) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const x0 = Math.min(e.clientX, this.boxStart.x), x1 = Math.max(e.clientX, this.boxStart.x);
      const y0 = Math.min(e.clientY, this.boxStart.y), y1 = Math.max(e.clientY, this.boxStart.y);
      this.boxStart = null;
      if (this.boxEl) this.boxEl.style.display = 'none';
      const ids: string[] = [];
      const v = new THREE.Vector3();
      this.ctx.data.buildings.forEach((b, i) => {
        v.copy(this.ctx!.centre(i)).project(this.camera);
        if (v.z > 1) return;
        const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.push(b.id);
      });
      this.setPicked(ids, e.shiftKey);
      return;
    }
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return; // it was a drag
    if (this.outerEdit && this.outer) {
      const id = this.outerPick(e.clientX, e.clientY);
      if (id >= 0) { this.outer.toggle(id, e.shiftKey); this.outerEdit(this.outer.picks.size); }
      return;
    }
    if (this.editing) {
      const i = this.pickHouse(e.clientX, e.clientY);
      this.setPicked(i >= 0 ? [this.ctx!.data.buildings[i].id] : [], e.shiftKey && i >= 0);
      return;
    }
    this.cb.onSelect(this.pick(e.clientX, e.clientY));
  };
  private onMove = (e: PointerEvent) => {
    this.lastPtr = { x: e.clientX, y: e.clientY };
    if (this.editing && this.boxMode && this.boxStart) { this.drawBox(e.clientX, e.clientY); return; }
    if (this.outerEdit && this.outer) {
      if (e.buttons || this.hoverPending) return;
      this.hoverPending = true;
      requestAnimationFrame(() => {
        this.hoverPending = false;
        const id = this.outerPick(this.lastPtr.x, this.lastPtr.y);
        this.outer?.setHover(id); this.renderer.domElement.style.cursor = id >= 0 ? 'pointer' : 'grab'; this.dirty = true;
      });
      return;
    }
    if (this.editing) {
      if (e.buttons || this.hoverPending) return;
      this.hoverPending = true;
      requestAnimationFrame(() => {
        this.hoverPending = false;
        const i = this.pickHouse(this.lastPtr.x, this.lastPtr.y);
        if (i < 0 || !this.ctx) { this.cb.onEditHover?.(null, 0, 0); return; }
        const b = this.ctx.data.buildings[i], r = resolve(b, this.fileOverrides, this.edits);
        this.cb.onEditHover?.({ id: b.id, floors: r.floors, roof: r.roof, est: b.s === 'est', edited: r.edited }, this.lastPtr.x, this.lastPtr.y);
      });
      return;
    }
    if (e.buttons || this.hoverPending) return;
    this.hoverPending = true;
    requestAnimationFrame(() => {
      this.hoverPending = false;
      this.setHover(this.pick(this.lastPtr.x, this.lastPtr.y), this.lastPtr.x, this.lastPtr.y);
    });
  };
  private setHover(id: number | null, x: number, y: number) {
    if (id !== this.hovered) {
      this.hovered = id; this.dirty = true;
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      this.blocks.forEach((b) => {
        const on = b.def.id === id;
        b.materials.forEach((m) => m.emissive.set(on ? '#3a2a10' : '#000000'));
      });
    }
    this.cb.onHover(id, x, y);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastT) / 1000); this.lastT = now;
    if (this.camGoal) {
      const k = 0.08;
      this.camera.position.lerp(this.camGoal.pos, k);
      this.controls.target.lerp(this.camGoal.target, k);
      if (this.camera.position.distanceTo(this.camGoal.pos) < 0.3) this.camGoal = null;
    }
    this.controls.dampingFactor = orbitDamping(dt);
    this.controls.update();
    if (keepAboveGround(this.camera.position, this.controls.target, 2)) this.dirty = true;
    if (this.progOn) { this.prog?.tick(dt); this.dirty = true; }        // the cranes turn
    if (this.glide.tick(dt)) this.applyHour(this.glide.hour, this.glide.moving);
    if (!this.ready) return;
    // nothing changed and the Ultra pipeline has settled: no frame (the GPU idles)
    const changed = this.dirty || !!this.camGoal || now < this.awake;
    this.dirty = false;
    if (!changed && !this.proWants) return;
    const moving = !!this.camGoal || now - this.moveT < 300;
    const low = moving && this.fullMs > 30;
    if (low !== this.lowRes) { this.lowRes = low; this.renderer.setPixelRatio(this.baseDpr * (low ? 0.75 : 1)); this.resize(); }
    if (!this.lowRes && this.lastDraw && now - this.lastDraw < 250) this.fullMs = this.fullMs ? this.fullMs * 0.9 + (now - this.lastDraw) * 0.1 : now - this.lastDraw;
    this.lastDraw = now;
    this.ctx?.lod(this.camera.position, this.treeShadowR);
    renderStats.view = 'kompleks';
    renderStats.effects = this.pro ? ['SSGI', 'TRAA', 'Bloom', 'CSM soyalar', 'Klasterli chiroqlar', 'AgX/Neutral tonemap'] : ['Oddiy soyalar', 'MSAA'];
    renderStats.lights = this.pro ? LAMP_COUNT.n : 0;
    renderStats.begin(this.renderer);
    if (this.pro) this.proWants = this.pro.frame(changed);   // the labels are part of the Ultra pipeline
    else {
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = false;
      this.renderer.render(this.overlay, this.camera);
      this.renderer.autoClear = true;
    }
    renderStats.end(this.renderer);
  };
}
