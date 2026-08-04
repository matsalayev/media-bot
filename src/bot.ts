import { Bot, Context, InlineKeyboard, InputFile, session, SessionFlavor } from "grammy";
import { randomUUID } from "crypto";
import { config, assertBotConfig } from "./config";
import { prisma } from "./db";
import { s3Enabled, uploadReelToS3 } from "./storage";

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

async function upsertUser(tg: {
  id: string;
  username?: string;
  first_name?: string;
  language_code?: string;
}) {
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
    await bot.api
      .sendMessage(adminId, text, keyboard ? { reply_markup: keyboard } : {})
      .catch(() => {});
  }
}

export async function creatorBalance(
  creatorUserId: number,
): Promise<{ earned: number; reserved: number; available: number }> {
  const agg = await prisma.unlock.aggregate({
    _sum: { creatorEarned: true },
    where: { content: { creatorId: creatorUserId } },
  });
  const earned = agg._sum.creatorEarned ?? 0;
  const paid = await prisma.payout.aggregate({
    _sum: { amountStars: true },
    where: { userId: creatorUserId, status: { in: ["requested", "paid"] } },
  });
  const reserved = paid._sum.amountStars ?? 0;
  return { earned, reserved, available: earned - reserved };
}

// ---------------- Storage yordamchilari (S3 reels + Telegram to'liq video) ----------------

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

/** Reel'ni saqlaydi: S3 sozlangan bo'lsa S3 URL, aks holda Telegram file_id. */
async function storeReel(source: { buffer?: Buffer; fileId?: string }): Promise<{
  reelUrl: string | null;
  reelFileId: string | null;
}> {
  if (s3Enabled()) {
    const buf = source.buffer ?? (source.fileId ? await downloadTelegramFile(source.fileId) : null);
    if (buf) {
      const url = await uploadReelToS3(buf, `reels/${randomUUID()}.mp4`);
      return { reelUrl: url, reelFileId: null };
    }
  }
  if (source.fileId) return { reelUrl: null, reelFileId: source.fileId };
  if (source.buffer) {
    const target = config.storageChannelId || config.adminIds[0];
    if (target) return { reelUrl: null, reelFileId: await sendVideoGetFileId(target, source.buffer, "reel.mp4") };
  }
  return { reelUrl: null, reelFileId: null };
}

/** To'liq videoni yopiq storage kanal/guruxga yuboradi va file_id qaytaradi. */
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

/** Yagona kontent yaratish yo'li (bot va Mini App API uchun). */
export async function createContent(
  uploaderTelegramId: string,
  reel: { buffer?: Buffer; fileId?: string },
  video: { buffer?: Buffer; fileId?: string },
  title: string,
  price: number,
  publish: boolean,
) {
  const { reelUrl, reelFileId } = await storeReel(reel);
  const videoFileId = await storeFullVideo(video);
  const creator = await prisma.user.upsert({
    where: { telegramId: uploaderTelegramId },
    update: {},
    create: { telegramId: uploaderTelegramId, isAdmin: isAdmin(uploaderTelegramId) },
  });
  return prisma.content.create({
    data: {
      title,
      reelUrl,
      reelFileId,
      videoFileId,
      priceStars: price,
      status: publish ? "published" : "pending",
      creatorId: creator.id,
    },
  });
}

/** Kontentni foydalanuvchi chatiga yetkazadi (to'liq video). Paid unlock'da creator ulushini yozadi. */
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

  await bot.api.sendVideo(telegramId, content.videoFileId, {
    caption: `🎬 ${content.title}`,
    supports_streaming: true,
  });
  return true;
}

export async function createStarsInvoiceLink(contentId: number, buyerTelegramId: string): Promise<string> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new Error("content not found");
  const payload = JSON.stringify({ t: "unlock", contentId, buyer: buyerTelegramId });
  return bot.api.createInvoiceLink(
    content.title,
    content.description ?? "Kontentni ochish",
    payload,
    "",
    "XTR",
    [{ label: content.title.slice(0, 32) || "Access", amount: content.priceStars }],
  );
}

export async function notifyAdminsNewContent(
  content: { id: number; title: string; priceStars: number; reelUrl: string | null; reelFileId: string | null },
  authorLabel: string,
): Promise<void> {
  const kb = new InlineKeyboard()
    .text("✅ Tasdiqlash", `approve:${content.id}`)
    .text("❌ Rad etish", `reject:${content.id}`);
  const cap = `🆕 Yangi kontent #${content.id}\n«${content.title}» — ${content.priceStars === 0 ? "bepul" : content.priceStars + " ⭐"}\nMuallif: ${authorLabel}`;
  const preview = content.reelUrl || content.reelFileId;
  for (const adminId of config.adminIds) {
    if (preview) {
      await bot.api
        .sendVideo(adminId, preview, { caption: cap, reply_markup: kb })
        .catch(() => bot.api.sendMessage(adminId, cap, { reply_markup: kb }).catch(() => {}));
    } else {
      await bot.api.sendMessage(adminId, cap, { reply_markup: kb }).catch(() => {});
    }
  }
}

export async function requestPayout(
  telegramId: string,
): Promise<{ ok: boolean; message: string; payoutId?: number; amount?: number }> {
  const creator = await prisma.user.findUnique({ where: { telegramId } });
  if (!creator) return { ok: false, message: "Avval /start bosing." };
  const b = await creatorBalance(creator.id);
  if (b.available < config.minWithdrawStars) {
    return { ok: false, message: `Yechish uchun kamida ${config.minWithdrawStars} ⭐ kerak. Mavjud: ${b.available} ⭐` };
  }
  const payout = await prisma.payout.create({ data: { userId: creator.id, amountStars: b.available, status: "requested" } });
  const kb = new InlineKeyboard()
    .text("✅ To'landi", `payout_paid:${payout.id}`)
    .text("❌ Rad", `payout_reject:${payout.id}`);
  await notifyAdmins(
    `💸 Payout so'rovi #${payout.id}\nMuallif: @${creator.username ?? creator.telegramId}\nSumma: ${b.available} ⭐`,
    kb,
  );
  return {
    ok: true,
    message: `✅ ${b.available} ⭐ yechish so'rovi qabul qilindi (#${payout.id}). Admin ko'rib chiqadi.`,
    payoutId: payout.id,
    amount: b.available,
  };
}

// ==================== Buyruqlar ====================

bot.command("start", async (ctx) => {
  if (ctx.from) {
    await upsertUser({
      id: String(ctx.from.id),
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      language_code: ctx.from.language_code,
    });
  }
  const kb = config.webappUrl ? new InlineKeyboard().webApp("🎬 Ochish", config.webappUrl) : undefined;
  await ctx.reply(
    "🎬 Kino'ga xush kelibsiz!\n\nQisqa videolarni ko'ring, yoqqanini Stars evaziga to'liq oching — video shu chatga yuboriladi.\n\n💡 O'z videongizni joylab pul ishlang: /upload",
    { reply_markup: kb },
  );
});

bot.command("help", (ctx) =>
  ctx.reply(
    [
      "🎬 Menyudagi «Kino» tugmasi orqali ilovani oching.",
      "",
      "👤 Creator (istalgan foydalanuvchi):",
      "/upload — video joylash (moderatsiyadan o'tadi)",
      "/mycontent — mening kontentim va statistikam",
      "/earnings — daromadim",
      "/withdraw — balansni yechish",
      "",
      "🛠 Admin:",
      "/add — to'g'ridan-to'g'ri nashr qilish",
      "/pending — moderatsiyadagi kontent",
      "/payouts — yechish (payout) so'rovlari",
      "/cancel — jarayonni bekor qilish",
    ].join("\n"),
  ),
);

// ---------------- Yuklash oqimi (admin va creator umumiy FSM) ----------------

bot.command("add", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.reply("Bu buyruq faqat adminlar uchun. Video joylash uchun /upload.");
  ctx.session.step = "reel";
  ctx.session.mode = "admin";
  ctx.session.draft = {};
  await ctx.reply("1/3 — Qisqa REELS videoni (vertikal short) yuboring.");
});

bot.command("upload", async (ctx) => {
  if (ctx.from) await upsertUser({ id: String(ctx.from.id), username: ctx.from.username, first_name: ctx.from.first_name });
  ctx.session.step = "reel";
  ctx.session.mode = "creator";
  ctx.session.draft = {};
  await ctx.reply("🎬 Yangi video joylash.\n\n1/3 — Qisqa REELS videoni (vertikal short, 1–3 daqiqa) yuboring.\n\nBekor qilish: /cancel");
});

bot.command("cancel", async (ctx) => {
  ctx.session.step = undefined;
  ctx.session.mode = undefined;
  ctx.session.draft = {};
  await ctx.reply("Bekor qilindi.");
});

bot.on("message:video", async (ctx) => {
  if (!ctx.session.step) return;
  const fileId = ctx.message.video.file_id;
  if (ctx.session.step === "reel") {
    ctx.session.draft.reelFileId = fileId;
    ctx.session.step = "video";
    await ctx.reply("2/3 — Endi TO'LIQ videoni (kino / asosiy material) yuboring.");
  } else if (ctx.session.step === "video") {
    ctx.session.draft.videoFileId = fileId;
    ctx.session.step = "meta";
    await ctx.reply("3/3 — Sarlavha va narxni yuboring:\nSarlavha | narx\nMasalan:  Qiziqarli video | 50   (0 = bepul)");
  }
});

bot.on("message:text", async (ctx) => {
  if (ctx.session.step !== "meta" || !ctx.from) return;
  const [titleRaw, priceRaw] = ctx.message.text.split("|");
  const title = (titleRaw ?? "").trim();
  const price = Math.max(0, parseInt((priceRaw ?? "0").trim(), 10) || 0);
  const d = ctx.session.draft;
  const mode = ctx.session.mode ?? "creator";
  if (!title || !d.reelFileId || !d.videoFileId) {
    return ctx.reply("Ma'lumot to'liq emas. /upload bilan qaytadan boshlang.");
  }

  await ctx.reply("⏳ Saqlanmoqda…");
  const content = await createContent(
    String(ctx.from.id),
    { fileId: d.reelFileId },
    { fileId: d.videoFileId },
    title,
    price,
    mode === "admin",
  );

  ctx.session.step = undefined;
  ctx.session.mode = undefined;
  ctx.session.draft = {};

  if (mode === "admin") {
    await ctx.reply(`✅ Nashr qilindi: «${content.title}» (${price === 0 ? "bepul" : price + " ⭐"}). ID: ${content.id}`);
  } else {
    await ctx.reply(`✅ «${content.title}» qabul qilindi va moderatsiyaga yuborildi.\nStatistika: /mycontent`);
    await notifyAdminsNewContent(content, "@" + (ctx.from.username ?? ctx.from.id));
  }
});

// ---------------- Moderatsiya (admin) ----------------

bot.command("pending", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const list = await prisma.content.findMany({ where: { status: "pending" }, orderBy: { id: "asc" }, take: 10 });
  if (!list.length) return ctx.reply("Moderatsiyada kontent yo'q. ✅");
  for (const c of list) {
    const kb = new InlineKeyboard()
      .text("✅ Tasdiqlash", `approve:${c.id}`)
      .text("❌ Rad etish", `reject:${c.id}`);
    const cap = `#${c.id} «${c.title}» — ${c.priceStars === 0 ? "bepul" : c.priceStars + " ⭐"}`;
    const preview = c.reelUrl || c.reelFileId;
    if (preview) {
      await ctx.replyWithVideo(preview, { caption: cap, reply_markup: kb }).catch(() => ctx.reply(cap, { reply_markup: kb }));
    } else {
      await ctx.reply(cap, { reply_markup: kb });
    }
  }
});

bot.callbackQuery(/^approve:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  const content = await prisma.content.update({ where: { id }, data: { status: "published", rejectionReason: null } });
  await ctx.answerCallbackQuery("✅ Tasdiqlandi");
  await ctx.editMessageReplyMarkup().catch(() => {});
  if (content.creatorId) {
    const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
    if (creator) await bot.api.sendMessage(creator.telegramId, `✅ «${content.title}» tasdiqlandi va endi feed'da!`).catch(() => {});
  }
});

bot.callbackQuery(/^reject:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const id = Number(ctx.match[1]);
  const content = await prisma.content.update({ where: { id }, data: { status: "rejected" } });
  await ctx.answerCallbackQuery("❌ Rad etildi");
  await ctx.editMessageReplyMarkup().catch(() => {});
  if (content.creatorId) {
    const creator = await prisma.user.findUnique({ where: { id: content.creatorId } });
    if (creator) await bot.api.sendMessage(creator.telegramId, `❌ «${content.title}» kontentingiz rad etildi.`).catch(() => {});
  }
});

// ---------------- Creator: statistika va daromad ----------------

bot.command("mycontent", async (ctx) => {
  if (!ctx.from) return;
  const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
  if (!creator) return ctx.reply("Avval /start bosing.");
  const list = await prisma.content.findMany({ where: { creatorId: creator.id }, orderBy: { id: "desc" }, take: 20 });
  if (!list.length) return ctx.reply("Sizda hali kontent yo'q. /upload orqali joylang.");
  const earned = await prisma.unlock.groupBy({
    by: ["contentId"],
    _sum: { creatorEarned: true },
    where: { content: { creatorId: creator.id } },
  });
  const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarned ?? 0]));
  const emoji = (s: string) => (s === "published" ? "🟢" : s === "pending" ? "🟡" : s === "rejected" ? "🔴" : "⚪");
  const lines = list.map(
    (c) => `${emoji(c.status)} «${c.title}» — 👁 ${c.viewCount} · 🔓 ${c.unlockCount} · ❤️ ${c.likeCount} · 💰 ${em.get(c.id) ?? 0} ⭐`,
  );
  await ctx.reply("📂 Sizning kontentingiz:\n\n" + lines.join("\n") + "\n\nDaromad: /earnings");
});

bot.command("earnings", async (ctx) => {
  if (!ctx.from) return;
  const creator = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
  if (!creator) return ctx.reply("Avval /start bosing.");
  const b = await creatorBalance(creator.id);
  await ctx.reply(
    [
      "💰 Daromadingiz",
      "",
      `Jami ishlangan: ${b.earned} ⭐`,
      `Yechilgan/so'ralgan: ${b.reserved} ⭐`,
      `Mavjud balans: ${b.available} ⭐`,
      "",
      `Yechish: /withdraw (min ${config.minWithdrawStars} ⭐)`,
      `Ulush: siz ${config.creatorSharePercent}%, platforma ${100 - config.creatorSharePercent}%`,
    ].join("\n"),
  );
});

bot.command("withdraw", async (ctx) => {
  if (!ctx.from) return;
  const res = await requestPayout(String(ctx.from.id));
  await ctx.reply(res.message);
});

// ---------------- Payout ijrosi (admin) ----------------

bot.command("payouts", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const list = await prisma.payout.findMany({
    where: { status: "requested" },
    orderBy: { id: "asc" },
    take: 20,
    include: { user: true },
  });
  if (!list.length) return ctx.reply("Kutayotgan payout so'rovi yo'q. ✅");
  for (const p of list) {
    const kb = new InlineKeyboard()
      .text("✅ To'landi", `payout_paid:${p.id}`)
      .text("❌ Rad", `payout_reject:${p.id}`);
    await ctx.reply(
      `💸 #${p.id} — @${p.user.username ?? p.user.telegramId}\nSumma: ${p.amountStars} ⭐\nSana: ${p.createdAt.toISOString().slice(0, 10)}`,
      { reply_markup: kb },
    );
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
  await ctx.answerCallbackQuery("✅ To'langan deb belgilandi");
  await ctx.editMessageReplyMarkup().catch(() => {});
  await bot.api.sendMessage(p.user.telegramId, `✅ Payout #${p.id}: ${p.amountStars} ⭐ to'landi. Rahmat!`).catch(() => {});
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
    await ctx.reply("✅ To'lov qabul qilindi — video shu chatga yuborildi.");
  }
});

bot.catch((err) => console.error("Bot xatosi:", err.error));
