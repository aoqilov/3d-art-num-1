// Left-side panel: how the renderer is doing (stats.ts). Folds away into the left edge, where a tab (with the frame
// rate) opens it again — as the right-hand panel folds to the right; closed at first, the state kept in this browser.
import { useEffect, useRef, useState } from 'react';
import { renderStats as S } from './stats';
import { getMode } from '../mode';

const KEY = 'om-render';          // new key: the panel starts closed also where the old one ('om-stats') was left open
type Gpu = { name: string } | null;

let gpuInfo: Promise<Gpu> | null = null;
function adapter(): Promise<Gpu> {
  if (!gpuInfo) {
    const nav = navigator as unknown as { gpu?: { requestAdapter(o?: object): Promise<{ info?: { vendor?: string; architecture?: string; description?: string; device?: string } } | null> } };
    gpuInfo = nav.gpu ? nav.gpu.requestAdapter({ powerPreference: 'high-performance' }).then((a) => {
      const i = a?.info; if (!i) return null;
      const name = [i.description, i.vendor && i.vendor.toUpperCase(), i.architecture, i.device].filter(Boolean).join(' · ');
      return name ? { name } : null;
    }).catch(() => null) : Promise.resolve(null);
  }
  return gpuInfo;
}
const mb = (b: number) => (b / 1048576).toFixed(0) + ' MB';
const num = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' mln' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' ming' : String(n));

export default function RenderStats({ place = 'top' }: { place?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [, tick] = useState(0);
  const [gpu, setGpu] = useState<Gpu>(null);
  const graph = useRef<HTMLCanvasElement>(null);
  useEffect(() => { void adapter().then(setGpu); }, []);
  useEffect(() => { const id = setInterval(() => tick((t) => t + 1), 500); return () => clearInterval(id); }, []);
  useEffect(() => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* blocked */ } }, [open]);

  const fps = S.fps(), frameMs = fps ? 1000 / fps : 0;
  const busy = S.gpuMs !== null && frameMs ? Math.min(100, (S.gpuMs / frameMs) * 100) : null;
  const r = S.renderer as unknown as { backend?: { isWebGPUBackend?: boolean }; getPixelRatio?: () => number; domElement?: HTMLCanvasElement; info?: { memory: { geometries: number; textures: number; total?: number } } } | null;
  const backend = r?.backend?.isWebGPUBackend ? 'WebGPU' : r ? 'WebGL 2' : '—';
  const mem = r?.info?.memory;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const c = r?.domElement;
  const idle = !fps;
  const tone = fps >= 50 ? 'ok' : fps >= 25 ? 'mid' : 'low';

  useEffect(() => {
    const cv = graph.current; if (!cv || !open) return;
    const g = cv.getContext('2d')!, W = cv.width, H = cv.height, iv = S.intervals().slice(-80);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath();
    for (const ms of [16.7, 33.3]) { const y = H - (ms / 50) * H; g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    iv.forEach((ms, i) => {
      const h = Math.min(H, (ms / 50) * H), x = (i / 80) * W;
      g.fillStyle = ms <= 17.5 ? '#3fa66b' : ms <= 34 ? '#e0a63a' : '#c0584d';
      g.fillRect(x, H - h, W / 80 - 1, h);
    });
  });

  return (
    <div className={`rs-dock rs-${place}${open ? '' : ' shut'}`}>
    <div className="rstats" aria-hidden={!open} inert={!open}>
      <div className="rs-head"><b>Render</b><span>{S.view}</span></div>
      <div className="rs-fps"><b className={tone}>{idle ? '—' : fps.toFixed(0)}</b><span>FPS{idle ? ' · kutish (sahna o\'zgarmasa chizilmaydi)' : ` · ${frameMs.toFixed(1)} ms kadr`}</span></div>
      <canvas ref={graph} width={232} height={38} />
      <table><tbody>
        <tr><td>GPU vaqti</td><td>{S.gpuMs !== null ? S.gpuMs.toFixed(1) + ' ms' : 'o\'lchanmaydi'}</td></tr>
        <tr><td>GPU bandligi</td><td>{busy !== null && !idle ? `~${busy.toFixed(0)}%` : '—'}</td></tr>
        <tr><td>CPU vaqti</td><td>{S.cpuMs.toFixed(1)} ms</td></tr>
        <tr><td>Draw call</td><td>{num(S.draws)}</td></tr>
        <tr><td>Uchburchak</td><td>{num(S.tris)}</td></tr>
        <tr><td>Xotira</td><td>{mem ? `${mem.geometries} geom · ${mem.textures} tex${mem.total ? ' · ' + mb(mem.total) : ''}` : '—'}</td></tr>
        {heap ? <tr><td>JS xotira</td><td>{mb(heap)}</td></tr> : null}
        <tr><td>Renderer</td><td>{backend} · {getMode() === 'pro' ? 'PRO (Ultra)' : 'BASIC'}</td></tr>
        <tr><td>O'lcham</td><td>{c ? `${c.width}×${c.height}` : '—'}{r?.getPixelRatio ? ` · ×${r.getPixelRatio().toFixed(2)}` : ''}</td></tr>
        {S.lights ? <tr><td>Chiroqlar</td><td>{S.lights} ta haqiqiy nur</td></tr> : null}
      </tbody></table>
      {S.effects.length ? <div className="rs-fx">{S.effects.map((e) => <i key={e}>{e}</i>)}</div> : null}
      <div className="rs-gpu">{gpu?.name ?? 'Videokarta nomi brauzer tomonidan yashirilgan'}</div>
    </div>
    <button className="rs-tab" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Render panelini yopish' : 'Render ko‘rsatkichlari'}>
      <span aria-hidden>{open ? '‹' : '›'}</span>
      {!open && <><b>Render</b><em className={tone}>{idle ? '—' : fps.toFixed(0)}</em></>}
    </button>
    </div>
  );
}
