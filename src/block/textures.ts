// Procedural canvas textures (1 texture repeat = 1 metre unless noted). No external image files needed.
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();
function canvasTex(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Light grey plaster noise, tinted by material colour. */
export const plasterTex = () => canvasTex('plaster', 256, (g, s) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, s, s);
  const r = rand(7);
  for (let i = 0; i < 9000; i++) {
    const v = 225 + Math.floor(r() * 30);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
});

/** Tan facing brick, 0.25 x 0.065 m, stretcher bond. Texture covers 1 x 1 m. */
export const brickTex = () => canvasTex('brick', 512, (g, s) => {
  g.fillStyle = '#b09a7c'; g.fillRect(0, 0, s, s);
  const r = rand(11);
  const bw = s / 4, bh = s / 13.3;
  for (let row = 0; row < 14; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const x = col * bw + off, y = row * bh;
      const k = r();
      const base = [208, 184, 146].map((c) => Math.round(c * (0.88 + k * 0.16)));
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
});

/** Girih-style 8-point star lattice. holes = transparent when `alpha`. 1 tile = 0.5 m. */
export function latticeTex(fg: string, bg: string | null, key: string) {
  return canvasTex('lat-' + key, 256, (g, s) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, s, s); } else g.clearRect(0, 0, s, s);
    g.strokeStyle = fg; g.fillStyle = fg;
    g.lineWidth = s * 0.06; g.lineJoin = 'miter';
    const star = (cx: number, cy: number, R: number) => {
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI / 8) * i + Math.PI / 8;
        const rr = i % 2 ? R * 0.62 : R;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath(); g.stroke();
    };
    const h = s / 2;
    for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [h, h]]) star(x, y, s * 0.27);
    // connecting cross bars → interlace
    g.lineWidth = s * 0.05;
    for (const [x, y] of [[h, 0], [0, h], [s, h], [h, s]]) {
      g.beginPath(); g.moveTo(x - s * 0.13, y); g.lineTo(x + s * 0.13, y); g.moveTo(x, y - s * 0.13); g.lineTo(x, y + s * 0.13); g.stroke();
    }
    g.lineWidth = s * 0.035; g.strokeRect(0, 0, s, s);
  });
}

/** Warm oak planks, 0.2 m wide boards, texture covers 2 x 2 m. */
export const woodTex = () => canvasTex('wood', 512, (g, s) => {
  const r = rand(3);
  const n = 10, bw = s / n;
  for (let i = 0; i < n; i++) {
    let y = -r() * s;
    while (y < s) {
      const len = s * (0.35 + r() * 0.4);
      const k = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${Math.round(176 * k)},${Math.round(132 * k)},${Math.round(92 * k)})`;
      g.fillRect(i * bw, y, bw - 1.5, len - 1.5);
      g.globalAlpha = 0.12;
      for (let k2 = 0; k2 < 6; k2++) {
        g.fillStyle = r() > 0.5 ? '#5a3a20' : '#e8c79c';
        g.fillRect(i * bw + r() * bw, y, 1, len);
      }
      g.globalAlpha = 1;
      y += len;
    }
  }
});

/** Large-format stone tiles (0.6 m) with thin grout; texture covers 1.2 x 1.2 m. */
export const tileTex = (base: string, key: string, veins = true) => canvasTex('tile-' + key, 512, (g, s) => {
  g.fillStyle = '#9a9894'; g.fillRect(0, 0, s, s);
  const r = rand(key.length * 31);
  const t = s / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = base; g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    if (veins) {
      g.globalAlpha = 0.18; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        g.beginPath(); let x = i * t + r() * t, y = j * t;
        g.moveTo(x, y);
        for (let q = 0; q < 6; q++) { x += (r() - 0.5) * 40; y += t / 6; g.lineTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }
});

/** Roof membrane / concrete noise. */
export const roofTex = () => canvasTex('roof', 256, (g, s) => {
  g.fillStyle = '#8c8f92'; g.fillRect(0, 0, s, s);
  const r = rand(19);
  for (let i = 0; i < 5000; i++) { const v = 120 + Math.floor(r() * 50); g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(r() * s, r() * s, 2, 2); }
});

/** Dense perforated screen as in the render: white field, small dark 8-point star holes. 1 tile = 0.25 m. */
export const screenTex = () => canvasTex('screen', 256, (g, S) => {
  g.fillStyle = '#f6f4ef'; g.fillRect(0, 0, S, S);
  const hole = '#2b3230';
  const star = (cx: number, cy: number, R: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI / 8) * i;
      const rr = i % 2 ? r : R;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  };
  g.fillStyle = hole;
  const h = S / 2;
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S], [h, h]]) star(x, y, S * 0.27, S * 0.19);
  // small kite holes between the stars (girih interlace)
  for (const [x, y] of [[h, 0], [0, h], [S, h], [h, S]]) star(x, y, S * 0.12, S * 0.06);
  // soft inner shadow on the holes' upper edge for depth
  g.globalAlpha = 0.25; g.fillStyle = '#000';
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S], [h, h]]) { g.beginPath(); g.ellipse(x, y - S * 0.05, S * 0.12, S * 0.05, 0, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
});

/** Shop sign lettering (render: slim gold capitals on the brick band over the shop fronts). One row per sign. */
export const SIGNS = ['BOUTIQUE', 'ARTISAN GOODS', 'PREMIUM DELI', 'COFFEE HOUSE'];
export function signAtlas() {
  const W = 1024, RH = 96, H = 512;
  const key = 'signs';
  let t = cache.get(key);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.font = '500 64px Georgia, "Times New Roman", serif';
  g.textBaseline = 'middle';
  const items = SIGNS.map((name, i) => {
    const text = name.split('').join('\u200a');
    const w = Math.min(W - 16, g.measureText(text).width + 16);
    return { name, text, u0: 0, u1: w / W, v0: 1 - ((i + 1) * RH) / H, v1: 1 - (i * RH) / H, aspect: w / RH };
  });
  if (!t) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    items.forEach((it, i) => g.fillText(it.text, 8, i * RH + RH / 2 + 2, W - 16));
    t = new THREE.CanvasTexture(c);
    t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return { tex: t, items };
}
