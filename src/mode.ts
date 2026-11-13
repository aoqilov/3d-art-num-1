// Basic (light, any device) / PRO (sales-office renderer: PBR textures, HDR sky, AO, bloom).
// The choice is remembered per browser; switching reloads the page so every material starts clean.
declare const __DEFAULT_MODE__: Mode;
export type Mode = 'basic' | 'pro';
const KEY = 'om-mode';

export function getMode(): Mode {
  try { const m = localStorage.getItem(KEY); if (m === 'pro' || m === 'basic') return m; } catch { /* storage may be blocked */ }
  const w = /(?:^|;)om-mode=(pro|basic)/.exec(window.name)?.[1];   // fallback that survives a reload in a frame
  return (w as Mode) ?? __DEFAULT_MODE__;
}
export function setMode(m: Mode) {
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  window.name = `om-mode=${m}`;
  location.reload();
}
