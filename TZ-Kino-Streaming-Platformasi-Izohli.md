# Texnik Zadacha (TZ) — «Kino» Streaming + Reels Platformasi

> **Hujjat turi:** Yuqori darajali texnik topshiriq (High-Level Design / TZ)
> **Versiya:** 1.1 — 7 ta kalit qaror ✅ TASDIQLANGAN (baseline v1.0 dan yangilangan)
> **Sana:** 2026-07-24
> **Bozor:** O'zbekiston (uz/ru, mobil-birinchi, Telegram-dominant, TAS-IX^[TAS-IX — O'zbekiston ichki internet-almashinuv nuqtasi; ichki (mamlakat ichidagi) trafik arzon yoki bepul.])
> **Metodologiya:** 11 ekspert-domen bo'yicha parallel loyihalash + bo'shliqlar tahlili (12 agent), raqobatchilar (SalomTV, iTV, TVCOM, Xonplay) tahlili asosida.

---

## 0. Hujjat haqida

Bu TZ **yuqori darajali dizayn** darajasida yozilgan: arxitektura, asosiy texnologik qarorlar (asoslash bilan), konseptual ma'lumotlar modeli, kalit oqimlar (flows), nofunksional talablar, xavfsizlik, infratuzilma va bosqichli reja. Endpoint/maydon darajasidagi batafsil spetsifikatsiya bu bosqichda **atayin kiritilmagan** — u keyingi detallashtirish bosqichida yoziladi.

Hujjat **8-bo'limda** (E'tibordan chetda qolgan kritik masalalar) siz alohida so'ramagan, lekin real ishga tushirish uchun hal qilinishi shart bo'lgan 15 ta muammoni ochib beradi — bu TZ'ning eng qimmatli qismi.

---

## 1. Mahsulot g'oyasi va maqsad

**Kino** — O'zbekiston bozori uchun obunaga asoslangan kino/serial **striming platformasi**, uning ajratuvchi xususiyati — har bir kinoga bog'langan **Reels^[Reels — kinoga bog'langan qisqa (1-3 daqiqalik) vertikal video-teaser; discovery uchun.]** (1–3 daqiqalik vertikal teaser) tizimi.

### 1.1. Asosiy mahsulot mantiqi
- **Admin** kinolarni/seriallarni va ularga tegishli qisqa **reels** teaserlarni joylaydi.
- Har bir reels **majburiy ravishda bitta kinoga bog'langan** (marketing/discovery vositasi, TikTok-uslub ijtimoiy tarmoq EMAS).
- **Foydalanuvchi** reels feed'ini vertikal ko'radi → teaser bosilganda → kino sahifasiga o'tadi → obuna orqali ko'radi.
- Freemium model: bir qism kontent bepul (reklama bilan), premium — obuna orqali reklamasiz + 4K.

### 1.2. Konversiya voronkasi (mahsulot yuragi)
```
Reels feed → qiziqarli teaser → "To'liq ko'rish" CTA → kino sahifasi
   → (premium bo'lsa) obuna taklifi → to'lov → tomosha
```
Shimoliy yulduz (north-star) metrikasi: **reel → kino → obuna** konversiyasi.

### 1.3. Yuzalar (surfaces) — hammasi majburiy
| # | Yuza | Texnologiya (tavsiya) | Vazifasi |
|---|------|----------------------|----------|
| 1 | **Foydalanuvchi veb** | Next.js^[Next.js — React asosidagi veb-ilova freymvorki; server-render va SEO qo'llab-quvvatlaydi.] (App Router^[App Router — Next.js ning zamonaviy marshrutlash va server-komponent (RSC) tizimi.]) | Browse, tomosha, reels, obuna, profil, SEO |
| 2 | **Admin veb** (alohida) | Next.js SPA + alohida auth | Kontent, foydalanuvchi, obuna, moderatsiya, analitika |
| 3 | **Mobil (Android+iOS)** | Flutter^[Flutter — bitta koddan iOS va Android ilovasini yasovchi Google freymvorki (Dart tili).] (yagona kod bazasi) | Tomosha, offline, reels, push |
| 4 | **Telegram bot + Mini App^[Mini App — Telegram bot ichida ishlaydigan veb-ilova (webview).]** | grammY^[grammY — TypeScript tilida Telegram bot qurish uchun kutubxona.] (TypeScript) | Auth, browse, xabarnoma, to'lov deep-link |

---

## 2. Aktorlar va rollar

| Aktor | Tavsif |
|-------|--------|
| **Mehmon (anonim)** | Ro'yxatsiz browse qiladi (SEO + reels virusliligi uchun ochiq), tomosha gate ostida |
| **Foydalanuvchi** | Telefon OTP^[OTP — One-Time Password — SMS yoki ilova orqali yuboriladigan bir martalik tasdiqlash kodi.] orqali ro'yxatdan o'tgan, obunali/bepul |
| **Super-admin** | To'liq tizim boshqaruvi |
| **Kontent-menejer** | Kino/serial/reels joylash, metadata, jadval |
| **Moderator** | Shikoyatlar, reels moderatsiyasi |
| **Support (yordam)** | Foydalanuvchi masalalari, refund, qo'lda entitlement |
| **Analitik** | Dashboard va hisobotlar |
| **Kontent-egasi/litsenziar** | (kelajakda) cheklangan hamkor kirishi |

---

## 3. Yuqori darajali arxitektura

### 3.1. Umumiy tamoyillar
1. **Modulli monolit** (mikroservis^[mikroservis — tizimni mustaqil ishlaydigan kichik servislarga bo'lish arxitekturasi.] EMAS) — kichik jamoa uchun eng tez va tranzaksion izchil. Modul chegaralari toza chizilgan, keyin "issiq" modullarni (reels feed, entitlement) alohida servisga ajratish mumkin.
2. **Yagona umumiy REST^[REST — HTTP orqali resurslarga murojaat qiluvchi keng tarqalgan API uslubi.] API** (OpenAPI^[OpenAPI — REST API ni standart tarzda hujjatlash formati; undan typed client'lar generatsiya qilinadi.] bilan hujjatlashtirilgan, `/api/v1` versiyalash) — barcha 4 yuza uchun. Admin — bir xil API'ning admin-scoped RBAC^[RBAC — Role-Based Access Control — foydalanuvchi roliga qarab kirish huquqlarini boshqarish.] qismi.
3. **Media plane ajratilgan** — ilova server video baytlarni HECH QACHON uzatmaydi; faqat metadata + entitlement + qisqa muddatli imzolangan token beradi. Video CDN^[CDN — Content Delivery Network — kontentni foydalanuvchiga yaqin serverlardan tez yetkazuvchi tarmoq.]'dan to'g'ridan-to'g'ri oqadi.
4. **Entitlement^[Entitlement — foydalanuvchi berilgan kontentni ko'ra oladimi yo'qmi degan huquqni aniqlovchi markaziy servis.] — yagona haqiqat manbasi** — "bu foydalanuvchi ko'ra oladimi?" logikasi bitta joyda.

### 3.2. Arxitektura diagrammasi

**3.2. Arxitektura qatlamlari (yuqoridan pastga)**

| Qatlam | Komponentlar |
|--------|--------------|
| **Yuzalar** | Foydalanuvchi Veb (Next.js) · Admin Veb (Next.js) · Mobil (Flutter, iOS/Android) · Telegram Bot + Mini App (grammY) |
| **Edge / Gateway** | API Gateway^[API Gateway — barcha so'rovlar o'tadigan yagona kirish nuqtasi — xavfsizlik, rate-limit, marshrutlash.] (Nginx/Traefik) + WAF^[WAF — Web Application Firewall — veb-hujumlardan himoya qiluvchi devor.] + Rate-limit |
| **Modulli Monolit** (NestJS^[NestJS — TypeScript tilida server (backend) ilova qurish uchun freymvork.] yoki Go) | Identity & Auth · Katalog · Reels · Entitlement/Access · Obuna & To'lov · Xabarnoma · Playback-Token · Async worker |
| **Media Plane** (ajratilgan) | Ingest + Transcode (FFmpeg^[FFmpeg — video va audioni qayta kodlash uchun ochiq kodli sanoat-standart dasturi.] + Shaka Packager^[Shaka Packager — videoni HLS/DASH segmentlariga paketlovchi Google ning ochiq kodli vositasi.]) → MinIO^[MinIO — o'z serveringda ishlaydigan, S3 ga mos obyekt-saqlash (fayl ombori) tizimi.] (S3^[S3 — Amazon ning obyekt-saqlash API standarti — fayllarni bulut uslubida saqlash.]) → TAS-IX Edge CDN (Nginx cache) |
| **Ma'lumot** | PostgreSQL^[PostgreSQL — ishonchli, tranzaksion relatsion ma'lumotlar bazasi.] (primary + replica) · Redis^[Redis — juda tez, xotira-asosidagi kesh, navbat va sessiya ombori.] (cache/session/queue) · Meilisearch^[Meilisearch — yengil, xatoga (typo) chidamli, tez qidiruv dvigateli.] · ClickHouse^[ClickHouse — katta hajmli analitika uchun juda tez ustunli (columnar) ma'lumotlar bazasi.] (analitika) |

*Oqim: Yuzalar → Gateway → Modulli Monolit → (PostgreSQL / Redis / Meilisearch; eventlar → ClickHouse). Video oqimi: Transcode → MinIO → TAS-IX CDN; mobil/veb pleyer HLS^[HLS — HTTP Live Streaming — Apple ishlab chiqqan protokol; videoni kichik bo'laklarga bo'lib uzatadi va tarmoq tezligiga qarab sifatni moslaydi.]'ni CDN'dan qisqa-TTL imzolangan token bilan to'g'ridan-to'g'ri oladi.*

### 3.3. Asosiy modullar (monolit ichida)
- **Identity & Auth** — telefon OTP, Telegram bog'lash, JWT^[JWT — JSON Web Token — foydalanuvchi seansini ifodalovchi imzolangan token.] + rotatsion refresh, admin RBAC
- **Katalog** — kinolar, seriallar/mavsum/epizod, janr, aktyor, lokalizatsiyalangan metadata
- **Reels** — kinoga bog'langan reels, vertikal feed reyting, like/share/view
- **Obuna & To'lov** — tariflar, obunalar, entitlement, promokod; Payme^[Payme — O'zbekistonning yirik onlayn to'lov tizimi.]/Click^[Click — O'zbekistonning yirik onlayn to'lov tizimi.]/Uzum^[Uzum — O'zbekistonning tez o'sayotgan to'lov/bank ilovasi.] adapterlari + webhook^[webhook — biror voqea yuz berganda avtomatik chaqiriladigan URL (masalan to'lov tasdig'i).]
- **Playback-Entitlement** — kirishni tekshiradi, qisqa TTL imzolangan token beradi, sessiyani yozadi
- **Watch-Progress & Library** — davom ettirish, watchlist, offline registr
- **Xabarnoma** — Telegram (asosiy), FCM/APNs push, email
- **Analitika ingestion** — view/reels eventlari → ClickHouse
- **Async worker** — encoding-callback, notif dispatch, obuna muddati/expiry ishlari

---

## 4. Texnologiyalar stack'i (tavsiya + asoslash)

| Qatlam | Tavsiya | Asos | Muqobil |
|--------|---------|------|---------|
| **Backend** | **NestJS (TypeScript)** birlamchi | Veb+admin (Next.js) + bot (grammY) bilan umumiy tiplar (OpenAPI→typed client), O'zbekistonda JS kadrlar ko'p, tez iteratsiya | **Go** — reels feed/token issiq yo'llari uchun (yuqori RPS); jamoa Go'ni bilsa yoki keyin hot-path'ni ajratganda |
| **DB** | **PostgreSQL** (primary + streaming^[streaming — video yoki audioni to'liq yuklab olmasdan, real vaqtda oqim ko'rinishida ko'rish.] replica) | ACID (to'lov/entitlement), JSONB (moslashuvchan metadata), UZ-hosting | MySQL |
| **Kesh/sessiya/navbat** | **Redis** (+ BullMQ/Asynq) | Issiq katalog/feed keshi, OTP+refresh, rate-limit^[rate-limit — so'rovlar sonini cheklab, suiiste'mol va hujumlardan himoya qilish.], oddiy job-queue (Kafka'siz) | — |
| **Qidiruv** | **Meilisearch** | Yengil, uz/ru typo-tolerant instant search, kam ops | Postgres FTS (MVP^[MVP — Minimum Viable Product — ishlaydigan eng minimal mahsulot; faqat asosiy funksiyalar bilan bozorga chiqariladi.]), OpenSearch (miqyosda) |
| **Media transcode^[transcode — videoni turli sifat/formatlarga qayta kodlash.]** | **FFmpeg + Shaka Packager** (ochiq) | VOD^[VOD — Video on Demand — foydalanuvchi istagan vaqtda ko'radigan yozib olingan video (jonli efirdan farqli).]-only → Flussonic^[Flussonic — tijorat media-server (jonli TV va IPTV uchun kuchli), litsenziya to'lovi bor.]'ning jonli TV kuchi kerak emas; per-stream litsenziya yo'q; to'liq nazorat; UZS narxida arzon | **Flussonic** — jamoada media-injener yo'q bo'lsa, tezroq ishga tushirish uchun (litsenziyali, raqobatchilar shunda) |
| **Paketlash** | HLS (CMAF^[CMAF — bitta media formatidan HLS va DASH ni birga xizmat qilish imkonini beruvchi segment formati (fMP4 asosida).]/fMP4), DASH^[DASH — HLS ga o'xshash ochiq adaptiv striming standarti.] keyin | iOS/Safari native HLS; bitta fMP4 to'plam HLS+DASH; raqobatchi stack | — |
| **Kontent himoya** | Qisqa TTL imzolangan URL (HMAC^[HMAC — maxfiy kalit yordamida imzo yaratib, ma'lumot buzilmaganini tekshirish usuli.]), premiumga AES-128; DRM^[DRM — Digital Rights Management — kontentni ruxsatsiz nusxalashdan himoyalash texnologiyasi.] keyin | Raqobatchilar DRM'siz token ishlatadi; DRM'ning ~1% narxida casual himoya | Widevine^[Widevine — Google ning DRM tizimi (Android va veb uchun).]/FairPlay^[FairPlay — Apple ning DRM tizimi (iOS va Safari uchun).] (litsenziar talab qilsa) |
| **Object storage** | **MinIO** (S3-mos, UZ ichida) | S3 API, egress to'lovi yo'q, TAS-IX ichida | AWS S3 (rad — egress qimmat) |
| **CDN** | UZ ichida **TAS-IX** peered Nginx edge cache | TAS-IX ichki trafik ~bepul — eng katta xarajat richagi | Cloudflare (xorij foydalanuvchi uchun fallback) |
| **Veb frontend** | **Next.js 14+ (App Router, RSC^[RSC — React Server Components — serverda render bo'lib, brauzerga kam JavaScript yuboradigan komponentlar.])** | SEO+ISR^[ISR — Incremental Static Regeneration — sahifalarni bosqichma-bosqich oldindan generatsiya qilib keshlash.] (katalog), CSR (personal); RSC kam JS (past Android) | — |
| **Mobil** | **Flutter (Dart)** | Bitta kod bazasi, silliq reels scroll (Impeller/Skia), native player wrapper | React Native (reels perf zaifroq) |
| **Telegram** | **grammY (TS)** webhook + Mini App | Zamonaviy, TS, Mini App helper, Node stack bilan mos | Telegraf, aiogram |
| **Pleyer** | hls.js^[hls.js — brauzerda HLS video oqimini o'ynatuvchi JavaScript kutubxonasi.] (veb), Media3/ExoPlayer^[ExoPlayer — Android ning zamonaviy native video pleyeri (Media3).] (Android), AVPlayer^[AVPlayer — iOS ning native video pleyeri.] (iOS) | Har platformada eng yaxshi bepul native pleyer, bir xil HLS chiqishi | — |
| **Analitika** | **PostHog^[PostHog — o'z serverida ishlaydigan mahsulot-analitika tizimi (event, funnel, A/B test).] (self-hosted, ClickHouse)** + Yandex Metrika^[Yandex Metrika — veb-sayt tashriflari va xatti-harakatlarini tahlil qiluvchi bepul analitika vositasi.] (veb) | Ma'lumot rezidentligi (UZ qonuni), reels event hajmi, funnel/flag/A-B; Metrika — SEO/marketing | — |
| **Xabarnoma** | Telegram (**asosiy**) + FCM/APNs + email; SMS faqat OTP | Telegram dominant+bepul, Android push UZ'da ishonchsiz (Huawei/AOSP), SMS qimmat | — |
| **SMS (OTP)** | **Eskiz^[Eskiz — O'zbekistonda SMS xabar yuborish provayderi.].uz** (asosiy) + PlayMobile (zaxira) | UZ standart provayderlari, ikki provayder — ishonchlilik | — |
| **Orkestratsiya** | Docker^[Docker — dasturni konteynerga o'rab, hamma joyda bir xil ishga tushirish texnologiyasi.] + **k3s^[k3s — Kubernetes ning yengil, kam resurs talab qiladigan versiyasi.]/RKE2** (stateless), DB/transcode bare-metal | Kichik jamoa uchun to'g'ri o'lchamli K8s; DB/GPU alohida temir | Nomad, docker-compose (MVP) |
| **CI/CD & IaC** | GitLab CI/GitHub Actions → Harbor^[Harbor — o'z serveringdagi Docker-image (konteyner obrazlari) ombori.] → ArgoCD^[ArgoCD — GitOps deploy vositasi — Git'dagi holatni klasterga sinxronlaydi.]; Terraform^[Terraform — infratuzilmani (server, DNS) kod bilan yaratish vositasi.] + Ansible^[Ansible — serverlarni avtomatik sozlash (konfiguratsiya) vositasi.] | Takrorlanuvchi, GitOps^[GitOps — infratuzilma va deploy'ni Git-repozitoriy orqali deklarativ boshqarish usuli.], UZ ichida registry (tez pull) | — |
| **Observability** | Grafana^[Grafana — metrika va loglarni vizual dashboard'da ko'rsatuvchi kuzatuv vositasi.] **LGTM** (Loki/Mimir/Prometheus/Tempo) + Sentry | Self-hosted, telemetriya egress yo'q, K8s-native | Datadog (rad — SaaS xarajat+egress) |

> ✅ **TASDIQLANGAN #1 — Media pipeline: FFmpeg + Shaka Packager.** Mahsulot faqat VOD bo'lgani uchun Flussonic'ning jonli-TV kuchi ishlatilmaydi, per-stream litsenziyasi esa UZS narxida marginni yeydi. Paketlash qatlami adapter ortida abstrakt saqlanadi. *Istisno: jamoada media-injener bo'lmasa va MVP 6–8 haftada kerak bo'lsa — vaqtincha Flussonic bilan de-risk qilinadi.*

> ✅ **TASDIQLANGAN #2 — Backend: NestJS / TypeScript.** 4 yuzadan 3 tasi TS (veb, admin, bot) → yagona til, umumiy tiplar, UZ'da oson kadr. Reels-feed va playback-token issiq yo'llari MVP'dan keyin bottleneck bo'lsa, o'sha modullar alohida **Go** servisga ajratiladi (modul chegaralari shu maqsadda toza chiziladi).

---

## 5. Ma'lumotlar modeli (konseptual)

Asosiy entitilar (maydonlar to'liq emas, konseptual):

- **User** (`id, phone, telegram_id, locale, status, created_at`) → 1:N Subscription, Session, Device, WatchProgress; 1:1 Wallet
- **Title** (`id, type: movie|series, year, age_rating, poster, is_free, status, popularity`) → 1:N TitleTranslation(uz-Latn^[uz-Latn — o'zbek tilining lotin yozuvi.]/uz-Cyrl^[uz-Cyrl — o'zbek tilining kirill yozuvi.]/ru), Season, Reel, MediaAsset; N:M Genre/Person
- **Season / Episode** (serial ierarxiyasi, epizod alohida `is_free`, `media_asset`)
- **Reel** (`id, title_id [MAJBURIY FK], media_asset_id, caption, duration, poster, status, is_pinned, publish_at, expire_at, like/view/share_count`) → N:1 Title
- **MediaAsset** (`id, owner_type: title|episode|reel, encoding_status, hls_template, qualities[], drm`) — polimorf
- **Plan** (`code, name, price_uzs, period, is_ad_free, features`) → 1:N Subscription
- **Subscription** (`user_id, plan, status: active|grace|expired, period_start/end, auto_renew, source`)
- **Transaction / LedgerEntry** (double-entry, `idempotency^[idempotency — bir so'rov bir necha marta kelsa ham natija faqat bir marta bajarilishini kafolatlash (to'lovda juda muhim).]_key`, provider, status) — pul harakati
- **Entitlement** (`user_id, scope, valid_until, source`) — playback-token beruvchi tomonidan o'qiladi
- **WatchProgress** (`user_id, title/episode, position_sec, completed`)
- **PlaybackSession / Device** (concurrency^[concurrency — bir akkauntdan bir vaqtning o'zida nechta qurilma yoki oqim ruxsat etilishi.] limiti, push-token)
- **License** ⭐ (yangi — 8.1-bo'lim: `licensor, title, territory, window_start/end, exclusivity, max_concurrency, drm_required, cost/MG/rev_share`)

---

## 6. Funksional talablar (subsystema bo'yicha)

### 6.1. Kontent katalogi
- Kino + serial/mavsum/epizod, uz-Latn/uz-Cyrl/ru lokalizatsiyalangan metadata
- Janr, yil, davlat, til/dublyaj^[dublyaj — chet tilidagi kontentni o'zbek (yoki rus) tilida ovoz berib qayta yozish.], yosh-reyting, IMDb/Kinopoisk^[Kinopoisk — rusiyzabon auditoriya orasida mashhur film reyting va ma'lumot xizmati.] + o'z reytingi
- Freemium bayroq (`is_free`), premyera/HD/4K teglari
- Nashr holati mashinasi: `draft → transcoding^[transcoding — videoni turli sifat va formatlarga qayta kodlash jarayoni.] → ready → published/scheduled → unpublished/archived` (nashr faqat asset tayyor bo'lganda)

### 6.2. Reels tizimi (kinoga bog'langan)
- Har reels majburiy `title_id` FK; orfan reels yo'q
- Vertikal autoplay snap-scroll feed (veb+mobil), muted-start + tap-to-unmute
- Keyingi 2–3 reels prefetch (bayt-budjet + Save-Data bilan), birinchi reels uchun MP4 fallback (tez birinchi kadr)
- Determinstik reyting (MVP): **pin > yangilik > mashhurlik (vaqt-decay)**, ko'rilganlarni dedupe — ML EMAS
- Faol oyna (`publish_at/expire_at`) + status hayot-sikli
- Engagement: **qualified view** (≥3s yoki ≥50%), like (toggle), share (deep-link) — komment/follow YO'Q
- Reel → kino deep-link + premium bo'lsa obuna CTA; **reel_id atributsiya** obuna voronkasiga muhrlanadi
- Admin moderatsiya darvozasi (noto'g'ri kino bog'lash/krop oldini olish)

### 6.3. Striming va media pipeline
- **Ingest** (admin resumable tus yuklash) → ffprobe validatsiya → transcode navbati
- **ABR^[ABR — Adaptive Bitrate — tarmoq tezligiga qarab video sifatini avtomatik o'zgartirish.] ladder**: 240p/360p/480p/720p/1080p H.264/AAC (past Android mos), transcode-once
- **Paketlash**: Shaka Packager → HLS CMAF/fMP4
- **Chiqarish**: qisqa TTL HMAC imzolangan playlist+segment URL (entitlement tekshirilgan), TAS-IX edge cache
- **Subtitr/audio**: uz/ru dublyaj audio-dorojka + WebVTT subtitr^[subtitr — video ostiga tarjima matnini yozib chiqish (ovoz o'zgarmaydi).] (uz-Latn/uz-Cyrl/ru), UTF-8 charset transcode ingest'da
- **Qo'shimcha**: sprite/storyboard scrubbing preview, EBU R128 balandlik normalizatsiyasi, resume-position + QoE heartbeat
- **Reels profili**: 720x1280 vertikal, 2s segment, tez startup
- **Offline (mobil, keyingi bosqich)**: qurilma-bog'langan shifrlangan fayl + license TTL (obunaga sinxron)

### 6.4. Auth (telefon OTP + Telegram)
- Telefon OTP (Eskiz→PlayMobile fallback), rate-limit (so'rov VA tasdiqlash), SMS xarajat cheklovi
- Telegram login teng-huquqli yo'l (deep-link/login-widget → `telegram_id` ↔ `user_id`)
- JWT access (5–15 daq) + rotatsion refresh (Redis, revoke qilinadi), reuse-detection
- Ko'p-qurilma sessiya + concurrency limiti; "boshqa qurilmalardan chiqish"

### 6.5. Obuna, to'lov (Uzbekiston)
- Tariflar: 1/3/6/12 oy; premium (reklamasiz+4K) vs bepul (reklamali)
- To'lov: **Payme, Click** (MVP) → **Uzum**, Uzcard/Humo (Atmos^[Atmos — Uzcard va Humo kartalarini bog'lash hamda to'lov qilish uchun API xizmati.] orqali binding)
- **Webhook**: imzo tekshirish + **idempotentlik** + reconciliation (majburiy — pul buzilmasligi uchun)
- Promokod/sovg'a-kod, tekshiruv muddati (trial), grace-period + dunning^[dunning — to'lov muvaffaqiyatsiz bo'lганda qayta urinish va foydalanuvchini eslatish jarayoni.] (avtomatik yangilanish ishonchsiz UZ'da → karta-token + eslatma)
- **Fiskal chek (OFD^[OFD — fiskal ma'lumot operatori — onlayn to'lovlarga soliq-cheki chiqaruvchi virtual kassa tizimi.]/soliq)** — qonun talabi, pipeline'ga o'rnatilgan
- Apple/Google IAP^[IAP — In-App Purchase — App Store yoki Google Play ichidagi xarid; do'kon 15-30% komissiya oladi.] — alohida izolyatsiyalangan entitlement manba (server-side receipt validatsiya)

> ✅ **TASDIQLANGAN #3 — Hamyon YO'Q: to'g'ridan-to'g'ri obuna debit-at-purchase.** Saqlangan mijoz balansi UZ'da **e-money^[e-money — elektron pul — saqlangan mijoz balansi; moliyaviy litsenziya va regulyatsiya talab qilishi mumkin.] regulyatsiyasi**ni (litsenziya, rezerv, refund/dormant majburiyat) keltirib chiqaradi va daromad-tan-olishni murakkablashtiradi (8.3-bo'lim). Foydalanuvchi obunani gateway orqali to'g'ridan-to'g'ri sotib oladi. Promokod/sovg'a — obuna muddatini uzaytirish (`free_days`) sifatida, balans EMAS. *Hamyon — faqat huquqiy ko'rik + aniq mahsulot sababidan keyin (masalan TVOD/mikro-to'lov).*

### 6.6. Foydalanuvchi veb (Next.js)
- Sahifalar: Bosh (hero+rail'lar), katalog/janr, qidiruv+filtr, sarlavha detali, pleyer, **reels feed**, davom ettirish, mening ro'yxatim, obuna/paywall, promokod, profil/qurilmalar, OTP onboarding
- Anonim browse ochiq va **SEO-indekslanadi**; tomosha server-side (imzolangan URL berishda) gate qilinadi — faqat UI'da emas
- Server-driven bosh sahifa (admin CMS orqali rail/banner) + ISR
- PWA^[PWA — Progressive Web App — brauzerdan o'rnatiladigan, offline ham ishlaydigan veb-ilova.] (o'rnatiladigan, offline shell, web-push)
- Pleyer: sifat/audio/subtitr tanlash, resume, keyingi epizod avtoplay, skip-intro, PiP

### 6.7. Admin panel (alohida ilova)
- Alohida frontend + alohida auth realm (email+parol + **majburiy TOTP^[TOTP — vaqt asosida ishlaydigan bir martalik kod (masalan Google Authenticator).] 2FA^[2FA — ikki bosqichli autentifikatsiya — parol ustiga qo'shimcha tasdiq (kod).]**, IP allowlist)
- RBAC: 5 rol (super-admin, kontent-menejer, moderator, support, analitik) — API darajasida yoqilgan
- Kontent hayot-sikli FSM (nashr asset tayyorligiga bog'langan)
- Kino/serial/epizod CRUD (uz-Latn/uz-Cyrl/ru), poster/artwork, video yuklash+transcode monitoring+retry
- Reels boshqaruvi (majburiy kino bog'lash, vertikal transcode, feed tartibi/pin)
- Bosh sahifa/kolleksiya CMS + banner (jadval bilan)
- Tarif/promokod boshqaruvi, foydalanuvchi boshqaruvi, refund, qo'lda entitlement
- Moderatsiya navbati, **o'zgarmas audit log** (aktor + before/after + sabab)
- Analitika dashboard (Metabase/ClickHouse)

### 6.8. Mobil (Flutter — Android + iOS)
- Telefon OTP + Telegram deep-link hand-off (bir martalik, qisqa TTL token)
- HLS token-auth^[token-auth — kontentga kirishni qisqa muddatli imzolangan token (raqamli kalit) orqali nazorat qilish.] pleyer (Media3/AVPlayer), ABR, dublyaj/subtitr, cross-device resume
- Reels: 3–5 pre-warmed native pleyer pool, prefetch, thumbnail-first (silliq scroll)
- Push (FCM+APNs) + deep-link routing; App Links / Universal Links
- **✅ TASDIQLANGAN #4 — Mobil to'lov: TASHQI (Payme/Click/Uzum), iOS "reader" model.** Obuna faqat veb/Telegram'da; iOS/Android ilova ichida narx, "obuna bo'lish" tugmasi yoki tashqi checkout linki **YO'Q**. Apple/Google IAP 15–30% olgani uchun UZS narxda margin qolmaydi. **⚠️ Bu eng katta launch riski (Apple review)** — temir intizom bilan rioya qilinadi; ilova qonuniy bepul kontent + login ko'rsatadi.
- Keyingi bosqich: DRM offline download, Chromecast/AirPlay, PiP

### 6.9. Telegram bot + Mini App
- Webhook (long-polling emas) + `secret_token` header validatsiya, UZ ichida hosting
- Telefon-kontakt orqali akkaunt bog'lash (Telegram-birinchi VA veb-boshlangan signed deep-link)
- Katalog browse/qidiruv, sarlavha kartalari
- Obuna: **deep-link → Payme/Click/Uzum** (Telegram Payments EMAS — UZ provayderlar qo'llab-quvvatlanmaydi); PSP webhook tasdiqlaydi
- Hayot-sikli xabarnomalari: yangi relise, obuna tugashi (T-3/T-1/expired), opt-in bilan
- `update_id` idempotentlik, bot-bloklangan (403) boshqaruvi, rate-limit (30/s global, 1/s per-chat)
- Keyingi: Mini App (webview, initData HMAC), admin broadcast (segment+throttle), referral

### 6.10. Xabarnoma va analitika
- **Notification Orchestrator**: event-driven, template (uz/ru), opt-in, dedup, quiet-hours (UZT), kanal fallback (Telegram→push→email; SMS faqat OTP)
- **Analitika**: PostHog (event, funnel, retention, feature-flag, A/B) + Yandex Metrika (veb SEO)
- **Tavsiyalar (MVP)**: qoida-asosli — trending (decay), davom ettirish, janr rail, oddiy "chunki siz ko'rdingiz"; ML keyin
- **Metadata boyitish**: TMDB^[TMDB — The Movie Database — filmlar haqida ochiq metadata (poster, aktyor, janr) manbai.] (asosiy) + Kinopoisk (ikkilamchi) + admin editorial override
- **KPI**: bepul→pullik konversiya, DAU/MAU, watch-time, **reel→kino CTR**, D1/D7/D30 retention, churn, MRR/ARPU^[ARPU — Average Revenue Per User — bitta foydalanuvchidan olinadigan o'rtacha daromad.]

---

## 7. Nofunksional talablar

| Kategoriya | Talab |
|-----------|-------|
| **Ishlash** | Pleyer startup p95 < 2–3s (UZ mobil), reels scroll silliq (prefetch), katalog TTFB past (ISR+kesh) |
| **Miqyoslash** | Stateless tier (API/reels) HPA bilan autoscale; DB read-replica; reels — arzon lekin **so'rov hajmi katta** → keshlash |
| **Ishonchlilik** | Warm replica + tested failover; ledger uchun near-zero RPO (PITR) |
| **Xavfsizlik** | 8-bo'lim + 9-bo'lim |
| **i18n^[i18n — internatsionalizatsiya — ilovani bir necha tilga moslashtirish.]** | **uz-Latn, uz-Cyrl, ru** (8.2-bo'lim — bitta "uz" EMAS) |
| **Accessibility** | WCAG 2.1 AA (veb/PWA), platforma a11y API (mobil), subtitr kafolatlangan |
| **Ma'lumot rezidentligi** | UZ fuqarolari PII^[PII — shaxsni aniqlovchi ma'lumot — telefon, ism, hujjat va hokazo.] UZ ichida (Personal Data Law ZRU-547) |
| **Kuzatuvchanlik** | SLO'lar aniqlangan (8.10), Grafana LGTM + Sentry |

---

## 8. ⭐ E'tibordan chetda qolgan kritik masalalar (siz aytmagan, lekin shart)

> Bu bo'lim — tanqidchi-agent topgan 15 ta bo'shliq. Bular **texnik emas, biznes/huquqiy/operatsion** masalalar bo'lib, ko'pincha e'tibordan chetda qoladi, lekin real ishga tushirishni **bloklaydi**. Muhimlik bo'yicha tartiblangan.

### 🔴 8.1. Kontent litsenziyalash va huquqlar (ENG KATTA bo'shliq)
Butun mahsulot — **litsenziya biznesi**, lekin hech qaysi modul litsenziyani birinchi-darajali obyekt sifatida modellamaydi. Kerak: **License entity** (litsenziar, sarlavhalar, hudud, oyna start/end, eksklyuzivlik, maks-concurrency banti, DRM/watermark^[watermark — videoga ko'rinmas yoki ko'rinadigan belgi qo'yib, sizib chiqqan nusxani egasiga bog'lash usuli.] majburiyati, narx/MG/rev-share). Entitlement + nashr FSM litsenziya oynasiga **qattiq bog'lanishi** kerak — oyna tugaganda **avtomatik unpublish + offline litsenziya purge** (bir kun kechiksa — kontrakt buzilishi + jarima). Har-sarlavha cost-per-view → renew/drop qarori.

### 🔴 8.2. O'zbek yozuvi dualligi (uz-Latin / uz-Kirill)
Barcha domenlar "uz/ru" deb modellaydi, LEKIN o'zbek ham **lotin, ham kirill**da faol ishlatiladi. Oqibat: kirillda qidirgan lotin metadatani topmaydi; SEO/hreflang ajrata olmaydi. **Yechim**: `uz-Latn, uz-Cyrl, ru` lokallar; kanonik o'zbekni bir marta saqlab, ikkinchi yozuvni **avtomatik translitеratsiya** qilish (editorial override bilan); Meilisearch ikkala yozuvni indekslaydi; 3 til uchun hreflang. **Bu build'dan OLDIN hal qilinishi kerak** — keyin retrofit qimmat.

### 🔴 8.3. Hamyon (stored value) moliyaviy-regulyativ maqomi + soliq/buxgalteriya
Mijoz to'ldirgan balans = **e-money** bo'lishi mumkin → UZ moliyaviy litsenziya, rezerv, iste'molchi himoyasi majburiyatlari (foydalanilmagan balans qaytarilishi, dormant balans). Alohida: **QQS** obunaga, **kechiktirilgan daromad** (prepaid davr — balansdagi majburiyat), litsenziar royalti buxgalteriyasi, 1C integratsiya. **Yechim**: huquqiy ko'rik; MVP uchun "obuna debit-at-purchase" (hamyonsiz) modeli e-money'dan qochadi.

### 🔴 8.4. Yosh-reyting taksonomiyasi va UZ senzura/axloq muvofiqligi
Yagona yosh-reyting **taksonomiyasi** yo'q (UZ me'yorlariga moslashgan), import kontentni klassifikatsiya oqimi yo'q, va **reels feed'da yosh-darvoza yo'q** — autoplay teaser jamoat joyida mature kontent ko'rsatishi mumkin. UZ'da faol kontent-cheklov rejimlari bor. **Yechim**: reyting taksonomiyasi; nashr-darvozasi majburiy maydon (reels ham); entitlement/token-mint VA feed query'da yoqish (mature teaserni unauth/kids uchun filtr/blur); nashr FSM'da compliance-review nazorat nuqtasi; regulyator shikoyati uchun takedown yo'li.

### 🔴 8.5. Unit-ekonomika / xarajat modeli / narx validatsiyasi
Infra xarajat **richag**larini sifat jihatdan muhokama qiladi, lekin **unit-ekonomika modeli yo'q**: to'liq-yuklangan abonent-boshiga xarajat, stream/reels-so'rov xarajati, SMS-OTP xarajati, amortizatsiyalangan litsenziya+dublyaj har-sarlavha, va 15–60k UZS narxida **break-even^[break-even — daromad xarajatni to'liq qoplaydigan nuqta — na foyda, na zarar.] abonent soni**. **Yechim**: litsenziya+dublyaj+SMS+infra+gateway+store komissiya ↔ ARPU modeli; break-even; qattiq siyosat cheklovlari (SMS/user/kun); freemium^[freemium — bir qism kontent bepul (odatda reklama bilan), qolgani pullik obuna orqali ochiladigan model.] bepul-sarlavha tanlovini litsenziya narxiga tekshirish.

### 🟡 8.6. Dublyaj va subtitr ishlab chiqarish operatsiyalari
Strategiya — dublyaj qilingan turk/koreys/hind kontent, pipeline dub INGEST qila oladi, lekin hech kim ularni **ISHLAB CHIQARMAYDI**: dublyaj-studiya oqimi, subtitr tarjima+QC, epizod-bo'yicha dub versiyalash, balandlik QC darvozasi va bu qo'shadigan **lead-time**. Serial dropida dub — kritik yo'l, transcode emas. **Yechim**: lokalizatsiya-produksiya pipeline'ni pre-ingest bosqichi sifatida (`source-acquired → dubbing → QC → ready`), vendor boshqaruvi, QC sign-off, release jadvaliga lead-time.

### 🟡 8.7. Launch katalog seeding + transcode backlog quvvati
Greenfield → migratsiya yo'q, LEKIN hech kim boshlang'ich katalogni (yuzlab sarlavha+reels) day-1'dan OLDIN yozish/dub/transcode/nashrini egallamaydi. In-country temir bir zumda autoscale bo'lmaydi. **Bo'sh katalog = launch yo'q**. **Yechim**: "seed katalog produksiya" alohida pre-launch ish-oqimi (sarlavha/reels maqsadi, transcode-quvvat rejasi yoki bir martalik cloud-GPU burst, bulk-import dry-run, TMDB backfill); minimal launch katalog hajmi.

### 🟡 8.8. Huquqiy hujjatlar hayot-sikli (ToS, Maxfiylik, obuna shartlari, rozilik)
Hech kim **Foydalanish shartlari, Maxfiylik siyosati, obuna/avto-yangilanish shartlari, refund siyosati, offline EULA** yozish/versiyalash/rozilik olishni egallamaydi. Bular App Store/Play uchun, qonuniy OTP-marketing roziligi uchun, ijro etiladigan avto-renew/refund uchun **shart**. **Yechim**: versiyalangan huquqiy hujjatlar (uz-Latn/uz-Cyrl/ru), signup'da rozilik olish + moddiy o'zgarishda qayta rozilik (user_id+versiya+timestamp), tranzaksion'dan alohida marketing rozilik.

### 🟡 8.9. Mijozlarni qo'llab-quvvatlash operatsiyasi + refund SLA + agent asboblari
Support "Telegram-birinchi" deyilgan, lekin operatsion funksiya yupqa: refund siyosati/SLA yo'q (UZ gateway refund qo'lda/async), foydalanuvchi QoE/to'lov/entitlement holatini ko'radigan **agent konsoli** yo'q, "to'ladim lekin kirish yo'q" reconciliation runbook yo'q. **Yechim**: staffed support funksiya, yozma refund siyosati+SLA, agent konsoli (Chatwoot + read API), "to'lov stuck" runbook, ikki tilli canned javob, on-call eskalatsiya.

### 🟡 8.10. SLA/SLO, insident boshqaruvi, on-call (kichik self-hosted jamoa)
Boy observability stack bor, lekin u nimaga qarshi **o'lchashini** hech narsa aniqlamaydi: SLO (playback startup, availability, payment-success, error-budget), insident darajalari, on-call rotatsiya, status page, post-mortem. **Yechim**: kritik yo'l bo'yicha SLO'lar (playback startup p95, katalog availability, webhook lag, feed latency) + error budget + Alertmanager routing; insident darajalari + eskalatsiya + 2–3 kishilik rota + top failure runbook'lar; status page. **Bu keyingi emas, launch shartidir.**

### 🟡 8.11. Disaster Recovery: RPO/RTO, ledger bardoshliligi, master-media saqlash
Infra single-DC riskini **HAL QILMAY** qoldiradi va per-data-class RPO/RTO yo'q. Ikki o'tkir teshik: (1) to'lov/hamyon ledger = pul → near-zero RPO (PITR/sinxron replikatsiya); (2) media domen paketlashdan keyin **master fayllarni o'chiradi** — agar paketlangan storage yo'qolsa va master yo'q bo'lsa, katalog **tiklanmaydi** (cost-optimizatsiya ↔ DR ziddiyati). **Yechim**: per-data-class RPO/RTO (ledger: soniya/PITR; media: master saqlansa re-derivable); masterlarni o'chirmasdan **arzon cold-arxiv**; single-DC uchun aniq DR pozitsiya (warm replica + tested failover).

### 🟡 8.12. Deferred deep-linking / install atributsiyasi
Deep-link **yechish** (TG/reel→kino) qamrab olingan, lekin **deferred** holat yo'q: app-siz foydalanuvchi reels link bosadi → app o'rnatadi → aynan o'sha kinoga routing + acquiring `reel_id`/campaign signupgacha muhrlanishi kerak. `apple-app-site-association`/`assetlinks.json` hosting va IARC store reyting ham yo'q. **Reel→install→subscribe viral loop install chegarasida buziladi** — atributsiya yo'qoladi. **Yechim**: deferred deep-linking (payload store-install'dan keyin ham saqlanadi) + reel_id/UTM signup event'iga; universal-link association fayllar TAS-IX origin'da; IARC reyting.

### 🟡 8.13. Operatsion shtat / tashkiliy model
Admin RBAC 5 texnik rol beradi, lekin day-1'dan mavjud bo'lishi SHART funksiyalarga real odamlarni bog'lovchi shtat rejasi yo'q: kontent-akvizitsiya/litsenziya, dublyaj ops, katalog QC, compliance/moderatsiya, support, moliya/reconciliation, devops on-call. **Yechim**: launch org/RACI — har funksiyaga egа nomlash + RBAC rollariga bog'lash; unit-ekonomika modeliga o'lchash (shtat kam joyda og'ir avtomatlashtirsh).

### 🟡 8.14. Yaxlit anti-fraud + ko'p-akkaunt suiiste'moli (+ fingerprinting ↔ ma'lumot qonuni ziddiyati)
Alohida mitigatsiyalar bor (OTP rate-limit, one-trial-per-phone+device, concurrency cap), lekin **yagona anti-abuse strategiyasi** yo'q: trial/promo farming (disposable raqamlar), akkaunt/link ulashish → trace-and-ban, chargeback (qo'lda UZ gateway), reels view-count fraud. Yashirin ziddiyat: **device fingerprinting** o'zi UZ qonuni bo'yicha personal data — qonuniy asos/rozilik kerak. **Yechim**: bitta anti-abuse siyosat qatlami (telefon-yosh, fingerprint, IP/ASN, sharing pattern, chargeback flag) → entitlement + trace-and-ban ops; fingerprinting-vs-qonun ziddiyatini hujjatlashtirilgan qonuniy asos+pseudonimizatsiya bilan hal qilish.

### 🟢 8.15. Accessibility standarti va majburiyati
Accessibility faqat fragmentlarda (keyboard/caption/kontrast) — maqsad standart yo'q, custom pleyer/reels uchun screen-reader majburiyati yo'q, audio-description yo'q. Store-review va ba'zi yurisdiksiya talabi. **Yechim**: WCAG 2.1 AA (veb/PWA), platforma a11y API (mobil), caption kafolatlangan, pleyer/reels to'g'ri role/focus/label, accessibility statement. **Veb/store yuzalar uchun MVP-scope, keyinga emas.**

---

## 9. Xavfsizlik va kontent himoyasi (xulosa)

- **Auth**: telefon OTP (rate-limit so'rov+tasdiq, SMS-cap), JWT+rotatsion refresh (reuse-detect), device registry
- **Playback token**: qisqa TTL, imzolangan, `session+device+coarse-IP(ASN)` bog'langan (CGNAT-tolerant), edge-validate, concurrency cap (session ledger + tez revoke)
- **Kontent himoya (tiered)**: Tier-0 token + ko'rinadigan/forensik watermark (keng katalog); Tier-1 multi-DRM + shifrlangan offline (litsenziar talab qilsa)
- **Piratlik**: screen-record + Telegram re-upload — asosiy vektor; watermark → **trace-and-ban** (yagona real deterrent)
- **PCI**: hosted redirect (Payme/Click/Uzum), PAN/CVV saqlanmaydi (SAQ-A)
- **Ma'lumot qonuni**: UZ ichida PII, column-encryption, HMAC-searchable telefon hash, consent registry, DSAR^[DSAR — foydalanuvchining o'z shaxsiy ma'lumotini olish yoki o'chirishni so'rash huquqi.] (retention-exception bilan)
- **Audit**: hash-zanjirli append-only (auth/entitlement/token/admin/payment)
- **⚠️ SDK egress**: Yandex Metrika, FCM/APNs, crash-reporting UZ-PII'ni xorijga chiqarishi mumkin — inventarizatsiya + pseudonimizatsiya

---

## 10. Bosqichli reja (MVP → keyingi)

### 🚀 MVP (0-relise: ishlaydigan asosiy oqim)
- Modulli monolit (NestJS) + umumiy REST API (OpenAPI)
- PostgreSQL + Redis + MinIO + Meilisearch
- Telefon OTP + Telegram bog'lash; JWT/refresh
- Katalog: kino + serial/mavsum/epizod (uz-Latn/uz-Cyrl/ru)
- Reels (kinoga bog'langan): vertikal feed, like/share/view, reel_id atributsiya
- FFmpeg+Shaka HLS pipeline + qisqa TTL imzolangan token + entitlement (DRM'siz)
- Freemium: bepul sarlavhalar + premium obuna
- To'lov: Payme + Click (adapter + idempotent webhook) + promokod; **obuna debit-at-purchase**
- Watch-progress/resume + watchlist
- Xabarnoma: Telegram + FCM/APNs push
- Admin (RBAC): kontent/reels yuklash, foydalanuvchi, obuna, asosiy moderatsiya, audit log
- Mobil (Flutter): tomosha + reels + tashqi to'lov (iOS reader) + push
- Telegram bot (grammY): auth, browse, obuna deep-link, expiry notif
- Analitika: PostHog + Yandex Metrika; asosiy KPI dashboard
- **Kritik non-tech (8-bo'lim MVP qismi)**: litsenziya entity + oyna-bog'langan unpublish; uz-Latn/uz-Cyrl/ru locale model; yosh-reyting darvozasi (reels ham); huquqiy hujjatlar + rozilik; refund siyosati+SLA; SLO+on-call; ledger PITR + master cold-arxiv; unit-ekonomika modeli; seed-katalog ish-oqimi; accessibility (veb/store)

### 📈 Keyingi bosqichlar
- Uzum gateway + karta-token binding + true auto-renew + dunning
- DRM (Widevine/FairPlay) + shifrlangan offline download (mobil)
- Forensik A/B watermark + avtomatik leak trace-back
- Telegram Mini App + admin broadcast + referral
- ML tavsiyalar (collaborative filtering, reels bandit ranking) + A/B tajriba dasturi
- ClickHouse warehouse + dbt + cost-per-view BI (litsenziya qarorlari)
- Multi-DC HA + TAS-IX ko'p-nuqta edge + Cloudflare xorij fallback
- Chromecast/AirPlay, PiP, kids profil, low-data rejim
- Hot-path'larni (reels feed, entitlement) Go servisga ajratish
- Apple/Google IAP (agar store majbur qilsa)

---

## 11. ✅ Tasdiqlangan kalit qarorlar (v1.1)

Quyidagi 7 ta qaror **yakuniy tasdiqlangan**. Umumiy mantiq: **kichik jamoa + UZS narx + tez launch** uchun optimallashtirish — arzon/ochiq texnologiya, minimal regulyativ yuk, keyin miqyoslashga oson kengaytiriladigan toza chegaralar.

| # | Qaror | ✅ Tanlov | Asosiy sabab | Qachon qayta ko'rish |
|---|-------|----------|--------------|----------------------|
| 1 | Media pipeline | **FFmpeg + Shaka Packager** | VOD-only → Flussonic kuchi ishlatilmaydi; litsenziya marginni yeydi | Media-injener yo'q + 6–8 hafta launch → Flussonic |
| 2 | Backend tili | **NestJS / TypeScript** | 3/4 yuza TS; umumiy tip; UZ'da oson kadr | Reels/token hot-path bottleneck → o'sha modul Go'ga |
| 3 | Hamyon | **Yo'q (debit-at-purchase)** | Saqlangan balans = e-money regulyatsiyasi; soddaroq buxgalteriya | Huquqiy ko'rik + TVOD/mikro-to'lov sababi |
| 4 | Mobil to'lov | **Tashqi + iOS reader** | IAP 15–30% marginni yo'q qiladi | Store majbur qilsa (mintaqaviy) |
| 5 | DRM | **Token + watermark** | Raqobatchilar DRM'siz; DRM arzon Android'ni buzadi; screen-record'ni to'xtatmaydi | Litsenziar kontraktda talab qilsa (Tier-1 sarlavha) |
| 6 | Reels reyting | **Determinstik** (pin>recency>popularity) | Cold-start; nol o'zaro-ta'sir data; debug qilinadi | Engagement data zichligi (oylar) → ML |
| 7 | Locale | **uz-Latn + uz-Cyrl(auto) + ru** | Kirill↔Lotin cross-search; SEO; retrofit qimmat | — (build'dan oldin, keyin o'zgarmas) |

**Muhim ketma-ketlik:** #7 (locale) va #3 (hamyonsiz) — **build'dan OLDIN** modellanishi shart, keyin retrofit qimmat. #4 (Apple review) — eng katta launch riski, intizom talab qiladi. #1 va #2 dagi "qayta ko'rish" shartlari faqat aniq bottleneck/muddat bosimida qo'llaniladi.

---

## 12. Muvaffaqiyat mezonlari (KPI)

- **Konversiya**: bepul → pullik obuna %
- **Reel→kino CTR** va **reel→obuna** atributsiya (north-star)
- **Retention**: D1 / D7 / D30
- **Churn** va **MRR / ARPU**
- **QoE**: playback startup p95, rebuffer nisbati
- **Unit-ekonomika**: abonent-boshiga margin, break-even abonent soni

---

*Ushbu TZ raqobat tahlili (SalomTV, iTV, TVCOM, Xonplay) va 12-agentli parallel loyihalash workflow asosida tuzildi. Keyingi qadam — tanlangan kalit qarorlar bo'yicha har bir modulni endpoint/maydon darajasida detallashtirish.*
