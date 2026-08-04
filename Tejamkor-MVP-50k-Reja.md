# «Kino» Tejamkor MVP — $50 000 / 3–4 oy (to'liq: Mobil + Veb + Admin + Telegram)

> **Hujjat turi:** Tejamkor (lean) MVP byudjeti va muddat rejasi
> **Maqsad:** Hamma yuzani (mobil iOS+Android, foydalanuvchi veb, admin veb, Telegram bot, backend) 3–4 oyda, ~$50 000 ichida ishga tushirish
> **Sana:** 2026-07-24 · **Valyuta:** 1 USD = 12 700 so'm
> **Asos:** TZ v1.1 (tasdiqlangan stack) + MVP byudjet modeli, tejamkor ssenariyga moslashtirilgan

---

## 📌 Umumiy xulosa

| Ko'rsatkich | Qiymat |
|-------------|--------|
| **Jami byudjet (launch'gacha)** | **~$50 000** (~635 mln so'm) |
| **Muddat** | **3–4 oy** (3.5 oy asos) |
| **Yuzalar (hammasi kiradi)** | Backend + Media pipeline + **Foydalanuvchi veb** + **Admin veb** + **Mobil (iOS+Android)** + **Telegram bot** |
| Jamoa | ~6 to'lovli + asoschi(lar) |
| Oylik burn (launch'dan keyin) | ~$11 000/oy |
| **Break-even** | **~5 200 pullik obunachi** |
| Kontent (launch) | ~50 sarlavha, **subtitr-birinchi** (dublyaj keyin) |

**Bitta jumlada:** Hamma yuza $50k'da quriladi — chunki O'zbekiston IT maoshlari past, TAS-IX trafik ~bepul, stack ochiq/bepul. Yagona majburiy murosa — **kontent kichik va subtitr-birinchi** (katta dublyaj katalog keyin, daromad bilan qo'shiladi).

---

## 🔑 Buni mumkin qiladigan 3 shart

$50k / 3–4 oy / hamma yuza faqat quyidagi 3 shart bilan real:

1. **Asoschi(lar) dasturchi bo'lishi** — kamida bitta asoschi backend/full-stack va mahsulotni olib boradi ($0 maosh, sweat equity). Bu jamoa xarajatining ~yarmini tejaydi. Aks holda +$12–15k kerak → byudjetdan chiqadi.
2. **Kontent subtitr-birinchi, ~50 sarlavha** — dublyaj emas (dublyaj byudjetni yoradi). Rev-share/mahalliy litsenziya, upfront minimal.
3. **Har yuzada faqat MVP-yadro** — sayqal emas, asosiy oqim. DRM, offline, ko'p-profil, catch-up, to'liq CMS, ML — hammasi keyingi bosqichga.

---

## 1️⃣ Jamoa (~$29 000 · 3.5 oy)

Hamma yuzani parallel qurish uchun ~6 to'lovli mutaxassis + asoschi(lar). Maoshlar 2026 Toshkent (mid ~$1 300–1 600, junior ~$700).

| Rol | Vazifa | $/oy | 3.5 oy |
|-----|--------|------|--------|
| **Asoschi(lar)** | Backend yadro + media pipeline yetakchi + mahsulot/PM | $0 | **$0** |
| Backend dev (mid) | API, auth/OTP, obuna (Payme/Click), entitlement, reels | $1 400 | $4 900 |
| Veb + Admin frontend (mid) | User veb VA admin (Next.js, umumiy komponent) | $1 500 | $5 250 |
| Mobil Flutter (mid-senior) | iOS+Android bitta kod: browse, pleyer, reels, obuna | $1 600 | $5 600 |
| **Media-infra/DevOps** ⭐ | FFmpeg+Shaka HLS, token, MinIO, deploy (kontrakt) | — | $6 000 |
| Telegram bot (grammY, junior) | Auth-link, browse, to'lov deep-link, xabarnoma | $700 | $2 450 |
| QA + dizayn (part-time/kontrakt) | Test + UI kit | — | $3 000 |
| Recruiting / onboarding | Bir martalik | — | $1 500 |
| **JAMI** | | | **~$28 700** |

> ⭐ **Eng kritik va kam-topiladigan** — FFmpeg/Shaka media-infra mutaxassisi. Uni birinchi bo'lib topib qo'ying (mintaqaviy remote kontraktor bo'lishi mumkin).
> 💡 Veb + admin bitta dev tomonidan — admin **minimal** (kontent yuklash + CRUD), umumiy dizayn-tizim bilan. Tejash uchun admin'ni yengil vosita (Directus/Strapi) bilan boshlash ham mumkin.

---

## 2️⃣ Kontent (~$12 500 · subtitr-birinchi)

$50k'da katta dublyaj katalog mumkin emas → **subtitr-birinchi, ~50 tanlangan sarlavha**.

| Element | Asos | $ |
|---------|------|---|
| Litsenziya (rev-share / mahalliy) | ~50 sarlavha, upfront minimal, foiz-ulush | ~$2 500 |
| Subtitr | ~180–200 soat × ~$50/soat | ~$8 000 |
| Metadata + poster + QC | ~50 sarlavha | ~$2 000 |
| **JAMI** | | **~$12 500** |

> **Strategiya:** mahalliy UZ kontent (rev-share, arzon) + tayyor UZ/RU trekli kontent + distributorlar bilan foiz-ulush (minimum-guarantee'siz). **Dublyaj:** launch'da yo'q; top 2–3 hero sarlavhani keyin daromad bilan dublyaj qiling.
> ⚠️ **Risk:** UZ bozorida dublyaj — kuchli qadriyat. Subtitr-only — raqobat riski; buni mahalliy kontent va tez dublyaj-roadmap bilan yumshating.

---

## 3️⃣ Infratuzilma (~$4 500 · 3.5 oy COLO)

Kichik katalog uchun minimal COLO (GPU kerak emas — CPU transcode yetarli).

| Element | $/oy | 3.5 oy |
|---------|------|--------|
| App/backend node + Redis + Meilisearch (birga) | $250 | $875 |
| PostgreSQL node | $180 | $630 |
| CPU transcode + Nginx edge | $220 | $770 |
| MinIO storage (~10 TB) | $200 | $700 |
| TAS-IX port + kichik intl uplink | $180 | $630 |
| Xorij DR backup (B2) | $50 | $175 |
| Setup (bir martalik) | — | $800 |
| **JAMI** | ~$1 080/oy | **~$4 580** |

> TAS-IX ichki egress ~bepul — bandwidth katta xarajat emas. Kichik katalog uchun GPU shart emas.

---

## 4️⃣ Uchinchi-tomon + huquqiy (~$3 500)

| Element | $ |
|---------|---|
| Apple Developer ($99/yil) + Google Play ($25) | $124 |
| Domain (.uz + .com) + DNS | $50 |
| Kompaniya (OOO) ro'yxati | $200 |
| OFD / fiskalizatsiya (setup + 3.5 oy) | $220 |
| Personal Data Law ro'yxati | $100 |
| Kontent-huquq yuristi (yengil) | $1 200 |
| Buxgalteriya (3.5 oy) | $525 |
| SMS/Eskiz (pre-launch ~0) + tooling | $300 |
| Bufer | $780 |
| **JAMI** | **~$3 500** |

---

## 5️⃣ Jami byudjet

| Kategoriya | $ | so'm (~) |
|-----------|---|----------|
| Jamoa (3.5 oy) | $29 000 | 368 mln |
| Kontent (subtitr, ~50 sarlavha) | $12 500 | 159 mln |
| Infratuzilma (COLO) | $4 500 | 57 mln |
| Uchinchi-tomon + huquqiy | $3 500 | 44 mln |
| Kontingensiya | $500 | 6 mln |
| **JAMI** | **~$50 000** | **~635 mln so'm** |

---

## 6️⃣ Muddat rejasi (3.5 oy, intensiv)

| Oy | Asosiy ishlar |
|----|---------------|
| **1-oy** | Backend yadro (OTP auth, katalog, DB, obuna skeleti) · Media pipeline setup (FFmpeg+Shaka+MinIO+token) · Infra provision · Dizayn-tizim · **Kontent: litsenziya+subtitr boshlanadi (parallel, tashqi)** |
| **2-oy** | Veb ilova (browse, pleyer, reels) · Mobil skaffolding · Admin CRUD (kontent yuklash) · Telegram bot asoslari · To'lov integratsiyasi (Payme/Click) |
| **3-oy** | Mobil yadro (pleyer, reels, obuna) · Admin kontent boshqaruvi · Reels feed sayqal · Entitlement/paywall · Xabarnoma · **Katalog yuklanadi** · Test boshlanadi |
| **4-oy (bufer)** | QA + bug-fix · App Store / Google Play submission (review 1–2 hafta — risk!) · To'lov reconciliation · Soft-launch |

> ⚠️ **Muddat riski:** 5 yuzani 3–4 oyda qurish **agressiv** — faqat asoschi ishtiroki + qat'iy MVP-scope + kod qayta-ishlatish (Next.js komponent web↔admin, OpenAPI client) bilan bajariladi. Apple review 4-oyda vaqt oladi — rejaga kiritilgan.

---

## 7️⃣ Har yuzada nima bor (MVP-yadro)

| Yuza | Kiradi | Keyinga |
|------|--------|---------|
| **Backend** | Auth (OTP+Telegram), katalog, reels, obuna (Payme/Click), entitlement, watch-progress | Mikroservis, hamyon, ko'p-profil |
| **Media** | FFmpeg+Shaka HLS, token-auth, ABR, subtitr | DRM, offline, dublyaj-audio |
| **Foydalanuvchi veb** | Bosh, katalog, qidiruv, sarlavha, pleyer, **reels feed**, obuna, profil | PWA offline, personalizatsiya |
| **Admin veb** | Kontent/reels yuklash, metadata, foydalanuvchi, obuna, oddiy analitika | To'liq CMS, moderatsiya workflow, 4-eyes |
| **Mobil (Flutter)** | Browse, pleyer, reels, obuna (tashqi/iOS-reader), push | Offline download, Chromecast, PiP |
| **Telegram bot** | Auth-link, browse, to'lov deep-link, xabarnoma | Mini App, broadcast, referral |
| **Reels** | Kinoga bog'langan vertikal feed, like/share, deep-link | ML reyting, kampaniya analitika |

---

## 8️⃣ Oylik xarajat + break-even

| Element | $/oy |
|---------|------|
| Jamoa (lean, asoschi + 1–2 part-time) | ~$6 500 |
| Infra (COLO) | ~$1 100 |
| Kontent refresh (subtitr, kichik) | ~$3 000 |
| Uchinchi-tomon (SMS+gateway o'sadi) | ~$500 |
| **Oylik burn** | **~$11 100/oy** |

**Break-even:** ~$11 100 ÷ $2.1 (sof/obunachi) ≈ **~5 200 pullik obunachi** (29 000 so'm × 5 200 ≈ 151 mln so'm/oy).

> Bu — oldingi base modeldagi ~25 300 o'rniga **~5 200** — ancha erishilarli. Sababi: lean jamoa + kichik subtitr-refresh + minimal infra.

---

## 9️⃣ Risklar va ochiq eslatmalar

- **Asoschi dasturchi shart** — bu byudjetning ustuni. Bo'lmasa +$12–15k.
- **Subtitr-only raqobat riski** — UZ'da dublyaj kuchli qadriyat; mahalliy kontent + tez dublyaj-roadmap bilan yumshating.
- **3–4 oy agressiv** — 5 yuza uchun qat'iy scope va parallel ish shart; kechikish riski real (bufer 4-oy).
- **Media-infra mutaxassisi** — kam topiladi, birinchi yollang.
- **App Store review** — 1–2 hafta, rad etilishi mumkin (iOS reader qoidasi — ichida narx/link YO'Q).
- **Bu baholar** ±15–25% o'zgarishi mumkin; server-provayder va subtitr-studiya bilan tasdiqlang.

---

## 🔟 Keyingi bosqich (o'sish)

Bu tejamkor MVP — **validatsiya bosqichi**: mahsulotni isbotlash + birinchi ~5k pullik obunachi. Keyin daromad/keyingi raund bilan:
1. **Dublyaj** (top hero → keng katalog) — eng katta qadriyat qo'shish
2. **Katalog kengaytirish** (50 → 300+ sarlavha)
3. **DRM, offline download, ko'p-profil, catch-up**
4. **To'liq admin CMS, ML tavsiyalar, Mini App, broadcast**

---

*Ushbu reja TZ v1.1 va MVP byudjet modeli asosida, "$50k / 3–4 oy / hamma yuza" cheklovi uchun optimallashtirilgan. Barcha yuzalar (mobil, veb, admin, Telegram) kiritilgan; yagona murosa — kontent subtitr-birinchi va kichik katalog bilan boshlanadi.*
