import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { readFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { config } from "./config";
import { prisma } from "./db";
import { validateInitData, TgUser } from "./auth";
import { s3Enabled, presignReelUrl } from "./storage";
import { normLang } from "./i18n";
import { bot, deliverContent, createStarsInvoiceLink, creatorBalance, requestPayout, createContent } from "./bot";

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
  app.get("/health", async () => ({ ok: true }));

  // ---- Reels feed ----
  app.post("/api/reels", async (req) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    const body = (req.body ?? {}) as { focus?: number };
    let userId: number | null = null;
    let lang = "uz";
    if (tg) {
      const u = await getUser(tg);
      userId = u.id;
      lang = normLang(u.lang);
    }

    let items = await prisma.content.findMany({ where: { status: "published" }, orderBy: { id: "desc" }, take: 30 });
    const focusId = Number(body.focus) || 0;
    if (focusId) {
      const f = await prisma.content.findFirst({ where: { id: focusId, status: "published" } });
      if (f) items = [f, ...items.filter((x) => x.id !== focusId)];
    }

    let unlocked = new Set<number>();
    let liked = new Set<number>();
    let saved = new Set<number>();
    if (userId) {
      unlocked = new Set((await prisma.unlock.findMany({ where: { userId }, select: { contentId: true } })).map((x) => x.contentId));
      liked = new Set((await prisma.contentLike.findMany({ where: { userId }, select: { contentId: true } })).map((x) => x.contentId));
      saved = new Set((await prisma.savedItem.findMany({ where: { userId }, select: { contentId: true } })).map((x) => x.contentId));
    }

    return {
      botUsername: botUsername(),
      lang,
      items: await Promise.all(
        items.map(async (c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          priceStars: c.priceStars,
          reelUrl: await reelSrc(c),
          unlocked: unlocked.has(c.id) || c.priceStars === 0,
          liked: liked.has(c.id),
          saved: saved.has(c.id),
          likeCount: c.likeCount,
          saveCount: c.saveCount,
          shareCount: c.shareCount,
        })),
      ),
    };
  });

  // ---- Ochish / yetkazish ----
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

    if (content.priceStars === 0 || alreadyUnlocked) {
      await deliverContent(tg.id, contentId, content.priceStars === 0 ? "free" : "unlock");
      return { status: "delivered" };
    }
    const invoiceLink = await createStarsInvoiceLink(contentId, tg.id);
    return { status: "invoice", invoiceLink };
  });

  // ---- Like (toggle) ----
  app.post("/api/like", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = await getUser(tg);
    const existing = await prisma.contentLike.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
    if (existing) {
      await prisma.contentLike.delete({ where: { id: existing.id } });
      const c = await prisma.content.update({ where: { id: contentId }, data: { likeCount: { decrement: 1 } } });
      return { liked: false, likeCount: Math.max(0, c.likeCount) };
    }
    await prisma.contentLike.create({ data: { userId: user.id, contentId } });
    const c = await prisma.content.update({ where: { id: contentId }, data: { likeCount: { increment: 1 } } });
    return { liked: true, likeCount: c.likeCount };
  });

  // ---- Save (toggle) ----
  app.post("/api/save", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = await getUser(tg);
    const existing = await prisma.savedItem.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } });
    if (existing) {
      await prisma.savedItem.delete({ where: { id: existing.id } });
      const c = await prisma.content.update({ where: { id: contentId }, data: { saveCount: { decrement: 1 } } });
      return { saved: false, saveCount: Math.max(0, c.saveCount) };
    }
    await prisma.savedItem.create({ data: { userId: user.id, contentId } });
    const c = await prisma.content.update({ where: { id: contentId }, data: { saveCount: { increment: 1 } } });
    return { saved: true, saveCount: c.saveCount };
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

  // ---- Ko'rishni hisoblash ----
  app.post("/api/view", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    const contentId = Number((req.body as { contentId?: number })?.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = tg ? await prisma.user.findUnique({ where: { telegramId: tg.id } }) : null;
    await prisma.view.create({ data: { contentId, userId: user?.id ?? null } });
    await prisma.content.update({ where: { id: contentId }, data: { viewCount: { increment: 1 } } });
    return { ok: true };
  });

  // ---- Profil: balans, mening kontentim, saqlanganlar ----
  app.post("/api/me", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const user = await getUser(tg);
    const bal = await creatorBalance(user.id);
    const list = await prisma.content.findMany({ where: { creatorId: user.id }, orderBy: { id: "desc" }, take: 50 });
    const earned = await prisma.unlock.groupBy({
      by: ["contentId"],
      _sum: { creatorEarned: true },
      where: { content: { creatorId: user.id } },
    });
    const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarned ?? 0]));
    const savedRows = await prisma.savedItem.findMany({
      where: { userId: user.id },
      include: { content: true },
      orderBy: { id: "desc" },
      take: 50,
    });
    const likedRows = await prisma.contentLike.findMany({
      where: { userId: user.id },
      include: { content: true },
      orderBy: { id: "desc" },
      take: 50,
    });
    return {
      lang: normLang(user.lang),
      user: { firstName: user.firstName, username: user.username },
      balance: bal,
      minWithdraw: config.minWithdrawStars,
      creatorShare: config.creatorSharePercent,
      content: list.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        views: c.viewCount,
        unlocks: c.unlockCount,
        likes: c.likeCount,
        earned: em.get(c.id) ?? 0,
      })),
      saved: savedRows.map((s) => ({ id: s.content.id, title: s.content.title, priceStars: s.content.priceStars })),
      liked: likedRows.map((l) => ({ id: l.content.id, title: l.content.title, priceStars: l.content.priceStars })),
    };
  });

  // ---- Payout so'rovi ----
  app.post("/api/withdraw", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    return requestPayout(tg.id);
  });

  // ---- Video yuklash (Mini App, multipart) ----
  app.post("/api/upload", async (req, reply) => {
    const tg = validateInitData((req.headers["x-init-data"] as string) || "");
    if (!tg) return reply.code(401).send({ error: "unauthorized" });

    const fields: Record<string, string> = {};
    const files: Record<string, { buffer: Buffer; filename: string }> = {};
    for await (const part of req.parts()) {
      if (part.type === "file") files[part.fieldname] = { buffer: await part.toBuffer(), filename: part.filename || "video.mp4" };
      else fields[part.fieldname] = String(part.value);
    }
    if (!files.reel || !files.video) return reply.code(400).send({ error: "reel va to'liq video kerak" });
    const title = (fields.title ?? "").trim();
    const price = Math.max(0, parseInt(fields.price ?? "0", 10) || 0);
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
