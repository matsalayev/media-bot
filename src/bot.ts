import { Bot, Context, InlineKeyboard, InputFile, session, SessionFlavor } from "grammy";
import { randomUUID } from "crypto";
import { config, assertBotConfig } from "./config";
import { prisma } from "./db";
import { s3Enabled, putReelToS3, publicUrlFor } from "./storage";
import { t, normLang, Lang } from "./i18n";
import { usdtToStars, starsToUsdt, fmtUsd } from "./pricing";
import {
  tronEnabled,
  isTrc20Address,
  hotWalletAddress,
  getTrxBalance,
  getUsdtBalance,
  signUsdtTransfer,
  broadcastSigned,
  txSucceeded,
  isDefiniteBroadcastReject,
} from "./tron";
import {
  createWithdrawal,
  withdrawableBalance,
  markPayoutPaid,
  failAndRefundPayout,
  attachPayoutTx,
  processFraudRefund,
  adjustBalance,
} from "./ledger";
import { buyerVerified, creditedBonusStars } from "./incentives";

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

/** Foydalanuvchiga (id bo'yicha) xabar yuboradi — watcher/reconciler ishlatadi. */
export async function notifyUserById(userId: number, text: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true } });
  if (u) await bot.api.sendMessage(u.telegramId, text).catch(() => {});
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

/** Foydalanuvchi ichki USDT balansi (to'ldirish + daromad − sarf − yechish). */
export async function userBalance(userId: number): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { balanceUsdt: true } });
  return u?.balanceUsdt ?? 0;
}

/** Creatorning umrbod ishlagan daromadi (statistika uchun; joriy pul = userBalance). */
export async function lifetimeEarned(creatorUserId: number): Promise<number> {
  const agg = await prisma.unlock.aggregate({
    _sum: { creatorEarnedUsdt: true },
    where: { refunded: false, content: { creatorId: creatorUserId } },
  });
  return agg._sum.creatorEarnedUsdt ?? 0;
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
    shareBps?: number;
    countsForTier?: boolean;
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

/** Telegram videoni yetkaza olmaydigan (foydalanuvchi botni ochmagan/bloklagan) 403 xatolarini aniqlaydi. */
function isCantDeliver(e: unknown): boolean {
  const code = (e as { error_code?: number })?.error_code;
  const msg = String((e as { description?: string })?.description ?? (e as Error)?.message ?? e).toLowerCase();
  return (
    code === 403 ||
    msg.includes("can't initiate") ||
    msg.includes("bot was blocked") ||
    msg.includes("chat not found") ||
    msg.includes("user is deactivated")
  );
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
  try {
    await bot.api.sendVideo(telegramId, content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true });
  } catch (e) {
    if (isCantDeliver(e)) return true; // ochildi (yozildi); user botni ochib qayta "ko'rish" bosса oladi
    throw e;
  }
  return true;
}

/** Ochilgan (balansdan to'langan) kontent videosini xaridorga yuboradi. Unlock ledger'da yozilgan. */
export async function sendUnlockedVideo(buyerTelegramId: string, contentId: number): Promise<boolean> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content || !content.videoFileId) return false;
  const user = await prisma.user.findUnique({ where: { telegramId: buyerTelegramId } });
  const lang = normLang(user?.lang);
  try {
    await bot.api.sendVideo(buyerTelegramId, content.videoFileId, {
      caption: `🎬 ${content.title}`,
      supports_streaming: true,
      reply_markup: new InlineKeyboard().text(t(lang, "complaintBtn"), `complain:${contentId}`), // aldov shikoyati
    });
  } catch (e) {
    if (isCantDeliver(e)) return true; // unlock yozildi; user botni ochib qayta "ko'rish"dan oladi
    throw e;
  }
  return true;
}

// ==================== Telegram Stars to'lovi ====================

function starsShare(priceStars: number, sharePercent = config.creatorSharePercent): { creatorEarned: number; platformFee: number } {
  const creatorEarned = Math.floor((priceStars * sharePercent) / 100);
  return { creatorEarned, platformFee: priceStars - creatorEarned };
}

/** Kontent uchun Telegram Stars invoice havolasini yaratadi (Mini App tg.openInvoice bilan ochadi). */
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
    const link = await bot.api.createInvoiceLink(
      content.title.slice(0, 32) || "Video",
      `🎬 ${content.title}`.slice(0, 255),
      `buy:${content.id}`, // payload
      "", // provider_token — Telegram Stars uchun bo'sh
      "XTR", // currency = Telegram Stars
      [{ label: content.title.slice(0, 32) || "Video", amount: stars }],
    );
    return { ok: true, link, stars };
  } catch (e) {
    return { ok: false, message: String((e as Error)?.message ?? e).slice(0, 150) };
  }
}

/** Creator Stars balansi (jami ishlangan, band, mavjud). */
export async function creatorStarsBalance(
  userId: number,
): Promise<{ earned: number; reserved: number; available: number }> {
  const agg = await prisma.unlock.aggregate({ _sum: { creatorEarned: true }, where: { refunded: false, content: { creatorId: userId } } });
  const bonus = await creditedBonusStars(userId); // kreditlangan bonuslar ham yechiladi
  const earned = (agg._sum.creatorEarned ?? 0) + bonus;
  const paid = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { userId, status: { in: ["requested", "processing", "paid"] } } });
  const reserved = paid._sum.amountStars ?? 0;
  return { earned, reserved, available: earned - reserved };
}

/**
 * Admin CRM ma'lumoti: jami Stars, komissiya, creatorlar daromadi, $ qiymati + har creator kesimi.
 * rangeDays: 1|7|30 (range-scoped metrikalar); undefined = jami. Live majburiyatlar doim all-time.
 */
export async function getCrmData(rangeDays?: number) {
  const usd = config.starUsd;
  const since = rangeDays && rangeDays > 0 ? new Date(Date.now() - rangeDays * 86400000) : undefined;
  const rangeWhere = since ? { createdAt: { gte: since } } : {};

  // Range-scoped umumiy (refunded emas)
  const agg = await prisma.unlock.aggregate({
    _sum: { starsPaid: true, platformFee: true, creatorEarned: true },
    _count: true,
    where: { refunded: false, ...rangeWhere },
  });
  const buyers = await prisma.unlock.findMany({ where: { refunded: false, ...rangeWhere }, select: { userId: true }, distinct: ["userId"] });
  const refundedAgg = await prisma.unlock.aggregate({ _sum: { starsPaid: true }, where: { refunded: true, ...rangeWhere } });
  const paidAgg = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { status: "paid", ...rangeWhere } });

  // Live majburiyatlar (all-time)
  const pendingAgg = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { status: { in: ["requested", "processing"] } } });
  const earnedAllAgg = await prisma.unlock.aggregate({ _sum: { creatorEarned: true }, where: { refunded: false } });
  const reservedAllAgg = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { status: { in: ["requested", "processing", "paid"] } } });

  const totalStars = agg._sum.starsPaid ?? 0;
  const commissionStars = agg._sum.platformFee ?? 0;
  const creatorStars = agg._sum.creatorEarned ?? 0;
  const undistributed = (earnedAllAgg._sum.creatorEarned ?? 0) - (reservedAllAgg._sum.amountStars ?? 0);

  // Kontent → creator xaritasi
  const contents = await prisma.content.findMany({ select: { id: true, creatorId: true, status: true } });
  const c2creator = new Map<number, number | null>();
  const videosByCreator = new Map<number, number>();
  for (const c of contents) {
    c2creator.set(c.id, c.creatorId ?? null);
    if (c.creatorId && c.status === "published") videosByCreator.set(c.creatorId, (videosByCreator.get(c.creatorId) ?? 0) + 1);
  }

  // Range-scoped: creator bo'yicha sotuv + daromad (contentId groupBy → creatorga yig'amiz)
  const byContent = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarned: true }, _count: true, where: { refunded: false, ...rangeWhere } });
  const per = new Map<number, { sales: number; starsEarned: number }>();
  for (const r of byContent) {
    const cid = c2creator.get(r.contentId);
    if (!cid) continue;
    const e = per.get(cid) ?? { sales: 0, starsEarned: 0 };
    e.sales += r._count;
    e.starsEarned += r._sum.creatorEarned ?? 0;
    per.set(cid, e);
  }
  // All-time daromad (available balans uchun)
  const byContentAll = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarned: true }, where: { refunded: false } });
  const earnedAllByCreator = new Map<number, number>();
  for (const r of byContentAll) {
    const cid = c2creator.get(r.contentId);
    if (!cid) continue;
    earnedAllByCreator.set(cid, (earnedAllByCreator.get(cid) ?? 0) + (r._sum.creatorEarned ?? 0));
  }
  // Payout (all-time) creator bo'yicha
  const payoutRows = await prisma.payout.groupBy({ by: ["userId", "status"], _sum: { amountStars: true } });
  const paidByCreator = new Map<number, number>();
  const reservedByCreator = new Map<number, number>();
  for (const r of payoutRows) {
    const amt = r._sum.amountStars ?? 0;
    if (r.status === "paid") paidByCreator.set(r.userId, (paidByCreator.get(r.userId) ?? 0) + amt);
    if (["requested", "processing", "paid"].includes(r.status)) reservedByCreator.set(r.userId, (reservedByCreator.get(r.userId) ?? 0) + amt);
  }

  const creatorIds = new Set<number>([...earnedAllByCreator.keys(), ...per.keys(), ...videosByCreator.keys()]);
  const users = await prisma.user.findMany({ where: { id: { in: [...creatorIds] } }, select: { id: true, telegramId: true, username: true, firstName: true, tier: true } });
  const uMap = new Map(users.map((u) => [u.id, u]));
  // Kutilayotgan (hali kreditlanmagan) bonuslar creator bo'yicha
  const bonusRows = await prisma.creatorBonus.groupBy({ by: ["userId"], _sum: { amountStars: true }, where: { status: "pending" } });
  const pendingBonusByCreator = new Map(bonusRows.map((b) => [b.userId, b._sum.amountStars ?? 0]));
  const creators = [...creatorIds]
    .map((id) => {
      const u = uMap.get(id);
      const rangeE = per.get(id) ?? { sales: 0, starsEarned: 0 };
      const available = (earnedAllByCreator.get(id) ?? 0) - (reservedByCreator.get(id) ?? 0);
      return {
        userId: id,
        telegramId: u?.telegramId ?? "",
        username: u?.username ?? null,
        firstName: u?.firstName ?? null,
        tier: u?.tier ?? "bronze",
        videos: videosByCreator.get(id) ?? 0,
        sales: rangeE.sales,
        starsEarned: rangeE.starsEarned,
        usdValue: Math.round(rangeE.starsEarned * usd * 100) / 100,
        availableStars: Math.max(0, available),
        paidStars: paidByCreator.get(id) ?? 0,
        pendingBonusStars: pendingBonusByCreator.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.starsEarned - a.starsEarned);

  // Shu oygi bonus pool (taxminiy) = oylik NET komissiyaning bonusPoolPercent %i
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthComm = await prisma.unlock.aggregate({ _sum: { platformFee: true }, where: { refunded: false, createdAt: { gte: monthStart } } });
  const bonusPoolThisMonth = Math.floor(((monthComm._sum.platformFee ?? 0) * config.bonusPoolPercent) / 100);

  const round2 = (n: number) => Math.round(n * usd * 100) / 100;
  return {
    range: { days: rangeDays ?? 0, label: rangeDays ? `${rangeDays}d` : "all" },
    rates: { starUsd: usd, creatorSharePercent: config.creatorSharePercent, minWithdrawStars: config.minWithdrawStars, platformMode: config.paymentMode, bonusPoolPercent: config.bonusPoolPercent },
    totals: {
      totalStars,
      totalUsd: round2(totalStars),
      commissionStars,
      commissionUsd: round2(commissionStars),
      creatorStars,
      creatorUsd: round2(creatorStars),
      blendedCommissionPct: totalStars > 0 ? Math.round((commissionStars / totalStars) * 1000) / 10 : 0,
      sales: agg._count ?? 0,
      distinctBuyers: buyers.length,
      refundedStars: refundedAgg._sum.starsPaid ?? 0,
      paidOutStars: paidAgg._sum.amountStars ?? 0,
      pendingPayoutStars: pendingAgg._sum.amountStars ?? 0,
      undistributedLiabilityStars: Math.max(0, undistributed),
      undistributedLiabilityUsd: round2(Math.max(0, undistributed)),
      activeCreators: per.size,
      totalCreators: videosByCreator.size,
      bonusPoolThisMonthStars: bonusPoolThisMonth,
      bonusPoolThisMonthUsd: round2(bonusPoolThisMonth),
    },
    creators,
  };
}

/** Stars yechish so'rovi — admin QO'LDA tarqatadi (Telegram'da botdan userga Stars yuborish API'si yo'q). */
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

/** Creatorning TON hamyon manzilini saqlaydi (payout USDT shu manzilga tushadi). */
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

/**
 * Yechish: foydalanuvchining butun balansini uning TRC20 hamyoniga on-chain jo'natadi.
 * Idempotent: txID broadcast'dan OLDIN saqlanadi → tarmoq uzilsa ham qayta yubormaymiz.
 * Barcha yechishlar NAVBAT bilan (poyga/ikki-marta to'lovning oldini oladi).
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
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return { ok: false, message: t(l, "startFirst") };
  if (user.isBanned) return { ok: false, message: t(l, "banned") };
  if (!tronEnabled()) return { ok: false, message: t(l, "payoutOffline") };
  if (!user.tonWallet) return { ok: false, message: t(l, "needWallet") };

  // Bir vaqtda bitta yechish
  const pending = await prisma.payout.findFirst({ where: { userId: user.id, status: "processing" } });
  if (pending) return { ok: false, message: t(l, "payoutPending") };

  // Faqat "pishgan" (nizolar oynasidan o'tgan) daromadni yechish mumkin — aldov himoyasi
  const avail = await withdrawableBalance(user.id);
  const amount = Math.floor(avail * 100) / 100; // 2 kasr
  const cr = await createWithdrawal(user.id, user.tonWallet, amount);
  if (cr.status === "bad_address") return { ok: false, message: t(l, "walletInvalid") };
  if (cr.status === "too_small")
    return { ok: false, message: t(l, "withdrawMin", { min: fmtUsd(config.minWithdrawUsdt), available: fmtUsd(avail) }) };
  if (cr.status === "insufficient")
    return { ok: false, message: t(l, "withdrawMin", { min: fmtUsd(config.minWithdrawUsdt), available: fmtUsd(cr.balance) }) };

  // fire-and-forget: debet bilan txHash biriktirish o'rtasida stall bo'lmasin
  void notifyAdmins(
    `💸 Yechish #${cr.payoutId}\n@${user.username ?? user.telegramId}\n${fmtUsd(cr.grossUsdt)} → ${fmtUsd(cr.netUsdt)} USDT (tarmoq haqi ${fmtUsd(config.withdrawFeeUsdt)})\n→ ${user.tonWallet}`,
  ).catch(() => {});
  let signed: { txID: string; signed: unknown };
  try {
    signed = await signUsdtTransfer(user.tonWallet, cr.netUsdt);
  } catch (se) {
    // Imzolash/qurishda xato → hech narsa jo'natilmadi → balans qaytadi
    await failAndRefundPayout(cr.payoutId, "imzo/qurish: " + String((se as Error)?.message ?? se).slice(0, 120));
    await notifyAdmins(`⚠️ Yechish #${cr.payoutId} imzo/qurish xatosi — balans qaytdi.\n${String((se as Error)?.message ?? se).slice(0, 150)}`).catch(() => {});
    return { ok: false, message: t(l, "withdrawFailed") };
  }
  // txID'ni broadcast'dan OLDIN saqlaymiz. Agar CAS 0 qaytarsa (reconciler payout'ni
  // allaqachon failed/refund qilgan) — BROADCAST QILMAYMIZ (ikki marta to'lov bo'lmasin).
  const attached = await attachPayoutTx(cr.payoutId, signed.txID);
  if (!attached) {
    await notifyAdmins(`⚠️ Yechish #${cr.payoutId} broadcast oldidan bekor qilindi (holat o'zgargan) — jo'natilmadi.`).catch(() => {});
    return { ok: false, message: t(l, "withdrawFailed") };
  }
  try {
    await broadcastSigned(signed);
    await markPayoutPaid(cr.payoutId, signed.txID);
    await bot.api.sendMessage(telegramId, `✅ ${fmtUsd(cr.netUsdt)} USDT hamyoningizga yuborildi.\ntx: ${signed.txID}`).catch(() => {});
  } catch (be) {
    const msg = String((be as Error)?.message ?? be);
    if (isDefiniteBroadcastReject(msg)) {
      // Node ANIQ rad etdi → tarmoqqa kirmadi → xavfsiz refund
      await failAndRefundPayout(cr.payoutId, "broadcast rad: " + msg.slice(0, 100));
      return { ok: false, message: t(l, "withdrawFailed") };
    }
    // Noaniq (tarmoq/DUP) — on-chain holatni tekshiramiz; hech qachon ikki marta yubormaymiz
    const ok = await txSucceeded(signed.txID);
    if (ok === true) {
      await markPayoutPaid(cr.payoutId, signed.txID);
      await bot.api.sendMessage(telegramId, `✅ ${fmtUsd(cr.netUsdt)} USDT hamyoningizga yuborildi.\ntx: ${signed.txID}`).catch(() => {});
    } else if (ok === false) {
      await failAndRefundPayout(cr.payoutId, "broadcast/REVERT: " + msg.slice(0, 100));
      return { ok: false, message: t(l, "withdrawFailed") };
    } else {
      await notifyAdmins(`⏳ Yechish #${cr.payoutId} holati noaniq (tx ${signed.txID}) — reconciler/admin tekshiradi.`).catch(() => {});
    }
  }
  return { ok: true, message: t(l, "withdrawProcessing", { amount: fmtUsd(cr.netUsdt) }), payoutId: cr.payoutId, amount: cr.netUsdt };
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
  if (!unlock || unlock.refunded || unlock.creatorEarnedUsdt <= 0) {
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

/** Refundni bajaradi. Stars xaridi → Telegram Stars qaytariladi; USDT xaridi → balansga. Clawback creatordan. */
export async function processRefund(complaintId: number): Promise<{ ok: boolean; message: string }> {
  const c = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!c || c.status !== "pending") return { ok: false, message: "Shikoyat topilmadi yoki allaqachon ko'rib chiqilgan." };
  const content = await prisma.content.findUnique({ where: { id: c.contentId } });

  // --- Stars xaridi: Telegram Stars refund (avtomatik) + clawback (unlock refunded) ---
  const buyerU = await prisma.user.findUnique({ where: { telegramId: c.buyerTgId } });
  const unlockU = buyerU
    ? await prisma.unlock.findUnique({ where: { userId_contentId: { userId: buyerU.id, contentId: c.contentId } } })
    : null;
  if (unlockU && !unlockU.refunded && unlockU.source === "stars") {
    if (unlockU.chargeId) {
      try {
        await bot.api.refundStarPayment(Number(c.buyerTgId), unlockU.chargeId);
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
    await bot.api.sendMessage(c.buyerTgId, t(normLang(buyerU?.lang), "refundBuyerStars", { title: content?.title ?? "", amount: stars })).catch(() => {});
    if (content?.creatorId) {
      const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
      if (creator) await bot.api.sendMessage(creator.telegramId, t(normLang(creator.lang), "refundClawbackStars", { title: content?.title ?? "", amount: unlockU.creatorEarned })).catch(() => {});
    }
    return { ok: true, message: `✅ Refund #${complaintId}: ${stars} ⭐ xaridorga qaytarildi.` };
  }

  // --- USDT (TRON) xaridi: off-chain balans (eski oqim) ---
  const res = await processFraudRefund(c.contentId, c.buyerTgId, complaintId);
  if (res.status !== "ok") return { ok: false, message: "Qaytarib bo'lmadi (unlock yo'q yoki allaqachon qaytarilgan)." };

  // Aldov tasdiqlandi → creatorga strike (boshqalar aldanmasin) + bildirishnomalar
  if (res.creatorId) await strikeCreator(res.creatorId, `aldov refund #${res.refundId}`);
  const buyer = await prisma.user.findUnique({ where: { telegramId: c.buyerTgId } });
  if (buyer)
    await bot.api
      .sendMessage(c.buyerTgId, t(normLang(buyer.lang), "refundBuyer", { title: content?.title ?? "", amount: fmtUsd(res.refundUsdt) }))
      .catch(() => {});
  if (res.creatorId) {
    const creator = await prisma.user.findUnique({ where: { id: res.creatorId } });
    if (creator)
      await bot.api
        .sendMessage(creator.telegramId, t(normLang(creator.lang), "refundClawback", { title: content?.title ?? "", amount: fmtUsd(res.refundUsdt) }))
        .catch(() => {});
  }
  return { ok: true, message: `✅ Refund #${res.refundId}: ${fmtUsd(res.refundUsdt)} USDT xaridor balansiga qaytdi.` };
}

// ==================== Moderatsiya ====================

async function modLog(action: string, data: { contentId?: number; targetTgId?: string; adminTgId?: string; note?: string }): Promise<void> {
  await prisma.moderationLog.create({ data: { action, ...data } }).catch(() => {});
}

/** Yuklash mumkinmi (ban + soatlik limit). */
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

/** Creatorga strike beradi; chegaraga yetsa auto-ban. */
async function strikeCreator(creatorUserId: number, reason: string, adminTgId?: string): Promise<void> {
  const u = await prisma.user.update({ where: { id: creatorUserId }, data: { strikes: { increment: 1 } } });
  await modLog("strike", { targetTgId: u.telegramId, adminTgId, note: reason });
  if (u.strikes >= config.strikeBanThreshold && !u.isBanned) {
    await prisma.user.update({ where: { id: u.id }, data: { isBanned: true } });
    await modLog("ban", { targetTgId: u.telegramId, adminTgId, note: `auto: ${config.strikeBanThreshold} strike` });
    await bot.api.sendMessage(u.telegramId, t(normLang(u.lang), "banned")).catch(() => {});
    await notifyAdmins(`⛔ Auto-ban: @${u.username ?? u.telegramId} (${u.strikes} strike)`);
  }
}

/** Kontentni o'chiradi (soft-delete — dalil saqlanadi) + creatorga strike. */
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
      await bot.api.sendMessage(creator.telegramId, t(normLang(creator.lang), "contentRemoved", { title: content.title })).catch(() => {});
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
  await bot.api.sendMessage(telegramId, t(normLang(u.lang), "banned")).catch(() => {});
  return { ok: true, message: `⛔ @${u.username ?? telegramId} bloklandi.` };
}

export async function unbanUser(telegramId: string, adminTgId?: string): Promise<{ ok: boolean; message: string }> {
  const u = await prisma.user.findUnique({ where: { telegramId } });
  if (!u) return { ok: false, message: "Foydalanuvchi topilmadi." };
  await prisma.user.update({ where: { id: u.id }, data: { isBanned: false, strikes: 0 } });
  await modLog("unban", { targetTgId: telegramId, adminTgId });
  return { ok: true, message: `✅ @${u.username ?? telegramId} blokdan chiqarildi.` };
}

const REPORT_CATS = ["illegal", "sexual", "copyright", "violence", "other"];
/** Umumiy shikoyat (istalgan tomoshabin) — adminlarga takedown/ban tugmalari bilan boradi. */
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
  const can = await assertCanUpload(String(ctx.from.id), lang);
  if (!can.ok) {
    ctx.session.step = undefined;
    ctx.session.mode = undefined;
    ctx.session.draft = {};
    return ctx.reply(can.message);
  }
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
  const earned = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarnedUsdt: true }, where: { refunded: false, content: { creatorId: creator.id } } });
  const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarnedUsdt ?? 0]));
  const lines = list.map((c) => `«${c.title}» — 👁 ${c.viewCount} · 🔓 ${c.unlockCount} · ❤️ ${c.likeCount} · 💰 ${fmtUsd(em.get(c.id) ?? 0)} USDT`);
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

// ---------------- Payout ijrosi (admin) ----------------

// Payout tarixi (avtomatik — monitoring)
bot.command("payouts", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const list = await prisma.payout.findMany({ orderBy: { id: "desc" }, take: 20, include: { user: true } });
  if (!list.length) return ctx.reply("Payout tarixi bo'sh.");
  const icon: Record<string, string> = { paid: "✅", processing: "⏳", failed: "❌" };
  const lines = list.map((p) => {
    const tx = p.txHash ?? p.tonTxHash;
    return (
      `${icon[p.status] ?? "•"} #${p.id} @${p.user.username ?? p.user.telegramId} · ${fmtUsd(p.amountUsdt)} USDT · ${p.status}` +
      (tx ? `\n   tx: ${tx.slice(0, 16)}…` : "")
    );
  });
  await ctx.reply("💸 Payoutlar (oxirgi 20):\n\n" + lines.join("\n"));
});

// 'processing' payoutni qo'lда hal qilish (admin on-chain tekshirgach). failed → balans qaytadi.
bot.command("resolvepayout", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const [idRaw, st, tx] = (ctx.match ?? "").toString().trim().split(/\s+/);
  const id = Number(idRaw);
  if (!id || (st !== "paid" && st !== "failed")) return ctx.reply("Foydalanish: /resolvepayout <id> paid|failed [txHash]");
  const p = await prisma.payout.findUnique({ where: { id } });
  if (!p || p.status !== "processing") return ctx.reply("Bunday 'processing' payout topilmadi.");
  if (st === "paid") {
    await markPayoutPaid(id, tx ?? p.txHash ?? "manual");
    return ctx.reply(`✅ Payout #${id} → paid`);
  }
  const ok = await failAndRefundPayout(id, "admin: manual failed");
  await ctx.reply(ok ? `✅ Payout #${id} → failed (balans qaytdi)` : `Payout #${id} allaqachon hal qilingan.`);
});

// Balansni qo'lda to'ldirish (mos kelmagan deposit yoki qo'llab-quvvatlash uchun)
bot.command("credit", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const [tgId, amtRaw, ...noteArr] = (ctx.match ?? "").toString().trim().split(/\s+/);
  const amt = Math.round((Number(amtRaw) || 0) * 1e6) / 1e6;
  if (!tgId || !(amt > 0)) return ctx.reply("Foydalanish: /credit <telegramId> <usdt> [izoh]");
  const u = await prisma.user.findUnique({ where: { telegramId: tgId } });
  if (!u) return ctx.reply("Foydalanuvchi topilmadi.");
  const after = await adjustBalance(u.id, amt, "admin_adjust", { note: noteArr.join(" ").slice(0, 120) || "admin credit" });
  // Shu summaga mos ochiq deposit'ni yopamiz — keyin on-chain tasdiq kelsa qayta kreditlanmasin
  const dep = await prisma.deposit.findFirst({ where: { userId: u.id, status: "pending", expectedAmount: amt } });
  if (dep) {
    await prisma.deposit
      .updateMany({ where: { id: dep.id, status: "pending" }, data: { status: "credited", txHash: "manual:" + dep.id, actualAmount: amt, creditedAt: new Date() } })
      .catch(() => {});
  }
  await bot.api.sendMessage(tgId, `✅ Balansingiz to'ldirildi: +${fmtUsd(amt)} USDT\nJoriy balans: ${fmtUsd(after)} USDT`).catch(() => {});
  await ctx.reply(`✅ @${u.username ?? tgId} balansi: ${fmtUsd(after)} USDT${dep ? " (deposit #" + dep.id + " yopildi)" : ""}`);
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

// ---------------- Moderatsiya (admin) ----------------

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
  await prisma.report.update({ where: { id }, data: { status: "dismissed" } }).catch(() => {});
  await modLog("dismiss", { adminTgId: String(ctx.from?.id), note: `report#${id}` });
  await ctx.answerCallbackQuery("✅ Rad etildi");
  await ctx.editMessageReplyMarkup().catch(() => {});
});

// TRON hot-wallet holati (admin) — USDT + TRX (gaz)
bot.command("hotwallet", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  if (!tronEnabled()) return ctx.reply("⚙️ TRON hot-wallet sozlanmagan (.env: TRON_HOTWALLET_*).");
  const addr = hotWalletAddress();
  let usdt: number | null = null;
  let trx: number | null = null;
  try {
    usdt = await getUsdtBalance(addr);
  } catch {
    /* API/rate-limit */
  }
  try {
    trx = await getTrxBalance(addr);
  } catch {
    /* API */
  }
  await ctx.reply(
    `🏦 Hot-wallet (TRON)\n${addr}\n\n` +
      `💵 USDT: ${usdt === null ? "noma'lum (API/kalit)" : fmtUsd(usdt) + " USDT"}\n` +
      `⛽ TRX (gaz): ${trx === null ? "noma'lum" : trx.toFixed(1) + " TRX"}\n\n` +
      `To'ldirishlar shu yerga tushadi; payout/refund yechish shundan chiqadi. Gaz (TRX) kamaysa payout to'xtaydi — TRX to'ldiring.`,
  );
});

// Platforma statistikasi (admin)
bot.command("balance", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const feeAgg = await prisma.unlock.aggregate({ _sum: { platformFeeUsdt: true, creatorEarnedUsdt: true }, where: { refunded: false } });
  const paidAgg = await prisma.payout.aggregate({ _sum: { amountUsdt: true }, where: { status: "paid" } });
  const refAgg = await prisma.refund.aggregate({ _sum: { amountUsdt: true }, where: { status: "credited" } });
  const balAgg = await prisma.user.aggregate({ _sum: { balanceUsdt: true } });
  const depAgg = await prisma.deposit.aggregate({ _sum: { actualAmount: true }, where: { status: "credited" } });
  let out = "📊 Platforma statistikasi\n";
  out += `\n💰 To'ldirilgan (jami): ${fmtUsd(depAgg._sum.actualAmount ?? 0)} USDT`;
  out += `\n🏦 Komissiya (${100 - config.creatorSharePercent}%): ${fmtUsd(feeAgg._sum.platformFeeUsdt ?? 0)} USDT`;
  out += `\n👥 Creatorlar (${config.creatorSharePercent}%): ${fmtUsd(feeAgg._sum.creatorEarnedUsdt ?? 0)} USDT`;
  out += `\n💸 To'langan payout: ${fmtUsd(paidAgg._sum.amountUsdt ?? 0)} USDT`;
  out += `\n↩️ Refund (balansga): ${fmtUsd(refAgg._sum.amountUsdt ?? 0)} USDT`;
  out += `\n👛 Userlar balansi (jami majburiyat): ${fmtUsd(balAgg._sum.balanceUsdt ?? 0)} USDT`;
  if (tronEnabled()) {
    const addr = hotWalletAddress();
    let usdt: number | null = null;
    try {
      usdt = await getUsdtBalance(addr);
    } catch {
      /* API */
    }
    out += `\n\n🏦 Hot-wallet USDT: ${usdt === null ? "noma'lum" : fmtUsd(usdt) + " USDT"}`;
    if (usdt !== null) out += `\n   (majburiyatdan ${usdt >= (balAgg._sum.balanceUsdt ?? 0) ? "✅ yetarli" : "⚠️ KAM!"})`;
  } else {
    out += "\n\n⚙️ TRON hot-wallet hali sozlanmagan.";
  }
  await ctx.reply(out);
});

// To'lov — balansdan (off-chain); to'ldirish USDT-TRC20 orqali (watcher tanib oladi).

// ---------------- Telegram Stars to'lov handlerlari ----------------
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
  // O'z kontentini sotib olsa — daromad YOZILMAYDI (statistika/tier shishmasin), lekin video beriladi
  if (content.creatorId === user.id) {
    await bot.api.sendVideo(String(ctx.from.id), content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true }).catch(() => {});
    return;
  }
  const stars = sp.total_amount;
  // Dinamik ulush — creator darajasi bo'yicha (Unlock.shareBps snapshot qilinadi)
  const creator = content.creatorId ? await prisma.user.findUnique({ where: { id: content.creatorId }, select: { tierSharePercent: true } }) : null;
  const sharePct = creator?.tierSharePercent ?? config.creatorSharePercent;
  const { creatorEarned, platformFee } = starsShare(stars, sharePct);
  // Daraja/bonus uchun sanaladimi (self-buy yuqorida chiqib ketgan → arms-length; qolgani tekshirilgan xaridor)
  const counts = await buyerVerified(user.id).catch(() => false);
  await recordUnlock(user.id, contentId, {
    source: "stars",
    starsPaid: stars,
    creatorEarned,
    platformFee,
    shareBps: sharePct * 100,
    countsForTier: counts,
    chargeId: sp.telegram_payment_charge_id,
  });
  try {
    await bot.api.sendVideo(String(ctx.from.id), content.videoFileId, {
      caption: `🎬 ${content.title}`,
      supports_streaming: true,
      reply_markup: new InlineKeyboard().text(t(normLang(user.lang), "complaintBtn"), `complain:${contentId}`),
    });
  } catch (e) {
    if (!isCantDeliver(e)) console.error("Stars yetkazish xatosi:", e);
  }
});

// Admin: Stars yechish so'rovini qo'lda tasdiqlash (tashqi tarqatgach)
bot.callbackQuery(/^spayout_ok:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  await prisma.payout.updateMany({ where: { id, status: { in: ["requested", "processing"] } }, data: { status: "paid" } });
  const p = await prisma.payout.findUnique({ where: { id }, include: { user: true } });
  if (p) await bot.api.sendMessage(p.user.telegramId, `✅ ${p.amountStars} ⭐ hisobingizga tarqatildi.`).catch(() => {});
  await ctx.answerCallbackQuery("✅ To'landi");
  await ctx.editMessageReplyMarkup().catch(() => {});
});
bot.callbackQuery(/^spayout_no:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  await prisma.payout.updateMany({ where: { id, status: { in: ["requested", "processing"] } }, data: { status: "rejected" } });
  await ctx.answerCallbackQuery("Rad etildi");
  await ctx.editMessageReplyMarkup().catch(() => {});
});

// Admin CRM — tez xulosa + to'liq dashboard tugmasi
bot.command("crm", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const d = await getCrmData();
  const t = d.totals;
  const money = (u: number) => "$" + u.toFixed(2);
  let out = "📊 CRM (jami)\n\n";
  out += `💰 Jami yig'ilgan: ${t.totalStars} ⭐ (${money(t.totalUsd)})\n`;
  out += `🏦 Komissiya (${t.blendedCommissionPct}%): ${t.commissionStars} ⭐ (${money(t.commissionUsd)})\n`;
  out += `👥 Creatorlar topgani: ${t.creatorStars} ⭐ (${money(t.creatorUsd)})\n`;
  out += `🛒 Sotuvlar: ${t.sales} · ${t.distinctBuyers} xaridor\n`;
  out += `⏳ Kutilayotgan payout: ${t.pendingPayoutStars} ⭐\n`;
  out += `👛 Tarqatilmagan balans: ${t.undistributedLiabilityStars} ⭐ (${money(t.undistributedLiabilityUsd)})\n`;
  out += `🎭 Faol creatorlar: ${t.activeCreators}/${t.totalCreators}`;
  if (d.creators.length) {
    out += "\n\n🏆 Top creatorlar:\n";
    d.creators.slice(0, 5).forEach((c, i) => {
      out += `${i + 1}. ${c.firstName ?? c.username ?? c.telegramId}: ${c.starsEarned} ⭐ (${c.sales} sotuv)\n`;
    });
  }
  const url = config.webappUrl ? config.webappUrl.replace(/\/$/, "") + "/admin" : "";
  const kb = url ? new InlineKeyboard().webApp("📊 To'liq CRM panel", url) : undefined;
  await ctx.reply(out, kb ? { reply_markup: kb } : {});
});

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
