// Minimal stroke icons (24x24) in the style of the Kamolon UI.
const P: Record<string, string> = {
  bino: 'M4 21V9l5-3v15M9 21V4l7 3v14M16 21v-9l4 2v7M3 21h18M12 9h1M12 12h1M12 15h1',
  kvartiralar: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  qavatlar: 'M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  joylashuv: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  yaqin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3 6.3-2.1Z',
  galereya: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1.5 1.5 0 1 0 0-.01',
  raqamlar: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  back: 'M15 18l-6-6 6-6',
  expand: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  shrink: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  close: 'M6 6l12 12M18 6 6 18',
  sunrise: 'M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sunset: 'M17 18a5 5 0 0 0-10 0M12 9V2M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 5l-4 4-4-4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z',
  plan: 'M3 3h18v18H3zM3 12h8M11 3v18M15 12h6',
  door: 'M5 21V3h11l3 3v15M14 12h.01M3 21h18',
  walk: 'M13.5 5.5a1.75 1.75 0 1 0 0-.01M9 21l2.2-6.2L14 17v4M8 10.5l3.2-2.3 3.3 3.1 3 1.2M11.2 8.2 9.6 15l-3.2 1.6',
  window: 'M4 3h16v18H4zM12 3v18M4 12h16',
  lift: 'M5 3h14v18H5zM12 3v18M8.5 9l-1.5 2h3zM15.5 13l1.5-2h-3z',
  person: 'M12 3.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6zM8 21v-6.5l-1.5-.5V10.5A2.5 2.5 0 0 1 9 8h6a2.5 2.5 0 0 1 2.5 2.5V14l-1.5.5V21M12 14.5V21',
  keys: 'M3 7h18v11H3zM6.5 10.5h1M10 10.5h1M13.5 10.5h1M17 10.5h.5M7 14.5h10',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z',
  ruler: 'M4 15.5 15.5 4 20 8.5 8.5 20zM8 12l1.8 1.8M10.5 9.5l1.2 1.2M13 7l1.8 1.8',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
};
export function Icon({ n, size = 20 }: { n: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}><path d={P[n] ?? ''} /></svg>
  );
}
