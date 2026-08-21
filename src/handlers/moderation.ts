import { Bot, InlineKeyboard } from "grammy";
import { MyContext, bot as botInstance, isAdmin, notifyAdmins, userLang } from "../bot-core";
import { config } from "../config";
import { prisma } from "../db";
import { t, normLang } from "../i18n";
import { fmtUsd } from "../pricing";
import { processFraudRefund } from "../ledger";

async function modLog(action: string, data: { contentId?: number; targetTgId?: string; adminTgId?: string; note?: string }): Promise<void> {
  await prisma.moderationLog.create({ data: { action, ...data } }).catch(() => {});
}

export async function assertCanUpload(telegramId: string, lang?: string): Promise<{ ok: boolean; message: string }> {
  const l = normLang(lang);
  const u = await prisma.user.findUnique({ where: { telegramId } });
  if (u?.isBanned) return { ok: false, message: t(l, "banned") };
  if (u) {
    const since = new Date(Date.now() - 3600 * 1000);
    const recent = await prisma.content.count({ where: { creatorId: u.id, createdAt: { gt: since } } });
    if (recent >= config.uploadsPerHour) return { ok: false, message: t(l, "uploadRateLimit") };
  }
  return { ok: true, message: "" };
}

async function strikeCreator(creatorUserId: number, reason: string, adminTgId?: string): Promise<void> {
  const u = await prisma.user.update({ where: { id: creatorUserId }, data: { strikes: { increment: 1 } } });
  await modLog("strike", { targetTgId: u.telegramId, adminTgId, note: reason });
  if (u.strikes >= config.strikeBanThreshold && !u.isBanned) {
    await prisma.user.update({ where: { id: u.id }, data: { isBanned: true } });
    await modLog("ban", { targetTgId: u.telegramId, adminTgId, note: `auto: ${config.strikeBanThreshold} strike` });
    await botInstance.api.sendMessage(u.telegramId, t(normLang(u.lang), "banned")).catch(() => {});
    await notifyAdmins(`⛔ Auto-ban: @${u.username ?? u.telegramId} (${u.strikes} strike)`);
  }
}

export async function takedownContent(contentId: number, adminTgId?: string, reportId?: number): Promise<{ ok: boolean; message: string }> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return { ok: false, message: "Kontent topilmadi." };
  if (content.status === "removed") return { ok: false, message: "Allaqachon o'chirilgan." };
  await prisma.content.update({ where: { id: contentId }, data: { status: "removed" } });
  await modLog("takedown", { contentId, adminTgId, note: reportId ? `report#${reportId}` : undefined });
  await prisma.report.updateMany({ where: { contentId, status: "open" }, data: { status: "actioned" } });
  if (content.creatorId) {
    const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
    if (creator) {
      await botInstance.api.sendMessage(creator.telegramId, t(normLang(creator.lang), "contentRemoved", { title: content.title })).catch(() => {});
      await strikeCreator(content.creatorId, `takedown #${contentId}`, adminTgId);
    }
  }
  return { ok: true, message: `🚫 #${contentId} «${content.title}» o'chirildi.` };
}

export async function banUser(telegramId: string, adminTgId?: string): Promise<{ ok: boolean; message: string }> {
  const u = await prisma.user.findUnique({ where: { telegramId } });
  if (!u) return { ok: false, message: "Foydalanuvchi topilmadi." };
  await prisma.user.update({ where: { id: u.id }, data: { isBanned: true } });
  await modLog("ban", { targetTgId: telegramId, adminTgId });
  await botInstance.api.sendMessage(telegramId, t(normLang(u.lang), "banned")).catch(() => {});
  return { ok: true, message: `⛔ @${u.username ?? telegramId} bloklandi.` };
}

export async function unbanUser(telegramId: string, adminTgId?: string): Promise<{ ok: boolean; message: string }> {
  const u = await prisma.user.findUnique({ where: { telegramId } });
  if (!u) return { ok: false, message: "Foydalanuvchi topilmadi." };
  await prisma.user.update({ where: { id: u.id }, data: { isBanned: false, strikes: 0 } });
  await modLog("unban", { targetTgId: telegramId, adminTgId });
  return { ok: true, message: `✅ @${u.username ?? telegramId} blokdan chiqarildi.` };
}

export async function createComplaint(
  buyerTelegramId: string,
  contentId: number,
  reason?: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; complaintId?: number }> {
  const l = normLang(lang);
  const user = await prisma.user.findUnique({ where: { telegramId: buyerTelegramId } });
  if (!user) return { ok: false, message: t(l, "startFirst") };
  const unlock = await prisma.unlock.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
  const isPaid = !!unlock && (unlock.starsPaid > 0 || unlock.creatorEarnedUsdt > 0);
  if (!unlock || unlock.refunded || !isPaid) {
    return { ok: false, message: t(l, "complaintNeedBuy") };
  }
  if (config.disputeWindowDays > 0 && Date.now() - new Date(unlock.createdAt).getTime() > config.disputeWindowDays * 86400000) {
    return { ok: false, message: t(l, "complaintTooLate", { days: config.disputeWindowDays }) };
  }
  const existing = await prisma.complaint.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
  if (existing) return { ok: false, message: t(l, "complaintExists") };
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  const c = await prisma.complaint.create({
    data: { contentId, userId: user.id, buyerTgId: buyerTelegramId, reason: reason?.slice(0, 300), status: "pending" },
  });
  const kb = new InlineKeyboard().text("✅ Qaytarish (refund)", `refund_ok:${c.id}`).text("❌ Rad", `refund_no:${c.id}`);
  await notifyAdmins(
    `🚨 Aldov shikoyati #${c.id}\nKontent #${contentId}: «${content?.title ?? ""}»\nXaridor: @${user.username ?? buyerTelegramId}\nSabab: ${reason ?? "—"}\n\nReel'ni feed'da #${contentId} da, to'liq videoni quyida ko'ring:`,
    kb,
  );
  if (content?.videoFileId) {
    for (const a of config.adminIds) await botInstance.api.sendVideo(a, content.videoFileId, { caption: `To'liq video (shikoyat #${c.id})` }).catch(() => {});
  }
  return { ok: true, message: t(l, "complaintFiled"), complaintId: c.id };
}

async function processRefund(complaintId: number): Promise<{ ok: boolean; message: string }> {
  const c = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!c || c.status !== "pending") return { ok: false, message: "Shikoyat topilmadi yoki allaqachon ko'rib chiqilgan." };
  const content = await prisma.content.findUnique({ where: { id: c.contentId } });

  const buyerU = await prisma.user.findUnique({ where: { telegramId: c.buyerTgId } });
  const unlockU = buyerU
    ? await prisma.unlock.findUnique({ where: { userId_contentId: { userId: buyerU.id, contentId: c.contentId } } })
    : null;
  if (unlockU && !unlockU.refunded && unlockU.source === "stars") {
    if (unlockU.chargeId) {
      try {
        await botInstance.api.refundStarPayment(Number(c.buyerTgId), unlockU.chargeId);
      } catch (e) {
        return { ok: false, message: "Stars refund xatosi: " + String((e as Error)?.message ?? e).slice(0, 120) };
      }
    }
    const done = await prisma.$transaction(async (tx) => {
      const claim = await tx.complaint.updateMany({ where: { id: complaintId, status: "pending" }, data: { status: "approved" } });
      if (claim.count !== 1) return false;
      await tx.unlock.updateMany({ where: { id: unlockU.id, refunded: false }, data: { refunded: true } });
      await tx.content.update({ where: { id: c.contentId }, data: { status: "rejected", rejectionReason: "Aldov shikoyati tasdiqlandi" } });
      return true;
    });
    if (!done) return { ok: false, message: "Allaqachon ko'rib chiqilgan." };
    if (content?.creatorId) await strikeCreator(content.creatorId, `aldov refund (stars) #${complaintId}`);
    const stars = unlockU.starsPaid || 0;
    await botInstance.api.sendMessage(c.buyerTgId, t(normLang(buyerU?.lang), "refundBuyerStars", { title: content?.title ?? "", amount: stars })).catch(() => {});
    if (content?.creatorId) {
      const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
      if (creator) await botInstance.api.sendMessage(creator.telegramId, t(normLang(creator.lang), "refundClawbackStars", { title: content?.title ?? "", amount: unlockU.creatorEarned })).catch(() => {});
    }
    return { ok: true, message: `✅ Refund #${complaintId}: ${stars} ⭐ xaridorga qaytarildi.` };
  }

  const res = await processFraudRefund(c.contentId, c.buyerTgId, complaintId);
  if (res.status !== "ok") return { ok: false, message: "Qaytarib bo'lmadi (unlock yo'q yoki allaqachon qaytarilgan)." };
  if (res.creatorId) await strikeCreator(res.creatorId, `aldov refund #${res.refundId}`);
  const buyer = await prisma.user.findUnique({ where: { telegramId: c.buyerTgId } });
  if (buyer)
    await botInstance.api
      .sendMessage(c.buyerTgId, t(normLang(buyer.lang), "refundBuyer", { title: content?.title ?? "", amount: fmtUsd(res.refundUsdt) }))
      .catch(() => {});
  if (res.creatorId) {
    const creator = await prisma.user.findUnique({ where: { id: res.creatorId } });
    if (creator)
      await botInstance.api
        .sendMessage(creator.telegramId, t(normLang(creator.lang), "refundClawback", { title: content?.title ?? "", amount: fmtUsd(res.refundUsdt) }))
        .catch(() => {});
  }
  return { ok: true, message: `✅ Refund #${res.refundId}: ${fmtUsd(res.refundUsdt)} USDT xaridor balansiga qaytdi.` };
}

const REPORT_CATS = ["illegal", "sexual", "copyright", "violence", "other"];

export async function createReport(
  reporterTgId: string,
  contentId: number,
  category: string,
  reason: string | undefined,
  lang?: string,
): Promise<{ ok: boolean; message: string }> {
  const l = normLang(lang);
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content || content.status === "removed") return { ok: true, message: t(l, "reportSent") };
  const already = await prisma.report.findFirst({ where: { reporterTgId, contentId } });
  if (already) return { ok: true, message: t(l, "reportSent") };
  const since = new Date(Date.now() - 3600 * 1000);
  const recent = await prisma.report.count({ where: { reporterTgId, createdAt: { gt: since } } });
  if (recent >= config.reportsPerHour) return { ok: true, message: t(l, "reportSent") };
  const cat = REPORT_CATS.includes(category) ? category : "other";
  const r = await prisma.report.create({ data: { contentId, reporterTgId, category: cat, reason: reason?.slice(0, 300), status: "open" } });
  const kb = new InlineKeyboard()
    .text("🚫 O'chirish", `takedown:${contentId}:${r.id}`)
    .text("⛔ Creatorni ban", `banc:${contentId}`)
    .row()
    .text("✅ Rad etish", `dismiss:${r.id}`);
  await notifyAdmins(
    `🚩 Shikoyat #${r.id} — ${cat.toUpperCase()}\nKontent #${contentId}: «${content.title}»\nSabab: ${reason ?? "—"}\nShikoyatchi: ${reporterTgId}`,
    kb,
  );
  return { ok: true, message: t(l, "reportSent") };
}

export function register(bot: Bot<MyContext>) {
  bot.callbackQuery(/^complain:(\d+)$/, async (ctx) => {
    if (!ctx.from) return ctx.answerCallbackQuery();
    const contentId = Number(ctx.match[1]);
    const lang = await userLang(String(ctx.from.id));
    const res = await createComplaint(String(ctx.from.id), contentId, undefined, lang);
    await ctx.answerCallbackQuery({ text: res.message.slice(0, 190), show_alert: true });
  });

  bot.callbackQuery(/^refund_ok:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const id = Number(ctx.match[1]);
    await ctx.answerCallbackQuery("⏳ Qaytarilmoqda…");
    await ctx.editMessageReplyMarkup().catch(() => {});
    const res = await processRefund(id);
    await ctx.reply(res.message);
  });

  bot.callbackQuery(/^refund_no:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const id = Number(ctx.match[1]);
    const c = await prisma.complaint.findUnique({ where: { id } });
    if (!c || c.status !== "pending") {
      await ctx.answerCallbackQuery("Allaqachon ko'rib chiqilgan");
      await ctx.editMessageReplyMarkup().catch(() => {});
      return;
    }
    await prisma.complaint.update({ where: { id }, data: { status: "rejected" } });
    await ctx.answerCallbackQuery("❌ Rad etildi");
    await ctx.editMessageReplyMarkup().catch(() => {});
    const content = await prisma.content.findUnique({ where: { id: c.contentId } });
    const u = await prisma.user.findUnique({ where: { telegramId: c.buyerTgId } });
    await botInstance.api.sendMessage(c.buyerTgId, t(normLang(u?.lang), "refundRejected", { title: content?.title ?? "" })).catch(() => {});
  });

  bot.command("complaints", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const list = await prisma.complaint.findMany({ where: { status: "pending" }, orderBy: { id: "asc" }, take: 20, include: { content: true } });
    if (!list.length) return ctx.reply("Kutayotgan shikoyat yo'q. ✅");
    for (const c of list) {
      const kb = new InlineKeyboard().text("✅ Qaytarish", `refund_ok:${c.id}`).text("❌ Rad", `refund_no:${c.id}`);
      await ctx.reply(`🚨 Shikoyat #${c.id}\n«${c.content.title}» (#${c.contentId})\nXaridor: ${c.buyerTgId}\nSabab: ${c.reason ?? "—"}`, { reply_markup: kb });
    }
  });

  bot.command("reports", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const list = await prisma.report.findMany({ where: { status: "open" }, orderBy: { id: "asc" }, take: 20, include: { content: true } });
    if (!list.length) return ctx.reply("Ochiq shikoyat yo'q. ✅");
    for (const r of list) {
      const kb = new InlineKeyboard()
        .text("🚫 O'chirish", `takedown:${r.contentId}:${r.id}`)
        .text("⛔ Ban", `banc:${r.contentId}`)
        .row()
        .text("✅ Rad", `dismiss:${r.id}`);
      await ctx.reply(`🚩 #${r.id} — ${r.category}\n«${r.content.title}» (#${r.contentId})\nSabab: ${r.reason ?? "—"}`, { reply_markup: kb });
    }
  });

  bot.command("takedown", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const id = Number((ctx.match ?? "").toString().trim());
    if (!id) return ctx.reply("Foydalanish: /takedown <contentId>");
    const res = await takedownContent(id, String(ctx.from?.id));
    await ctx.reply(res.message);
  });

  bot.command("ban", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const tgId = (ctx.match ?? "").toString().trim();
    if (!tgId) return ctx.reply("Foydalanish: /ban <telegramId>");
    await ctx.reply((await banUser(tgId, String(ctx.from?.id))).message);
  });

  bot.command("unban", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const tgId = (ctx.match ?? "").toString().trim();
    if (!tgId) return ctx.reply("Foydalanish: /unban <telegramId>");
    await ctx.reply((await unbanUser(tgId, String(ctx.from?.id))).message);
  });

  bot.callbackQuery(/^takedown:(\d+):(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const res = await takedownContent(Number(ctx.match[1]), String(ctx.from?.id), Number(ctx.match[2]));
    await ctx.answerCallbackQuery(res.message.slice(0, 190));
    await ctx.editMessageReplyMarkup().catch(() => {});
  });

  bot.callbackQuery(/^banc:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const contentId = Number(ctx.match[1]);
    const content = await prisma.content.findUnique({ where: { id: contentId } });
    await takedownContent(contentId, String(ctx.from?.id));
    let msg = "🚫 O'chirildi";
    if (content?.creatorId) {
      const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
      if (creator) msg = (await banUser(creator.telegramId, String(ctx.from?.id))).message;
    }
    await ctx.answerCallbackQuery(msg.slice(0, 190));
    await ctx.editMessageReplyMarkup().catch(() => {});
  });

  bot.callbackQuery(/^dismiss:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const id = Number(ctx.match[1]);
    const upd = await prisma.report.updateMany({ where: { id, status: "open" }, data: { status: "dismissed" } });
    if (upd.count === 1) {
      await modLog("dismiss", { adminTgId: String(ctx.from?.id), note: `report#${id}` });
      await ctx.answerCallbackQuery("✅ Rad etildi");
    } else {
      await ctx.answerCallbackQuery("Allaqachon ko'rib chiqilgan");
    }
    await ctx.editMessageReplyMarkup().catch(() => {});
  });
}
