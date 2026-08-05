import { Bot, Context, InlineKeyboard, InputFile, session, SessionFlavor } from "grammy";
import { randomUUID } from "crypto";
import { config, assertBotConfig } from "./config";
import { prisma } from "./db";
import { s3Enabled, putReelToS3, publicUrlFor } from "./storage";
import { t, normLang, Lang } from "./i18n";
import { usdtToStars, fmtUsd } from "./pricing";
import { tonEnabled, sendUsdt, parseTonAddress, getHotWalletInfo, findOutgoingUsdt } from "./ton";

interface Draft {
  reelFileId?: string;
  videoFileId?: string;
}
interface SessionData {
  step?: "reel" | "video" | "meta";
  mode?: "admin" | "creator";
  draft: Draft;
}
export type MyContext = Context & SessionFlavor<SessionData>;

assertBotConfig();
export const bot = new Bot<MyContext>(config.botToken);
bot.use(session({ initial: (): SessionData => ({ draft: {} }) }));

function isAdmin(id?: string | number): boolean {
  return id !== undefined && config.adminIds.includes(String(id));
}

async function upsertUser(tg: { id: string; username?: string; first_name?: string; language_code?: string }) {
  return prisma.user.upsert({
    where: { telegramId: tg.id },
    update: { username: tg.username, firstName: tg.first_name, languageCode: tg.language_code },
    create: {
      telegramId: tg.id,
      username: tg.username,
      firstName: tg.first_name,
      languageCode: tg.language_code,
      isAdmin: isAdmin(tg.id),
    },
  });
}

export async function notifyAdmins(text: string, keyboard?: InlineKeyboard): Promise<void> {
  for (const adminId of config.adminIds) {
    await bot.api.sendMessage(adminId, text, keyboard ? { reply_markup: keyboard } : {}).catch(() => {});
  }
}

async function userLang(telegramId?: string): Promise<Lang> {
  if (!telegramId) return "uz";
  const u = await prisma.user.findUnique({ where: { telegramId }, select: { lang: true } });
  return normLang(u?.lang);
}

function langKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🇺🇿 O'zbek", "lang:uz").text("🇷🇺 Русский", "lang:ru").text("🇬🇧 English", "lang:en");
}

async function sendWelcome(ctx: MyContext, lang: Lang) {
  const kb = config.webappUrl ? new InlineKeyboard().webApp(t(lang, "openApp"), config.webappUrl) : undefined;
  await ctx.reply(t(lang, "welcome"), { reply_markup: kb });
}

async function sendTerms(ctx: MyContext, lang: Lang) {
  const kb = new InlineKeyboard().text(t(lang, "termsAgree"), "terms:accept");
  await ctx.reply(t(lang, "terms"), { reply_markup: kb });
}

/** Creator balansi — USDT'da (jami ishlangan, band qilingan, mavjud). */
export async function creatorBalance(
  creatorUserId: number,
): Promise<{ earned: number; reserved: number; available: number }> {
  const agg = await prisma.unlock.aggregate({
    _sum: { creatorEarnedUsdt: true },
    where: { refunded: false, content: { creatorId: creatorUserId } }, // qaytarilganlar hisobga olinmaydi
  });
  const earned = agg._sum.creatorEarnedUsdt ?? 0;
  const paid = await prisma.payout.aggregate({
    _sum: { amountUsdt: true },
    where: { userId: creatorUserId, status: { in: ["requested", "processing", "paid"] } },
  });
  const reserved = paid._sum.amountUsdt ?? 0;
  // clamp yo'q: refund clawback allaqachon yechib olingan daromaddan oshsa, defitsit kelajakdagi daromaddan qoplanadi
  return { earned, reserved, available: earned - reserved };
}

// ---------------- Storage (S3 reels + Telegram to'liq video) ----------------

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("file_path yo'q");
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Telegram fayl yuklab bo'lmadi");
  return Buffer.from(await resp.arrayBuffer());
}

async function sendVideoGetFileId(chatId: string | number, buffer: Buffer, filename: string): Promise<string> {
  const msg = await bot.api.sendVideo(chatId, new InputFile(buffer, filename));
  if (!msg.video) throw new Error("file_id olinmadi");
  return msg.video.file_id;
}

async function storeReel(source: { buffer?: Buffer; fileId?: string }): Promise<{ reelUrl: string | null; reelFileId: string | null }> {
  if (s3Enabled()) {
    const buf = source.buffer ?? (source.fileId ? await downloadTelegramFile(source.fileId) : null);
    if (buf) {
      const key = `reels/${randomUUID()}.mp4`;
      await putReelToS3(buf, key);
      return { reelUrl: config.awsPublicBaseUrl ? publicUrlFor(key) : key, reelFileId: null };
    }
  }
  if (source.fileId) return { reelUrl: null, reelFileId: source.fileId };
  if (source.buffer) {
    const target = config.storageChannelId || config.adminIds[0];
    if (target) return { reelUrl: null, reelFileId: await sendVideoGetFileId(target, source.buffer, "reel.mp4") };
  }
  return { reelUrl: null, reelFileId: null };
}

async function storeFullVideo(source: { buffer?: Buffer; fileId?: string }): Promise<string | null> {
  const target = config.storageChannelId || config.adminIds[0];
  if (!target) return source.fileId ?? null;
  if (source.buffer) return sendVideoGetFileId(target, source.buffer, "video.mp4");
  if (source.fileId) {
    const msg = await bot.api.sendVideo(target, source.fileId).catch(() => null);
    return msg?.video?.file_id ?? source.fileId;
  }
  return null;
}

/** Yagona kontent yaratish (bot va Mini App API uchun). Narx USDT'da; Stars invoice uchun hisoblanadi. Auto-publish. */
export async function createContent(
  uploaderTelegramId: string,
  reel: { buffer?: Buffer; fileId?: string },
  video: { buffer?: Buffer; fileId?: string },
  title: string,
  priceUsdt: number,
) {
  const { reelUrl, reelFileId } = await storeReel(reel);
  const videoFileId = await storeFullVideo(video);
  const creator = await prisma.user.upsert({
    where: { telegramId: uploaderTelegramId },
    update: {},
    create: { telegramId: uploaderTelegramId, isAdmin: isAdmin(uploaderTelegramId) },
  });
  const priceStars = usdtToStars(priceUsdt);
  return prisma.content.create({
    data: { title, reelUrl, reelFileId, videoFileId, priceUsdt, priceStars, status: "published", creatorId: creator.id },
  });
}

/**
 * Unlock qatorini yozadi. YANGI ochilish bo'lsa true qaytaradi (va unlockCount +1),
 * allaqachon ochilgan bo'lsa false (hisoblagich oshirilmaydi — dublikatga qarshi).
 */
async function recordUnlock(
  userId: number,
  contentId: number,
  data: {
    source: string;
    starsPaid?: number;
    creatorEarned?: number;
    platformFee?: number;
    creatorEarnedUsdt?: number;
    platformFeeUsdt?: number;
    chargeId?: string;
  },
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.unlock.create({ data: { userId, contentId, ...data } });
      await tx.content.update({ where: { id: contentId }, data: { unlockCount: { increment: 1 } } });
    });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false; // @@unique([userId,contentId]) — allaqachon bor
    throw e;
  }
}

/** Bepul yoki allaqachon ochilgan kontentni chatga yuboradi. */
export async function deliverContent(
  telegramId: string,
  contentId: number,
  source: string,
  starsPaid = 0,
  chargeId?: string,
): Promise<boolean> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content || !content.videoFileId) return false;
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return false;
  await recordUnlock(user.id, contentId, { source, starsPaid, chargeId });
  await bot.api.sendVideo(telegramId, content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true });
  return true;
}

/** USDT (kripto) to'lovdan keyin kontentni chatga yetkazadi va daromadni (70/30) yozadi. Idempotent. */
export async function deliverCryptoUnlock(
  buyerTelegramId: string,
  contentId: number,
  amountUsdt: number,
  txHash?: string,
): Promise<boolean> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content || !content.videoFileId) return false;
  const user = await prisma.user.findUnique({ where: { telegramId: buyerTelegramId } });
  if (!user) return false;
  const creatorEarnedUsdt = (amountUsdt * config.creatorSharePercent) / 100;
  const platformFeeUsdt = amountUsdt - creatorEarnedUsdt;
  await recordUnlock(user.id, contentId, { source: "usdt", creatorEarnedUsdt, platformFeeUsdt, chargeId: txHash });
  await bot.api.sendVideo(buyerTelegramId, content.videoFileId, {
    caption: `🎬 ${content.title}`,
    supports_streaming: true,
    reply_markup: new InlineKeyboard().text(t(normLang(user.lang), "complaintBtn"), `complain:${contentId}`), // aldov shikoyati
  });
  return true;
}

/** Creatorning TON hamyon manzilini saqlaydi (payout USDT shu manzilga tushadi). */
export async function setTonWallet(
  telegramId: string,
  address: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; address?: string }> {
  const l = normLang(lang);
  let norm: string;
  try {
    norm = parseTonAddress(address);
  } catch {
    return { ok: false, message: t(l, "walletInvalid") };
  }
  await prisma.user.upsert({
    where: { telegramId },
    update: { tonWallet: norm },
    create: { telegramId, tonWallet: norm, isAdmin: isAdmin(telegramId) },
  });
  return { ok: true, message: t(l, "walletSaved", { addr: norm }), address: norm };
}

/**
 * Avtomatik payout: creatorning mavjud USDT balansini uning TON hamyoniga yuboradi.
 * 30% komissiya avtomatik platformada qoladi (creator balansi allaqachon 70%).
 * Barcha payoutlar NAVBAT bilan ishlaydi (poyga/ikki-marta to'lovning oldini oladi).
 */
let payoutChain: Promise<unknown> = Promise.resolve();
export function requestPayout(
  telegramId: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; payoutId?: number; amount?: number }> {
  const run = payoutChain.then(() => requestPayoutInner(telegramId, lang));
  payoutChain = run.catch(() => {}); // navbatni uzmaslik uchun
  return run;
}

async function requestPayoutInner(
  telegramId: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; payoutId?: number; amount?: number }> {
  const l = normLang(lang);
  const creator = await prisma.user.findUnique({ where: { telegramId } });
  if (!creator) return { ok: false, message: t(l, "startFirst") };
  if (!tonEnabled()) return { ok: false, message: t(l, "payoutOffline") };
  if (!creator.tonWallet) return { ok: false, message: t(l, "needWallet") };

  // Bir vaqtda bitta yechish
  const pending = await prisma.payout.findFirst({ where: { userId: creator.id, status: "processing" } });
  if (pending) return { ok: false, message: t(l, "payoutPending") };

  const b = await creatorBalance(creator.id);
  if (b.available < config.minWithdrawUsdt) {
    return { ok: false, message: t(l, "withdrawMin", { min: fmtUsd(config.minWithdrawUsdt), available: fmtUsd(b.available) }) };
  }
  const amount = Math.floor(b.available * 100) / 100; // 2 kasr

  // Hot-wallet likvidligini tekshirish (yetarli USDT + gaz uchun TON)
  const hw = await getHotWalletInfo().catch(() => null);
  if (!hw || hw.usdt + 1e-6 < amount || hw.ton < 0.1) {
    await notifyAdmins(
      `⚠️ Payout uchun hot-wallet balansi yetarli emas!\nKerak: ${fmtUsd(amount)} USDT\nMavjud: ${hw ? fmtUsd(hw.usdt) + " USDT / " + hw.ton.toFixed(3) + " TON" : "noma'lum"}\n\nHot-wallet'ni to'ldiring: /hotwallet`,
    );
    return { ok: false, message: t(l, "payoutNoLiquidity") };
  }

  // Balansni band qilamiz (processing) — keyin yuboramiz
  const payout = await prisma.payout.create({
    data: { userId: creator.id, amountUsdt: amount, toAddress: creator.tonWallet, status: "processing" },
  });
  try {
    const { hash, confirmed } = await sendUsdt(creator.tonWallet, amount, "p" + payout.id);
    if (confirmed) {
      // CAS: reconciler oldin 'paid' qilib qo'ygan bo'lsa qayta yozmaymiz / takror xabar bermaymiz
      const upd = await prisma.payout.updateMany({ where: { id: payout.id, status: "processing" }, data: { status: "paid", tonTxHash: hash } });
      if (upd.count === 1) {
        await notifyAdmins(
          `✅ Avto-payout #${payout.id}\n@${creator.username ?? creator.telegramId}\n${fmtUsd(amount)} USDT → ${creator.tonWallet}\ntx: ${hash}`,
        );
      }
      return { ok: true, message: t(l, "withdrawPaid", { amount: fmtUsd(amount), addr: creator.tonWallet }), payoutId: payout.id, amount };
    }
    // tasdiqlanmagan — 'processing'da qoladi (reconciler hal qiladi); tonTxHash'ni faqat hali processing bo'lsa saqlaymiz
    await prisma.payout.updateMany({ where: { id: payout.id, status: "processing" }, data: { tonTxHash: hash } });
    await notifyAdmins(`⏳ Payout #${payout.id} yuborildi, tasdiq kutilmoqda\n${fmtUsd(amount)} USDT → ${creator.tonWallet}`);
    return { ok: true, message: t(l, "withdrawProcessing", { amount: fmtUsd(amount) }), payoutId: payout.id, amount };
  } catch (e) {
    // Bu yerga FAQAT broadcast'dan oldingi xato tushadi (sendUsdt keyin xato tashlamaydi) → 'failed' xavfsiz
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    await prisma.payout.updateMany({ where: { id: payout.id, status: "processing" }, data: { status: "failed", note: msg } });
    await notifyAdmins(`⚠️ Payout XATO #${payout.id}\n${fmtUsd(amount)} USDT → ${creator.tonWallet}\n${msg}`);
    return { ok: false, message: t(l, "withdrawFailed") };
  }
}

/**
 * 'processing' payoutlarni on-chain tekshirib hal qiladi:
 *  - chiquvchi USDT transfer topilsa → paid (creatorga xabar)
 *  - 30 daqiqada topilmasa → failed (balans creatorga qaytadi, admin xabardor)
 * Watcher davriy chaqiradi. sendUsdt broadcast'dan keyin xato tashlamagani uchun
 * bu yerga tushgan payout uchun pul allaqachon un-reserve bo'lib ketmaydi.
 */
export async function reconcilePayouts(): Promise<void> {
  const list = await prisma.payout.findMany({ where: { status: "processing" }, orderBy: { id: "asc" }, take: 50 });
  for (const p of list) {
    if (!p.toAddress) continue;
    const since = Math.floor(new Date(p.createdAt).getTime() / 1000);
    let found: { found: boolean; txHash?: string; exhausted: boolean };
    try {
      found = await findOutgoingUsdt(p.toAddress, p.amountUsdt, since, "p" + p.id);
    } catch {
      continue; // tonapi xatosi — keyingi tsiklda
    }
    if (found.found) {
      const upd = await prisma.payout.updateMany({ where: { id: p.id, status: "processing" }, data: { status: "paid", tonTxHash: found.txHash } });
      if (upd.count === 1) {
        const u = await prisma.user.findUnique({ where: { id: p.userId } });
        if (u) await bot.api.sendMessage(u.telegramId, `✅ ${fmtUsd(p.amountUsdt)} USDT hamyoningizga yuborildi.`).catch(() => {});
      }
    } else if (!found.exhausted && (Date.now() - new Date(p.createdAt).getTime()) / 60000 > 30) {
      // FAQAT vaqt oynasi to'liq tekshirilgan bo'lsa 'failed' — aks holda un-reserve = ikki marta to'lov xavfi
      const upd = await prisma.payout.updateMany({ where: { id: p.id, status: "processing" }, data: { status: "failed", note: "on-chain topilmadi (reconcile 30min)" } });
      if (upd.count === 1) {
        await notifyAdmins(`⚠️ Payout #${p.id} 30 daqiqada tasdiqlanmadi → failed (balans qaytdi).\n${fmtUsd(p.amountUsdt)} USDT → ${p.toAddress}`);
      }
    }
    // found=false && exhausted → 'processing'da qoldiriladi (sahifa yetmadi): admin /payouts + /resolvepayout bilan hal qiladi
  }
}

/** Xaridor "aldov" shikoyatini yaratadi (kontentni sotib olgan bo'lishi shart). Adminlarga xabar. */
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
  if (!unlock || unlock.source !== "usdt" || unlock.refunded || unlock.creatorEarnedUsdt <= 0) {
    return { ok: false, message: t(l, "complaintNeedBuy") };
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
    for (const a of config.adminIds) await bot.api.sendVideo(a, content.videoFileId, { caption: `To'liq video (shikoyat #${c.id})` }).catch(() => {});
  }
  return { ok: true, message: t(l, "complaintFiled"), complaintId: c.id };
}

/** Refundни bajaradi: creator daromadini qaytarib oladi, xaridorga 90% USDT yuboradi (10% komissiya qoladi). */
export async function processRefund(complaintId: number): Promise<{ ok: boolean; message: string }> {
  const c = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!c || c.status !== "pending") return { ok: false, message: "Shikoyat topilmadi yoki allaqachon ko'rib chiqilgan." };
  const content = await prisma.content.findUnique({ where: { id: c.contentId } });
  const buyer = await prisma.user.findUnique({ where: { telegramId: c.buyerTgId } });
  if (!buyer) return { ok: false, message: "Xaridor topilmadi." };
  const unlock = await prisma.unlock.findUnique({ where: { userId_contentId: { userId: buyer.id, contentId: c.contentId } } });
  if (!unlock || unlock.refunded) return { ok: false, message: "Unlock topilmadi yoki allaqachon qaytarilgan." };
  const refundUsdt = Math.round(unlock.creatorEarnedUsdt * 100) / 100; // creator ulushi = 90%
  if (refundUsdt <= 0) return { ok: false, message: "Qaytariladigan summa 0." };
  if (!tonEnabled()) return { ok: false, message: "TON payout sozlanmagan." };
  const order = await prisma.order.findFirst({ where: { buyerTgId: c.buyerTgId, contentId: c.contentId, status: "paid" }, orderBy: { id: "desc" } });
  // Buyer ulagan self-custody hamyonni afzal ko'ramiz; bo'lmasa to'lov kelgan manzil (birja bo'lishi mumkin — ehtiyot)
  const toAddr = buyer.tonWallet || order?.fromAddr;
  if (!toAddr) return { ok: false, message: "Xaridor hamyon manzili topilmadi — qo'lda qaytaring." };

  // Atomik: shikoyat claim + clawback + refund yozuvi — hammasi birga (yarim holat qolmasin, ikki marta refund bo'lmasin)
  let refund: { id: number };
  try {
    refund = await prisma.$transaction(async (tx) => {
      const claim = await tx.complaint.updateMany({ where: { id: complaintId, status: "pending" }, data: { status: "approved" } });
      if (claim.count !== 1) throw new Error("CLAIMED");
      await tx.unlock.update({ where: { id: unlock.id }, data: { refunded: true, creatorEarnedUsdt: 0 } });
      return tx.refund.create({
        data: { contentId: c.contentId, buyerTgId: c.buyerTgId, toAddr, amountUsdt: refundUsdt, status: "processing", complaintId },
      });
    });
  } catch (e) {
    if ((e as Error).message === "CLAIMED") return { ok: false, message: "Allaqachon ko'rib chiqilgan." };
    throw e;
  }

  try {
    const { hash, confirmed } = await sendUsdt(toAddr, refundUsdt, "r" + refund.id);
    await prisma.refund.updateMany({ where: { id: refund.id, status: "processing" }, data: { status: confirmed ? "paid" : "processing", txHash: hash } });
  } catch (e) {
    await prisma.refund.updateMany({ where: { id: refund.id, status: "processing" }, data: { status: "failed", txHash: null } });
    await notifyAdmins(`⚠️ Refund #${refund.id} yuborishda xato — qo'lda tekshiring.\n${fmtUsd(refundUsdt)} USDT → ${toAddr}\n${String((e as Error)?.message ?? e).slice(0, 150)}`);
  }

  await bot.api
    .sendMessage(c.buyerTgId, t(normLang(buyer.lang), "refundBuyer", { title: content?.title ?? "", amount: fmtUsd(refundUsdt) }))
    .catch(() => {});
  if (content?.creatorId) {
    const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
    if (creator) {
      await bot.api
        .sendMessage(creator.telegramId, t(normLang(creator.lang), "refundClawback", { title: content.title, amount: fmtUsd(refundUsdt) }))
        .catch(() => {});
    }
  }
  return { ok: true, message: `✅ Refund #${refund.id}: ${fmtUsd(refundUsdt)} USDT → ${toAddr}` };
}

/** 'processing' refundlarni on-chain tekshirib hal qiladi (payout reconcile bilan bir xil mantiq). */
export async function reconcileRefunds(): Promise<void> {
  const list = await prisma.refund.findMany({ where: { status: "processing" }, orderBy: { id: "asc" }, take: 50 });
  for (const r of list) {
    const since = Math.floor(new Date(r.createdAt).getTime() / 1000);
    let found: { found: boolean; txHash?: string; exhausted: boolean };
    try {
      found = await findOutgoingUsdt(r.toAddr, r.amountUsdt, since, "r" + r.id);
    } catch {
      continue;
    }
    if (found.found) {
      await prisma.refund.updateMany({ where: { id: r.id, status: "processing" }, data: { status: "paid", txHash: found.txHash } });
    } else if (!found.exhausted && (Date.now() - new Date(r.createdAt).getTime()) / 60000 > 30) {
      const upd = await prisma.refund.updateMany({ where: { id: r.id, status: "processing" }, data: { status: "failed" } });
      if (upd.count === 1) await notifyAdmins(`⚠️ Refund #${r.id} 30 daqiqada tasdiqlanmadi → failed. Qo'lda tekshiring.\n${fmtUsd(r.amountUsdt)} USDT → ${r.toAddr}`);
    }
  }
}

// ==================== Buyruqlar ====================

bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  const user = await upsertUser({
    id: String(ctx.from.id),
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    language_code: ctx.from.language_code,
  });
  if (!user.lang) {
    await ctx.reply("Tilni tanlang / Выберите язык / Choose language:", { reply_markup: langKeyboard() });
  } else if (!user.acceptedTerms) {
    await sendTerms(ctx, normLang(user.lang));
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

// Admin panel — barcha mavjud buyruqlar ro'yxati
bot.command("admin", async (ctx) => {
  if (!ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  if (!isAdmin(ctx.from.id)) return ctx.reply(t(lang, "help"));
  await ctx.reply(t(lang, "adminPanel"));
});

// ---------------- Yuklash oqimi ----------------

bot.command("add", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  ctx.session.step = "reel";
  ctx.session.mode = "admin";
  ctx.session.draft = {};
  await ctx.reply(t(await userLang(String(ctx.from?.id)), "uploadStart"));
});

bot.command("upload", async (ctx) => {
  if (!ctx.from) return;
  await upsertUser({ id: String(ctx.from.id), username: ctx.from.username, first_name: ctx.from.first_name });
  ctx.session.step = "reel";
  ctx.session.mode = "creator";
  ctx.session.draft = {};
  await ctx.reply(t(await userLang(String(ctx.from.id)), "uploadStart"));
});

bot.command("cancel", async (ctx) => {
  ctx.session.step = undefined;
  ctx.session.mode = undefined;
  ctx.session.draft = {};
  await ctx.reply(t(await userLang(String(ctx.from?.id)), "cancelled"));
});

bot.on("message:video", async (ctx) => {
  if (!ctx.session.step || !ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  const fileId = ctx.message.video.file_id;
  if (ctx.session.step === "reel") {
    ctx.session.draft.reelFileId = fileId;
    ctx.session.step = "video";
    await ctx.reply(t(lang, "uploadFull"));
  } else if (ctx.session.step === "video") {
    ctx.session.draft.videoFileId = fileId;
    ctx.session.step = "meta";
    await ctx.reply(t(lang, "uploadMeta"));
  }
});

bot.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "meta" || !ctx.from) return next(); // buyruqlar keyingi ishlovchilarga o'tsin
  const lang = await userLang(String(ctx.from.id));
  const [titleRaw, priceRaw] = ctx.message.text.split("|");
  const title = (titleRaw ?? "").trim();
  const price = Math.max(0, parseFloat((priceRaw ?? "0").trim().replace(",", ".")) || 0);
  const d = ctx.session.draft;
  if (!title || !d.reelFileId || !d.videoFileId) return ctx.reply(t(lang, "incomplete"));
  await ctx.reply(t(lang, "saving"));
  const content = await createContent(String(ctx.from.id), { fileId: d.reelFileId }, { fileId: d.videoFileId }, title, price);
  ctx.session.step = undefined;
  ctx.session.mode = undefined;
  ctx.session.draft = {};
  await ctx.reply(t(lang, "published", { title: content.title, price: price === 0 ? t(lang, "free") : fmtUsd(price) + " USDT" }));
});

// ---------------- Creator: statistika va daromad ----------------

bot.command("mycontent", async (ctx) => {
  if (!ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
  if (!creator) return ctx.reply(t(lang, "startFirst"));
  const list = await prisma.content.findMany({ where: { creatorId: creator.id }, orderBy: { id: "desc" }, take: 20 });
  if (!list.length) return ctx.reply(t(lang, "noContent"));
  const earned = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarnedUsdt: true }, where: { content: { creatorId: creator.id } } });
  const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarnedUsdt ?? 0]));
  const lines = list.map((c) => `«${c.title}» — 👁 ${c.viewCount} · 🔓 ${c.unlockCount} · ❤️ ${c.likeCount} · 💰 ${fmtUsd(em.get(c.id) ?? 0)} USDT`);
  await ctx.reply("📂\n\n" + lines.join("\n"));
});

bot.command("earnings", async (ctx) => {
  if (!ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
  if (!creator) return ctx.reply(t(lang, "startFirst"));
  const b = await creatorBalance(creator.id);
  await ctx.reply(
    t(lang, "earnings", {
      earned: fmtUsd(b.earned),
      reserved: fmtUsd(b.reserved),
      available: fmtUsd(Math.max(0, b.available)),
      min: fmtUsd(config.minWithdrawUsdt),
      share: config.creatorSharePercent,
      plat: 100 - config.creatorSharePercent,
      wallet: creator.tonWallet ?? "—",
    }),
  );
});

bot.command("wallet", async (ctx) => {
  if (!ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
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
  const res = await requestPayout(String(ctx.from.id), lang);
  await ctx.reply(res.message);
});

// ---------------- Payout ijrosi (admin) ----------------

// Payout tarixi (avtomatik — monitoring)
bot.command("payouts", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const list = await prisma.payout.findMany({ orderBy: { id: "desc" }, take: 20, include: { user: true } });
  if (!list.length) return ctx.reply("Payout tarixi bo'sh.");
  const icon: Record<string, string> = { paid: "✅", processing: "⏳", failed: "❌", requested: "📩", rejected: "🚫" };
  const lines = list.map(
    (p) =>
      `${icon[p.status] ?? "•"} #${p.id} @${p.user.username ?? p.user.telegramId} · ${fmtUsd(p.amountUsdt)} USDT · ${p.status}` +
      (p.tonTxHash ? `\n   tx: ${p.tonTxHash.slice(0, 16)}…` : ""),
  );
  await ctx.reply("💸 Payoutlar (oxirgi 20):\n\n" + lines.join("\n"));
});

// 'processing' payoutni qo'lда hal qilish (admin on-chain tekshirgach)
bot.command("resolvepayout", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const [idRaw, st] = (ctx.match ?? "").toString().trim().split(/\s+/);
  const id = Number(idRaw);
  if (!id || (st !== "paid" && st !== "failed")) return ctx.reply("Foydalanish: /resolvepayout <id> paid|failed");
  const p = await prisma.payout.findUnique({ where: { id } });
  if (!p || p.status !== "processing") return ctx.reply("Bunday 'processing' payout topilmadi.");
  await prisma.payout.update({ where: { id }, data: { status: st } });
  await ctx.reply(`✅ Payout #${id} → ${st}${st === "failed" ? " (balans creatorga qaytdi)" : ""}`);
});

// Muvaffaqiyatsiz refundni qayta yuborish yoki qo'lda hal qilish
bot.command("resolverefund", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const [idRaw, action] = (ctx.match ?? "").toString().trim().split(/\s+/);
  const id = Number(idRaw);
  if (!id || !["resend", "paid", "failed"].includes(action)) {
    return ctx.reply("Foydalanish: /resolverefund <id> resend|paid|failed");
  }
  const r = await prisma.refund.findUnique({ where: { id } });
  if (!r) return ctx.reply("Refund topilmadi.");
  if (action === "paid" || action === "failed") {
    await prisma.refund.update({ where: { id }, data: { status: action } });
    return ctx.reply(`Refund #${id} → ${action}`);
  }
  // resend — comment "r"+id barqaror, shuning uchun on-chain dedup ishlaydi (ikki marta emas)
  if (r.status === "paid") return ctx.reply("Bu refund allaqachon to'langan.");
  await ctx.reply("⏳ Qayta yuborilmoqda…");
  try {
    await prisma.refund.updateMany({ where: { id }, data: { status: "processing" } });
    const { hash, confirmed } = await sendUsdt(r.toAddr, r.amountUsdt, "r" + r.id);
    await prisma.refund.updateMany({ where: { id, status: "processing" }, data: { status: confirmed ? "paid" : "processing", txHash: hash } });
    await ctx.reply(`Refund #${id}: ${confirmed ? "✅ to'landi" : "⏳ yuborildi, tasdiq kutilmoqda"} · ${fmtUsd(r.amountUsdt)} USDT → ${r.toAddr}`);
  } catch (e) {
    await prisma.refund.updateMany({ where: { id, status: "processing" }, data: { status: "failed" } });
    await ctx.reply("❌ Qayta yuborishda xato: " + String((e as Error)?.message ?? e).slice(0, 150));
  }
});

// ---------------- Aldov shikoyati / refund ----------------

// Xaridor shikoyat qiladi (yetkazilgan video tugmasi)
bot.callbackQuery(/^complain:(\d+)$/, async (ctx) => {
  if (!ctx.from) return ctx.answerCallbackQuery();
  const contentId = Number(ctx.match[1]);
  const lang = await userLang(String(ctx.from.id));
  const res = await createComplaint(String(ctx.from.id), contentId, undefined, lang);
  await ctx.answerCallbackQuery({ text: res.message.slice(0, 190), show_alert: true });
});

// Admin: pulni qaytarish
bot.callbackQuery(/^refund_ok:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery("⏳ Qaytarilmoqda…");
  await ctx.editMessageReplyMarkup().catch(() => {});
  const res = await processRefund(id);
  await ctx.reply(res.message);
});

// Admin: shikoyatni rad etish
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
  await bot.api.sendMessage(c.buyerTgId, t(normLang(u?.lang), "refundRejected", { title: content?.title ?? "" })).catch(() => {});
});

// Admin: kutayotgan shikoyatlar
bot.command("complaints", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const list = await prisma.complaint.findMany({ where: { status: "pending" }, orderBy: { id: "asc" }, take: 20, include: { content: true } });
  if (!list.length) return ctx.reply("Kutayotgan shikoyat yo'q. ✅");
  for (const c of list) {
    const kb = new InlineKeyboard().text("✅ Qaytarish", `refund_ok:${c.id}`).text("❌ Rad", `refund_no:${c.id}`);
    await ctx.reply(`🚨 Shikoyat #${c.id}\n«${c.content.title}» (#${c.contentId})\nXaridor: ${c.buyerTgId}\nSabab: ${c.reason ?? "—"}`, { reply_markup: kb });
  }
});

// Hot-wallet — to'ldirish uchun manzil va balans (admin)
bot.command("hotwallet", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  if (!tonEnabled()) return ctx.reply("⚙️ TON payout sozlanmagan (TON_MNEMONIC yo'q).");
  const hw = await getHotWalletInfo().catch(() => null);
  if (!hw) return ctx.reply("Hot-wallet ma'lumotini olib bo'lmadi (TON API xatosi).");
  await ctx.reply(
    `🔥 Hot-wallet (payout manbasi)\n\nManzil:\n\`${hw.address}\`\n\nBalans:\n💵 ${fmtUsd(hw.usdt)} USDT\n💎 ${hw.ton.toFixed(3)} TON\n\nShu manzilga USDT (TON tarmog'i) va gaz uchun ozroq TON (≥1) yuboring.`,
    { parse_mode: "Markdown" },
  );
});

// Bot Stars balansi (admin)
bot.command("balance", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const call = (m: string, body?: unknown) =>
    fetch(`https://api.telegram.org/bot${config.botToken}/${m}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
      .then((r) => r.json())
      .catch(() => null as unknown);
  let out = "";
  const bal: any = await call("getMyStarBalance");
  if (bal?.ok && bal.result) out += `⭐ Bot balansi: ${bal.result.amount} Stars\n\n`;
  const tx: any = await call("getStarTransactions", { limit: 10 });
  if (tx?.ok && tx.result) {
    const list: any[] = tx.result.transactions || [];
    const lines = list.map((tr: any) => `${tr.source ? "➕" : "➖"} ${tr.amount} ⭐`);
    out += "Oxirgi tranzaksiyalar:\n" + (lines.length ? lines.join("\n") : "—");
  }
  if (!out) out = "Ma'lumot olinmadi (Stars API mavjud emas bo'lishi mumkin).";

  // USDT bo'yicha platforma statistikasi
  const feeAgg = await prisma.unlock.aggregate({ _sum: { platformFeeUsdt: true, creatorEarnedUsdt: true } });
  const paidAgg = await prisma.payout.aggregate({ _sum: { amountUsdt: true }, where: { status: "paid" } });
  out += `\n\n🏦 Platforma komissiyasi (${100 - config.creatorSharePercent}%): ${fmtUsd(feeAgg._sum.platformFeeUsdt ?? 0)} USDT`;
  out += `\n👥 Creatorlar ishlagani (${config.creatorSharePercent}%): ${fmtUsd(feeAgg._sum.creatorEarnedUsdt ?? 0)} USDT`;
  out += `\n💸 To'langan payout: ${fmtUsd(paidAgg._sum.amountUsdt ?? 0)} USDT`;

  if (tonEnabled()) {
    const hw = await getHotWalletInfo().catch(() => null);
    if (hw) out += `\n\n🔥 Hot-wallet: ${fmtUsd(hw.usdt)} USDT · ${hw.ton.toFixed(3)} TON\n(/hotwallet — to'ldirish)`;
  } else {
    out += "\n\n⚙️ TON payout hali sozlanmagan (TON_MNEMONIC yo'q).";
  }
  out += "\n\n💡 Starlarni Fragment (fragment.com) orqali TON/USDT'ga yechib, hot-wallet'ni to'ldirasiz (~21 kun ushlanadi).";
  await ctx.reply(out);
});

// To'lov — USDT (TON Connect) orqali Mini App'da; on-chain watcher yetkazadi (src/watcher.ts).

// Bot kanal/guruxga admin qilinganda — storage kanal ID'sini adminlarga yuboradi
bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.chat;
  const status = ctx.myChatMember.new_chat_member.status;
  if (
    (chat.type === "channel" || chat.type === "group" || chat.type === "supergroup") &&
    (status === "administrator" || status === "member")
  ) {
    await notifyAdmins(`📦 Bot «${("title" in chat && chat.title) || chat.id}» ga qo'shildi (${status}).\n\nSTORAGE_CHANNEL_ID:\n${chat.id}`);
  }
});

bot.catch((err) => console.error("Bot xatosi:", err.error));
