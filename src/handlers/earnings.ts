import { Bot, InlineKeyboard } from "grammy";
import { MyContext, bot as botInstance, userLang, isAdmin, notifyAdmins } from "../bot-core";
import { config } from "../config";
import { prisma } from "../db";
import { t, normLang } from "../i18n";
import { starsToUsdt, fmtUsd } from "../pricing";
import { creatorStarsBalance } from "./payments";
import { isTrc20Address } from "../tron";

export async function requestStarsPayout(telegramId: string, lang?: string): Promise<{ ok: boolean; message: string }> {
  const l = normLang(lang);
  const u = await prisma.user.findUnique({ where: { telegramId } });
  if (!u) return { ok: false, message: t(l, "startFirst") };
  if (u.isBanned) return { ok: false, message: t(l, "banned") };
  const pending = await prisma.payout.findFirst({ where: { userId: u.id, status: { in: ["requested", "processing"] } } });
  if (pending) return { ok: false, message: t(l, "payoutPending") };
  const b = await creatorStarsBalance(u.id);
  if (b.available < config.minWithdrawStars)
    return { ok: false, message: t(l, "withdrawMinStars", { min: config.minWithdrawStars, available: Math.max(0, b.available) }) };
  const payout = await prisma.payout.create({ data: { userId: u.id, amountStars: b.available, status: "requested" } });
  const kb = new InlineKeyboard().text("✅ To'landi", `spayout_ok:${payout.id}`).text("❌ Rad", `spayout_no:${payout.id}`);
  await notifyAdmins(
    `⭐ Stars yechish #${payout.id}\n@${u.username ?? u.telegramId}\n${b.available} ⭐ (~$${fmtUsd(starsToUsdt(b.available))})\n\nQo'lda tarqating (Fragment/karta), keyin «To'landi» bosing.`,
    kb,
  );
  return { ok: true, message: t(l, "withdrawRequested", { amount: b.available }) };
}

export async function setTonWallet(
  telegramId: string,
  address: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; address?: string }> {
  const l = normLang(lang);
  const norm = (address ?? "").trim();
  if (!isTrc20Address(norm)) {
    return { ok: false, message: t(l, "walletInvalid") };
  }
  await prisma.user.upsert({
    where: { telegramId },
    update: { tonWallet: norm },
    create: { telegramId, tonWallet: norm, isAdmin: isAdmin(telegramId) },
  });
  return { ok: true, message: t(l, "walletSaved", { addr: norm }), address: norm };
}

export function register(bot: Bot<MyContext>) {
  bot.command("mycontent", async (ctx) => {
    if (!ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (!creator) return ctx.reply(t(lang, "startFirst"));
    const list = await prisma.content.findMany({ where: { creatorId: creator.id }, orderBy: { id: "desc" }, take: 20 });
    if (!list.length) return ctx.reply(t(lang, "noContent"));
    const earned = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarned: true }, where: { refunded: false, content: { creatorId: creator.id } } });
    const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarned ?? 0]));
    const lines = list.map((c) => `«${c.title}» — 👁 ${c.viewCount} · 🔓 ${c.unlockCount} · ❤️ ${c.likeCount} · 💰 ${em.get(c.id) ?? 0} ⭐`);
    await ctx.reply("📂\n\n" + lines.join("\n"));
  });

  bot.command("earnings", async (ctx) => {
    if (!ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (!creator) return ctx.reply(t(lang, "startFirst"));
    const b = await creatorStarsBalance(creator.id);
    await ctx.reply(
      t(lang, "earningsStars", {
        earned: b.earned,
        available: Math.max(0, b.available),
        min: config.minWithdrawStars,
        share: config.creatorSharePercent,
        plat: 100 - config.creatorSharePercent,
      }),
    );
  });

  bot.command("wallet", async (ctx) => {
    if (!ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    if (config.paymentMode !== "tron") {
      return void ctx.reply(t(lang, "walletStarsInfo"));
    }
    const arg = (ctx.match ?? "").toString().trim();
    if (!arg) {
      const u = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
      const current = u?.tonWallet ? t(lang, "walletCurrent", { addr: u.tonWallet }) : "";
      return ctx.reply(t(lang, "walletPrompt", { current }));
    }
    const res = await setTonWallet(String(ctx.from.id), arg, lang);
    await ctx.reply(res.message);
  });

  bot.command("withdraw", async (ctx) => {
    if (!ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    const res = await requestStarsPayout(String(ctx.from.id), lang);
    await ctx.reply(res.message);
  });
}
