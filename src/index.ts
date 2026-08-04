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
        menu_button: { type: "web_app", text: "🎬 Kino", web_app: { url: config.webappUrl } },
      });
    } catch (e) {
      console.warn("Menyu tugmasini o'rnatib bo'lmadi:", e);
    }
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
