import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { readFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { config } from "./config";
import { prisma } from "./db";
import { validateInitData, TgUser } from "./auth";
import { s3Enabled, presignReelUrl } from "./storage";
import { normLang } from "./i18n";
import { bot, deliverContent, sendUnlockedVideo, createContent, createComplaint, createReport, assertCanUpload, createStarsInvoice, creatorStarsBalance, requestStarsPayout, getCrmData } from "./bot";
import { usdtToStars } from "./pricing";

const WEBAPP_DIR = join(__dirname, "..", "webapp");

async function reelSrc(c: { reelUrl: string | null; reelFileId: string | null; id: number }): Promise<string> {
  if (c.reelUrl) {
    if (/^https?:\/\//.test(c.reelUrl)) return c.reelUrl; // public / CloudFront URL
    if (s3Enabled()) return presignReelUrl(c.reelUrl); // S3 key -> presigned URL
  }
  return `/media/reel/${c.id}`; // Telegram proxy fallback
}

async function getUser(tg: TgUser) {
  return prisma.user.upsert({
    where: { telegramId: tg.id },
    update: { username: tg.username, firstName: tg.first_name },
    create: { telegramId: tg.id, username: tg.username, firstName: tg.first_name, languageCode: tg.language_code },
  });
}

// Fayl haqiqiy videomi (magic bytes: MP4/MOV 'ftyp', WebM/Matroska EBML)
function looksLikeVideo(b: Buffer): boolean {
  if (!b || b.length < 12) return false;
  if (b.toString("ascii", 4, 8) === "ftyp") return true; // mp4/mov/m4v
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true; // webm/mkv
  return false;
}

function botUsername(): string {
  try {
    return bot.botInfo.username;
  } catch {
    return "";
  }
}

export function buildServer() {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 2 } });

  // ---- Mini App statik fayllari ----
  const serveFile = (file: string, type: string) => (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header("Content-Type", type);
    reply.send(readFileSync(join(WEBAPP_DIR, file)));
  };
  app.get("/", serveFile("index.html", "text/html; charset=utf-8"));
  app.get("/app.js", serveFile("app.js", "application/javascript; charset=utf-8"));
  app.get("/style.css", serveFile("style.css", "text/css; charset=utf-8"));
  app.get("/admin", serveFile("admin.html", "text/html; charset=utf-8"));
  app.get("/health", async () => ({ ok: true }));

  // ---- Admin CRM (faqat adminlar; initData + isAdmin) ----
  app.post("/api/admin/crm", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    if (!config.adminIds.includes(String(tg.id))) return reply.code(403).send({ error: "forbidden" });
    const daysRaw = Number((req.body as { days?: number })?.days);
    const days = [1, 7, 30].includes(daysRaw) ? daysRaw : undefined; // undefined = jami
    return getCrmData(days);
  });

  // ---- Reels feed ----
  app.post("/api/reels", async (req) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    const body = (req.body ?? {}) as { focus?: number };
    let userId: number | null = null;
    let lang = "uz";
    let acceptedTerms = true; // anonim ko'rish uchun true (harakatlar baribir bloklangan)
    if (tg) {
      const u = await getUser(tg);
      userId = u.id;
      lang = normLang(u.lang);
      acceptedTerms = u.acceptedTerms;
    }

    let items = await prisma.content.findMany({
      where: { status: "published" },
      orderBy: [{ likeCount: "desc" }, { id: "desc" }], // eng ko'p yoqtirilgan birinchi
      take: 30,
    });
    const focusId = Number(body.focus) || 0;
    if (focusId) {
      const f = await prisma.content.findFirst({ where: { id: focusId, status: "published" } });
      if (f) items = [f, ...items.filter((x) => x.id !== focusId)];
    }

    let unlocked = new Set<number>();
    let liked = new Set<number>();
    let saved = new Set<number>();
    if (userId) {
      unlocked = new Set((await prisma.unlock.findMany({ where: { userId, refunded: false }, select: { contentId: true } })).map((x) => x.contentId));
      liked = new Set((await prisma.contentLike.findMany({ where: { userId }, select: { contentId: true } })).map((x) => x.contentId));
      saved = new Set((await prisma.savedItem.findMany({ where: { userId }, select: { contentId: true } })).map((x) => x.contentId));
    }

    return {
      botUsername: botUsername(),
      lang,
      acceptedTerms,
      items: await Promise.all(
        items.map(async (c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          priceUsdt: c.priceUsdt,
          reelUrl: await reelSrc(c),
          unlocked: unlocked.has(c.id) || c.priceUsdt === 0 || (userId !== null && c.creatorId === userId),
          canReport: unlocked.has(c.id) && c.priceUsdt > 0 && c.creatorId !== userId, // sotib olingan pullik kontent → shikoyat mumkin
          liked: liked.has(c.id),
          saved: saved.has(c.id),
          likeCount: c.likeCount,
          saveCount: c.saveCount,
          shareCount: c.shareCount,
        })),
      ),
    };
  });

  // ---- Ochish / yetkazish (bepul yoki allaqachon ochilgan) ----
  app.post("/api/unlock", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });

    const content = await prisma.content.findFirst({ where: { id: contentId, status: "published" } });
    if (!content) return reply.code(404).send({ error: "not found" });

    const user = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    const alreadyUnlocked = user
      ? await prisma.unlock.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } })
      : null;

    const isOwner = !!user && content.creatorId === user.id;
    if (content.priceUsdt === 0 || isOwner || (alreadyUnlocked && !alreadyUnlocked.refunded)) {
      await deliverContent(tg.id, contentId, content.priceUsdt === 0 ? "free" : "unlock");
      return { status: "delivered" };
    }
    return { status: "needpay", priceUsdt: content.priceUsdt }; // pullik yoki refund qilingan → balansdan (/api/buy)
  });

  // ---- Sotib olish — Telegram Stars invoice (Mini App tg.openInvoice bilan ochadi) ----
  app.post("/api/buy", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId kerak" });

    const content = await prisma.content.findFirst({ where: { id: contentId, status: "published" } });
    if (!content) return reply.code(404).send({ error: "not found" });
    if (content.priceUsdt <= 0) return reply.code(400).send({ error: "bepul kontent" });
    if (!content.videoFileId) return reply.code(409).send({ error: "kontent to'liq video yo'q" });

    const user = await getUser(tg);
    if (user.isBanned) return reply.code(403).send({ error: "banned", banned: true });
    if (!user.acceptedTerms) return reply.code(403).send({ error: "terms", needTerms: true });

    // Egasi yoki allaqachon ochilgan → bepul yetkazamiz
    const already = await prisma.unlock.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
    if (content.creatorId === user.id || (already && !already.refunded)) {
      await sendUnlockedVideo(tg.id, contentId).catch(() => {});
      return { status: "delivered" };
    }

    const inv = await createStarsInvoice(contentId, tg.id);
    if (!inv.ok || !inv.link) return reply.code(500).send({ error: inv.message || "invoice yaratilmadi" });
    return { status: "invoice", link: inv.link, stars: inv.stars };
  });

  // ---- Like (toggle) ----
  app.post("/api/like", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = await getUser(tg);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.contentLike.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
      let liked: boolean;
      if (existing) {
        await tx.contentLike.delete({ where: { id: existing.id } });
        liked = false;
      } else {
        await tx.contentLike.create({ data: { userId: user.id, contentId } });
        liked = true;
      }
      const likeCount = await tx.contentLike.count({ where: { contentId } }); // haqiqiy hisob — drift/manfiy yo'q
      await tx.content.update({ where: { id: contentId }, data: { likeCount } });
      return { liked, likeCount };
    });
  });

  // ---- Save (toggle) ----
  app.post("/api/save", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = await getUser(tg);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.savedItem.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
      let saved: boolean;
      if (existing) {
        await tx.savedItem.delete({ where: { id: existing.id } });
        saved = false;
      } else {
        await tx.savedItem.create({ data: { userId: user.id, contentId } });
        saved = true;
      }
      const saveCount = await tx.savedItem.count({ where: { contentId } });
      await tx.content.update({ where: { id: contentId }, data: { saveCount } });
      return { saved, saveCount };
    });
  });

  // ---- Share (deep link + hisob) ----
  app.post("/api/share", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    await prisma.content.update({ where: { id: contentId }, data: { shareCount: { increment: 1 } } }).catch(() => {});
    const u = botUsername();
    return { link: u ? `https://t.me/${u}?startapp=c${contentId}` : "" };
  });

  // ---- Aldov shikoyati (sotib olingan pullik kontent) ----
  app.post("/api/complaint", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { contentId?: number; reason?: string };
    const contentId = Number(body.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const u = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    return createComplaint(tg.id, contentId, body.reason, u?.lang ?? undefined);
  });

  // ---- Umumiy shikoyat (noqonuniy/nomaqbul kontent) — istalgan tomoshabin ----
  app.post("/api/report", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { contentId?: number; category?: string; reason?: string };
    const contentId = Number(body.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const u = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    return createReport(tg.id, contentId, String(body.category ?? "other"), body.reason, u?.lang ?? undefined);
  });

  // ---- Ko'rishni hisoblash (auth + validatsiya + dedup: user boshiga bir marta) ----
  app.post("/api/view", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const content = await prisma.content.findFirst({ where: { id: contentId, status: "published" }, select: { id: true } });
    if (!content) return reply.code(404).send({ error: "not found" });
    const user = await prisma.user.findUnique({ where: { telegramId: tg.id }, select: { id: true } });
    if (!user) return { ok: true };
    await prisma.$transaction(async (tx) => {
      const seen = await tx.view.findFirst({ where: { userId: user.id, contentId }, select: { id: true } });
      if (!seen) {
        await tx.view.create({ data: { contentId, userId: user.id } });
        await tx.content.update({ where: { id: contentId }, data: { viewCount: { increment: 1 } } });
      }
    });
    return { ok: true };
  });

  // ---- Profil: balans, mening kontentim, saqlanganlar ----
  app.post("/api/me", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const user = await getUser(tg);
    const sbal = await creatorStarsBalance(user.id);
    // DARAJA — joriy daraja + keyingi darajaga progress + kutilayotgan bonus
    const tiers = config.tiers;
    const curIdx = tiers.findIndex((t) => t.key === user.tier);
    const nextT = curIdx >= 0 && curIdx < tiers.length - 1 ? tiers[curIdx + 1] : null;
    const lifeUsd = (user.lifetimeEarnedStars ?? 0) * config.starUsd;
    const pendingBonus = await prisma.creatorBonus.aggregate({ _sum: { amountStars: true }, where: { userId: user.id, status: "pending" } }); // credited bonus allaqachon balansда — ikki marta sanamaymiz
    const daraja = {
      tier: user.tier,
      tierName: tiers.find((t) => t.key === user.tier)?.name ?? "Bronze",
      sharePercent: user.tierSharePercent,
      verified: user.isVerifiedCreator,
      lifetimeStars: user.lifetimeEarnedStars ?? 0,
      lifetimeUsd: Math.round(lifeUsd * 100) / 100,
      verifiedBuyers: user.verifiedBuyerCount ?? 0,
      pendingBonusStars: pendingBonus._sum.amountStars ?? 0,
      next: nextT
        ? { name: nextT.name, share: nextT.share, needUsd: Math.max(0, Math.round((nextT.usd - lifeUsd) * 100) / 100), needBuyers: Math.max(0, nextT.buyers - (user.verifiedBuyerCount ?? 0)) }
        : null,
    };
    const list = await prisma.content.findMany({
      where: { creatorId: user.id, status: { not: "removed" } },
      orderBy: { id: "desc" },
      take: 100,
    });
    const earned = await prisma.unlock.groupBy({
      by: ["contentId"],
      _sum: { creatorEarned: true },
      where: { refunded: false, content: { creatorId: user.id } },
    });
    const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarned ?? 0]));
    const savedRows = await prisma.savedItem.findMany({
      where: { userId: user.id, content: { status: "published" } },
      include: { content: true },
      orderBy: { id: "desc" },
      take: 50,
    });
    const likedRows = await prisma.contentLike.findMany({
      where: { userId: user.id, content: { status: "published" } },
      include: { content: true },
      orderBy: { id: "desc" },
      take: 50,
    });
    return {
      lang: normLang(user.lang),
      user: { firstName: user.firstName, username: user.username },
      paymentMode: "stars",
      balanceStars: Math.max(0, sbal.available),
      earnedStars: sbal.earned,
      minWithdrawStars: config.minWithdrawStars,
      starUsd: config.starUsd,
      creatorShare: config.creatorSharePercent,
      payoutEnabled: true,
      daraja,
      content: await Promise.all(
        list.map(async (c) => ({
          id: c.id,
          title: c.title,
          priceUsdt: c.priceUsdt,
          reelUrl: await reelSrc(c),
          status: c.status,
          views: c.viewCount,
          unlocks: c.unlockCount,
          likes: c.likeCount,
          earned: em.get(c.id) ?? 0,
        })),
      ),
      saved: await Promise.all(
        savedRows.map(async (s) => ({ id: s.content.id, title: s.content.title, priceUsdt: s.content.priceUsdt, reelUrl: await reelSrc(s.content) })),
      ),
      liked: await Promise.all(
        likedRows.map(async (l) => ({ id: l.content.id, title: l.content.title, priceUsdt: l.content.priceUsdt, reelUrl: await reelSrc(l.content) })),
      ),
    };
  });

  // ---- Kontentni tahrirlash (faqat egasi): nom / narx ----
  app.post("/api/content/update", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const body = (req.body ?? {}) as { contentId?: number; title?: string; priceUsdt?: number };
    const contentId = Number(body.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content || !user || content.creatorId !== user.id) return reply.code(403).send({ error: "not owner" });
    const data: { title?: string; priceUsdt?: number; priceStars?: number } = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 120);
    if (body.priceUsdt !== undefined) {
      const p = Math.max(0, Number(body.priceUsdt) || 0);
      data.priceUsdt = p;
      data.priceStars = usdtToStars(p);
    }
    if (!Object.keys(data).length) return reply.code(400).send({ error: "nothing to update" });
    const c = await prisma.content.update({ where: { id: contentId }, data });
    return { ok: true, id: c.id, title: c.title, priceUsdt: c.priceUsdt };
  });

  // ---- Kontentni o'chirish (faqat egasi): soft-delete ----
  app.post("/api/content/delete", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content || !user || content.creatorId !== user.id) return reply.code(403).send({ error: "not owner" });
    await prisma.content.update({ where: { id: contentId }, data: { status: "removed" } });
    return { ok: true };
  });

  // ---- Foydalanish shartlarini qabul qilish ----
  app.post("/api/accept-terms", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    await prisma.user.update({ where: { telegramId: tg.id }, data: { acceptedTerms: true } }).catch(() => {});
    return { ok: true };
  });

  // ---- Interfeys tilini o'zgartirish ----
  app.post("/api/lang", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const lang = normLang(String((req.body as { lang?: string })?.lang ?? ""));
    await prisma.user.update({ where: { telegramId: tg.id }, data: { lang } }).catch(() => {});
    return { ok: true, lang };
  });

  // ---- Yechish so'rovi (Stars) — admin qo'lda tarqatadi ----
  app.post("/api/withdraw", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const u = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    if (!u?.acceptedTerms) return reply.code(403).send({ error: "terms", needTerms: true });
    return requestStarsPayout(tg.id, u?.lang ?? undefined);
  });

  // ---- Video yuklash (Mini App, multipart) ----
  app.post("/api/upload", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const upUser = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    if (!upUser?.acceptedTerms) return reply.code(403).send({ error: "terms", needTerms: true });
    const canUp = await assertCanUpload(tg.id, upUser?.lang ?? undefined);
    if (!canUp.ok) return reply.code(403).send({ error: canUp.message });

    const fields: Record<string, string> = {};
    const files: Record<string, { buffer: Buffer; filename: string }> = {};
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        // Faqat haqiqiy video (magic bytes) — junk fayl S3'ga tushmasin (mimetype mijozда soxta bo'lishi mumkin)
        if (!looksLikeVideo(buffer)) return reply.code(400).send({ error: "faqat video fayl (mp4/mov/webm) qabul qilinadi" });
        files[part.fieldname] = { buffer, filename: part.filename || "video.mp4" };
      } else fields[part.fieldname] = String(part.value);
    }
    if (!files.reel || !files.video) return reply.code(400).send({ error: "reel va to'liq video kerak" });
    const title = (fields.title ?? "").trim();
    const price = Math.max(0, parseFloat(String(fields.price ?? "0").replace(",", ".")) || 0); // USDT
    if (!title) return reply.code(400).send({ error: "sarlavha kerak" });

    try {
      const content = await createContent(tg.id, { buffer: files.reel.buffer }, { buffer: files.video.buffer }, title, price);
      return { status: "published", id: content.id };
    } catch (e) {
      return reply.code(500).send({ error: "Yuklashda xatolik (fayl juda katta yoki S3 sozlanmagan bo'lishi mumkin)" });
    }
  });

  // ---- Reel media proxy (S3 sozlanmaganda Telegram'dan oqim) ----
  app.get("/media/reel/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const content = await prisma.content.findFirst({ where: { id, status: "published" } });
    if (!content?.reelFileId) return reply.code(404).send("not found");
    const file = await bot.api.getFile(content.reelFileId);
    if (!file.file_path) return reply.code(404).send("no file");
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const tgResp = await fetch(url);
    if (!tgResp.ok || !tgResp.body) return reply.code(502).send("upstream error");
    reply.header("Content-Type", "video/mp4");
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(Readable.fromWeb(tgResp.body as unknown as Parameters<typeof Readable.fromWeb>[0]));
  });

  return app;
}
