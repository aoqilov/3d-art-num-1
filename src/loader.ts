// The loading clouds (#ld in index.html: two cloud banks drawn there at once, before this bundle has even arrived).
// The page opens with them closing in from both sides over a spinner; when the view below has arrived and drawn
// (its `loaded` promise, every texture / model of the default loading manager, then a run of quick frames — the
// first draws of new materials stall on shader compiles) they part to the sides. Opening a block, or going back to
// the complex, closes them again first (App.tsx).
import * as THREE from 'three';

type State = 'closed' | 'opening' | 'open';
const W = window as unknown as { __ldApp?: boolean; __ldOpened?: boolean; __ldReadyAt?: number };
W.__ldApp = true;                    // index.html: the app code is here (else it parts the clouds by itself)
let state: State = document.getElementById('ld') ? 'closed' : 'open';
let gen = 0;
let closedAt = 300;                 // the first closing starts with the page's first paint
const IN_MS = 1100, OUT_MS = 1700;
const el = () => document.getElementById('ld');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// files in flight through the default loading manager (textures, models): counted around its own bookkeeping, the
// scenes set its onStart / onProgress for themselves
let pending = 0;
{
  const M = THREE.DefaultLoadingManager as unknown as { itemStart(u: string): void; itemEnd(u: string): void };
  const start = M.itemStart.bind(M), end = M.itemEnd.bind(M);
  M.itemStart = (u) => { pending++; start(u); };
  M.itemEnd = (u) => { pending = Math.max(0, pending - 1); end(u); };
}
const until = async (ok: () => boolean, cap: number) => { const t = performance.now(); while (!ok() && performance.now() - t < cap) await sleep(100); };
/** a run of quick frames: the renderer has got through its first draws (shader compiles hold the page for seconds) */
const settled = (cap: number) => new Promise<void>((res) => {
  const t0 = performance.now();
  let last = t0, good = 0;
  const f = (t: number) => {
    good = t - last < 200 ? good + 1 : 0; last = t;
    if (good >= 8 || t - t0 > cap) res(); else requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});

/** clouds in (resolves when the window is covered) */
export function loaderClose(): Promise<void> {
  const e = el();
  if (!e || !e.classList.contains('open')) return Promise.resolve();      // the page's (it may have parted them itself)
  gen++;
  state = 'closed'; closedAt = performance.now();
  e.classList.remove('open', 'gone');
  return sleep(IN_MS);
}

/** clouds apart once the view has arrived and drawn */
export function loaderReveal(loaded: Promise<unknown>) {
  const g = gen;
  void (async () => {
    await Promise.race([loaded.catch(() => {}), sleep(40000)]);
    await until(() => pending === 0, 15000);
    await settled(15000);
    // the first time the banks start closing only once index.html has drawn them (#ld.ready, __ldReadyAt)
    await until(() => !!document.querySelector('#ld.ready'), 5000);
    const begun = Math.max(closedAt, W.__ldReadyAt ?? 0);
    const wait = begun + IN_MS + 200 - performance.now();
    if (wait > 0) await sleep(wait);
    const e = el();
    if (!e || g !== gen || state !== 'closed') return;
    state = 'opening'; W.__ldOpened = true;
    e.classList.add('open');
    await sleep(OUT_MS);
    if (g === gen && state === 'opening') { e.classList.add('gone'); state = 'open'; }
  })();
}
