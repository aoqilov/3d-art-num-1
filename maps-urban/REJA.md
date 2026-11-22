# Atrof (shahar) va renderlar — ish rejasi

Manba: `maps-urban/` — urban-export (FBX, DXF, sun'iy yo'ldosh JPG) + Yandex panorama skrinshotlari (27 ta).
Joylashuv aniqlangan: majmua markazi DXF'da (−492, −313) m, 15° burilish (`align.json`), 1258/1356 bino mos, xato ~2 m.
Asosiy manba — **DXF** (har bir bino alohida: 8857 ta; yo'llar, yashil zona, suv, relyef, 1068 daraxt).

**Ish qoidasi:** har bosqich oxirida bir xil kameralardan "oldin/keyin" renderlari + FPS o'lchovi → egasi tasdiqlaydi →
keyingi bosqich. Tasdiqlanmasa, o'sha bosqich qayta ishlanadi (avvalgi atrof qabul qilinmagani uchun).
**Tezlik chegarasi (RTX 4060 laptop, muharrir):** yerdan ≥ 30 FPS, tepadan ≥ 20 FPS. Oshsa — LOD/soddalashtirish.

---

## 0. Tayyorgarlik — ma'lumotni tozalash
- DXF → toza JSON: binolar (kontur, balandlik, turi), yo'l maydonlari, markaz chiziqlari (katta/kichik), yo'laklar,
  yashil zona, suv, daraxtlar, relyef to'ri — hammasi Unreal koordinatasida (`align.json` + `kompleks_coords`).
- Majmua hududi (+ chegara) ichidagi narsalar olib tashlanadi; urban-export va majmua chegarasi tutashtiriladi.
- **Natija:** yuqoridan reja-rasm (majmua + atrof ustma-ust), sonlar jadvali.

## 1. Relyef va yer
- DXF relyefidan Unreal Landscape balandlik xaritasi (37 m farq).
- Majmua va 150 m atrofi tekis (z = 0), 150–300 m oralig'ida haqiqiy relyefga silliq o'tish.
- Yer materiali: maysa / tuproq / chang aralashmasi (Megascans), uzoqda sun'iy yo'ldosh rangi bilan tuslanadi.
- **Render:** tepadan 3 rakurs (kunduz).

## 2. Yo'llar va trotuarlar
- DXF yo'l maydonlari relyef ustiga, asfalt (Megascans), bordyur, trotuar plitkasi.
- Markaz chiziqlaridan yo'l belgilari: katta yo'lda uzuk chiziq, chorrahalarda piyoda o'tish joylari.
- Yo'laklar (PATHS), ko'priklar, soyabonlar.
- **Render:** Darvoza va Zakovat ko'chalaridan yer darajasidagi kadrlar, Yandex skrinshotlari bilan yonma-yon.

## 3. Binolar (umumiy uslub)
Turiga qarab 3 uslub, hammasi Nanite, deraza bilan:
- **Mahalla uylari (1–2 qavat):** suvoq yoki g'isht devor, qiya tunuka tom (Toshkent ranglari), darvoza devori.
- **Ko'p qavatli turar joy:** panel yoki g'isht fasad, deraza va balkon to'ri, tekis tom.
- **Savdo / jamoat:** 1-qavatda vitrina, yuqorida oddiy fasad.
- Tunda derazalar tasodifiy yonadi (majmuadagi kabi).
- **Render:** tepadan va ko'chadan, kunduz va ko'k soat.

## 4. Yashillik
- 1068 ta daraxt haqiqiy joyida (balandligi Meta xaritasidan) + ko'cha qatorlari.
- Turlari: chinor, terak, mevali daraxtlar, archa. Yaqinda (≤ 400 m) 3D model, uzoqda yengil.
- Yashil zonalar — maysa, butalar.
- **Egasidan kerak:** Fab'dan yengil daraxt modellari (ro'yxat alohida beriladi).
- **Render:** ko'cha va hovli kadrlari.

## 5. Ko'cha jihozlari
- Katta yo'llar bo'ylab fonarlar (majmuadagi ingichka model), avtobus bekatlari, svetoforlar, yo'l belgilari,
  mahalla darvozalari va devorlari, ariq va panjaralar — Yandex skrinshotlari bo'yicha.
- **Render:** ko'cha kadrlari, kunduz va tun.

## 6. Batafsil binolar (diqqatga sazovor)
- Skrinshotlardagi muhim binolar bittadan batafsil modelga almashtiriladi: Ahmad Olmos to'yxonasi, Korzinka,
  Art House, Darvoza ko'chasi bo'yidagi do'konlar va yangi baland binolar.
- Har biri DXF'dagi o'z konturiga qo'yiladi.
- **Egasidan kerak:** qaysilari birinchi navbatda (ustuvorlik ro'yxati).

## 7. Yoritish va tun
- Shahar tungi yoritilishi: derazalar, fonarlar, do'kon vitrinalari, havo pardasi va tuman.
- Majmua tungi uslubi bilan uyg'unlashtirish (mo'ljal: `foto-reference/Screenshot_2.png`).
- Tezlikni yakuniy tekshirish.

## 8. Renderlar
- **Doimiy kameralar to'plami** (har bosqichda shulardan foydalaniladi):
  - tepadan 4 ta — mo'ljal render rakurslariga mos;
  - ko'chadan 4 ta — Yandex skrinshotlaridagi joylardan;
  - majmua ichidan 2 ta (hovli, kirish).
- **Vaqtlar:** kunduz (13:00), oltin soat, ko'k soat (20:30), tun.
- **Yakuniy sifat:** Movie Render Queue, 4K, yuqori Lumen sifati; xohlansa tepadan aylanma video (fly-through).
- **Natija:** `tools/unreal/out/renders/` papkasida, har bosqich uchun alohida.

---

## Mualliflik (ilovada ko'rsatiladi)
OpenStreetMap (ODbL), Overture Maps, Copernicus / Sentinel-2 (EOX, CC BY 4.0), Meta / WRI Global Canopy Height
(CC BY 4.0), Copernicus GLO-30. Daraxt va boshqa modellar — o'z litsenziyalari bo'yicha.

## Holat
- [x] Fayllar o'rganildi, joylashuv topildi (`align.json`)
- [x] 0. Tayyorgarlik — `tools/unreal/urban_prep.py` → `out/urban.json`; reja-rasm `out/renders/0_reja.png`
- [x] 1. Relyef va yer — majmua 150 m tekis, 300 m gacha silliq o'tish; `M_UR_GroundWP` (dunyo-koordinata UV)
- [x] 2. Yo'llar — DXF yo'l/yo'lak maydonlari relyef ustida, asosiy yo'llarda uzuk chiziq
- [x] 3. Binolar — 8808 ta: 7832 mahalla uyi (qiya tom), 976 baland (tekis tom); deraza to'ri, tunda yonadi
- [x] 4. Yashillik — 1061 daraxt (mavjud chinor, ×1.4 baland, 9–22 m)
- [x] 5. Ko'cha jihozlari — katta yo'llarda 1045 ingichka fonar (700 m ichidagi 247 tasi nur sochadi)
- [x] 6. Asosiy yo'l — 25 bino, 26 ta do'kon fasadi (vitrina, yozuv lavhasi, soyabon)
- [x] 7. Yoritish va tun — majmua tungi tizimiga ulangan (derazalar, fonarlar, do'konlar)
- [x] 8. Renderlar — `out/renders/8_yakuniy/` (10 kamera × 13:00 / 19:30 / 20:30, 1920×1080)

Skriptlar ketma-ketligi: `urban_prep.py` → `urban_mesh.py` → `build_urban.py` (Blender) → `ue_scripts/urban_setup.py`
→ `urban_ground_mat.py`; `urban_props.py` → `ue_scripts/urban_life_setup.py`; `urban_main.py` →
`URBAN_SET=urban_main_mesh build_urban.py` → `ue_scripts/main_street_setup.py`. Render: `ue_graphs/render_set.mjs <papka>`.
