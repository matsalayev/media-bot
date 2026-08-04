# «Kino» MVP — Byudjet va Resurs Hisoboti

> **Hujjat turi:** MVP moliyaviy hisob-kitobi (jamoa + server + kontent + break-even)
> **Sana:** 2026-07-24 · **Valyuta:** 1 USD = 12 700 so'm (2026)
> **Asos:** TZ v1.1 (tasdiqlangan stack) + 5-agentli xarajat-modellashtirish workflow
> **Muhim:** Bu rejalashtirish darajasidagi baholar (low–base–high). Yakuniy raqamlar mahalliy sotuvchilar (server, dublyaj-studiya, litsenziar) bilan tasdiqlanishi kerak.

---

## 📌 Umumiy xulosa (Executive Summary)

| Ko'rsatkich | **BASE** (real) | **LEAN** (optimallashtirilgan) |
|-------------|-----------------|-------------------------------|
| Launch'gacha jami naqd | **~$821 000** (~10.4 mlrd so'm) | **~$415 000** (~5.3 mlrd so'm) |
| Qurilish narxi (CapEx) | ~$502 000 (~6.4 mlrd) | ~$252 000 (~3.2 mlrd) |
| Oylik operatsion (burn) | ~$53 000/oy (~674 mln so'm) | ~$27 000/oy (~343 mln so'm) |
| Break-even (pullik obunachi) | **~25 300** | **~13 000** |
| Jamoa (qurilish / run) | 8.5 / 5.3 FTE | 7 / ~4.5 FTE |
| MVP muddati | ~5 oy | ~4 oy |

**Bitta jumlada:** MVP'ni **texnik jihatdan** qurish arzon (jamoa ~$75k, server ~$1.7k/oy) — chunki O'zbekiston IT maoshlari past va TAS-IX ichki trafik ~bepul. **Lekin butun byudjetni KONTENT belgilaydi:** seed kontent CapEx'ning **84%i**, oylik burn'ning **75%i**. Break-even yuqori (~25k obunachi), chunki ARPU juda past (~$2.1 sof/obunachi). **Eng katta richag — "subtitr-birinchi, dublyaj-keyin" strategiyasi** (~$360k tejaydi).

---

## ⚙️ Asosiy taxminlar (Assumptions)

| Parametr | Qiymat |
|----------|--------|
| Valyuta kursi | 1 USD = 12 700 so'm |
| MVP qurilish muddati | ~5 oy (diapazon 4–7) |
| Joylashuv | Toshkent (2026 UZ IT bozori maoshlari) |
| Premium narx | 29 000 so'm/oy (~$2.28); gateway'dan keyin sof ~$2.1 |
| Seed katalog | ~300 sarlavha (turk/koreys/hind + mahalliy) |
| Hosting | O'z serveri, UZ ichida, TAS-IX (ichki egress ~bepul) |
| Stack | TZ v1.1: NestJS, Next.js×2, Flutter, grammY, FFmpeg+Shaka, PostgreSQL/Redis/Meilisearch/MinIO |
| PM/mahsulot | Asoschi(lar) qoplaydi (alohida PM maoshi yo'q) |

---

## 1️⃣ Jamoa va maoshlar (Team & Salaries)

MVP'ni ~5 oyda qurish uchun **~8.5 FTE** (to'liq stavka ekvivalenti) jamoa, keyin operatsiya uchun **~5.3 FTE**. Maoshlar 2026 Toshkent bozori: senior ~$1 500–3 500, mid ~$800–1 800, junior ~$400–900 (oylik gross). Payrollga ~12% ish beruvchi ijtimoiy solig'i qo'shilgan.

### Qurilish jamoasi (5 oy)

| Rol | Stavka/oy | To'liq (×1.12) | Izoh |
|-----|-----------|----------------|------|
| Tech Lead / Backend arxitektor (senior) | $3 000 | $3 360 | Arxitektura, code review, NestJS yadro |
| Backend muhandis, NestJS (mid) | $1 500 | $1 680 | API, to'lov (Payme/Click), OTP, obuna |
| Frontend veb, Next.js (mid) | $1 400 | $1 568 | User veb + reels feed |
| Admin frontend, Next.js (mid) | $1 200 | $1 344 | Admin/CMS; run'da veb bilan birlashadi |
| Mobil, Flutter (mid-senior) | $1 800 | $2 016 | iOS+Android bitta kod; run'da 0.5 FTE |
| **DevOps / Media-infra (senior)** ⭐ | $2 200 | $2 464 | **Kritik**: FFmpeg+Shaka HLS pipeline, token, bare-metal |
| QA (mid) | $900 | $1 008 | Manual + auto; run'da 0.5 FTE |
| UI/UX dizayner (mid) | $1 100 | $1 232 | Front-loaded; run'da ~0.3 FTE |
| Telegram bot, grammY (junior, 0.5) | $700 | $392 | Part-time; run'da backend'ga qo'shiladi |
| Recruiting / onboarding (bir martalik) | — | $3 000 | Agentlik, jihoz, ramp (~8 hire) |

**Qurilish jami:** ~$15 064/oy × 5 oy + $3 000 = **~$78 300** (base). Diapazon: **low ~$51k** (4 oy, 7 FTE) / **high ~$121k** (7 oy, +backend+data eng).

**Run-faza (launch'dan keyin):** ~$10 842/oy (~5.3 FTE) — tech lead, backend, full-stack veb+admin, 0.5 mobil, DevOps/media, 0.5 QA, 0.3 UX.

> ⭐ **Kritik risk:** FFmpeg/Shaka media-infra mutaxassisi O'zbekistonda kam. Mintaqaviy remote kontraktor kerak bo'lishi mumkin (+$500–1 000/oy) — bu high case'ga suradi. Agar pullik PM kerak bo'lsa: +$1 500–2 000/oy.

---

## 2️⃣ Server va infratuzilma (Infrastructure)

Ikki yo'l: **(A) COLO/ijaraga olingan serverlar** (~nol CapEx, oylik OpEx) yoki **(B) o'z serverini sotib olish** (katta CapEx). **Lean MVP uchun COLO tavsiya etiladi** — naqd saqlaydi, import/logistika riski yo'q, GPU faqat backlog uchun ijaraga olinadi.

### COLO yo'li (TAVSIYA)

| Komponent | Konfiguratsiya | $/oy |
|-----------|----------------|------|
| App / k3s node'lar (3) | 16c/32t, 64GB, NVMe | $270 |
| PostgreSQL primary + replica | 16c, 128GB, RAID10 | $360 |
| Redis | 8c, 32GB | $70 |
| CPU transcode worker (2) | 32c/64t, 128GB | $340 |
| MinIO / S3 storage | ~40 TB raw (11.9 TB usable) | $300 |
| Nginx edge cache | 8c, 32GB, NVMe | $90 |
| TAS-IX port + intl uplink | peering + 100–200 Mbps | $200 |
| Xorij DR/backup (Backblaze B2) | ~12 TB masters+DB | $72 |
| **Steady-state jami** | | **~$1 702/oy** |
| GPU node (faqat backlog, ~1 oy) | NVENC, ~10 kunlik burst | +$350 |
| COLO setup (bir martalik) | provisioning, hardening | $1 500 |

**Storage matematikasi:** ABR ladder (240p–1080p) ~9.4 Mbps ≈ 4.2 GB/soat. ~300 sarlavha × ~5.1 soat ≈ 1 520 soat → ~6.4 TB deliverable + ~5.5 TB master + reels ≈ ~11.9 TB usable (~25 TB raw).

**Backlog transcode:** ~1 520 soat. CPU-only 3 worker'da ~42–85 kun; bitta GPU'da ~10 kun → **GPU'ni faqat burst uchun ijaraga oling** ($350 vs $6 500 sotib olish).

> **BUY alternativa** (tavsiya emas): ~$59 400 bir martalik CapEx + ~$1 122/oy. COLO'ga nisbatan payback ~24–36 oy. 5 oylik MVP uchun juda ko'p naqdni bog'laydi.

> 💡 **TAS-IX — asosiy iqtisodiy richag:** UZ foydalanuvchilarga striming egress ~bepul, shuning uchun bandwidth katta xarajat EMAS (xorij-CDN modelidan farqli).

---

## 3️⃣ Uchinchi-tomon, SaaS va operatsion (Third-party)

Self-hosted + free-tier stack tufayli bu kategoriya **arzon** (~$525/oy). Bir martalik ~$2 550.

| Element | Asos | $ |
|---------|------|---|
| SMS OTP (Eskiz.uz) | ~8 000 SMS/oy × ~50 so'm | $31/oy |
| To'lov gateway (Payme/Click) | ~1.5% aylanmadan | $34/oy |
| Apple Developer | $99/yil | $8/oy |
| Google Play | bir martalik | $25 |
| Domain + DNS | .uz + .com, Cloudflare free | $4/oy |
| TLS (Let's Encrypt) | bepul | $0 |
| Transaksion email | past hajm | $15/oy |
| Push (FCM/APNs), TMDB | bepul | $0 |
| CI/CD + Git (GitHub) | ~5 seat | $25/oy |
| Figma | 2 editor | $30/oy |
| Kompaniya ro'yxati (OOO) | davlat bojlari | $200 |
| Buxgalteriya (outsource) | Toshkent | $150/oy |
| OFD / fiskalizatsiya | virtual kassa | $20/oy + $150 |
| Personal Data Law ro'yxati | davlat bojlari | $100 |
| **Kontent-huquq yuristi** | ~20–40 soat ko'rik | $1 800 |
| Coworking (ixtiyoriy) | 2 stol | $150/oy |
| Kontingensiya (~12%) | bufer | $275 + $57/oy |

> **Scaling e'tibor:** faqat **SMS OTP** va **gateway fee** foydalanuvchi bilan o'sadi. Telegram-login + sessiya saqlash bilan SMS hajmini kamaytiring (eng katta o'suvchi operatsion chiziq).

---

## 4️⃣ Kontent — litsenziya + dublyaj (ENG KATTA xarajat)

Kontent eng katta va eng o'zgaruvchan xarajat. ~300 sarlavha UZ-hududi uchun **litsenziya arzon** (kichik bozor), lekin **dublyaj/subtitr hukmron** — chunki bitta serial mavsumi 15–75+ soat.

| Element | Asos | Bir martalik $ |
|---------|------|----------------|
| Litsenziya — filmlar | ~200 film × ~$325 | $65 000 |
| Litsenziya — seriallar/mavsumlar | ~70 mavsum × ~$1 700 | $120 000 |
| Litsenziya — mahalliy UZ | ~30 sarlavha × ~$530 | $16 000 |
| **Dublyaj — hero sarlavhalar** | ~400 soat × ~$275/soat | $110 000 |
| Subtitr — to'liq katalog | ~1 300 soat × ~$65/soat | $85 000 |
| Lokalizatsiya QC + metadata + poster | 300 sarlavha | $24 000 |
| **Bir martalik jami (base)** | | **~$420 000** |
| Oylik refresh — litsenziya | ~20 yangi/oy × ~$750 | $15 000/oy |
| Oylik refresh — dublyaj/subtitr | ~60s dub + ~150s sub | $25 000/oy |
| **Oylik refresh jami** | | **~$40 000/oy** |

**Diapazon (bir martalik):** low **~$195k** (subtitr-birinchi, dublyaj faqat ~200 soat, rev-share litsenziya) / base **~$420k** / high **~$860k** (agressiv dublyaj).

> 🎯 **ENG KATTA RICHAG — dublyaj yoki subtitr?** Butun ~1 700 soatni **subtitr** qilish ~$110k, to'liq **dublyaj** ~$470k+ — **~$360k farq**. **Tavsiya:** launch'da 100% subtitr, faqat top ~20–25% hero soatni dublyaj, qolganini daromad o'sgach.
>
> ⚠️ **Break-even'ga ta'siri:** faqat oylik kontent refresh (~$40k) $2.1/obunachi'da **~19 000 obunachi**ni talab qiladi — belgilangan xarajatlardan OLDIN. Shuning uchun refresh tempini bosqichlang.

---

## 5️⃣ Konsolidatsiyalangan moliyaviy model

### CapEx — launch'gacha bir martalik (base)

| Element | $ | % |
|---------|---|---|
| Qurilish jamoasi (5 oy, 8.5 FTE) | $75 300 | 15% |
| Recruiting / onboarding | $3 000 | 1% |
| Seed kontent — litsenziya | $201 000 | 40% |
| Seed kontent — dublyaj+subtitr+QC | $219 000 | 44% |
| Infra setup (COLO) | $1 500 | <1% |
| Huquqiy + ro'yxatlar | $2 550 | <1% |
| **CapEx JAMI** | **~$502 350** | **100%** |

### Oylik OpEx — launch'dan keyin (base)

| Element | $/oy | % |
|---------|------|---|
| Run jamoa (~5.3 FTE) | $10 842 | 20% |
| Infra (COLO steady) | $1 702 | 3% |
| Uchinchi-tomon / SaaS | $525 | 1% |
| **Kontent refresh** | **$40 000** | **75%** |
| **Oylik burn JAMI** | **~$53 069** | **100%** |

**Launch'gacha jami naqd (base):** CapEx $502k + 6 oylik runway ($318k) = **~$820 764** (~10.4 mlrd so'm).

---

## 6️⃣ Break-even va ssenariylar

Sof ~$2.1/pullik obunachi/oy'da oylik OpEx'ni qoplash uchun kerak bo'lgan obunachilar:

| Ssenariy | Pullik obunachi | Oylik daromad | Oylik xarajat | Sof natija |
|----------|-----------------|---------------|---------------|-----------|
| Lean | 2 000 | $4 200 | $53 069 | **−$48 869** |
| Base | 10 000 | $21 000 | $53 069 | **−$32 069** |
| **Break-even** | **~25 271** | $53 069 | $53 069 | **$0** |
| Growth | 40 000 | $84 000 | $53 069 | **+$30 931** |

> **Ochiq haqiqat:** break-even ~**25 300 pullik obunachi** — bu YUQORI, chunki ARPU juda past ($2.28 gross). Faqat kontent refresh ~19 000 obunachi'ni talab qiladi. **Miqyos — hamma narsa.** Shuning uchun 6 emas, **12–18 oylik runway** va marketing byudjeti kerak.

---

## 7️⃣ Xarajatni kamaytirish tavsiyalari

1. **Subtitr-birinchi, dublyaj-keyin** — butun katalogni subtitr, faqat top ~20–25% hero'ni dublyaj. **~$360k tejaydi** (eng katta CapEx kamaytirish).
2. **Katalogni bosqichlang** — kamroq, yuqori-signalli sarlavha bilan launch; upfront minimum-guarantee o'rniga **rev-share / paket** litsenziya (past UZ ARPU sababli). $201k litsenziya va $40k/oy refresh'ni kamaytiradi.
3. **COLO, sotib olmang** — ~$1.7k/oy ijaraga, GPU faqat ~10 kunlik backlog uchun. ~$59k CapEx va import riskidan qochadi.
4. **Run-jamoani lean saqlang** (~5.3 FTE), PM/mahsulotni asoschi qoplasin. Admin'ni veb'ga qo'shing, mobil/QA/UX'ni part-time. Media-infra mutaxassisi uchun +$500–1 000/oy bufer.
5. **Ikki o'suvchi operatsion chiziqni jilovlang** — Telegram-login + sessiya saqlash bilan SMS-OTP hajmini kamaytiring; gateway fee'ni aylanmaning ~1.5%i sifatida modellang.
6. **Milestone'larga qarshi kapital jalb qiling** — launch'gacha ~$821k (base) yoki ~$415k (lean). Break-even ~25k (yoki lean ~13k) obunachi bo'lgani uchun **12–18 oylik runway** ta'minlang.

---

## 8️⃣ Xulosa va ogohlantirishlar

- **Texnik qurilish arzon, kontent qimmat.** Jamoa+server ~$155k (base CapEx+6oy), kontent ~$660k — nisbat ~1:4. Bu striming biznesining tabiati.
- **Lean yo'l real:** subtitr-birinchi + bosqichli katalog + COLO + lean jamoa bilan launch'gacha ~$415k va break-even ~13k obunachi'ga tushadi — ancha erishilarli.
- **Eng katta noaniqliklar:** (1) dublyaj hajmi/tarifi, (2) litsenziya shartlari (flat vs rev-share), (3) media-infra mutaxassisini topish. Bularni birinchi bo'lib mahalliy sotuvchilar bilan tasdiqlang.
- **Bu baholar** rejalashtirish uchun; aniq takliflar (server-provayder, dublyaj-studiya, distributorlar) bilan ±20–30% o'zgarishi mumkin.

---

*Ushbu hisobot TZ v1.1 (tasdiqlangan stack) va 5-agentli xarajat-modellashtirish (jamoa, infra, 3rd-party, kontent + CFO sintezi) asosida tuzildi. Barcha raqamlar 2026 O'zbekiston sharoiti uchun.*
