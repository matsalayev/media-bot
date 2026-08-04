# «Kino» Platformasi — Tijorat Taklifi va Texnik Topshiriq

> **Hujjat turi:** Ishlab chiqish xizmatlari bo'yicha tijorat taklifi va texnik topshiriq (klient uchun)
> **Loyiha:** «Kino» — kino/serial striming platformasi + kinoga bog'langan Reels tizimi
> **Narx:** Belgilangan (fixed-price) — **USD $50 000**
> **Muddat:** ~3–4 oy (16 hafta)
> **Sana:** 2026-07-24 · **Taklif amal muddati:** sanadan 30 kun

---

## 1. Loyiha haqida

Biz «Kino» platformasini **to'liq ishlab chiqib**, ishga tushirishga tayyor holda topshiramiz: barqaror backend, o'z media-pipeline'i (HLS striming), foydalanuvchi veb-ilovasi, admin panel, iOS va Android mobil ilovalari, hamda Telegram bot. Ishlab chiqish **belgilangan narx — $50 000** (~635 mln so'm) asosida, ~3–4 oyda amalga oshiriladi.

Narximiz **faqat ishlab chiqish xizmatlarini** o'z ichiga oladi. Kontent, server/hosting, to'lov-gateway va SMS akkauntlari, do'kon (App Store/Google Play) akkauntlari, huquqiy ro'yxatlar va ishga tushirilgandan keyingi doimiy operatsion xarajatlar — bular klientning biznes-aktivlari bo'lib, uning nomida ochiladi va to'g'ridan-to'g'ri klient tomonidan qoplanadi (7-bo'limga qarang).

**Texnologiyalar (tasdiqlangan):** Backend — NestJS/TypeScript (modulli monolit); Veb va Admin — Next.js; Mobil — Flutter (iOS+Android, yagona kod); Telegram bot — grammY; Media — FFmpeg + Shaka Packager (HLS); Ma'lumot — PostgreSQL, Redis, Meilisearch, MinIO; Analitika — PostHog; To'lov — Payme/Click; Auth — telefon OTP + Telegram. Interfeys ikki tilda (o'zbek/rus).

---

## 2. Ish ko'lami (Scope of Work)

Har bir yo'nalish bo'yicha aniq deliverable'lar va qabul mezoni (acceptance criteria) belgilangan.

### 2.1. Arxitektura va UI/UX dizayn
- Tizim arxitekturasi hujjati (modul xaritasi, data-flow, deploy topologiyasi)
- Ma'lumotlar modeli (PostgreSQL) + Redis/Meilisearch/MinIO foydalanish dizayni
- Media va xavfsizlik dizayni: HLS yetkazish, qisqa-TTL imzolangan-token pleybek avtorizatsiyasi, adaptiv bitreyt, kirish-nazorat qoidalari
- API shartnomasi (OpenAPI/REST) — barcha klient va admin endpointlar
- To'liq UI/UX dizayn (Figma): veb, admin, mobil, bot oqimlari; komponent kutubxonasi; o'zbek/rus maketlar
- **Qabul mezoni:** klient arxitektura, ma'lumot modeli, API shartnomasi va Figma dizayn to'plamini tasdiqlaydi — bu implementatsiya uchun kelishilgan asos (baseline) bo'ladi.

### 2.2. Backend (NestJS / modulli monolit)
- Autentifikatsiya: telefon OTP (klient Eskiz akkaunti orqali) + Telegram login/bog'lash; token berish, yangilash, bekor qilish
- Katalog: kino/serial/mavsum/epizod CRUD va so'rov API'lari; metadata, janr, o'zbek/rus maydonlar
- Reels: har Reels aynan bitta kinoga bog'langan; vertikal-feed API, tartiblash, kinoga qaytish havolasi
- Obuna va entitlement: tariflar, obuna holati, pleybek va premiumni himoyalovchi markaziy kirish-nazorat
- Watch-progress: ko'rilgan joyni saqlash, davom ettirish
- Qidiruv: Meilisearch indeks va so'rov API'lari (o'zbek/rus, xatoga chidamli)
- Ko'ndalang: rolga asoslangan avtorizatsiya, validatsiya, xato boshqaruvi, sezgir endpointlarga rate-limit, Redis kesh, PostHog event yig'ish
- **Qabul mezoni:** barcha modullar integratsion testlardan o'tadi; staging'da foydalanuvchi login qilib, browse/qidiruv, huquqli kontentni ko'rish va watch-progress'ni davom ettira oladi; entitlement obunasizlarni to'g'ri to'sadi.

### 2.3. Media pipeline (FFmpeg + Shaka Packager → HLS)
- Ingest→pleybek: manba MinIO'ga yuklash, FFmpeg adaptiv-bitreyt transcode, Shaka Packager HLS chiqishi
- O'zbek/rus subtitr qayta ishlash va paketlash
- Qisqa-TTL imzolangan-token avtorizatsiya: token faqat huquqli foydalanuvchiga beriladi va yetkazishda tekshiriladi (ruxsatsiz/ulashilgan havolani to'sadi)
- Transcode ishlarini orkestratsiya va holat kuzatuvi (retry + xato ko'rinishi admin panelda)
- Turli bandwidth sharoitida adaptiv pleybek tekshirilgan
- **Qabul mezoni:** yuklangan manba o'zbek/rus subtitrli, ko'p-bitreytli HLS oqimini beradi; pleybek faqat yaroqli token bilan ishlaydi, muddati o'tgan/buzilgan token yoki huquqsizlik holatida rad etiladi.

### 2.4. Foydalanuvchi veb-ilovasi (Next.js)
- Bosh sahifa/browse: qatorlar, janrlar, kino/serial detali
- Meilisearch qidiruvi (o'zbek/rus)
- Adaptiv HLS pleyer: sifat tanlash, subtitr, watch-progress'dan davom ettirish
- Vertikal Reels feed: har Reels o'z kinosining detali/obuna oqimiga olib boradi
- Obuna va paywall: tarif tanlash va Payme/Click orqali to'lov; to'lovdan so'ng entitlement darhol aks etadi
- Profil: autentifikatsiya, Telegram bog'lash, obuna holati, davom ettirish
- Ikki tilli (o'zbek/rus) va moslashuvchan (responsive) interfeys
- **Qabul mezoni:** staging'da foydalanuvchi ro'yxatdan o'tib, browse/qidiruv, Payme/Click orqali obuna, huquqli kontent va Reels'ni ko'rish, obuna va davom-ettirish holatini seanslararo to'g'ri ko'ra oladi.

### 2.5. Admin veb panel (Next.js)
- Kontent boshqaruvi: kino/serial/mavsum/epizod yaratish, tahrirlash, nashr/nashrdan olish; ikki tilli metadata va poster
- Media yuklash va pipeline nazorati: manba yuborish, transcode ishlarini ishga tushirish/kuzatish, holat va xatolarni ko'rish
- Reels boshqaruvi: yaratish, kinoga bog'lash, feed tartibi, nashr/nashrdan olish
- Tarif konfiguratsiyasi va foydalanuvchi obunalarini ko'rish/boshqarish
- Foydalanuvchi boshqaruvi: qidiruv, ko'rish, rol/holat
- **Asosiy analitika dashboardlari** (PostHog): faol foydalanuvchi, ko'rishlar, Reels engagement, obuna konversiyasi
- Rolga asoslangan admin kirish
- **Qabul mezoni:** administrator to'liq kontent hayot-siklini (yuklash → transcode → nashr → foydalanuvchi ilovasida paydo bo'lish) bajaradi, Reels va obunalarni boshqaradi, to'ldirilgan dashboardlarni ko'radi.

### 2.6. Mobil ilovalar (Flutter — iOS + Android)
- Yagona Flutter kod bazasidan native iOS va Android build
- Browse, janr, qidiruv, detal ekranlari
- Adaptiv HLS pleyer (subtitr + davom ettirish)
- Vertikal Reels feed (veb bilan bir xil kino-havola)
- Obuna/paywall (klient Payme/Click akkauntlari bilan)
- Autentifikatsiya (telefon OTP + Telegram) va profil/obuna ekranlari
- Ikki tilli interfeys; klient Apple/Google akkauntlariga yuborishga tayyor imzolangan build'lar
- **Qabul mezoni:** imzolangan iOS va Android build'lar real qurilmalarda to'liq oqimlar bilan ishlaydi va klient akkauntlari ostida do'konga yuborishga tayyor topshiriladi.

### 2.7. Telegram bot (grammY)
- Telegram va Kino akkauntini bog'lash
- Bot ichida katalog/Reels-havolali sarlavhalarni ko'rish
- Obuna deep-link'lari (Payme/Click checkout'ga yo'naltirish)
- Xabarnomalar (yangi kontent, obuna eslatmasi)
- Ikki tilli bot xabarlari
- **Qabul mezoni:** foydalanuvchi akkauntni bog'laydi, botdan browse qiladi, obuna deep-link orqali checkout'ga o'tadi va xabarnoma oladi.

### 2.8. Integratsiya, deploy, QA va topshirish
- **Integratsiya:** Payme/Click to'lov, Eskiz SMS va PostHog — klientning o'z akkauntlariga ulanadi (kalitlar klientda qoladi, xavfsiz konfiguratsiya orqali)
- **Deploy:** barcha servislarni klient infratuzilmasiga o'rnatish; konfiguratsiya, secrets, reverse-proxy/TLS, staging va production muhitlari; takrorlanadigan deploy runbook
- **QA va hujjatlar:** kritik modullar va pleybek/entitlement testlari; asosiy oqimlarning uchdan-uchgacha (end-to-end) tekshiruvi; hujjatlar to'plami (arxitektura, API, deploy runbook, admin qo'llanma)
- **Topshirish va kafolat:** to'liq manba-kodni klient repozitoriysiga topshirish; bilim-almashuv sessiyalari; ishga tushirilgandan keyingi kafolat davri
- **Qabul mezoni:** platforma klient infratuzilmasida production'da ishlaydi; kelishilgan kritik/major nuqsonlar bartaraf etilgan; hujjatlar to'plami topshirilgan; kod va kirishlar klientga o'tkazilgan.

---

## 3. Ko'lam chegaralari (kelgusi bosqichlar)

Quyidagilar ushbu bosqichga **kirmaydi** va keyingi bosqichlarda kelishiladi: DRM/kontent shifrlash va litsenziya-serverlari; offline yuklab olish; ko'p-profil (bitta obunada bir necha profil); catch-up/jonli-TV/EPG; kengaytirilgan CMS (tahririy workflow, jadval, murakkab merchandising, A/B kuratsiya); ML-asosidagi shaxsiylashtirilgan tavsiya dvigateli; dublyaj/subtitr ishlab chiqarish vositalari.

Ushbu bosqich «Kino»ning to'liq ishlaydigan **birinchi versiyasini (V1)** — yuqoridagi deliverable'lar, qabul mezonlari va kelishilgan arxitektura/Figma asosida — yetkazadi.

---

## 4. Narx va ish-paketlari

Belgilangan narx **$50 000** yetti aniq ish-paketiga taqsimlangan (yig'indisi aynan $50 000):

| Ish-paketi | Narx (USD) |
|-----------|-----------|
| Discovery + Arxitektura + UI/UX dizayn | $5 000 |
| Backend + Media pipeline | $15 000 |
| Foydalanuvchi veb-ilovasi (Next.js) | $8 000 |
| Admin panel (Next.js) | $6 000 |
| Mobil ilovalar (Flutter, iOS + Android) | $10 000 |
| Telegram bot (grammY) | $3 000 |
| Integratsiya + Deploy + QA + PM + Topshirish | $3 000 |
| **JAMI** | **$50 000** |

---

## 5. To'lov jadvali

To'lovlar **qabulga asoslangan** (acceptance-based) — har bosqich tasdiqlangach tegishli transh to'lanadi. Yakuniy 10% kafolat davri yakunigacha ushlanadi.

| # | Bosqich | To'lov | Trigger |
|---|---------|--------|---------|
| 1 | Shartnoma + Discovery, arxitektura, dizayn | **20%** | Arxitektura va dizayn tasdig'i |
| 2 | Backend + Media pipeline | **25%** | Staging'da qabul |
| 3 | Foydalanuvchi veb + Admin panel | **20%** | Staging'da qabul |
| 4 | Mobil ilovalar + Telegram bot | **15%** | Test-build qabul |
| 5 | Integratsiya, QA, deploy, launch, topshirish | **10%** | Production launch + UAT |
| 6 | Kafolat yakuni | **10%** | Kafolat davri oxiri |
| | **JAMI** | **100%** | |

---

## 6. Muddat va bosqichlar (~16 hafta)

Bosqichlar ataylab **parallel** olib boriladi (masalan, veb ishi backend mustahkamlanayotganda boshlanadi) — bu real muhandislik unumdorligini aks ettiradi, har deliverable esa o'z qabul darvozasidan o'tadi.

| Faza | Hafta | Asosiy deliverable'lar |
|------|-------|------------------------|
| **1. Discovery, arxitektura, dizayn** | 1–3 | Ko'lam, arxitektura hujjati, ma'lumot modeli, API shartnoma, to'liq UI/UX (o'zbek/rus), loyiha rejasi + klient-input checklist |
| **2. Backend + Media pipeline** | 3–8 | Auth, katalog, Reels, obuna/entitlement, watch-progress; FFmpeg+Shaka HLS + token; staging'ga deploy |
| **3. User veb + Admin panel** | 7–11 | Veb (browse, pleyer, Reels, obuna, profil); admin (kontent/Reels/foydalanuvchi/obuna, analitika) |
| **4. Mobil + Telegram bot** | 10–14 | Flutter iOS+Android (browse, pleyer, Reels, obuna, profil); grammY bot; test-track build'lar |
| **5. Integratsiya, QA, launch** | 13–16 | Payme/Click + Eskiz integratsiya; to'liq QA/UAT; production deploy; do'konga yuborish; launch; hujjat + topshirish; kafolat boshlanadi |

**App Store / Google Play ko'rik oynasi** — mustaqil tashqi jarayon (odatda ~1 kundan bir necha kungача); biz yuborishni amalga oshiramiz va ko'ruvchi izohlariga javob beramiz, ammo ko'rik muddati bizning nazoratimizdan tashqarida va 16 haftalik ishga kirmaydi.

---

## 7. Klient mas'uliyati va uchinchi-tomon xarajatlari

Quyidagilar klientning biznes-aktivlari bo'lib, uning yuridik shaxsi/nomida ochiladi va to'g'ridan-to'g'ri klient tomonidan qoplanadi. Biz ularni integratsiya qilamiz va ustiga deploy qilamiz, ammo akkauntlar va huquqlar klientda qoladi.

| Kategoriya | Klient ta'minlaydi/qoplaydi | Sababi |
|-----------|------------------------------|--------|
| **Kontent va huquqlar** | Kino/serial litsenziyasi; dublyaj/subtitr ishlab chiqarish; metadata va poster; Reels manba-lavhalari; doimiy yangilanish | Litsenziya va ijodiy aktivlar klient nomida bo'lishi shart |
| **Infratuzilma/hosting** | Server (UZ/TAS-IX yoki bulut); storage; bandwidth; domen/DNS; TLS; DB/Redis/Meilisearch resurslari | Doimiy operatsion xarajat, auditoriyaga qarab masshtablanadi |
| **To'lov gateway** | Payme/Click (ixtiyoriy Uzum) merchant akkauntlari; API kalitlari; tranzaksiya to'lovlari | Merchant akkaunt klient yuridik shaxsiga bog'lanadi |
| **SMS provayder** | Eskiz akkaunti; tasdiqlangan sender alias; SMS xarajatlari | Sender identifikatori va hisob klient biznesiga tegishli |
| **Do'kon akkauntlari** | Apple Developer ($99/yil); Google Play ($25); listing egaligi | Ilovalar rasmiy operator sifatida klient nomida nashr etiladi |
| **Huquqiy va ro'yxat** | Kompaniya ro'yxati; OFD/fiskalizatsiya; shaxsiy-ma'lumot ro'yxati; yuridik maslahat | Regulyativ majburiyatlar operator zimmasida |
| **Doimiy operatsiya** | Launch'dan keyingi barcha operatsion xarajat; qo'llab-quvvatlash; marketing/user acquisition | Platforma egasi/operatori sifatida klient biznesi |

---

## 8. Klient bizga o'z vaqtida taqdim etadigan narsalar

Belgilangan narx va muddat quyidagilar **o'z vaqtida** taqdim etilishiga bog'liq:
- **Brend aktivlari:** logo, ranglar, tipografiya — UI/UX dizayn tasdig'idan oldin
- **Payme/Click merchant kalitlari** (API, callback URL) — klient nomida, integratsiyaga tayyor
- **Eskiz SMS** akkaunt kalitlari, tasdiqlangan sender alias va OTP shablonlari
- **Apple Developer va Google Play** akkauntlari faol, jamoaga build/imzolash/yuborish uchun kirish berilgan
- **Kontent fayllari** (video masterlar, dublyaj/subtitr treklari) + metadata va poster — launch katalogi va boshlang'ich Reels uchun
- **Domen(lar)** + DNS boshqaruvi
- **Hosting/server/storage** — deploy uchun administrativ kirish bilan
- **Vakolatli yagona kontakt** — mahsulot qarorlarini qabul qiladigan
- **O'z vaqtida qaror va fikr** — har qabul darvozasida kelishilgan SLA doirasida (maqsad: 2–3 ish kunida)

---

## 9. Taxminlar va bog'liqliklar

Belgilangan **$50 000** narx va ~16 haftalik muddat quyidagilarga asoslanadi:
1. Tasdiqlangan texnologik stack ish jarayonida o'zgartirilmaydi;
2. Klient akkauntlari, kalitlari, infra kirishi, brend aktivlari va launch kontenti input-checklist bo'yicha tegishli bosqichdan oldin yetkaziladi;
3. Klient fikr/tasdiqlari kelishilgan SLA (2–3 ish kuni) ichida beriladi;
4. Vakolatli yagona qaror qabul qiluvchi mavjud;
5. Kontent qo'llab-quvvatlanadigan manba-formatlarda topshiriladi;
6. **Masshtab chegarasi:** V1 klient ta'minlagan infratuzilmada belgilangan boshlang'ich concurrency/yuklama darajasi uchun muhandislashtiriladi; katta auditoriya uchun yuk-testi va gorizontal-masshtab/CDN arxitekturasi — keyingi bosqich ishi.

Ushbu taxminlardan jiddiy chetlanish o'zgarish-nazorati (change-control) orqali boshqariladi va narx/muddatga ta'sir qilishi mumkin.

---

## 10. Shartlar

- **Belgilangan narx:** $50 000 — yetti ish-paketi va tasdiqlangan stack doirasidagi ko'lam uchun. Faqat ishlab chiqish xizmatlarini qamraydi; 7-bo'limdagi klient-mas'uliyatidagi xarajatlar narxga kirmaydi.
- **O'zgarish-nazorati:** kelishilgan ko'lamdan tashqari funksiya rasmiy o'zgarish-so'rovi sifatida baholanadi, yozma taxminlanadi va tasdiqlangach alohida rejalashtiriladi/hisoblanadi.
- **Intellektual mulk va manba-kod:** yakuniy to'lov olingach, barcha maxsus ishlab chiqilgan komponentlarning to'liq huquqlari va manba-kodi klientga o'tadi (ochiq-kodli komponentlar o'z litsenziyalarida qoladi). Yakuniy to'lovgacha klient topshirilgan ishdan foydalanish uchun cheklangan litsenziyaga ega.
- **Maxfiylik:** ikkala tomon ham almashilgan biznes/texnik/foydalanuvchi ma'lumotini maxfiy saqlaydi; majburiyat loyiha yakunidan keyin ham davom etadi.
- **Qabul jarayoni:** har bosqich kelishilgan mezon bo'yicha ko'rib chiqiladi. Klient **5 ish kuni** ichida yozma qabul yoki aniq nuqson-ro'yxatini beradi; shu muddatda javob bo'lmasa, bosqich qabul qilingan hisoblanadi va to'lov muddati keladi. Faqat kelishilgan mezonga qarshi nuqsonlar rad asosidir; yangi talablar — o'zgarish-so'rovi.
- **Kafolat:** launch qabulidan so'ng 1–2 oy kafolat davri narxga kiritilgan; bu davrda topshirilgan funksiyadagi nuqsonlar bepul tuzatiladi. Kafolat yangi funksiya, uchinchi-tomon xizmat uzilishlari va kontent/operatsion masalalarni qamramaydi.
- **Qo'llab-quvvatlash (ixtiyoriy):** kafolatdan so'ng, klient xohishiga ko'ra oylik qo'llab-quvvatlash/rivojlantirish shartnomasi tuzilishi mumkin (alohida hisoblanadi).
- **Javobgarlik chegarasi:** yig'ma javobgarlik shartnoma bo'yicha to'langan umumiy summadan oshmaydi; bilvosita/natijaviy zararlar chiqarib tashlanadi. Kontent-huquq, to'lov-hisob-kitob va regulyativ javobgarlik operator sifatida klient zimmasida.
- **Uchinchi-tomon xizmatlari:** platforma Payme, Click, Eskiz, Telegram, Apple App Store, Google Play kabi xizmatlarга bog'lanadi. Ularning ishlashi, siyosati, API o'zgarishi, ko'rik natijasi va narxi bizning nazoratimizdan tashqarida va yetkazish majburiyati/kafolatga kirmaydi.
- **To'lov mexanikasi:** hisob-fakturalar USD'da, bosqich qabulidan so'ng **7–10 ish kuni** ichida to'lanadi; qabul qilingan faktura muddati o'tsa, keyingi bosqich ishi to'xtatilishi mumkin.
- **Taklif amal muddati:** ushbu taklif va $50 000 belgilangan narx sanadan **30 kun** amal qiladi; keyin narx/muddat qayta tasdiqlanishi mumkin.

---

## 11. Risklar va yumshatish

| Risk | Yumshatish |
|------|-----------|
| App Store/Play ko'rik kechikishi | Erta yuborish; ko'ruvchi izohlariga tez javob |
| Klient-input kechikishi | Muddatli input-checklist + o'zgarish-nazorati |
| Uchinchi-tomon API/siyosat o'zgarishi | Hujjatlangan interfeyslarga qurish; o'zgarishlar change-request orqali |
| Kontent/transcode format xilma-xilligi | Kelishilgan qo'llab-quvvatlanadigan manba-formatlar |
| Yuklama/masshtab kutilganidan yuqori | V1 belgilangan concurrency uchun; masshtab — keyingi bosqich |

---

## 12. Xulosa va keyingi qadam

«Kino» platformasi belgilangan narx **$50 000** evaziga, ~3–4 oyda, barcha yuzalar (backend, media, veb, admin, mobil, Telegram) bilan to'liq, ishga tushirishga tayyor va hujjatlangan holda topshiriladi — manba-kod va intellektual mulk klientga to'liq o'tkaziladi.

**Keyingi qadam:** ushbu taklifni tasdiqlash va shartnomani imzolash → 1-bosqich (Discovery va dizayn) boshlanadi.

---

*Ushbu hujjat ishlab chiqish xizmatlari bo'yicha tijorat taklifi bo'lib, imzolangan shartnoma bilan yakuniy huquqiy kuchga ega bo'ladi. Barcha raqamlar va shartlar 2026-yil holatiga ko'ra.*
