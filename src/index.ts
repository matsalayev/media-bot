import { config } from "./config";
import { bot } from "./bot";
import { buildServer } from "./server";

async function main() {
  // 0) Bot ma'lumotini oldindan yuklash (share-link'lar uchun botInfo.username kerak)
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
    { command: "wallet", description: "TON hamyonni ulash" },
    { command: "withdraw", description: "USDT yechish" },
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

  // 3) Botni ishga tushirish (long polling)
  await bot.start({
    onStart: (bi) => console.log(`🤖 Bot @${bi.username} ishga tushdi (long polling)`),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
