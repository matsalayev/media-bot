import { config } from "./config";
import { prisma } from "./db";
import { bot, notifyAdmins } from "./bot";
import { tronEnabled, hotWalletAddress } from "./tron";
import { buildServer } from "./server";
import { startPaymentWatcher } from "./watcher";

// Bitta ham stray promise butun jarayonni o'ldirmasin; adminni ogohlantiramiz
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
  notifyAdmins("⚠️ unhandledRejection: " + String((reason as Error)?.stack ?? reason).slice(0, 400)).catch(() => {});
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  notifyAdmins("🔥 uncaughtException: " + String(err?.stack ?? err).slice(0, 400)).catch(() => {});
  setTimeout(() => process.exit(1), 1500); // alert ketsin, keyin systemd qayta tiklaydi
});

async function main() {
  // 0) SQLite WAL + busy_timeout — parallel yozuvlar (feed/watcher) SQLITE_BUSY bermasin
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
  // Ochiq (pending) to'ldirishlar summasi noyob bo'lishi shart — bir on-chain to'lov
  // noto'g'ri userga tushmasligi uchun (partial unique index; Prisma buni ifodalay olmaydi).
  await prisma
    .$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "deposit_pending_amount" ON "Deposit"("expectedAmount") WHERE "status" = 'pending';`,
    )
    .catch((e) => console.warn("deposit_pending_amount index:", (e as Error).message));

  // To'lov rejimi
  if (config.paymentMode === "tron") {
    if (tronEnabled()) console.log(`💳 Native TRON to'lov yoqilgan. Hot-wallet: ${hotWalletAddress()}`);
    else console.log("💤 TRON hot-wallet sozlanmagan — to'lov/yechish o'chiq (.env: TRON_HOTWALLET_*).");
  } else {
    console.log("⭐ To'lov rejimi: Telegram Stars.");
  }

  // 1) Bot ma'lumotini oldindan yuklash (share-link'lar uchun botInfo.username kerak)
  await bot.init();

  // 1) Mini App + API serverini ishga tushirish
  const app = buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(
    `🌐 Mini App + API: http://0.0.0.0:${config.port}   (public: ${config.webappUrl || "WEBAPP_URL o'rnatilmagan"})`,
  );

  // 2) Chat menyu tugmasini Mini App'ga bog'lash
  if (config.webappUrl) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: { type: "web_app", text: "Media", web_app: { url: config.webappUrl } },
      });
    } catch (e) {
      console.warn("Menyu tugmasini o'rnatib bo'lmadi:", e);
    }
  }

  // 2b) Buyruqlar menyusi ("/" avtomatik to'ldirish) — adminlarga admin buyruqlari ham
  const userCommands = [
    { command: "start", description: "Boshlash / til" },
    { command: "upload", description: "Video joylash" },
    { command: "mycontent", description: "Mening kontentim" },
    { command: "earnings", description: "Daromad (USDT)" },
    { command: "wallet", description: "TRC20 hamyon ulash" },
    { command: "withdraw", description: "USDT yechish" },
    { command: "terms", description: "Foydalanish shartlari" },
    { command: "lang", description: "Tilni o'zgartirish" },
    { command: "help", description: "Yordam" },
  ];
  const adminCommands = [
    ...userCommands,
    { command: "admin", description: "Admin panel — barcha buyruqlar" },
    { command: "add", description: "Video qo'shish (admin)" },
    { command: "balance", description: "Balans + komissiya + hot-wallet" },
    { command: "hotwallet", description: "Hot-wallet manzili/balansi" },
    { command: "payouts", description: "Payout tarixi" },
    { command: "complaints", description: "Aldov shikoyatlari" },
    { command: "reports", description: "Shikoyatlar (moderatsiya)" },
  ];
  try {
    await bot.api.setMyCommands(userCommands);
    for (const id of config.adminIds) {
      await bot.api
        .setMyCommands(adminCommands, { scope: { type: "chat", chat_id: Number(id) } })
        .catch(() => {});
    }
  } catch (e) {
    console.warn("Buyruqlar menyusini o'rnatib bo'lmadi:", e);
  }

  // 2c) To'lov kuzatuvchisi — faqat TRON rejimida (Stars'da kerak emas)
  if (config.paymentMode === "tron") startPaymentWatcher();

  // 3) Botni ishga tushirish (long polling)
  await bot.start({
    onStart: (bi) => console.log(`🤖 Bot @${bi.username} ishga tushdi (long polling)`),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
