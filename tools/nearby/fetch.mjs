// node tools/nearby/fetch.mjs — places around the complex out to 5 km for the "Yaqinda" panel → public/context/nearby.json
//  1. OpenStreetMap (Overpass): schools, kindergartens, higher education, hospitals / clinics, pharmacies, mosques,
//     supermarkets, malls, bazaars, metro stations, bus stops (≤ 1 km), parks, sport
//  2. cleaned: a name (Uzbek, else the local one), unnamed ones by their kind, a few known mis-tags moved, duplicates
//     (a node and a building of the same place) merged
//  3. by road from the complex, by car and on foot: OSRM tables (routing.openstreetmap.de, OSM roads, no traffic)
//  4. placed in the scene: georef.json (the scene origin on the earth, see georef.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { enu, overpass, toScene } from './georef.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(readFileSync(path.join(here, 'georef.json'), 'utf8')).origin;
const R_MAX = 5000;

const q = `[out:json][timeout:120];
(
  nwr(around:${R_MAX},${G.lat},${G.lon})[amenity~"^(school|kindergarten|university|college|hospital|clinic|pharmacy|marketplace|place_of_worship)$"];
  nwr(around:${R_MAX},${G.lat},${G.lon})[shop~"^(mall|supermarket)$"];
  nwr(around:${R_MAX},${G.lat},${G.lon})[station=subway];
  nwr(around:${R_MAX},${G.lat},${G.lon})[railway=station][subway=yes];
  nwr(around:1000,${G.lat},${G.lon})[highway=bus_stop];
  nwr(around:${R_MAX},${G.lat},${G.lon})[leisure~"^(park|sports_centre|stadium|fitness_centre)$"][name];
);
out center tags;`;

/** kind → [category, Uzbek name of the kind] */
function kind(t) {
  if (t.station === 'subway' || (t.railway === 'station' && t.subway === 'yes')) return ['transport', 'Metro bekati'];
  if (t.highway === 'bus_stop') return ['transport', 'Avtobus bekati'];
  if (t.shop === 'mall') return ['savdo', 'Savdo markazi'];
  if (t.shop === 'supermarket') return ['savdo', 'Supermarket'];
  if (t.amenity === 'marketplace') return ['savdo', 'Bozor'];
  if (t.amenity === 'place_of_worship') return t.religion === 'muslim' ? ['masjid', 'Masjid'] : null;
  if (t.amenity === 'kindergarten') return ['talim', 'Bog‘cha'];
  if (t.amenity === 'school') return ['talim', 'Maktab'];
  if (t.amenity === 'university' || t.amenity === 'college') return ['talim', 'Oliy ta’lim / kollej'];
  if (t.amenity === 'hospital') return ['sogliq', 'Shifoxona'];
  if (t.amenity === 'clinic') return ['sogliq', 'Klinika'];
  if (t.amenity === 'pharmacy') return ['sogliq', 'Dorixona'];
  if (t.leisure === 'park') return ['dam', 'Park'];
  if (t.leisure) return ['dam', 'Sport'];
  return null;
}
const GENERIC = /^(аптека|dorixona|масжид|мечеть|masjid|школа|maktab|детский сад|bog.?cha|остановка|bekat|супермаркет|магазин)$/i;

function clean(osm) {
  const out = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {}, k = kind(t);
    if (!k) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null) continue;
    let [cat, sub] = k;
    let name = (t['name:uz'] || t.name || t['name:ru'] || '').trim();
    // known mis-tags: colleges tagged as kindergartens or schools
    if (/колледж|kollej|college|техникум|лицей|litsey/i.test(name) && sub !== 'Oliy ta’lim / kollej') sub = 'Oliy ta’lim / kollej';
    if (/университет|universitet|институт|institut|академия|akademiya/i.test(name)) sub = 'Oliy ta’lim / kollej';
    if (GENERIC.test(name)) name = '';
    const [e_, n_] = enu(lat, lon, G);
    const [x, z] = toScene(e_, n_);
    out.push({ id: `${e.type[0]}${e.id}`, cat, sub, name, ru: t['name:ru'] && t['name:ru'] !== name ? t['name:ru'] : undefined,
      lat: +lat.toFixed(6), lon: +lon.toFixed(6), x: Math.round(x), z: Math.round(z), m: Math.round(Math.hypot(x, z)) });
  }
  // a place mapped twice (a point and its building, an Uzbek and a Russian entry): same kind within 50 m, or within
  // 80 m with the same name or one unnamed. The Latin-script name leads, the other one is kept as the Russian name
  const latin = (s) => /[a-z‘’']/i.test(s) && !/[а-яё]/i.test(s);
  out.sort((a, b) => (b.name ? 1 : 0) + (latin(b.name) ? 1 : 0) - (a.name ? 1 : 0) - (latin(a.name) ? 1 : 0));
  const kept = [];
  for (const p of out) {
    const k = kept.find((k) => k.sub === p.sub && (Math.hypot(k.x - p.x, k.z - p.z) < 50
      || (Math.hypot(k.x - p.x, k.z - p.z) < 80 && (!p.name || !k.name || k.name === p.name))));
    if (k) { if (p.name && p.name !== k.name && !k.ru) k.ru = p.name; continue; }
    kept.push(p);
  }
  return kept.filter((p) => p.m <= R_MAX).sort((a, b) => a.m - b.m);
}

/** OSRM table from the complex to each place: road metres and seconds (null when no route) */
async function table(profile, places) {
  const base = `https://routing.openstreetmap.de/routed-${profile}/table/v1/driving/`;
  const res = new Map();
  for (let i = 0; i < places.length; i += 99) {
    const part = places.slice(i, i + 99);
    const coords = [`${G.lon},${G.lat}`, ...part.map((p) => `${p.lon},${p.lat}`)].join(';');
    let j = null;
    for (let tries = 0; tries < 3 && !j; tries++) {
      try {
        const r = await fetch(`${base}${coords}?sources=0&annotations=distance,duration`, { headers: { 'User-Agent': 'ObodMaskan3D/1.0' } });
        if (r.ok) j = await r.json(); else { console.warn(profile, r.status); await new Promise((s) => setTimeout(s, 3000)); }
      } catch (e) { console.warn(profile, e.message); await new Promise((s) => setTimeout(s, 3000)); }
    }
    if (!j || j.code !== 'Ok') throw new Error(`OSRM ${profile}: no answer`);
    part.forEach((p, k) => {
      const m = j.distances[0][k + 1], s = j.durations[0][k + 1];
      res.set(p.id, m == null ? null : { m: Math.round(m), min: Math.max(1, Math.round(s / 60)) });
    });
    process.stdout.write(`\r  ${profile}: ${Math.min(i + 99, places.length)}/${places.length}`);
    await new Promise((s) => setTimeout(s, 1100));                // the service asks for at most 1 request a second
  }
  process.stdout.write('\n');
  return res;
}

const osm = await overpass(q);
const places = clean(osm);
console.log(`places within ${R_MAX / 1000} km: ${places.length}`);
const car = await table('car', places), foot = await table('foot', places);
for (const p of places) { p.car = car.get(p.id) ?? null; p.foot = foot.get(p.id) ?? null; }
const out = {
  note: 'Places out to 5 km (© OpenStreetMap contributors, ODbL). Road distances / times: OSRM on OSM roads (routing.openstreetmap.de), no traffic — approximate. tools/nearby/fetch.mjs',
  origin: G, generated: new Date().toISOString().slice(0, 10), places,
};
writeFileSync(path.resolve(here, '../../public/context/nearby.json'), JSON.stringify(out));
const by = {}; for (const p of places) by[p.sub] = (by[p.sub] ?? 0) + 1;
console.log(by);
console.log('nearest:', places.slice(0, 8).map((p) => `${p.name || p.sub} ${p.m} m (car ${p.car?.m ?? '-'} m / ${p.car?.min ?? '-'} min, foot ${p.foot?.min ?? '-'} min)`).join('\n  '));
