// Render measurements for the stats panel (RenderStats.tsx): frame rate, CPU time of a frame, GPU time of a frame
// (WebGPU timestamp queries), draw calls and triangles of the whole frame (all passes), memory. The scenes call
// begin() before and end() after every frame they draw; a view that draws only on change shows "idle".
import type { Renderer } from './gpu';

type Info = { render: { drawCalls: number; triangles: number }; memory: { geometries: number; textures: number; total?: number }; autoReset: boolean; reset(): void };

export const renderStats = {
  renderer: null as Renderer | null,
  /** what the current view draws: effects, lights … (set by the scenes) */
  view: '' as string,
  effects: [] as string[],
  lights: 0,
  frames: [] as number[],        // timestamps of the frames of the last 2 s
  cpuMs: 0,                      // smoothed
  gpuMs: null as number | null,  // last resolved frame; null: no timestamp queries
  draws: 0, tris: 0,
  private: { t0: 0, lastResolve: 0, resolving: false },

  begin(r: Renderer) {
    this.renderer = r;
    const info = r.info as unknown as Info;
    info.autoReset = false;      // count every pass of the frame (the Ultra pipeline renders several)
    info.reset();
    this.private.t0 = performance.now();
  },
  end(r: Renderer) {
    const now = performance.now(), p = this.private;
    const dt = now - p.t0;
    this.cpuMs = this.cpuMs ? this.cpuMs * 0.9 + dt * 0.1 : dt;
    this.frames.push(now);
    while (this.frames.length && this.frames[0] < now - 2000) this.frames.shift();
    const info = r.info as unknown as Info;
    this.draws = info.render.drawCalls; this.tris = info.render.triangles;
    const be = (r as unknown as { backend: { trackTimestamp?: boolean } }).backend;
    if (be.trackTimestamp && !p.resolving && now - p.lastResolve > 300) {
      p.resolving = true; p.lastResolve = now;
      r.resolveTimestampsAsync('render').then((ms) => { if (typeof ms === 'number' && ms > 0) this.gpuMs = ms; }).finally(() => (p.resolving = false));
    }
  },
  fps() {
    const f = this.frames, now = performance.now();
    if (f.length < 2 || now - f[f.length - 1] > 700) return 0;
    return ((f.length - 1) * 1000) / (f[f.length - 1] - f[0]);
  },
  /** frame intervals (ms) of the last 2 s, for the graph */
  intervals() { const f = this.frames; return f.slice(1).map((t, i) => t - f[i]); },
};
export type RenderStatsT = typeof renderStats;
