// The "Yaqinda" layer of the complex view: radius rings on the ground (500 m … 5 km) with their labels, a pin for each
// place of the panel's list (always on top, a constant size on screen), the chosen one larger with its name, and a
// line on the ground from the complex to it. Data: public/context/nearby.json (tools/nearby/fetch.mjs).
import * as THREE from 'three';

export type NearbyPlace = {
  id: string; cat: string; sub: string; name: string; ru?: string; lat: number; lon: number; x: number; z: number; m: number;
  car: { m: number; min: number } | null; foot: { m: number; min: number } | null;
};
export const RADII = [500, 1000, 1500, 2000, 3000, 5000] as const;
export const radiusLabel = (r: number) => (r < 1000 ? `${r} m` : `${r / 1000} km`);

/** per kind: category colour and a glyph for the pin */
export const SUB: Record<string, { glyph: string; order: number }> = {
  'Maktab': { glyph: '🏫', order: 0 }, 'Bog‘cha': { glyph: '🧸', order: 1 }, 'Oliy ta’lim / kollej': { glyph: '🎓', order: 2 },
  'Shifoxona': { glyph: '🏥', order: 3 }, 'Klinika': { glyph: '⚕️', order: 4 }, 'Dorixona': { glyph: '💊', order: 5 },
  'Supermarket': { glyph: '🛒', order: 6 }, 'Savdo markazi': { glyph: '🛍️', order: 7 }, 'Bozor': { glyph: '🧺', order: 8 },
  'Metro bekati': { glyph: 'Ⓜ️', order: 9 }, 'Avtobus bekati': { glyph: '🚌', order: 10 },
  'Masjid': { glyph: '🕌', order: 11 }, 'Park': { glyph: '🌳', order: 12 }, 'Sport': { glyph: '🏟️', order: 13 },
};
export const CAT: Record<string, { label: string; color: string }> = {
  talim: { label: 'Ta’lim', color: '#5aa9e6' }, sogliq: { label: 'Sog‘liq', color: '#e46d6d' }, savdo: { label: 'Savdo', color: '#e2c785' },
  transport: { label: 'Transport', color: '#6f8cf0' }, masjid: { label: 'Masjid', color: '#7dc9a0' }, dam: { label: 'Dam olish', color: '#9bd36a' },
};

const pinTex = new Map<string, THREE.Texture>();
/** a round pin: the kind's glyph in a ring of the category's colour; `dot` — only a filled dot (many pins at once) */
function pinTexture(sub: string, color: string, dot = false) {
  const key = sub + color + (dot ? '.' : '');
  let t = pinTex.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = dot ? 32 : 96;
  const g = c.getContext('2d')!;
  if (dot) {
    g.fillStyle = color; g.beginPath(); g.arc(16, 16, 12, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3.5; g.strokeStyle = '#0a271d'; g.stroke();
  } else {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(48, 51, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a271d'; g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill();
    g.lineWidth = 7; g.strokeStyle = color; g.stroke();
    g.font = '42px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SUB[sub]?.glyph ?? '•', 48, 51);
  }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  pinTex.set(key, t);
  return t;
}
/** more pins than this: the unchosen ones become dots (5 km has ~900 places) */
const DOTS_FROM = 180;
function textSprite(text: string, color = '#f4f1ea', bg = 'rgba(9,40,29,.88)') {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const font = '600 30px Montserrat, system-ui, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w; c.height = 52;
  g.font = font;
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, 52, 14); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, 28);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.userData.aspect = w / 52;
  s.renderOrder = 21;
  return s;
}

export class NearbyLayer {
  /** in the scene: rings and the line to the chosen place (fogged, under the buildings' shadows) */
  readonly ground = new THREE.Group();
  /** in the overlay: pins and labels, always on top */
  readonly pins = new THREE.Group();
  private items: { p: NearbyPlace; s: THREE.Sprite }[] = [];
  private selected: string | null = null;

  constructor() { this.ground.name = 'nearby'; this.pins.name = 'nearby-pins'; }

  set(radius: number, places: NearbyPlace[], selected: string | null) {
    this.clear();
    this.selected = selected;
    // rings: every radius up to the chosen one, the chosen one gold
    for (const r of RADII) {
      if (r > radius) break;
      const on = r === radius, w = Math.max(2.5, r / 140);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 160),
        new THREE.MeshBasicMaterial({ color: on ? '#e2c785' : '#ffffff', transparent: true, opacity: on ? 0.9 : 0.35, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4; ring.renderOrder = 2;
      this.ground.add(ring);
      if (r < radius * 0.3) continue;                    // the small inner rings' labels would sit on each other
      const label = textSprite(radiusLabel(r), on ? '#0a271d' : '#f4f1ea', on ? 'rgba(226,199,133,.95)' : 'rgba(9,40,29,.8)');
      label.position.set(r * Math.SQRT1_2, 2, -r * Math.SQRT1_2);
      label.scale.set(0.03 * label.userData.aspect, 0.03, 1);
      this.pins.add(label);
    }
    const dots = places.length > DOTS_FROM;
    for (const p of places) {
      const color = CAT[p.cat]?.color ?? '#ffffff', sel = p.id === selected, dot = dots && !sel;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(p.sub, color, dot), depthTest: false, transparent: true, sizeAttenuation: false }));
      const k = sel ? 0.058 : dot ? 0.0125 : 0.034;
      s.scale.set(k, k, 1);
      s.position.set(p.x, 6, p.z);
      s.renderOrder = sel ? 22 : 20;
      this.pins.add(s);
      this.items.push({ p, s });
      if (sel) {
        const name = textSprite(p.name || p.sub);
        name.position.set(p.x, 6, p.z);
        name.center.set(0.5, -0.9);                       // above the pin
        name.scale.set(0.034 * name.userData.aspect, 0.034, 1);
        this.pins.add(name);
        // the line on the ground from the complex to the place
        const d = Math.hypot(p.x, p.z), w = Math.max(3, d / 260);
        const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
          new THREE.MeshBasicMaterial({ color: '#e2c785', transparent: true, opacity: 0.75, depthWrite: false }));
        line.rotation.set(-Math.PI / 2, 0, -Math.atan2(p.x, -p.z));
        line.position.set(p.x / 2, 0.45, p.z / 2);
        line.renderOrder = 3;
        this.ground.add(line);
      }
    }
  }

  /** the place under a screen point (pins are picked on screen: they have a constant size) */
  pick(clientX: number, clientY: number, camera: THREE.Camera, rect: DOMRect) {
    const v = new THREE.Vector3();
    let best: NearbyPlace | null = null, bd = 18;
    for (const { p, s } of this.items) {
      v.copy(s.position).project(camera);
      if (v.z > 1) continue;
      const sx = rect.left + ((v.x + 1) / 2) * rect.width, sy = rect.top + ((1 - v.y) / 2) * rect.height;
      const d = Math.hypot(sx - clientX, sy - clientY) - (p.id === this.selected ? 8 : 0);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  clear() {
    for (const g of [this.ground, this.pins]) {
      for (const o of [...g.children]) {
        g.remove(o);
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material & { map?: THREE.Texture | null };
        // the pin textures are shared (cache); the text ones are per sprite
        if (mat?.map && ![...pinTex.values()].includes(mat.map)) mat.map.dispose();
        mat?.dispose?.();
      }
    }
    this.items = [];
  }
}
