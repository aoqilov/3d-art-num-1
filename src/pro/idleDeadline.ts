// @takram/three-atmosphere precomputes its tables (transmittance, scattering …) in four requestIdleCallback steps.
// With the Ultra view drawing every frame the browser is hardly ever idle, so the sky and the aerial perspective
// came ~15 s after opening a block (black until then). A deadline runs each step within 100 ms however busy.
// Imported before the library (atmosphere.ts): it keeps its own reference to requestIdleCallback.
if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
  const ric = window.requestIdleCallback.bind(window);
  window.requestIdleCallback = ((cb: IdleRequestCallback, o?: IdleRequestOptions) => ric(cb, { timeout: 100, ...o })) as typeof window.requestIdleCallback;
}
export {};
