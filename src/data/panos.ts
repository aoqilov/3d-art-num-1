// Flats with 360° room panoramas (tools/interior/build.py → public/pano/apt<N>/). Keyed by the flat's index on the
// typical storey plan ('3', floors 3–16 of the type-4 blocks); floors 1–2 have other plans.
const PANOS: Record<number, string> = { 4: 'pano/apt4' };
export const panoFor = (storey: number, index: number): string | null => (storey >= 3 ? PANOS[index] ?? null : null);
