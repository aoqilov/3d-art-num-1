// One-off facade elements of the type-4 block taken from the architect's render:
// shop canopy, brick portal with gold lattice and pointed arch, central lattice arch frame,
// ornamental pilasters with crown tiles, 3-storey bands across the slate window strips, roof & parapets.
import * as THREE from 'three';
import { MeshBuilder } from './floorGeom';
import { BLOCK_W, FLOOR_H, FLOORS, PLAN, SLAB, pointInPoly, type Pt } from './plan';
import type { MatName } from './materials';
import { signAtlas } from './textures';

export const ROOF_Z = FLOORS * FLOOR_H; // 48 m
const BAND_Z = [12, 21, 30, 39];
export const mintStorey = (s: number) => s >= 2 && s <= 7;

/** Pointed (Persian) arch outline from springing at (cx±w/2, zs) to apex zA. */
function archPts(cx: number, w: number, zs: number, zA: number, n = 14): Pt[] {
  const r = w * 0.82; // two-centred arch
  const half = w / 2;
  const cL = cx + half - r, cR = cx - half + r;
  const pts: Pt[] = [];
  // right side: from (cx+half, zs) up to apex using centre cL
  const a0 = 0, a1 = Math.acos((cx - cL) / r);
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cL + r * Math.cos(a), zs + (zA - zs) * (Math.sin(a) / Math.sin(a1))]); }
  for (let i = n - 1; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cR - r * Math.cos(a), zs + (zA - zs) * (Math.sin(a) / Math.sin(a1))]); }
  return pts;
}

/** Flat panel in a vertical plane y = const (plan), with optional arch hole. Coordinates (x, z). */
function panelGeometry(outline: Pt[], holes: Pt[][], y: number, facing: 1 | -1) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const g = new THREE.ShapeGeometry(shape);
  // ShapeGeometry lies in XY; map (x, z) → (X=x, Y=z, Z=y)
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    pos.setXYZ(i, x, z, y);
    uv.setXY(i, x, z);
  }
  if (facing === -1) {
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  }
  g.computeVertexNormals();
  return g;
}

export function buildFacade() {
  const mb = new MeshBuilder();
  const extra: { geometry: THREE.BufferGeometry; mat: MatName }[] = [];
  const typ = PLAN['3'];
  const cx = BLOCK_W / 2;

  // ---- street canopy over the shop fronts (p.4 plan: 1.5 m deep), split by the portal
  const portal = { x0: cx - 3.1, x1: cx + 3.1, d: 1.5, top: 5.95 };
  for (const [a, b] of [[0, portal.x0], [portal.x1, BLOCK_W]]) {
    mb.box({ side: 'canopy', top: 'canopy', bottom: 'jamb' }, a, -1.5, b, 0, 3.02, 3.72);
  }
  // courtyard entrance canopy
  mb.box({ side: 'canopy', top: 'canopy', bottom: 'jamb' }, 9.5, 17.8, 17.0, 19.9, 3.05, 3.35);

  // ---- brick portal (render): two brick piers on granite bases and a deep brick lintel frame a recessed gold
  // girih screen; a wide pointed arch with a white surround is cut out of the screen and glazed.
  const P = portal;
  const PIER = 0.95, OPEN_TOP = 5.2, SCR = -P.d + 0.3;
  const ox0 = P.x0 + PIER, ox1 = P.x1 - PIER;
  for (const [a, b] of [[P.x0, ox0], [ox1, P.x1]]) {
    mb.box({ side: 'brick' }, a, -P.d, b, 0, 0.5, OPEN_TOP);
    mb.box({ side: 'granite', top: 'granite' }, a - 0.03, -P.d - 0.03, b + 0.03, 0, 0, 0.5);
  }
  mb.box({ side: 'brick', top: 'canopy', bottom: 'brick' }, P.x0, -P.d, P.x1, 0, OPEN_TOP, P.top);
  mb.box({ side: 'canopy', top: 'canopy', bottom: 'canopy' }, P.x0 - 0.05, -P.d - 0.05, P.x1 + 0.05, 0, P.top, P.top + 0.1);   // coping
  // Opening (render): glazed over its full width up to the shoulder line; above it a cream girih screen with a
  // stilted pointed arch cut out. A thin white band follows the shoulders, the stilts and the arch.
  const SH = 2.45, STILT = 3.3, APEX = 4.3, hw = (ox1 - ox0) / 2 - 0.24;
  const curve = archPts(cx, hw * 2, STILT, APEX, 20).reverse();           // left springing → apex → right springing
  const screen: Pt[] = [[ox1, SH], [ox1, OPEN_TOP], [ox0, OPEN_TOP], [ox0, SH], [cx - hw, SH], ...curve, [cx + hw, SH]];
  extra.push({ geometry: panelGeometry(screen, [], SCR, -1), mat: 'lattice_gold' });
  extra.push({ geometry: panelGeometry([[ox0, 0.02], [ox1, 0.02], [ox1, OPEN_TOP], [ox0, OPEN_TOP]], [], SCR + 0.06, -1), mat: 'glass' });
  const T = 0.09, wy0 = SCR - 0.04, wy1 = SCR + 0.02;
  mb.box('facade_white', ox0, wy0, cx - hw, wy1, SH - T, SH);                  // shoulders
  mb.box('facade_white', cx + hw, wy0, ox1, wy1, SH - T, SH);
  mb.box('facade_white', cx - hw - T, wy0, cx - hw, wy1, SH - T, STILT);        // stilts
  mb.box('facade_white', cx + hw, wy0, cx + hw + T, wy1, SH - T, STILT);
  const outer = archPts(cx, hw * 2 + 2 * T, STILT, APEX + T * 1.3, 20);        // right → apex → left
  const wband: Pt[] = [...outer, [cx - hw, STILT], ...curve.slice(1, -1), [cx + hw, STILT]];
  extra.push({ geometry: panelGeometry(wband.slice().reverse(), [], wy0, -1), mat: 'facade_white' });
  // glazing bars: two full-height mullions, a transom on the shoulder line, a pair of doors in the middle bay
  const archZ = (x: number) => {
    for (let i = 0; i < curve.length - 1; i++) {
      const [x0, z0] = curve[i], [x1, z1] = curve[i + 1];
      if ((x - x0) * (x - x1) <= 0 && x0 !== x1) return z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
    }
    return STILT;
  };
  const gy0 = SCR + 0.03, gy1 = SCR + 0.09, MB = 0.78;
  for (const u of [-MB, MB]) mb.box('frame', cx + u - 0.035, gy0, cx + u + 0.035, gy1, 0.02, archZ(cx + u) - 0.02);
  for (const x of [ox0, ox1 - 0.06]) mb.box('frame', x, gy0, x + 0.06, gy1, 0.02, SH);
  mb.box('frame', ox0, gy0, ox1, gy1, SH - T - 0.06, SH - T);
  mb.box('frame', ox0, gy0, ox1, gy1, 0.02, 0.09);
  mb.box('frame', cx - MB, gy0, cx + MB, gy1, 2.05, 2.11);                    // door head
  mb.box('frame', cx - 0.025, gy0, cx + 0.025, gy1, 0.02, 2.05);              // meeting stiles
  // recess floor (stone threshold)
  mb.box({ side: 'granite', top: 'floor_stone' }, ox0, -P.d, ox1, 0, 0, 0.03);

  // ---- shop fronts: granite bases on the brick piers and gold lettering on the band over the glazing
  const street = PLAN['1'];
  const spans: [number, number][] = [...street.windows, ...street.openings]
    .filter((r) => r.axis === 'x' && r.y0 < 0.4).map((r) => [r.x0, r.x1] as [number, number]).sort((a, b) => a[0] - b[0]);
  const bays: [number, number][] = [];
  for (const [a, b] of spans) { const l = bays[bays.length - 1]; if (l && a - l[1] < 0.25) l[1] = Math.max(l[1], b); else bays.push([a, b]); }
  let px = 0;
  for (const [a, b] of [...bays, [BLOCK_W, BLOCK_W] as [number, number]]) {
    if (a - px > 0.3 && !(px > P.x0 && a < P.x1)) mb.box({ side: 'granite', top: 'granite' }, px - (px === 0 ? 0.03 : 0), -0.035, a + (a === BLOCK_W ? 0.03 : 0), 0, 0, 0.5);
    px = b;
  }
  const atlas = signAtlas().items;
  let si = 0;
  for (const [a, b] of bays) {
    if (b > P.x0 - 0.2 && a < P.x1 + 0.2) continue;               // behind the portal
    const it = atlas[si++ % atlas.length];
    const hgt = 0.36, w = Math.min(hgt * it.aspect, b - a - 0.4), mid = (a + b) / 2, z0 = 2.6, y = -0.02;
    const g = new THREE.BufferGeometry();
    const x0 = mid - w / 2, x1 = mid + w / 2;
    // faces the street (−y): seen from outside, +x runs right to left, so u is flipped to keep the text readable
    g.setAttribute('position', new THREE.Float32BufferAttribute([x1, z0, y, x0, z0, y, x0, z0 + hgt, y, x1, z0, y, x0, z0 + hgt, y, x1, z0 + hgt, y], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([it.u0, it.v0, it.u1, it.v0, it.u1, it.v1, it.u0, it.v0, it.u1, it.v1, it.u0, it.v1], 2));
    extra.push({ geometry: g, mat: 'sign' });
  }

  // ---- ornamental pilasters on the street facade (party walls 53.88|40.00 and 40.73|70.80)
  const pil = [6.42, BLOCK_W - 6.28];
  const pw = 0.9, pd = 0.16, pz0 = 3.72, pz1 = ROOF_Z + 1.6;
  for (const x of pil) {
    mb.box({ side: 'pilaster_tile', ny: 'pilaster', top: 'pilaster_tile' }, x - pw / 2, -pd, x + pw / 2, 0, pz0, pz1);
    for (const z of [...BAND_Z, ROOF_Z + 1.0]) {
      mb.box({ side: 'pilaster_tile', top: 'pilaster_tile', bottom: 'pilaster_tile' }, x - pw / 2 - 0.06, -pd - 0.1, x + pw / 2 + 0.06, 0, z - 0.5, z + 0.5);
      // stylised crown motif (vertical fins) on the tile face
      for (let k = -2; k <= 2; k++) mb.box('jamb', x + k * 0.14 - 0.035, -pd - 0.16, x + k * 0.14 + 0.035, -pd - 0.1, z - 0.32, z + 0.18 + (2 - Math.abs(k)) * 0.06);
    }
  }

  // ---- central lattice arch frame around the projecting balcony stack (40.84 m² flats)
  // Proportions from the render: perforated white screen on both piers from the portal up to the top of
  // storey 7, a tall pointed arch whose apex sits ~1.1 m under a white cornice at the mint/white line.
  const bx0 = 12.42, bx1 = 17.32, fy = -1.47;
  const PW = 0.75;
  const zLat0 = portal.top, zTop = 21.05, fzs = 16.4, fzA = 19.55;
  const IN = 0.29; // screens overlap the balcony ends like in the render (opening ≈ 4.3 m)
  const piers: [number, number][] = [[bx0 - PW, bx0 + IN], [bx1 - IN, bx1 + PW]];
  for (const [a, b] of piers) {
    mb.box({ side: 'facade_white', top: 'facade_white', ny: null }, a, fy, b, 0, 3.72, ROOF_Z + 2.2);
    mb.vquad('facade_white', a, fy, b, fy, zTop, ROOF_Z + 2.2, 0, -1);
    extra.push({ geometry: panelGeometry([[a, zLat0], [b, zLat0], [b, zTop], [a, zTop]], [], fy, -1), mat: 'lattice_white' });
    // thin solid margins on both long edges of every pier (render: crisp white edge around the screen)
    for (const x of [a, b - 0.06]) mb.box('facade_white', x, fy - 0.03, x + 0.06, fy, zLat0, zTop);
  }
  // spandrel screen with the pointed arch cut out (outline follows the arch, no hole needed)
  const m = 0.06 + IN;
  const aw = bx1 - bx0 - 2 * m;
  const farch = archPts(cx, aw, fzs, fzA, 22).reverse(); // left springing → apex → right springing
  const sx0 = bx0 + IN, sx1 = bx1 - IN;
  const spandrel: Pt[] = [[sx1, fzs], [sx1, zTop], [sx0, zTop], [sx0, fzs], [cx - aw / 2, fzs], ...farch, [cx + aw / 2, fzs]];
  extra.push({ geometry: panelGeometry(spandrel, [], fy, -1), mat: 'lattice_white' });
  extra.push({ geometry: panelGeometry(spandrel, [], fy + 0.12, 1), mat: 'facade_white' });
  // solid white archivolt band along the arch edge
  const outerArch = archPts(cx, aw + 0.16, fzs, fzA + 0.11, 22);   // right → left
  const band: Pt[] = [...outerArch, [cx - aw / 2 - 0.08, fzs], ...farch, [cx + aw / 2 + 0.08, fzs]];
  extra.push({ geometry: panelGeometry(band.slice().reverse(), [], fy - 0.03, -1), mat: 'facade_white' });
  // girih grilles over the balcony doors of the 40.84 m² flats inside the arch (storeys 3–7)
  for (const o of typ.openings) {
    const ocx = (o.x0 + o.x1) / 2;
    if (o.axis !== 'x' || ocx < bx0 || ocx > bx1 || o.y0 > 0.4) continue;
    for (let st = 3; st <= 7; st++) {
      const z0 = (st - 1) * FLOOR_H + SLAB;
      extra.push({ geometry: panelGeometry([[o.x0 + 0.05, z0 + 0.05], [o.x1 - 0.05, z0 + 0.05], [o.x1 - 0.05, z0 + 2.25], [o.x0 + 0.05, z0 + 2.25]], [], o.y0 - 0.015, -1), mat: 'lattice_dark' });
    }
  }
  // white cornice capping the screen, and a plain white box frame above it up to the roof crown
  mb.box({ side: 'facade_white', top: 'sill', bottom: 'facade_white' }, bx0 - PW - 0.06, fy - 0.1, bx1 + PW + 0.06, 0, zTop, zTop + 0.3);
  mb.box({ side: 'facade_white', top: 'sill', bottom: 'slab_edge' }, bx0 - PW, fy, bx1 + PW, 0, ROOF_Z + 0.25, ROOF_Z + 2.2);

  // ---- horizontal bands across slate window strips (every 3 storeys)
  for (const w of typ.windows) {
    const ccx = (w.x0 + w.x1) / 2, ccy = (w.y0 + w.y1) / 2;
    if (w.axis !== 'x') continue;
    const north = !pointInPoly(ccx, w.y0 - 0.15, typ.footprint);
    const south = !pointInPoly(ccx, w.y1 + 0.15, typ.footprint);
    if (!north && !south) continue;
    const y = north ? w.y0 - 0.045 : w.y1;
    for (const z of BAND_Z) {
      mb.box(z <= 21 ? 'facade_mint' : 'facade_white', w.x0 - 0.06, y, w.x1 + 0.06, y + 0.045, z - 0.16, z + 0.16);
    }
    void ccy;
  }

  // ---- roof slab, parapets, raised parapets over street loggias, core penthouse
  const fp = typ.footprint;
  mb.hpoly('roof', fp, ROOF_Z + 0.25, true);
  mb.hpoly('ceiling', fp, ROOF_Z, false);
  const ring = fp.outer;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-3) continue;
    let nx = (by - ay) / L, ny = -(bx - ax) / L;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (pointInPoly(mx + nx * 0.02, my + ny * 0.02, fp)) { nx = -nx; ny = -ny; }
    mb.vquad('facade_white', ax, ay, bx, by, ROOF_Z, ROOF_Z + 0.25, nx, ny);
    // parapet: box hugging the edge, 0.2 thick inward
    const t = 0.2;
    const x0 = Math.min(ax, bx) - (nx < 0 ? 0 : nx > 0 ? t : 0), x1 = Math.max(ax, bx) + 0;
    let px0 = Math.min(ax, bx), px1 = Math.max(ax, bx), py0 = Math.min(ay, by), py1 = Math.max(ay, by);
    if (Math.abs(nx) > 0.5) { if (nx > 0) px0 -= t; else px1 += t; } else { if (ny > 0) py0 -= t; else py1 += t; }
    void x0; void x1;
    const raised = ny < -0.5 && my < 0.4 && ([[0.2, 3.2], [9.4, 12.3], [17.4, 20.3], [26.5, 29.6]] as const).some(([a, b]) => mx > a && mx < b);
    mb.box({ side: 'facade_white', top: 'sill' }, px0, py0, px1, py1, ROOF_Z + 0.25, ROOF_Z + (raised ? 2.0 : 1.2));
  }
  // dark soffit band under raised loggia parapets (render: thin slate line under the crown)
  for (const [a, b] of [[0.22, 3.11], [9.51, 12.21], [17.52, 20.21], [26.62, 29.51]]) mb.box('spandrel', a, -0.04, b, 0.02, ROOF_Z + 0.05, ROOF_Z + 0.3);
  // stair / lift penthouse
  mb.box({ side: 'facade_white', top: 'roof' }, 9.6, 10.0, 16.9, 16.2, ROOF_Z + 0.25, ROOF_Z + 3.0);

  const main = mb.build();
  return { main, extra };
}

void SLAB;
