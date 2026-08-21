import { Bot } from "grammy";
import { MyContext, upsertUser, userLang, langKeyboard, sendWelcome, sendTerms, isAdmin } from "../bot-core";
import { prisma } from "../db";
import { t, normLang, Lang } from "../i18n";

export function register(bot: Bot<MyContext>) {
  bot.command("start", async (ctx) => {
    if (!ctx.from) return;
    const user = await upsertUser({
      id: String(ctx.from.id),
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      language_code: ctx.from.language_code,
    });
    const payload = (ctx.match ?? "").toString().trim();
    if (!user.lang) {
      await ctx.reply("Tilni tanlang / Выберите язык / Choose language:", { reply_markup: langKeyboard() });
    } else if (!user.acceptedTerms) {
      await sendTerms(ctx, normLang(user.lang));
    } else if (payload === "upload") {
      ctx.session.step = "reel";
      ctx.session.mode = "creator";
      ctx.session.draft = {};
      await ctx.reply(t(normLang(user.lang), "uploadStart"));
    } else {
      await sendWelcome(ctx, normLang(user.lang));
    }
  });

  bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
    const lang = ctx.match[1] as Lang;
    let u: { acceptedTerms: boolean } | null = null;
    if (ctx.from) u = await prisma.user.update({ where: { telegramId: String(ctx.from.id) }, data: { lang } }).catch(() => null);
    await ctx.answerCallbackQuery(t(lang, "langSet"));
    await ctx.editMessageReplyMarkup().catch(() => {});
    if (u && !u.acceptedTerms) await sendTerms(ctx, lang);
    else await sendWelcome(ctx, lang);
  });

  bot.callbackQuery("terms:accept", async (ctx) => {
    if (!ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    await prisma.user.update({ where: { telegramId: String(ctx.from.id) }, data: { acceptedTerms: true } }).catch(() => {});
    await ctx.answerCallbackQuery(t(lang, "termsAccepted"));
    await ctx.editMessageReplyMarkup().catch(() => {});
    await sendWelcome(ctx, lang);
  });

  bot.command("terms", async (ctx) => ctx.reply(t(await userLang(String(ctx.from?.id)), "terms")));

  bot.command("lang", (ctx) => ctx.reply("Tilni tanlang / Выберите язык / Choose language:", { reply_markup: langKeyboard() }));

  bot.command("help", async (ctx) => ctx.reply(t(await userLang(String(ctx.from?.id)), "help")));

  bot.command("admin", async (ctx) => {
    if (!ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    if (!isAdmin(ctx.from.id)) return ctx.reply(t(lang, "help"));
    await ctx.reply(t(lang, "adminPanel"));
  });
}
