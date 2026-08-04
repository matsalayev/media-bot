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

/** Creator balansi — USDT'da (jami ishlangan, band qilingan, mavjud). */
export async function creatorBalance(
  creatorUserId: number,
): Promise<{ earned: number; reserved: number; available: number }> {
  const agg = await prisma.unlock.aggregate({ _sum: { creatorEarnedUsdt: true }, where: { content: { creatorId: creatorUserId } } });
  const earned = agg._sum.creatorEarnedUsdt ?? 0;
  const paid = await prisma.payout.aggregate({
    _sum: { amountUsdt: true },
    where: { userId: creatorUserId, status: { in: ["requested", "processing", "paid"] } },
  });
  const reserved = paid._sum.amountUsdt ?? 0;
  return { earned, reserved, available: Math.max(0, earned - reserved) };
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
  await bot.api.sendVideo(buyerTelegramId, content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true });
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
  } else {
    await sendWelcome(ctx, normLang(user.lang));
  }
});

bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
  const lang = ctx.match[1] as Lang;
  if (ctx.from) await prisma.user.update({ where: { telegramId: String(ctx.from.id) }, data: { lang } }).catch(() => {});
  await ctx.answerCallbackQuery(t(lang, "langSet"));
  await ctx.editMessageReplyMarkup().catch(() => {});
  await sendWelcome(ctx, lang);
});

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
      available: fmtUsd(b.available),
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
