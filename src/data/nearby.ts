// Places around Obod Maskan read from the satellite screenshot (public/sat.jpg, 1090×713 px).
// Scale and orientation from its lat/lon grid: 1 px ≈ 1.72 m, north points to the lower-left.
// Distances are straight-line from the site centre (≈41°18'47"N 69°11'09"E); walking time assumes
// streets 30 % longer than the straight line at 80 m/min.
export type Cat = 'talim' | 'masjid' | 'transport' | 'ovqat' | 'savdo';
export type Place = { id: string; cat: Cat; px: [number, number]; uz: string; ru: string };

export const SAT = { w: 1090, h: 713, mPerPx: 1.72, centre: [520, 265] as [number, number] };

export const PLACES: Place[] = [
  { id: 'bus1', cat: 'transport', px: [395, 298], uz: 'Avtobus bekati', ru: 'Автобусная остановка' },
  { id: 'bus2', cat: 'transport', px: [547, 414], uz: 'Avtobus bekati', ru: 'Автобусная остановка' },
  { id: 'univer', cat: 'talim', px: [685, 55], uz: 'Jahon tillari universiteti', ru: 'Университет мировых языков' },
  { id: 'school4', cat: 'talim', px: [407, 509], uz: '4-maktab', ru: 'Школа № 4' },
  { id: 'noorlys', cat: 'talim', px: [118, 655], uz: 'Noorlys Dadil (o‘quv markazi)', ru: 'Noorlys Dadil (учебный центр)' },
  { id: 'mosque1', cat: 'masjid', px: [937, 232], uz: 'Ko‘kcha Oqtepa masjidi', ru: 'Мечеть Кукча Октепа' },
  { id: 'bakery', cat: 'savdo', px: [308, 248], uz: 'Ismoil non markazi', ru: 'Хлебный центр «Исмоил»' },
  { id: 'grand', cat: 'savdo', px: [40, 140], uz: 'Grand House (kiyim do‘koni)', ru: 'Grand House (одежда)' },
  { id: 'astoria', cat: 'ovqat', px: [352, 465], uz: 'Astoria (restoran)', ru: 'Astoria (ресторан)' },
  { id: 'fish', cat: 'ovqat', px: [158, 165], uz: 'Yamin baliq (restoran)', ru: 'Ямин балик (ресторан)' },
  { id: 'choyxona', cat: 'ovqat', px: [850, 507], uz: 'Shokiraka choyxonasi', ru: 'Чайхана «Шокирака»' },
];

export const CATS: Record<Cat, { uz: string; ru: string; color: string }> = {
  talim: { uz: 'Ta’lim', ru: 'Образование', color: '#5aa9e6' },
  masjid: { uz: 'Masjid', ru: 'Мечети', color: '#7dc9a0' },
  transport: { uz: 'Transport', ru: 'Транспорт', color: '#4f8cf0' },
  ovqat: { uz: 'Ovqatlanish', ru: 'Питание', color: '#f2994a' },
  savdo: { uz: 'Savdo', ru: 'Магазины', color: '#e2c785' },
};

export function distance(p: Place) {
  const m = Math.hypot(p.px[0] - SAT.centre[0], p.px[1] - SAT.centre[1]) * SAT.mPerPx;
  return { m: Math.round(m / 10) * 10, min: Math.max(1, Math.round((m * 1.3) / 80)) };
}

export const ADDRESS = {
  uz: 'Toshkent sh., Uchtepa tumani, Ko‘kcha Oqtepa MFY, Ko‘kcha Darvoza ko‘chasi, 69-uy',
  ru: 'г. Ташкент, Учтепинский р-н, МСГ Кукча Октепа, ул. Кукча Дарвоза, 69',
};
