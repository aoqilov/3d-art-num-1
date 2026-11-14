# Obod Maskan 3D

Turar-joy majmuasi uchun 3D savdo ilovasi (React 19 + three.js **WebGPU** + esbuild, TypeScript). Egasi: Abdulaziz. **Muloqot o'zbek tilida.** Ilova faqat kompyuterlar uchun (mobil kerak emas).

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
- Hovli jihozlari .glb (`npm run yard`, ~1.5 daqiqa: `tools/yard_glb/` fetch → Blender `build.py` → siqish → `public/yard/`, `src/three/glbInstances.ts` bilan instancing): `buta_tosiq` (qirqilgan to'siq bo'lagi — barg teksturasi Blender'da minglab haqiqiy barglardan Cycles bilan "suratga olingan", notekis yumaloq quti + 50 ta erkin barg), `buta` (searsia_lucida, barglar 22% qoldirilib kattalashtirilgan), `gul` (flower_gazania), `orindiq` (Blender'da yasalgan, yog'och teksturasi modular_street_seating'dan). Hammasi Poly Haven CC0. To'siq har ikkinchi nuqtada, gullar 2.5/m² — GTX 1650 da ~16.5 FPS
- Ko'chalar: haqiqiy fototeksturalar (`node tools/ground/roads.mjs` → `public-pro/pro/tex/ph_asphalt_*`, `ph_pavers_*`; Poly Haven asphalt_02 va concrete_pavers, CC0), `context.ts` `STREET` — ichki ko'chalar, trotuarlar va hovli yo'laklari. Tashqi shahar ko'chalari `outer.json` `roads` (CADMapper markaz chiziqlari, ichki hudud tashqarisi) dan `outer.ts` `roads()`: asfalt lenta + plitkali trotuar lentasi + katta yo'llarda uzuk chiziq
- Render paneli (chapda; kompleksda yuqorida, blokda pastda; yig'ilsa FPS tugmasi, holati brauzerda): `src/three/stats.ts` (sahnalar har kadrda begin/end chaqiradi, `info.autoReset=false` — barcha o'tishlar yig'indisi; GPU vaqti WebGPU timestamp query, `trackTimestamp: true`) + `RenderStats.tsx`. 2026-11-14 o'lchov (GTX 1650, kompleks Ultra): 16 FPS, GPU 59 ms/kadr (~95%), 38 mln uchburchak/kadr — daraxtlar bitta o'tishda 3.7 mln, soya kaskadlari bilan ko'payadi (optimizatsiya nomzodi: uzoq daraxtlarga LOD, uzoq kaskadlarda daraxt soyasi yo'q)
- `src/three/outer.ts` — tashqi shahar: `maps-out/` dagi CADMapper zip'lari (3D binolar) `npm run outer` (`tools/outer/merge.mjs`) bilan bitta qatlamga: fayllar bir xil OSM binolari bo'yicha bir-biriga va `tools/data/cadmapper.dxf` ga moslanadi (siljish ovoz berish bilan), takrorlar olib tashlanadi → `public/context/outer.json` (5334 bino, 1.8 km gacha). Kulrang qutilar, bitta mesh; `?edit=2` — bosib (Shift qo'shadi) belgilash, brauzerda saqlanadi, "JSON yuklab olish" → outer-picks.json. 1-zip hech qaysi fayl bilan ustma-ust tushmadi — joylashtirilmadi (qayta yuklash kerak, qo'shnisi bilan 50–100 m ustma-ust). Tuman 600–2600 m, kamera far 6000
- `src/three/ground.ts` — ko'chalar/uylar orasidagi bo'sh yer (2.4 km taglik): Poly Haven CC0 tuproq + maysa fototeksturalari (`public/ground/`, `node tools/ground/prepare.mjs`), yirik shovqin bilan aralash, ikki masshtabda (takrorlanmasin); oq maketda oddiy rang
- `src/three/glbTrees.ts` — barcha daraxtlar egasi bergan .glb lardan (`glb-models/` → `node tools/trees_user/optimize.mjs` → `public/trees/user/`): `daraxt.glb` (2 bargli daraxt: chinor, terak, mevali) va `pack.glb` (to'plamdan faqat mayda narsalar: 4 archa, 2 buta, 2 o't tupi). CC BY 4.0 — mualliflar ilovada pastda yozilgan (`CREDITS.txt`). Daraxtlar soni `densify.ts` bilan ko'paytirilgan (ko'cha qatorlari to'ldiriladi, bog'lar va mahallaning bo'sh yerlari 420 m radiusda ~9 m oraliqda, hovli maysalari 4.5 m oraliqda — yo'l, trotuar, uy, maydonchalar, fasaddan 2.5 m chetda). `trees.ts` dagi karta daraxtlar faqat yuklanguncha turadi; EZ-Tree daraxtlari (`tools/trees_glb/`) endi ishlatilmaydi
- `src/three/blockDetail.ts` — 4-turdan boshqa 13 blokning fasadi; `clouds.ts` — bulutlar; `progressView.ts` — jonli qurilish
- `src/block/` — batafsil blok (4-tur: 1, 2, 12, 13, 15, 16, 18-bloklar bitta modeldan):
  - `data/plan_t4.json` — chizmalardan olingan reja; `floorGeom.ts` — qavat geometriyasi; `facade.ts` — fasad bezaklari, **1-qavat portali/arka, do'kon yozuvlari, ayvon**
  - `materials.ts`, `textures.ts` — materiallar (qavat kesimi `prep()`: `clippingPlanes` + orqa yuz rangi `outputNode`), canvas teksturalar
  - `BlockScene.ts`, `BlockView.tsx` — blok ichi: qavatlar, xonadonlar, yurish, MEP, qurilish, energiya, chizmalar (`ui/`)
  - `surroundings.ts` — blok sahifasining atrofi (2026-11-14): kompleks ko'rinishidagi haqiqiy atrof shu blok koordinatasida — foto-yer, ko'chalar, hovli (`three/courtLayout.ts` `layoutCourtyard` ikkala ko'rinishda umumiy), mahalla, qolgan bloklar (Blender modeli, material nusxalari CUT kesimisiz), tashqi shahar (soyasiz). Blok atrofida 20 m daraxtsiz ochiq hudud; 200 m dan nariroq daraxtlar yengil kartali (soyasiz). Kamera bilan blok orasidagi qo'shni blok/uy/daraxt siyraklashadi (maskNode, har kadrda siljiydigan dither — TRAA uni pardaga aylantiradi; soya butun qoladi `maskShadowNode`). Rakurslar `clearSpot` bilan uy/blok/daraxt ichiga tushmaydigan joyga suriladi; `view()` orbit chegarasi (0.6π) ichida. Ultra: CSM 3 kaskad, ko'cha chiroqlari ClusteredLighting. "Joylashuv" bo'limida eski reja rasmi + och qutilar. GTX 1650 Ultra: ~18–26 FPS harakatda (14–19 mln uchburchak), BASIC ~54
- `src/data/blocks.ts` — bloklar joylashuvi; `src/data/progress.ts` — qurilish jadvali (demo)
- `src/three/gpu.ts` — yagona renderer: `WebGPURenderer` (WebGPU yo'q joyda o'zi WebGL 2 ga o'tadi). `build.mjs` har bir `import 'three'` ni `three/webgpu` ga yo'naltiradi. Oddiy three materiallar ishlatiladi; GLSL/`onBeforeCompile` ishlamaydi — o'rniga node xossalari (`nodes(m).emissiveNode`, `outputNode`, `maskNode`, TSL). `material.clippingPlanes` renderer ichida `maskNode` ga aylantiriladi
- `src/three/timeStops.ts` — 7 ta vaqt (04, 07, 10, 13, 16, 19, 23; 21-iyun), har birining ko'rinishi (`LOOKS`: ekspozitsiya, grading, bulut, bloom), `HourGlide` — vaqtlar orasida ~1.5 s silliq o'tish. Ikkala sahna `setHour(h, instant?)`, quyosh `sun.ts` dan (blokda blok burilishi bilan)
- `src/pro/atmosphere.ts` — `@takram/three-atmosphere` (WebGPU): fizik osmon, quyosh, oy, yulduzlar (`public-pro/pro/atm/stars.bin`), havo pardasi. Faqat **blok** ko'rinishida (`ProInternals.atmosphere`); kompleksda klassik osmon (CPU sky + fog): u yerda atmosfera quyoshi kadrni qoraytiradi, havo pardasi 300 m balanddan hammasini jigarrang qiladi — sababi topilmagan. `build.mjs` @takram uchun moslik patchlari: `three/src/.../NodeUtils.js` → `src/three/nodeUtilsShim.ts`, `struct().layout.name` → `.name`; `gpu.ts` — r187 `getVaryings` patchi
- `src/pro/` — PRO = **Ultra** renderer (`ProRenderer.ts`: RenderPipeline — SSGI bilvosita yorug'lik + AO, bloom, TRAA; kompleksda CSM kaskad soyalar; PBR teksturalar `public-pro/`). SSR kodi bor, lekin o'chiq (`fx.ssr`): chuqurlik chegaralarida qora dog' beradi. Konsolda `__pro` — sozlash uchun (`__pro.gi.giIntensity.value`, `__pro.build()`). BASIC = "Yengil" rejim: o'sha renderer, effektlarsiz
- `tools/` — `yard.py` (hovli joylashuvi → `public/context/yard.json`, shapely kerak), `blender/` (pastga qarang)

## Koordinatalar
Blok-lokal: reja (x, y) → three (x, balandlik, y). `FLOOR_H` 3.0, `FLOORS` 16, `BLOCK_W` 29.7, `BLOCK_D` 18.1. Ko'cha fasadi y = 0 da, tashqariga −y. Portal markazi x = 14.85. Brauzerda `window.__complex` / `window.__block` debug uchun ochiq.

## Blender modeli (YOQILGAN, 3-bosqich)
`npm run model` (~1 daqiqa, `tools/blender/run.mjs`): `export.mjs` chizmalardan tashqi geometriyani oladi (o'rnatilgan Chrome, playwright-core) → Blender (`D:/blender.exe`, yoki `$BLENDER`) `block1.py` bilan: payvandlash, faqat qobiqqa 1.2 sm bevel (ramkalarga emas — uchburchak isrofi), ikkinchi UV, AO pishirish (GPU: OptiX/CUDA, bo'lmasa CPU) → `compress.mjs`: meshopt + WebP (`prune({ keepAttributes: true })` — aks holda fasad UV'si o'chadi!) → `public/models/blok1.glb` (~5.6 MB, ~167k uchburchak). Ilovada `ComplexScene.ts` `BLOCK_GLB` yoqilgan, 20 blokning hammasiga (`?noglb` — chizilgan geometriya, solishtirish uchun); material'lar AO kirishini oldindan oladi (model kelganda qayta kompilyatsiya yo'q). Blok sahifasi hali chizilgan geometriyada (oynadan xonalar ko'rinishi uchun). Shakl o'zgarsa `npm run model` qayta ishga tushiriladi; rang/material o'zgarsa shart emas. Balkon panjarasi: ustunlar va tutqichlar geometriya, oradagi 1.6 sm tayoqchalar bitta teksturali panel (`rail_panel`, `materials.ts`) — geometriya bo'lganda piksel'dan ingichka bo'lib harakatda titrardi; Blender'da panelga Alpha 0.5 berilgan, aks holda eksportchi uni 'rail' bilan birlashtiradi. SSR sinaldi: model bilan ancha toza, lekin deraza burchaklarida mayda qora nuqtalar — o'chiq.

## Holat va reja
Qilingan: manzil, atrof, eshiklar, yurish, 3D hovli, quyosh/vaqt, PRO, daraxtlar, chiroqlar va tun, MEP, qurilish/materiallar, jonli qurilish, o'lchamli chizmalar, energiya samaradorligi, bulutlar; eksteryer realizmi 1-bosqich (13 blok fasadi) va 2-bosqich (hovli, yashil zona, yo'laklar); 1-qavat eksteryeri render rasmiga qarab qayta chizildi (g'isht portal, yelkali o'tkir arka, girih panjara, granit poydevor, do'kon yozuvlari); bino oldida baland daraxtlar o'rniga 50 sm butalar.

Realizm rejasi (egasi bilan kelishilgan, 2026-11): maqsad — RTX 5090 kompyuterda Unreal'ga yaqin ko'rinish; oddiy kompyuterlar ahamiyatsiz (BASIC faqat zaxira). Ishlab chiqish kompyuterida GTX 1650 — sifat shu yerda tekshiriladi, tezlik 5090 da. Foto rejim (path tracing) kerak emas.
- 1-bosqich QILINDI: WebGPU, SSGI, TRAA, CSM (kompleks), bloom. Qolgani: SSR (oynalarda aks) — 3-bosqichda Blender modeli bilan qayta ko'rish
- 2-bosqich QILINDI: 7 ta vaqt (slayder o'rniga 7 ta soat tugmasi: yuqori panel va blokdagi vaqt paneli), silliq o'tish, har vaqtga ekspozitsiya + grading (avto-ekspozitsiya o'rniga), blokda fizik atmosfera, kompleksda klassik osmon. Yorug'lik jonli (bake qilinmaydi), faqat AO pishiriladi. Qolgani: kompleksda ham atmosfera (yuqoridagi muammo)
- 2-bosqichdan keyin QILINDI: egasining .glb daraxtlari hamma joyda va ko'paytirilgan (~5600); o'ng panel to'q shisha uslubida; blok tungi yoritilishi egasining render'i bo'yicha (pilastrlarda vertikal LED chiziqlar, fasad yuvilishi, arka nuri, trotuarda bollardlar, pastdan yoritilgan daraxtlar); kompleksda Ultra'da 591 ta ko'cha/hovli chirog'i haqiqiy nur (ClusteredLighting, `lamps.ts` `LAMP_LIGHTS`); kompleksdagi 20 blokning hammasi 1-blok modeli bilan (`T4_LOOK`, `t4Fit` — maydonga moslab), ma'lumotlar `TYPE4` bo'yicha qoladi
- 3-bosqich QILINDI: Blender modeli (bevel, AO, meshopt) kompleksda yoqilgan. Qolgani: blok sahifasida ham ishlatish, SSR (mayda artefaktlar)
- 4-bosqich — atrof shahar: (a) Google Photorealistic 3D Tiles (`3d-tiles-renderer`) — avval hudud Google Earth'da 3D'mi tekshirish, API kalit kerak; (b) Toshkentga xos uy turlari .glb, tomlar, devor/darvozalar, bo'sh yerga maysa, ko'cha jihozlari (bekat, svetofor, belgilar), asfalt/plitka teksturalari
- 5-bosqich (ixtiyoriy) — ob-havo/fasl, ufqda tog'lar

Ochiq savollar / qoldiqlar:
- Kompleksda fizik atmosfera ishlamaydi (atmosfera quyoshi kadrni qoraytiradi, havo pardasi 300 m dan jigarrang) — klassik osmon ishlatiladi
- Fasad rangi: egasining render'larida krem, bizda pastki qavatlar yalpiz-yashil — egasi qaror qilishi kerak
- 13 ta TYPE4 bo'lmagan blok sahifasi (`#blok-3` …) hali oddiy quti — to'liq 1-blok kabi qilish so'ralgan emas, taklif qilingan
- Kompleksdagi bloklarda tungi LED chiziqlar yo'q (faqat blok sahifasida) — taklif qilingan
- Tezlik: kompleks har kadrni to'xtovsiz chizadi (GPU 100%) — "kerak bo'lganda chizish" va FPS/GPU paneli taklif qilingan; 5090 da hali sinalmagan
- 1-qavat: do'kon ichi ko'rinmaydi, ayvon render'dagidan sodda
- Git: faqat boshlang'ich commit bor; repo ommaviy (PUBLIC), push uchun ruxsat kutilmoqda
- Harakat (mashinalar, odamlar) — egasi kerak emas dedi

## Eslatmalar
- Egasi qisqa, aniq natija xohlaydi; o'zgarishdan oldin/keyin bir xil rakursdan surat ko'rishni yoqtiradi.
- Demo ma'lumotlar: narx, qurilish jadvali, tariflar, do'kon nomlari.
