# Obod Maskan 3D

Turar-joy majmuasi uchun 3D savdo ilovasi (React 19 + three.js + esbuild, TypeScript). Egasi: Abdulaziz. **Muloqot o'zbek tilida.** Ilova faqat kompyuterlar uchun (mobil kerak emas).

## Buyruqlar
- `npm install`
- `npm run dev` — `dist/` ni yig'adi va http://localhost:5173 da ochadi (hot reload yo'q: o'zgarishdan keyin qayta ishga tushiring)
- `node build.mjs` — `dist/` (BASIC) va `dist-pro/` (PRO); `node build.mjs light` — faqat `dist/`
- `npm run typecheck` — `tsc --noEmit`
- Deploy: `dist/` ichidagi fayllar sayt ildizida turishi kerak (Vercel: papkaning o'zi emas, ichidagilari). `file://` orqali ochilmaydi.

## Tuzilma
- `src/App.tsx`, `src/styles.css` — majmua ekrani, panellar, rejimlar
- `src/three/ComplexScene.ts` — majmua sahnasi (20 blok, quyosh, tun, atrof, hovli, qurilish holati)
- `src/three/context.ts` — atrof (ko'chalar, qo'shni binolar), `Courtyard` (hovli maysalari, daraxtlar, chiroqlar)
- `src/three/yard.ts` — hovli jihozlari: sport maydoni, bolalar maydonchasi, turargoh, shiypon, o'rindiq, yo'laklar, buta to'siqlar, gulzorlar
- `src/three/trees.ts` — karta daraxtlar va haqiqiy `.glb` daraxtlar (`public/trees/`, EZ-Tree bilan yasalgan: `tools/trees_glb/`)
- `src/three/blockDetail.ts` — 4-turdan boshqa 13 blokning fasadi; `clouds.ts` — bulutlar; `progressView.ts` — jonli qurilish
- `src/block/` — batafsil blok (4-tur: 1, 2, 12, 13, 15, 16, 18-bloklar bitta modeldan):
  - `data/plan_t4.json` — chizmalardan olingan reja; `floorGeom.ts` — qavat geometriyasi; `facade.ts` — fasad bezaklari, **1-qavat portali/arka, do'kon yozuvlari, ayvon**
  - `materials.ts`, `textures.ts` — materiallar (shader patchlari `chain()` orqali), canvas teksturalar
  - `BlockScene.ts`, `BlockView.tsx` — blok ichi: qavatlar, xonadonlar, yurish, MEP, qurilish, energiya, chizmalar (`ui/`)
- `src/data/blocks.ts` — bloklar joylashuvi; `src/data/progress.ts` — qurilish jadvali (demo)
- `src/pro/` — PRO renderer (PBR teksturalar, `public-pro/`)
- `tools/` — `yard.py` (hovli joylashuvi → `public/context/yard.json`, shapely kerak), `blender/` (pastga qarang)

## Koordinatalar
Blok-lokal: reja (x, y) → three (x, balandlik, y). `FLOOR_H` 3.0, `FLOORS` 16, `BLOCK_W` 29.7, `BLOCK_D` 18.1. Ko'cha fasadi y = 0 da, tashqariga −y. Portal markazi x = 14.85. Brauzerda `window.__complex` / `window.__block` debug uchun ochiq.

## Blender modeli (hozir O'CHIRILGAN)
`tools/blender/export.mjs` chizmalardan tashqi geometriyani oladi, `block1.py` (`pip install bpy`) uni Blender'da yig'ib AO soyalarni pishiradi → `public/models/blok1.glb`. `npm run model` ikkalasini bajaradi (~3–4 daqiqa). Ilovada `ComplexScene.ts` dagi `BLOCK_GLB = false`: eksteryer hali o'zgaryapti, shuning uchun bloklar chizmadan chiziladi. Eksteryer tayyor bo'lgach: `npm run model`, keyin `BLOCK_GLB = true`. Rang/material o'zgarsa qayta yasash shart emas, shakl o'zgarsa shart.

## Holat va reja
Qilingan: manzil, atrof, eshiklar, yurish, 3D hovli, quyosh/vaqt, PRO, daraxtlar, chiroqlar va tun, MEP, qurilish/materiallar, jonli qurilish, o'lchamli chizmalar, energiya samaradorligi, bulutlar; eksteryer realizmi 1-bosqich (13 blok fasadi) va 2-bosqich (hovli, yashil zona, yo'laklar); 1-qavat eksteryeri render rasmiga qarab qayta chizildi (g'isht portal, yelkali o'tkir arka, girih panjara, granit poydevor, do'kon yozuvlari); bino oldida baland daraxtlar o'rniga 50 sm butalar.

Qolgan:
- 4-bosqich — yorug'lik va atmosfera: yumshoq soyalar, uzoq tuman, ob-havo/fasl (yomg'ir, qor, kuz), kuchliroq tungi sahna, ufqda tog'lar
- 5-bosqich — atrof shahar: qo'shni uylar tomlari, devor/darvozalar, ko'cha jihozlari (bekat, svetofor, belgilar)
- 3-bosqich (harakat: mashinalar, odamlar) — egasi kerak emas dedi
- 1-qavat: do'kon ichi ko'rinmaydi (oynalar ko'k, deyarli shaffof emas), ayvon render'dagidan sodda, yuqori qavatlar render'da sarg'ish — bizda yashil-oq
- Tekshirilmagan: tungi ko'rinish, PRO rejimi va blok ichidagi 1-qavat oxirgi o'zgarishlardan keyin; "Qurilish holati" yangi fasad detallari bilan
- Asfalt/plitka teksturalari realizmi, ko'cha daraxtlari hali karta ko'rinishida
- Hovli jihozlari joylashuvi bosh rejada yo'q edi — avtomatik joylashtirilgan

## Eslatmalar
- Egasi qisqa, aniq natija xohlaydi; o'zgarishdan oldin/keyin bir xil rakursdan surat ko'rishni yoqtiradi.
- Demo ma'lumotlar: narx, qurilish jadvali, tariflar, do'kon nomlari.
