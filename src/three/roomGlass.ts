// The complex view's glass: a reflective pane (double glazing, F0 ≈ 0.08, the sky in it) with a room behind it drawn
// by the material — "interior mapping", as in the Unreal project (tools/ue2/ue_setup.py ROOM_HLSL), but without
// per-pane data: the rooms are a grid in world space. Storeys from the drawings (finished floor 0.2 + 3 k, ceiling
// 2.8 m above it), rooms 4 m wide along the facade, 3.2–5.5 m deep (shops on the ground floor 8–12 m). The ray from
// the eye through the pixel enters that box; the face it meets gives the colour: back wall (a sofa band or a dark
// picture / tv), side walls, wooden or tiled floor, white ceiling, daylight fading with depth, a third of the rooms
// dim. Tulle (most Tashkent flats), curtains and roller blinds hang 10 cm behind the glass. Every room has its own
// random numbers from its cell, storey and facade plane, so the 20 blocks differ. At night a share of the rooms is lit.
// The pane counts as facing the viewer whichever way it was drawn (many panes of the drawings face indoors).
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { nodes } from './gpu';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TSL node types do not chain through select()
const T = TSL as any;
const DAY = T.uniform(1), NIGHT = T.uniform(0), GLOW = T.uniform(0.3);           // 0.09 read as black holes, 0.35 grey (2026-11-16)
// console tuning, as __pro: __roomGlass.glow.value = 0.2; __complex.dirty = true
(globalThis as unknown as { __roomGlass: unknown }).__roomGlass = { glow: GLOW, day: DAY, night: NIGHT };
/** room brightness by day (1 = as tuned) and the lit share at night: from the scene's light of the hour */
export function setRoomLight(dayK: number, night: number) { DAY.value = dayK; NIGHT.value = night; }

export function roomGlass() {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#000000', roughness: 0.04, metalness: 0, ior: 1.8, specularIntensity: 1, envMapIntensity: 1.4, side: THREE.DoubleSide,
  });
  m.name = 'glass';
  const { vec3, float, floor, fract, hash, select, mix, exp, dot, normalize, max, min, sin, step, abs, pow } = T;
  const P = T.positionWorld;
  const V = normalize(T.cameraPosition.sub(P));                       // pixel → eye
  const N0 = normalize(vec3(T.normalWorld.x, 0, T.normalWorld.z));
  const n = select(dot(N0, V).lessThan(0), N0.negate(), N0);           // the pane faces the viewer
  const t = vec3(n.z, 0, n.x.negate());                                // along the facade
  const rd = V.negate();
  const dx = dot(rd, t), dy = rd.y, dz = max(dot(rd, n).negate(), 0.02);
  const a = dot(P, t), plane = dot(P, n);
  const CW = 4.0;
  const cx = floor(a.div(CW)), fl = floor(P.y.sub(0.2).div(3.0));
  const x0 = cx.mul(CW), x1 = x0.add(CW), y0 = fl.mul(3).add(0.2), y1 = y0.add(2.8);
  const r1 = hash(cx.mul(13.1).add(fl.mul(71.3)).add(floor(plane.mul(2)).mul(17.7)));
  const r2 = hash(r1.mul(91.7).add(3.3));
  const shop = P.y.lessThan(3.2);
  const D = select(shop, float(8).add(r2.mul(4)), float(3.2).add(r1.mul(2.3)));
  const tx = select(dx.greaterThan(0), x1.sub(a).div(max(dx, 1e-4)), x0.sub(a).div(min(dx, -1e-4)));
  const ty = select(dy.greaterThan(0), y1.sub(P.y).div(max(dy, 1e-4)), y0.sub(P.y).div(min(dy, -1e-4)));
  const tz = D.div(dz);
  const tt = min(tx, min(ty, tz));
  const qx = a.add(dx.mul(tt)), qy = P.y.add(dy.mul(tt)), qz = dz.mul(tt);
  const back = tz.lessThanEqual(min(tx, ty)), side = tx.lessThanEqual(min(ty, tz));
  // colours (linear)
  const k = fract(r2.mul(5.73).add(r1.mul(1.91)));
  const wall = select(k.lessThan(0.35), vec3(0.60, 0.53, 0.44), select(k.lessThan(0.6), vec3(0.55, 0.43, 0.31), select(k.lessThan(0.8), vec3(0.52, 0.49, 0.45), vec3(0.47, 0.48, 0.46))));
  const flo = select(shop, vec3(0.55, 0.54, 0.52), select(fract(r1.mul(3.7)).lessThan(0.6), vec3(0.24, 0.13, 0.06), vec3(0.40, 0.37, 0.33)));
  const mid = x0.add(x1).mul(0.5), fb = fract(r1.mul(11.3)), h = qy.sub(y0);
  let backC = wall;
  backC = select(shop.not().and(fb.greaterThan(0.45)).and(h.lessThan(0.85)).and(abs(qx.sub(mid)).lessThan(1.3)),
    select(fb.greaterThan(0.75), vec3(0.16, 0.15, 0.14), vec3(0.40, 0.32, 0.25)), backC);                    // sofa / cabinet
  backC = select(shop.not().and(fb.lessThan(0.3)).and(h.greaterThan(1.1)).and(h.lessThan(1.7)).and(abs(qx.sub(mid)).lessThan(0.55)),
    vec3(0.04, 0.04, 0.05), backC);                                                                           // picture / tv
  backC = select(shop.and(h.lessThan(2.0)).and(fract(qx.mul(0.8)).lessThan(0.7)),
    mix(vec3(0.75, 0.73, 0.70), vec3(0.30, 0.28, 0.26), step(0.5, fract(qy.mul(2.5)))), backC);             // shop shelves
  let c = select(back, backC, select(side, wall.mul(0.85), select(dy.lessThan(0), flo, vec3(0.70, 0.68, 0.64))));
  c = select(shop, mix(c, vec3(0.8, 0.8, 0.78), 0.35), c);
  const lightF = float(0.12).add(exp(qz.mul(-0.75)).mul(0.88)).mul(select(side.not().and(back.not()).and(dy.greaterThan(0)), float(0.7), float(1)));
  const dim = select(shop, float(1.7), select(fract(r1.mul(17.9).add(r2.mul(4.3))).lessThan(0.3), float(0.45), float(1)));
  c = c.mul(lightF).mul(dim).mul(vec3(1.0, 0.93, 0.82));
  // tulle / curtains / blinds 10 cm behind the glass (not in the shops)
  const ct = fract(r1.mul(13.7).add(r2.mul(2.9)));
  const pcx = a.add(dx.mul(float(0.10).div(dz))), pcy = P.y.add(dy.mul(float(0.10).div(dz)));
  const tul = vec3(0.93, 0.92, 0.88).mul(float(0.80).add(sin(pcx.mul(75).add(r2.mul(9))).mul(0.08)));
  const withTul = mix(c, tul.mul(0.8), float(0.45).add(fract(r2.mul(3.3)).mul(0.25)));
  const cs = fract(r2.mul(9.1));
  const cc = select(cs.lessThan(0.4), vec3(0.70, 0.62, 0.48), select(cs.lessThan(0.65), vec3(0.80, 0.78, 0.72), select(cs.lessThan(0.85), vec3(0.42, 0.36, 0.30), vec3(0.55, 0.30, 0.25))));
  const folds = float(0.78).add(sin(pcx.mul(34).add(r1.mul(20))).mul(0.22));
  const openL = float(0.15).add(fract(r1.mul(29.3)).mul(0.25)), openR = openL.mul(float(0.6).add(fract(r2.mul(7.7)).mul(0.8)));
  const sideCover = pcx.sub(x0).lessThan(openL.mul(CW)).or(x1.sub(pcx).lessThan(openR.mul(CW)));
  const blind = pcy.greaterThan(y0.add(2.45).sub(float(0.3).add(fract(r1.mul(5.3)).mul(0.8))));
  let cur = c;
  cur = select(ct.lessThan(0.55), withTul, cur);
  cur = select(ct.lessThan(0.28).or(ct.greaterThanEqual(0.55).and(ct.lessThan(0.75))).and(sideCover), cc.mul(folds).mul(0.95), cur);
  cur = select(ct.greaterThanEqual(0.75).and(ct.lessThan(0.85)).and(blind), vec3(0.82, 0.80, 0.74).mul(0.8), cur);
  c = select(shop, c, cur);
  // glass: what is not reflected passes, with a slight green-blue cast
  const F = float(0.08).add(pow(float(1).sub(abs(dot(n, V))), 5).mul(0.92));
  const day = c.mul(GLOW.mul(DAY));
  const litNight = hash(r1.mul(7.7).add(1.3)).greaterThan(0.62).or(shop);
  const night = vec3(1.0, 0.72, 0.42).mul(float(0.25).add(lightF.mul(0.75))).mul(select(litNight, float(0.55), float(0.015))).mul(NIGHT);
  nodes(m).emissiveNode = day.add(night).mul(float(1).sub(F)).mul(vec3(0.90, 0.96, 0.95));
  return m;
}
