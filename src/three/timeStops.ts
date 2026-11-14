// The seven times of day the owner chose (21 June, Tashkent), offered as seven hour buttons; each one has its own
// look in the Ultra renderer (exposure, grading, clouds, bloom), and moving between them glides over ~1.5 s.
export const STOPS = [4, 7, 10, 13, 16, 19, 23] as const;
export const DEFAULT_HOUR = 13;
export const STOP_NAMES: Record<number, string> = {
  4: 'Tong oldi', 7: 'Erta tong', 10: 'Ertalab', 13: 'Tush', 16: 'Tushdan keyin', 19: 'Oltin soat', 23: 'Tun',
};

const STOP_NAMES_RU: Record<number, string> = {
  4: 'Предрассвет', 7: 'Раннее утро', 10: 'Утро', 13: 'Полдень', 16: 'После полудня', 19: 'Золотой час', 23: 'Ночь',
};
export const stopName = (h: number, lang: 'uz' | 'ru' = 'uz') => (lang === 'ru' ? STOP_NAMES_RU : STOP_NAMES)[h] ?? '';

export const nearestStop = (h: number) => STOPS.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a), STOPS[0]);
export const stopIndex = (h: number) => STOPS.indexOf(nearestStop(h) as (typeof STOPS)[number]);
export const fmtStop = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Look of one time stop in the Ultra renderer. */
export type Look = {
  /** tone-mapping exposure (the physical sky spans 5 orders of magnitude between noon and night) */
  exposure: number;
  /** grading after tone mapping: saturation, contrast, warm (+) / cool (−) white balance, lift of the shadows */
  sat: number; contrast: number; warmth: number; lift: number;
  /** cloud layer: cover 0…1 and brightness relative to the sky */
  cloud: number; cloudGain: number;
  /** bloom of lit windows and lamps */
  bloom: number;
  /** strength of the artificial lights' share (lit windows, lamps) against the physical light */
  night: number;
};
export const LOOKS: Record<number, Look> = {
  4: { exposure: 1.0, sat: 1.0, contrast: 1.05, warmth: 0.02, lift: 0.012, cloud: 0.25, cloudGain: 0.6, bloom: 0.45, night: 1 },
  7: { exposure: 0.6, sat: 1.06, contrast: 1.05, warmth: 0.05, lift: 0.006, cloud: 0.3, cloudGain: 1, bloom: 0.15, night: 0 },
  10: { exposure: 0.5, sat: 1.04, contrast: 1.06, warmth: 0.01, lift: 0.004, cloud: 0.35, cloudGain: 1, bloom: 0.12, night: 0 },
  13: { exposure: 0.48, sat: 1.02, contrast: 1.07, warmth: 0, lift: 0.004, cloud: 0.35, cloudGain: 1, bloom: 0.12, night: 0 },
  16: { exposure: 0.48, sat: 1.05, contrast: 1.06, warmth: 0.02, lift: 0.004, cloud: 0.3, cloudGain: 1, bloom: 0.12, night: 0 },
  19: { exposure: 0.8, sat: 1.1, contrast: 1.05, warmth: 0.08, lift: 0.006, cloud: 0.35, cloudGain: 1, bloom: 0.25, night: 0.3 },
  23: { exposure: 1.05, sat: 1.02, contrast: 1.06, warmth: 0.04, lift: 0.014, cloud: 0.2, cloudGain: 0.5, bloom: 0.5, night: 1 },
};

/** look at any hour (also between the stops while gliding): blended from the two neighbouring stops */
export function lookAt(h: number): Look {
  const t = ((h % 24) + 24) % 24;
  const ring = [...STOPS, STOPS[0] + 24];
  const x = t < STOPS[0] ? t + 24 : t;
  let i = 0;
  while (i < ring.length - 2 && x > ring[i + 1]) i++;
  const a = LOOKS[ring[i] % 24], b = LOOKS[ring[i + 1] % 24];
  const k = Math.min(1, Math.max(0, (x - ring[i]) / (ring[i + 1] - ring[i])));
  const out = {} as Look;
  for (const key of Object.keys(a) as (keyof Look)[]) {
    // exposure in log space: between noon and night the linear midpoint would be far too bright
    out[key] = key === 'exposure' ? Math.exp(Math.log(a[key]) * (1 - k) + Math.log(b[key]) * k) : a[key] * (1 - k) + b[key] * k;
  }
  return out;
}

/** Glide between hours: forward through the night when that is shorter (23:00 → 04:00 passes 01:00, not noon). */
export class HourGlide {
  private from = 0; private to = 0; private t = 1;
  constructor(public hour: number, private seconds = 1.5) { this.to = this.from = hour; }
  set(h: number, instant = false) {
    let to = h;
    if (to - this.hour > 12) to -= 24; else if (this.hour - to > 12) to += 24;
    this.from = this.hour; this.to = to; this.t = instant ? 1 : 0;
    if (instant) this.hour = h;
  }
  /** advances; true while moving */
  tick(dt: number) {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / this.seconds);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.hour = this.from + (this.to - this.from) * e;
    if (this.t >= 1) this.hour = ((this.to % 24) + 24) % 24;
    return true;
  }
  get moving() { return this.t < 1; }
}
