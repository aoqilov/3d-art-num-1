// Sun over Tashkent (41.31° N, 69.28° E, UTC+5) for a day of the year and a local hour, in scene axes.
// The master plan is rotated 15° counter-clockwise from north (see tools/context.py): plan "up" (−z) points
// 15° west of north, so a world direction (east, north) maps to scene x = e·cos φ + n·sin φ, z = e·sin φ − n·cos φ.
import * as THREE from 'three';

const LAT = THREE.MathUtils.degToRad(41.31), LON = 69.28, TZ = 5;
const PHI = THREE.MathUtils.degToRad(15);
/** 21 June: the longest day (sunrise ≈ 4:50, sunset ≈ 20:00); after ~21:00 it is night */
export const SUN_DAY = 172;

/** elevation and azimuth (from north, clockwise) in radians — NOAA approximation, good to ~0.5° */
export function solar(day: number, hour: number) {
  const g = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hour * 60 + eqt + 4 * LON - 60 * TZ;                    // true solar time, minutes
  const ha = THREE.MathUtils.degToRad(tst / 4 - 180);
  const cz = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const c = (Math.sin(LAT) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(LAT) * Math.sin(zen) || 1e-6);
  const a = Math.acos(Math.max(-1, Math.min(1, c)));
  const az = ha > 0 ? (a + Math.PI) % (2 * Math.PI) : (3 * Math.PI - a) % (2 * Math.PI);
  return { elev: Math.PI / 2 - zen, az };
}

/** unit vector towards the sun in scene coordinates */
export function sunDir(day: number, hour: number) {
  const { elev, az } = solar(day, hour);
  const e = Math.sin(az) * Math.cos(elev), n = Math.cos(az) * Math.cos(elev);
  return new THREE.Vector3(e * Math.cos(PHI) + n * Math.sin(PHI), Math.sin(elev), e * Math.sin(PHI) - n * Math.cos(PHI)).normalize();
}

/** day / dusk / night weights from the sun's elevation */
export function daylight(dir: THREE.Vector3) {
  const el = THREE.MathUtils.radToDeg(Math.asin(dir.y));
  const nightF = THREE.MathUtils.clamp((2 - el) / 8, 0, 1);           // +2° → day, −6° → night (civil twilight)
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(el - 2) / 10, 0, 1);
  return { el, nightF, dusk, dayK: 1 - nightF };
}

export const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
