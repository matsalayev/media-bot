import { Bot, Context, InlineKeyboard, InputFile, session, SessionFlavor } from "grammy";
import { randomUUID } from "crypto";
import { config, assertBotConfig } from "./config";
import { prisma } from "./db";
import { s3Enabled, putReelToS3, publicUrlFor } from "./storage";
import { t, normLang, Lang } from "./i18n";

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

async function notifyAdmins(text: string, keyboard?: InlineKeyboard): Promise<void> {
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

export async function creatorBalance(
  creatorUserId: number,
): Promise<{ earned: number; reserved: number; available: number }> {
  const agg = await prisma.unlock.aggregate({ _sum: { creatorEarned: true }, where: { content: { creatorId: creatorUserId } } });
  const earned = agg._sum.creatorEarned ?? 0;
  const paid = await prisma.payout.aggregate({
    _sum: { amountStars: true },
    where: { userId: creatorUserId, status: { in: ["requested", "paid"] } },
  });
  const reserved = paid._sum.amountStars ?? 0;
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

/** Yagona kontent yaratish (bot va Mini App API uchun). Auto-publish. */
export async function createContent(
  uploaderTelegramId: string,
  reel: { buffer?: Buffer; fileId?: string },
  video: { buffer?: Buffer; fileId?: string },
  title: string,
  price: number,
) {
  const { reelUrl, reelFileId } = await storeReel(reel);
  const videoFileId = await storeFullVideo(video);
  const creator = await prisma.user.upsert({
    where: { telegramId: uploaderTelegramId },
    update: {},
    create: { telegramId: uploaderTelegramId, isAdmin: isAdmin(uploaderTelegramId) },
  });
  return prisma.content.create({
    data: { title, reelUrl, reelFileId, videoFileId, priceStars: price, status: "published", creatorId: creator.id },
  });
}

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

  let creatorEarned = 0;
  let platformFee = 0;
  if (source === "stars" && starsPaid > 0) {
    creatorEarned = Math.floor((starsPaid * config.creatorSharePercent) / 100);
    platformFee = starsPaid - creatorEarned;
  }
  await prisma.unlock.upsert({
    where: { userId_contentId: { userId: user.id, contentId } },
    update: {},
    create: { userId: user.id, contentId, source, starsPaid, creatorEarned, platformFee, chargeId },
  });
  await prisma.content.update({ where: { id: contentId }, data: { unlockCount: { increment: 1 } } });
  await bot.api.sendVideo(telegramId, content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true });
  return true;
}

export async function createStarsInvoiceLink(contentId: number, buyerTelegramId: string): Promise<string> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new Error("content not found");
  const payload = JSON.stringify({ t: "unlock", contentId, buyer: buyerTelegramId });
  return bot.api.createInvoiceLink(content.title, content.description ?? "Unlock", payload, "", "XTR", [
    { label: content.title.slice(0, 32) || "Access", amount: content.priceStars },
  ]);
}

export async function requestPayout(
  telegramId: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; payoutId?: number; amount?: number }> {
  const l = normLang(lang);
  const creator = await prisma.user.findUnique({ where: { telegramId } });
  if (!creator) return { ok: false, message: t(l, "startFirst") };
  const b = await creatorBalance(creator.id);
  if (b.available < config.minWithdrawStars) {
    return { ok: false, message: t(l, "withdrawMin", { min: config.minWithdrawStars, available: b.available }) };
  }
  const payout = await prisma.payout.create({ data: { userId: creator.id, amountStars: b.available, status: "requested" } });
  const kb = new InlineKeyboard().text("✅ To'landi", `payout_paid:${payout.id}`).text("❌ Rad", `payout_reject:${payout.id}`);
  await notifyAdmins(
    `💸 Payout so'rovi #${payout.id}\nMuallif: @${creator.username ?? creator.telegramId}\nSumma: ${b.available} ⭐`,
    kb,
  );
  return { ok: true, message: t(l, "withdrawOk", { amount: b.available, id: payout.id }), payoutId: payout.id, amount: b.available };
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

bot.on("message:text", async (ctx) => {
  if (ctx.session.step !== "meta" || !ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  const [titleRaw, priceRaw] = ctx.message.text.split("|");
  const title = (titleRaw ?? "").trim();
  const price = Math.max(0, parseInt((priceRaw ?? "0").trim(), 10) || 0);
  const d = ctx.session.draft;
  if (!title || !d.reelFileId || !d.videoFileId) return ctx.reply(t(lang, "incomplete"));
  await ctx.reply(t(lang, "saving"));
  const content = await createContent(String(ctx.from.id), { fileId: d.reelFileId }, { fileId: d.videoFileId }, title, price);
  ctx.session.step = undefined;
  ctx.session.mode = undefined;
  ctx.session.draft = {};
  await ctx.reply(t(lang, "published", { title: content.title, price: price === 0 ? t(lang, "free") : price + " ⭐" }));
});

// ---------------- Creator: statistika va daromad ----------------

bot.command("mycontent", async (ctx) => {
  if (!ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
  if (!creator) return ctx.reply(t(lang, "startFirst"));
  const list = await prisma.content.findMany({ where: { creatorId: creator.id }, orderBy: { id: "desc" }, take: 20 });
  if (!list.length) return ctx.reply(t(lang, "noContent"));
  const earned = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarned: true }, where: { content: { creatorId: creator.id } } });
  const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarned ?? 0]));
  const lines = list.map((c) => `«${c.title}» — 👁 ${c.viewCount} · 🔓 ${c.unlockCount} · ❤️ ${c.likeCount} · 💰 ${em.get(c.id) ?? 0} ⭐`);
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
      earned: b.earned,
      reserved: b.reserved,
      available: b.available,
      min: config.minWithdrawStars,
      share: config.creatorSharePercent,
      plat: 100 - config.creatorSharePercent,
    }),
  );
});

bot.command("withdraw", async (ctx) => {
  if (!ctx.from) return;
  const lang = await userLang(String(ctx.from.id));
  const res = await requestPayout(String(ctx.from.id), lang);
  await ctx.reply(res.message);
});

// ---------------- Payout ijrosi (admin) ----------------

bot.command("payouts", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const list = await prisma.payout.findMany({ where: { status: "requested" }, orderBy: { id: "asc" }, take: 20, include: { user: true } });
  if (!list.length) return ctx.reply("Kutayotgan payout so'rovi yo'q. ✅");
  for (const p of list) {
    const kb = new InlineKeyboard().text("✅ To'landi", `payout_paid:${p.id}`).text("❌ Rad", `payout_reject:${p.id}`);
    await ctx.reply(`💸 #${p.id} — @${p.user.username ?? p.user.telegramId}\nSumma: ${p.amountStars} ⭐`, { reply_markup: kb });
  }
});

bot.callbackQuery(/^payout_paid:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  const p = await prisma.payout.findUnique({ where: { id }, include: { user: true } });
  if (!p || p.status !== "requested") {
    await ctx.answerCallbackQuery("Allaqachon ko'rib chiqilgan");
    await ctx.editMessageReplyMarkup().catch(() => {});
    return;
  }
  await prisma.payout.update({ where: { id }, data: { status: "paid" } });
  await ctx.answerCallbackQuery("✅ To'langan");
  await ctx.editMessageReplyMarkup().catch(() => {});
  await bot.api.sendMessage(p.user.telegramId, `✅ Payout #${p.id}: ${p.amountStars} ⭐ to'landi.`).catch(() => {});
});

bot.callbackQuery(/^payout_reject:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  const p = await prisma.payout.findUnique({ where: { id }, include: { user: true } });
  if (!p || p.status !== "requested") {
    await ctx.answerCallbackQuery("Allaqachon ko'rib chiqilgan");
    await ctx.editMessageReplyMarkup().catch(() => {});
    return;
  }
  await prisma.payout.update({ where: { id }, data: { status: "rejected" } });
  await ctx.answerCallbackQuery("❌ Rad etildi");
  await ctx.editMessageReplyMarkup().catch(() => {});
  await bot.api.sendMessage(p.user.telegramId, `❌ Payout #${p.id} rad etildi. ${p.amountStars} ⭐ balansingizga qaytdi.`).catch(() => {});
});

// ---------------- To'lovlar (Telegram Stars) ----------------

bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true).catch(() => {}));

bot.on("message:successful_payment", async (ctx) => {
  const sp = ctx.message.successful_payment;
  let payload: { t?: string; contentId?: number } | undefined;
  try {
    payload = JSON.parse(sp.invoice_payload);
  } catch {
    return;
  }
  if (payload?.t === "unlock" && payload.contentId && ctx.from) {
    await deliverContent(String(ctx.from.id), Number(payload.contentId), "stars", sp.total_amount, sp.telegram_payment_charge_id);
    await ctx.reply(t(await userLang(String(ctx.from.id)), "paymentDone"));
  }
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
