// Renders taken from the developer's presentation (Obod_Maskan_TJM.pdf) and the block-1 PDF.
export type GalCat = 'tashqi' | 'hovli' | 'ichki' | 'rejalar';
export type GalItem = { id: string; cat: GalCat; uz: string; ru: string; src: string; thumb: string; type4?: boolean };

const p = (n: number, cat: GalCat, uz: string, ru: string): GalItem => {
  const f = String(n).padStart(2, '0');
  return { id: f, cat, uz, ru, src: `gal/${f}.jpg`, thumb: `gal/t/${f}.jpg` };
};

export const GAL_CATS: Record<GalCat, { uz: string; ru: string }> = {
  tashqi: { uz: 'Tashqi ko‘rinish', ru: 'Экстерьер' },
  hovli: { uz: 'Hovli va infratuzilma', ru: 'Двор и инфраструктура' },
  ichki: { uz: 'Ichki makon', ru: 'Интерьер' },
  rejalar: { uz: '3D rejalar', ru: '3D-планировки' },
};

export const GALLERY: GalItem[] = [
  { id: 'b1', cat: 'tashqi', uz: '4-tip blok vizualizatsiyasi', ru: 'Визуализация блока типа 4', src: 'pdf/b1-p2.jpg', thumb: 'gal/t/b1.jpg', type4: true },
  p(6, 'tashqi', 'Kechki ko‘rinish', 'Вечерний вид'),
  p(29, 'tashqi', 'Majmua ko‘chasi', 'Улица комплекса'),
  p(14, 'tashqi', 'Piyodalar xiyoboni', 'Пешеходная аллея'),
  p(17, 'tashqi', 'Favvorali hovli', 'Двор с фонтаном'),
  p(12, 'tashqi', 'Majmua tepadan', 'Комплекс сверху'),
  p(59, 'tashqi', 'Bloklar raqamlari', 'Номера блоков'),
  p(7, 'hovli', 'Hovlidagi dam olish', 'Отдых во дворе'),
  p(21, 'hovli', 'Bolalar maydonchasi', 'Детская площадка'),
  p(23, 'hovli', 'Yashil hudud', 'Зелёная зона'),
  p(25, 'hovli', 'Fitness zona', 'Фитнес-зона'),
  p(26, 'hovli', 'Relax zona', 'Зона отдыха'),
  p(24, 'hovli', 'Yerosti avtoturargohi', 'Подземный паркинг'),
  p(19, 'hovli', '24/7 qo‘riqlash', 'Охрана 24/7'),
  p(27, 'ichki', 'Zamonaviy liftlar', 'Современные лифты'),
  p(33, 'ichki', 'Kirish eshiklari', 'Входные двери'),
  p(34, 'ichki', 'Deraza va oynalar', 'Окна'),
  p(35, 'ichki', 'Isitish tizimi', 'Система отопления'),
  p(32, 'ichki', 'Balkon', 'Балкон'),
  p(30, 'ichki', 'Shift balandligi', 'Высота потолков'),
  p(31, 'ichki', '50 % ta’mirlangan holatda topshiriladi', 'Сдача с отделкой 50 %'),
  // block-1 typical floor (3–16) flats rendered in 3D
  { ...p(47, 'rejalar', '1 xonali · 40,00 m²', '1-комн. · 40,00 м²'), type4: true },
  { ...p(48, 'rejalar', '1 xonali · 40,73 m²', '1-комн. · 40,73 м²'), type4: true },
  { ...p(49, 'rejalar', '1 xonali · 40,84 m²', '1-комн. · 40,84 м²'), type4: true },
  { ...p(50, 'rejalar', '2 xonali · 53,88 m²', '2-комн. · 53,88 м²'), type4: true },
  { ...p(51, 'rejalar', '3 xonali · 63,40 m²', '3-комн. · 63,40 м²'), type4: true },
  { ...p(52, 'rejalar', '3 xonali · 63,47 m²', '3-комн. · 63,47 м²'), type4: true },
  { ...p(53, 'rejalar', '3 xonali · 70,80 m²', '3-комн. · 70,80 м²'), type4: true },
];

/** 3D render of a typical-floor (3–16) flat of the type-4 block, keyed by plan label. */
const RENDER3D: Record<string, string> = { '40.00': '47', '40.73': '48', '40.84': '49', '53.88': '50', '63.40': '51', '63.47': '52', '70.80': '53' };
export const render3d = (storey: number, label: string) => (storey >= 3 && RENDER3D[label] ? GALLERY.find((g) => g.id === RENDER3D[label])! : null);
