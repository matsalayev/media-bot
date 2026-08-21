import { Bot, InlineKeyboard } from "grammy";
import { MyContext, bot as botInstance, isAdmin, notifyAdmins } from "../bot-core";
import { config } from "../config";
import { prisma } from "../db";
import { t, normLang } from "../i18n";
import { usdtToStars } from "../pricing";
import { recordUnlock, isCantDeliver } from "./content";
import { buyerVerified, creditedBonusStars } from "../incentives";

function starsShare(priceStars: number, sharePercent = config.creatorSharePercent): { creatorEarned: number; platformFee: number } {
  const p = Math.min(Math.max(sharePercent, 0), 100);
  const creatorEarned = Math.floor((priceStars * p) / 100);
  return { creatorEarned, platformFee: priceStars - creatorEarned };
}

export async function createStarsInvoice(
  contentId: number,
  _buyerTgId: string,
): Promise<{ ok: boolean; link?: string; message?: string; stars?: number }> {
  const content = await prisma.content.findFirst({ where: { id: contentId, status: "published" } });
  if (!content) return { ok: false, message: "not found" };
  if (!content.videoFileId) return { ok: false, message: "kontent to'liq video yo'q" };
  const stars = content.priceStars || usdtToStars(content.priceUsdt);
  if (stars <= 0) return { ok: false, message: "bepul" };
  try {
    const link = await botInstance.api.createInvoiceLink(
      content.title.slice(0, 32) || "Video",
      `🎬 ${content.title}`.slice(0, 255),
      `buy:${content.id}`,
      "",
      "XTR",
      [{ label: content.title.slice(0, 32) || "Video", amount: stars }],
    );
    return { ok: true, link, stars };
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message ?? e).slice(0, 150) };
  }
}

export async function creatorStarsBalance(
  userId: number,
): Promise<{ earned: number; reserved: number; available: number }> {
  const agg = await prisma.unlock.aggregate({ _sum: { creatorEarned: true }, where: { refunded: false, content: { creatorId: userId } } });
  const bonus = await creditedBonusStars(userId);
  const earned = (agg._sum.creatorEarned ?? 0) + bonus;
  let maturedEarned = agg._sum.creatorEarned ?? 0;
  if (config.disputeWindowDays > 0) {
    const cutoff = new Date(Date.now() - config.disputeWindowDays * 86400000);
    const m = await prisma.unlock.aggregate({ _sum: { creatorEarned: true }, where: { refunded: false, createdAt: { lte: cutoff }, content: { creatorId: userId } } });
    maturedEarned = m._sum.creatorEarned ?? 0;
  }
  const paid = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { userId, status: { in: ["requested", "processing", "paid"] } } });
  const reserved = paid._sum.amountStars ?? 0;
  return { earned, reserved, available: maturedEarned + bonus - reserved };
}

export function register(bot: Bot<MyContext>) {
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true).catch(() => {});
  });

  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    const m = /^buy:(\d+)$/.exec(sp.invoice_payload || "");
    if (!m || !ctx.from) return;
    const contentId = Number(m[1]);
    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content || !content.videoFileId) return;
    const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (!user) return;
    if (content.creatorId === user.id) {
      await botInstance.api.sendVideo(String(ctx.from.id), content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true }).catch(() => {});
      return;
    }
    const stars = sp.total_amount;
    const creator = content.creatorId ? await prisma.user.findUnique({ where: { id: content.creatorId }, select: { tierSharePercent: true } }) : null;
    const sharePct = creator?.tierSharePercent ?? config.creatorSharePercent;
    const { creatorEarned, platformFee } = starsShare(stars, sharePct);
    const counts = await buyerVerified(user.id).catch(() => false);
    try {
      await recordUnlock(user.id, contentId, {
        source: "stars",
        starsPaid: stars,
        creatorEarned,
        platformFee,
        shareBps: sharePct * 100,
        countsForTier: counts,
        chargeId: sp.telegram_payment_charge_id,
      });
    } catch (e) {
      await notifyAdmins(
        `⚠️ To'lov yozib bo'lmadi (qo'lda tekshiring/qaytaring)\nCharge: ${sp.telegram_payment_charge_id}\nKontent #${contentId} · Xaridor: ${ctx.from.id} · ${stars} ⭐\n${String((e as Error)?.message ?? e).slice(0, 150)}`,
      ).catch(() => {});
    }
    try {
      await botInstance.api.sendVideo(String(ctx.from.id), content.videoFileId, {
        caption: `🎬 ${content.title}`,
        supports_streaming: true,
        reply_markup: new InlineKeyboard().text(t(normLang(user.lang), "complaintBtn"), `complain:${contentId}`),
      });
    } catch (e) {
      if (!isCantDeliver(e)) console.error("Stars yetkazish xatosi:", e);
    }
  });
}
