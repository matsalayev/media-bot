# Kino — Telegram-native Reels + Paid Content Platform

Telegram bot + Mini App. Foydalanuvchi Mini App'da **qisqa reels**larni ko'radi; yoqqanini "to'liq ochish" bosganda video **to'g'ridan-to'g'ri Telegram chatiga** yuboriladi. To'lov — **Telegram Stars** (paid-unlock) yoki obuna. Video Telegram'da saqlanadi (`file_id`) — alohida striming serveri kerak emas.

## Stack
- **Bot:** grammY (TypeScript)
- **Server/API + Mini App:** Fastify (statik + REST)
- **DB:** Prisma + SQLite (lokal) → PostgreSQL (production)
- **To'lov:** Telegram Stars (`XTR`) — `createInvoiceLink` + `openInvoice`
- **Auth:** Telegram Mini App `initData` (HMAC tekshiruvi)

## Loyiha tuzilishi
```
src/
  config.ts     # .env sozlamalari
  db.ts         # Prisma client
  auth.ts       # Mini App initData tekshiruvi (HMAC)
  bot.ts        # grammY bot: start, admin /add, Stars to'lov, video yetkazish
  server.ts     # Fastify: Mini App + /api/reels, /api/unlock, /api/view, /media/reel
  index.ts      # ishga tushirish (server + bot long-polling)
webapp/         # Mini App (index.html, app.js, style.css) — vertikal reels feed
prisma/schema.prisma
```

## Ishga tushirish (lokal)

1. **Bog'liqliklarni o'rnatish**
   ```bash
   npm install
   ```
2. **.env yaratish** (`.env.example` dan nusxa oling):
   ```bash
   cp .env.example .env
   ```
   To'ldiring:
   - `BOT_TOKEN` — @BotFather'dan
   - `ADMIN_IDS` — sizning Telegram ID'ingiz (masalan @userinfobot dan oling)
   - `WEBAPP_URL` va `PUBLIC_URL` — Mini App'ning **public HTTPS** manzili (pastga qarang)
3. **Bazani tayyorlash**
   ```bash
   npm run prisma:generate
   npm run db:push
   ```
4. **Ishga tushirish**
   ```bash
   npm run dev
   ```

### Mini App uchun public HTTPS
Telegram Mini App'ni ochish uchun HTTPS URL kerak. Lokal test uchun tunnel ishlating:
```bash
# masalan cloudflared yoki ngrok
cloudflared tunnel --url http://localhost:3000
```
Chiqqan `https://...` manzilini `.env` dagi `WEBAPP_URL` va `PUBLIC_URL` ga yozing va qayta ishga tushiring. Botni /start qilib, menyu tugmasi orqali Mini App ochiladi.

## Kontent qo'shish

**Admin (to'g'ridan-to'g'ri nashr):** `/add` → reels video → to'liq video → `Sarlavha | narx` (masalan `Film | 50`; `0` = bepul). Darhol feed'da.

**Creator (istalgan foydalanuvchi, moderatsiya bilan):** `/upload` → reels → to'liq video → `Sarlavha | narx`. Kontent `pending` bo'ladi va adminga tasdiqlashga yuboriladi.

### Mini App profil ekrani (bot buyruqlarisiz)
Feed'da chap-yuqoridagi **👤** tugma → Profil ekrani:
- **Obuna** — holat / "Obuna bo'lish" tugmasi (Stars)
- **Creator daromadi** — jami ishlangan, mavjud balans, **Yechish** tugmasi
- **➕ Video joylash** — ilova ichida reel + to'liq video + sarlavha + narx → yuklanadi (moderatsiyaga)
- **Mening kontentim** — status (🟢🟡🔴) + 👁 ko'rish · 🔓 ochilish · 💰 daromad

Yuklashda videolar `STORAGE_CHANNEL_ID` kanaliga (bot admin bo'lishi kerak) yoki birinchi adminga yuborilib `file_id` olinadi. Cloud Bot API cheklovi: fayl **maks. 50MB** (kattaroq uchun — local Bot API server, roadmap).

### Obuna (Stars)
- `/subscribe` — obuna bo'lish (`SUB_PRICE_STARS` ⭐ / `SUB_DAYS` kun) → to'lov tugmasi
- `/mysub` — obuna holati (amal muddati)
- Mini App'da yuqorida **obuna pill** tugmasi (obuna narxi bilan) — bosilganda Stars invoice ochiladi
- Obuna faol bo'lsa **barcha kontent** per-item to'lovsiz ochiladi; muddat tugagach avtomatik nofaol

### Creator ekonomikasi (buyruqlar)
- `/upload` — video joylash (moderatsiyadan o'tadi)
- `/mycontent` — kontent + statistika (ko'rish, ochilish, daromad)
- `/earnings` — daromad va balans
- `/withdraw` — balansni yechish so'rovi (min `MIN_WITHDRAW_STARS`)

### Payout ijrosi (admin)
- Creator `/withdraw` qilganda admin(lar)ga **✅ To'landi / ❌ Rad** tugmalari yuboriladi
- `/payouts` — barcha kutayotgan yechish so'rovlari (har birida tugmalar)
- **To'landi:** status `paid`, creator xabar oladi (haqiqiy pul o'tkazish admin tomonidan tashqi usulda)
- **Rad:** status `rejected`, mablag' creator balansiga qaytadi, creator xabar oladi

### Moderatsiya (admin)
- Yangi `/upload` bo'lganda admin(lar)ga reel + **✅ Tasdiqlash / ❌ Rad etish** tugmalari yuboriladi
- `/pending` — kutayotgan kontent ro'yxati
- Tasdiqlanganda kontent feed'ga chiqadi va creator xabar oladi

### Daromad qanday ishlaydi
Foydalanuvchi kontentni **Stars** evaziga ochganda:
- Creator `CREATOR_SHARE_PERCENT`% oladi (standart **70%**)
- Platforma qolgan komissiyani oladi (standart **30%**)
- Har ochilish `Unlock.creatorEarned` / `platformFee` sifatida yoziladi
- Balans `available = jami_daromad − yechilgan/so'ralgan`

> Eslatma: hozircha creator faqat **paid-unlock**dan daromad oladi (real pul kirimidan). Bepul kontentni ko'rishdan daromad — reklama/creator-fund modeli qo'shilgach (roadmap).

## Foydalanuvchi oqimi
1. Botni ochadi → menyu tugmasi → Mini App
2. Reels'ni vertikal scroll qiladi (avtoijro, bosib ovozni yoqadi)
3. "To'liq ochish" → bepul/obunali/ochilgan bo'lsa darhol chatga yuboriladi; aks holda **Stars invoice** ochiladi → to'lovdan so'ng video chatga keladi

## Production (server)
1. Serverga kodni joylang, `npm install --production` emas — build kerak: `npm install && npm run build`, so'ng `npm start`
2. `.env` da `DATABASE_URL` ni PostgreSQL'ga o'zgartiring va `prisma/schema.prisma` da `provider = "postgresql"` qiling, `npm run db:push`
3. `WEBAPP_URL`/`PUBLIC_URL` — domeningiz (HTTPS, reverse-proxy/TLS orqali, masalan Nginx + Let's Encrypt)
4. Katta fayllarni bot orqali yuklash uchun (2GB gacha) — **local Bot API server** yoki MTProto tavsiya etiladi (keyingi bosqich)

## SIZ (Azizbek) ta'minlaysiz
- **Bot token** (@BotFather)
- **Server** (kod joylanadigan, public HTTPS domenli)
- Admin Telegram ID(lar)

## Keyingi bosqich (roadmap)
- [x] **Creator upload** — istalgan foydalanuvchi kontent yuklaydi → moderatsiya → nashr ✅
- [x] **Moderatsiya** — admin tasdiq/rad (inline tugmalar), `/pending` ✅
- [x] **Creator daromadi** — paid-unlock ulushi + platforma komissiyasi, `/earnings`, `/withdraw` ✅
- [x] **Obuna** oqimi — Stars orqali, `/subscribe` + `/mysub` + Mini App pill; obuna davomida barcha kontent cheksiz ochiladi ✅
- [x] **Payout ijrosi** — admin `/payouts` + inline ✅/❌ (so'rov kelganda ham); rad etilsa mablag' balansga qaytadi ✅
- [x] **Creator/obuna UI Mini App ichida** — profil ekrani: obuna, balans/daromad, yechish, mening kontentim + ilova ichida video yuklash ✅
- [ ] Bepul kontent uchun view-asosli daromad (reklama / creator-fund)
- [ ] Anti-fraud (view/unlock firibgarligi), rad sababini kiritish
- [ ] Katta fayl yuklash (local Bot API / MTProto)
- [ ] Reel media proxy'ga Range (seek) + kesh; webhook rejimi; admin veb-panel

> Model tafsilotlari va biznes hujjatlari: shu papkadagi `TZ-*.md`, `MVP-Byudjet-*.md` fayllar.
