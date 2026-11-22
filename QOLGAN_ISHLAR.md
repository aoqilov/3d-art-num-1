# Qilinmagan ishlar va ularni bajarish rejasi

Holat: 2026-11-22. Unreal loyihasi `D:\Projects\as`, skriptlar `tools/unreal/`.
Belgilar: **[S]** — egasidan nimadir kerak (qaror, model, rasm), **⏱** — taxminiy vaqt (mening ishim).

Ish qoidasi o'zgarmaydi: har bandda oldin/keyin render (`ue_graphs/render_set.mjs`) va FPS o'lchovi, egasi tasdiqlaydi.

---

## A. Darhol — xavfsizlik va tartib (1-navbat)

| # | Ish | Qanday | ⏱ |
|---|---|---|---|
| A1 ✅ | **Git commit** — 3 kunlik ish commit qilinmagan (Unreal skriptlari, `maps-urban/`, web o'zgarishlari) | Mavzular bo'yicha bir nechta commit. `maps-urban/` dagi 28 MB DXF va skrinshotlar `.gitignore` ga (repo ommaviy). **[S]** push ruxsati — repo PUBLIC | 20 daq |
| A2 ✅ | Buzilgan `M_UR_GroundFlat` materialini o'chirish | Unreal yopiq paytda `D:\Projects\as\Content\Kompleks\Urban\Mat\M_UR_GroundFlat.uasset` ni o'chirish, keyin "Fix Up Redirectors". **[S]** ruxsat | 5 daq |
| A3 ✅ | Eski keraksiz assetlar: `/Game/Kompleks/Context` (rad etilgan webdagi atrof), yashirilgan eski Landscape | Ishlatilmayotganini Reference Viewer bilan tekshirib o'chirish. Landscape — o'chirish yoki qoldirish **[S]** | 15 daq |
| A4 ✅ | Tekshirilmay qolgan eski o'zgarishlar: Esc kursor, 2-blokka chiqish, shisha aksi (`DefaultEngine.ini`, Unreal qayta ochilgach) | O'yin ichida avtomatik sinov (`esc_t.mjs`) + render | 20 daq |

## B. Atrof shahar — sifat (asosiy ish)

| # | Ish | Qanday | ⏱ |
|---|---|---|---|
| B1 | **Asosiy yo'ldagi muhim binolar** batafsil: Ahmad Olmos to'yxonasi, Korzinka, Art House, Darvoza ko'chasidagi do'konlar, yangi baland binolar | Yandex skrinshotlaridan har binoning shakli → DXF'dagi o'z konturiga Blender'da model (fasad bo'laklari, vitrina, yozuv, tom). Har bino alohida `.glb`, `main_street_setup.py` ga qo'shiladi. **[S]** ustuvorlik ro'yxati va kerak bo'lsa qo'shimcha suratlar (har bino 2–3 rakursdan) | har bino 1–2 soat |
| B2 ✅ | **Mahalla uylari realroq**: hozir quti + tom | (1) Fasad materiallari: mavjud Megascans `Plaster_Facade`, `Beige_Brick`, `Yellow_Brick` — uyga tasodifiy; (2) deraza o'rniga ramkali deraza teksturasi; (3) tom chetiga ozgina chiqish (karniz) | 2–3 soat |
| B3 ✅ | **Mahalla devorlari va darvozalari** (Toshkent mahallasining eng ko'zga tashlanadigan qismi) | Ko'cha cheti bo'ylab, uylar orasidagi bo'shliqqa 2.2 m g'isht/suvoq devor, har uchastkaga temir darvoza. Joyi: yo'l maydoni cheti − 0.5 m, uy devorlari bilan kesishmasdan. Model Blender'da, instancing | 3 soat |
| B4 | **Ko'p qavatli binolar** (976 ta): balandligi Overture'da noma'lum (9 m), balkonsiz | Sun'iy yo'ldosh soyasi yoki Yandex bo'yicha qavat sonini taxmin qilib bo'lmaydi → yaqin 300 m dagi ~30 ta binoni Yandex suratlaridan qo'lda tuzatish (JSON jadval: id → qavat). Fasadga balkon to'ri teksturasi. **[S]** qaysilari ko'rinadi deb belgilash | 2 soat + jadval |
| B5 ✅ | **Bordyur va trotuar balandligi**: hozir yo'l va yo'lak relyefga yopishgan, bordyur yo'q | Yo'l maydoni chetiga 15 sm bordyur tasmasi (majmuadagi `skirt` usuli), trotuarni 15 sm ko'tarish | 1.5 soat |
| B6 ✅ | **Ko'cha jihozlari**: avtobus bekatlari, svetoforlar, yo'l belgilari, piyoda o'tish chiziqlari | Chorrahalar DXF markaz chiziqlari kesishmasidan; bekatlar — Yandex'dagi joylar. Modellar Blender'da (sodda) yoki Fab **[S]** | 3 soat |
| B7 ✅ | **Daraxtlar ko'proq**: Meta xaritasidan atigi 1061 ta, haqiqatda mahallalar yashil | Ko'cha bo'ylab har 8–10 m qator (yo'l cheti bo'sh joyda), hovlilarga tasodifiy mevali daraxt. Uzoqdagilar uchun yengil variant (tezlik). Yangi daraxt turlari **[S]** Fab'dan (ixtiyoriy) | 2 soat |
| B8 | Uzoqdagi yer: hamma joy bir xil yashil | Sun'iy yo'ldosh suratini (2048 px) uzoq yerga rang qatlami sifatida aralashtirish; yaqinda Megascans | 1 soat |
| B9 | Majmua chegarasi tutashuvlari: majmua ichki yo'llari ↔ shahar yo'llari, kirish joylari, parkovka rampalari | Har kirishni yerdan render qilib tekshirish, kerak joyda yo'l bo'lagini qo'shish | 1 soat |

## C. Majmua — qolgan nuqsonlar

| # | Ish | Qanday | ⏱ |
|---|---|---|---|
| C1 | Hovli daraxtlari siyrak ("Forest" chinor) | Fab'dan qalin tojli park daraxti (jo'ka, chinor) **[S]**, yoki `PVE_Preset` dan barg zichligi oshirilgan variant (sinab ko'rish kerak) | 1 soat |
| C2 ✅ | 1-blok tunda — barcha xonadonlar yonadi | Xonalar chiroqlariga tasodifiy yoqilish (60–70%), ichki yo'laklar doim yoniq | 1 soat |
| C3 ✅ | Shafaq chirog'ining soyalari keskin | Soyani yumshatish (`light_source_angle` ↑) yoki o'chirish, renderda solishtirish | 20 daq |
| C4 ➖ | Katta parkovka maydonlari o'rtasi tunda qorong'i | Maydon o'rtasiga 2–3 ta fonar | 30 daq |
| C5 ➖ | Asfaltdagi och to'rtburchak dog'lar (avval ko'rilgan) | Manbasini topish (ustma-ust yuza yoki yorug'lik), tuzatish | 30 daq |
| C6 ✅ | Ba'zi derazalar kunduz miltillaydi (Lumen aksi) | Unreal qayta ochilgach shisha aksi sozlamasi bilan qayta o'lchash; kerak bo'lsa yengil bloklar shishasini g'adir-budurroq | 30 daq |
| C7 | Fasad rangi: renderda krem, bizda pastki qavatlar yalpiz-yashil | **[S]** egasi qarori, keyin material rangi | 15 daq |

## D. Renderlar va taqdimot

| # | Ish | Qanday | ⏱ |
|---|---|---|---|
| D1 | Kameralarni Yandex skrinshotlari joyiga moslash + S4 (mahalla) kamerani almashtirish | `render_cams.json` ni yangilash | 30 daq |
| D2 | **Yakuniy yuqori sifatli renderlar** (4K) | Movie Render Queue: anti-aliasing 16+ namunalar, yuqori Lumen sifati; 10 kamera × 4 vaqt | 2 soat (asosan render vaqti) |
| D3 | **Tepadan aylanma video** (fly-through) | Sequencer'da kamera yo'li (majmua atrofida aylana + hovliga tushish), 30–60 s, 1080p/4K | 2 soat |
| D4 | Mualliflik yozuvlari (OSM, Overture, Copernicus, Meta, daraxt modellari) | Ilova va video oxiriga | 15 daq |

## E. Tezlik va tarqatish

| # | Ish | Qanday | ⏱ |
|---|---|---|---|
| E1 | Tayyor o'yin (packaged build) sinovi RTX 4060 da | Build → kamera nuqtalarida FPS; muharrirdan farqi | 1 soat |
| E2 | RTX 5090 da sinov **[S]** (kompyuter kerak) | Xuddi shu o'lchov to'plami | — |
| E3 | Shahar uchun soddalashtirish (agar E1 da past chiqsa) | Uzoq binolar/daraxtlarni World Partition HLOD yoki masofa bo'yicha yashirish | 1–2 soat |

## F. Web ilova (Unreal'dan tashqari, avvalgi ochiq savollar)

- Kompleks ko'rinishida fizik atmosfera ishlamaydi (kadr qorayadi) — sababi topilmagan.
- 13 ta TYPE4 bo'lmagan blok sahifasi oddiy quti.
- Kompleksdagi bloklarda tungi LED chiziqlar yo'q.
- "Kerak bo'lganda chizish" (doimiy 100% GPU o'rniga).
- 1-qavat: do'kon ichi ko'rinmaydi, ayvon sodda.

Bular Unreal versiyasi ustuvor bo'lgani uchun to'xtatilgan. **[S]** web versiya davom etadimi — qaror.

---

## Bajarilganlar (2026-11-22)
- A1: 2 commit, `unreal/fab-plants` GitHub'da; `maps-urban/` (DXF, Yandex) va `foto-reference/` repoga kirmaydi
- A2: `M_UR_GroundFlat` zaxiraga ko'chirildi, Unreal qayta ochildi, sahna butun
- A3: webdagi atrof meshlari o'chirildi (materiallari shaharda ishlatiladi — qoldi); eski Landscape yashirin holda qoldi
- A4: 2-blokka chiqish ishlaydi; kursor mantig'i blueprint'da bor (avtomatik tugma sinovi o'tmadi — Windows tashqi
  tugmani o'yin oynasiga bermaydi); **muharrirda Esc o'yinni to'xtatadi** (Unreal standarti) — u yerda Tab ishlatiladi;
  shisha aksi qayta ochilgandan keyin yoqildi
- B5: `urban_curbs.py` — 58 ming bo'lak, 15 sm bordyur barcha yo'l chetlarida
- B3: `urban_walls.py` — mahalla ko'chalarida ~100 km devor, 5342 darvoza
- B2: `urban_wall_mat.py` — uy va devorlarga Megascans suvoq / g'isht (qizg'ish ranglar g'isht), dunyo bo'yicha tekstura
- B6: `urban_street.py` + `build_street_props.py` — 365 zebra, 101 svetofor (katta chorrahalar), 19 bekat, 868 mahalla fonari (350 m ichida 128 tasi nur sochadi)
- C2: `complex_fixes_c.py` — 1-blokda tunda ~35 % xonadon qorong'i (181 chiroq), 1, 2, 5-qavatlar va umumiy joylar yoniq
- C3: shafaq yorug'ligi soyasi yumshatildi (manba burchagi 12° → 35°)
- C4: kerak emas — majmua asfalti halqasimon tor yo'laklar, bollardlar har ~7 m da (rejani noto'g'ri baholagan edim)
- C5: dog'lar rad etilgan webdagi atrof suratida ko'rilgan edi; u o'chirilgan, yangi renderlarda yo'q
- C6: deraza miltillashi o'lchandi: kirishda 1112 → 153 piksel, hovlida 1 — yetarli
- B7: `urban_trees2.py` — mahalla ko'chalarida devor bo'ylab 2495 daraxt (majmuadan 500 m ichida)

## Tavsiya etilgan tartib
1. **A1–A4** (tartib va xavfsizlik) — 1 soat
2. **B1** asosiy yo'l binolari + **B5** bordyur + **B3** mahalla devorlari — eng katta ko'rinish farqi
3. **B2, B7, B6** — mahalla jonliroq
4. **C1–C7** — majmua nuqsonlari
5. **D1–D4** — yakuniy renderlar va video
6. **E1, E3** — tezlik

## Egasidan kerak bo'ladiganlar (jamlangan)
- Git push ruxsati (repo ommaviy) — A1
- Buzilgan material va eski Landscape bo'yicha ruxsat — A2, A3
- Asosiy yo'ldagi binolar ustuvorligi va qo'shimcha suratlar — B1
- Ko'rinadigan ko'p qavatli binolar ro'yxati — B4
- Fab modellari (ixtiyoriy): bekat, svetofor, park daraxtlari — B6, B7, C1
- Fasad rangi qarori — C7
- RTX 5090 kompyuterda sinov — E2
- Web versiya davom etadimi — F
