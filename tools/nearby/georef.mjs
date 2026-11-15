// node tools/nearby/georef.mjs — where the scene stands on the earth. The scene (context.json, from a CADMapper DXF)
// has no latitude / longitude; its turn is known (plan "up" 15° west of north, sun.ts). The OSM buildings around the
// site, put through that turn, are matched to the scene's buildings: the offset most centroid pairs agree on
// (a vote) gives the latitude / longitude of the scene origin. Writes tools/nearby/georef.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = { lat: 41.31306, lon: 69.18583 };           // site centre read off the satellite picture (nearby.ts)
const PHI = (15 * Math.PI) / 180;
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'];

export async function overpass(q) {
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': 'ObodMaskan3D/1.0' } });
      if (r.ok) return await r.json();
      console.warn(url, r.status);
    } catch (e) { console.warn(url, e.message); }
  }
  throw new Error('overpass: no mirror answered');
}
/** local east / north metres around ref */
export const enu = (lat, lon, ref = REF) => {
  const R = 6378137, t = Math.PI / 180;
  return [(lon - ref.lon) * t * R * Math.cos(ref.lat * t), (lat - ref.lat) * t * R];
};
/** east / north → scene x / z (sun.ts) */
export const toScene = (e, n) => [e * Math.cos(PHI) + n * Math.sin(PHI), e * Math.sin(PHI) - n * Math.cos(PHI)];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ctx = JSON.parse(readFileSync(path.resolve(here, '../../public/context/context.json'), 'utf8'));
  const sc = ctx.buildings.map((b) => { let x = 0, z = 0; const n = b.p.length / 2; for (let i = 0; i < n; i++) { x += b.p[i * 2] / n; z += b.p[i * 2 + 1] / n; } return [x, z]; });
  const osm = await overpass(`[out:json][timeout:60];way(around:900,${REF.lat},${REF.lon})[building];out center;`);
  const os = osm.elements.filter((e) => e.center).map((e) => toScene(...enu(e.center.lat, e.center.lon)));
  // vote on 1 m cells of the offset scene − osm, over pairs closer than 150 m
  const votes = new Map();
  for (const [x, z] of sc) for (const [ox, oz] of os) {
    const dx = x - ox, dz = z - oz;
    if (Math.abs(dx) > 150 || Math.abs(dz) > 150) continue;
    const k = `${Math.round(dx)},${Math.round(dz)}`;
    votes.set(k, (votes.get(k) ?? 0) + 1);
  }
  const [best, n] = [...votes].sort((a, b) => b[1] - a[1])[0];
  let [tx, tz] = best.split(',').map(Number);
  // refine: mean of the pairs within 3 m of the winning offset
  let sx = 0, sz = 0, m = 0;
  for (const [x, z] of sc) for (const [ox, oz] of os) { const dx = x - ox, dz = z - oz; if (Math.hypot(dx - tx, dz - tz) < 3) { sx += dx; sz += dz; m++; } }
  tx = sx / m; tz = sz / m;
  // the scene origin (0, 0) in lat / lon: undo the offset and the turn
  const ox = -tx, oz = -tz;
  const e = ox * Math.cos(PHI) + oz * Math.sin(PHI), nn = ox * Math.sin(PHI) - oz * Math.cos(PHI);
  const R = 6378137, t = Math.PI / 180;
  const origin = { lat: REF.lat + nn / (R * t), lon: REF.lon + e / (R * t * Math.cos(REF.lat * t)) };
  const out = { origin, phiDeg: 15, note: `scene buildings ${sc.length}, osm ${os.length}, votes ${n}, pairs ${m}; offset scene−osm(ref) ${tx.toFixed(2)}, ${tz.toFixed(2)} m` };
  writeFileSync(path.join(here, 'georef.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
