import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { readFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { config } from "./config";
import { prisma } from "./db";
import { validateInitData } from "./auth";
import {
  bot,
  deliverContent,
  createStarsInvoiceLink,
  createSubscriptionInvoiceLink,
  creatorBalance,
  requestPayout,
  ingestCreatorUpload,
} from "./bot";

const WEBAPP_DIR = join(__dirname, "..", "webapp");

export function buildServer() {
  const app = Fastify({ logger: false });

  // Mini App'dan video yuklash uchun (max 50MB/fayl — cloud Bot API cheklovi)
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 2 } });

  // ---- Mini App statik fayllari ----
  const serveFile =
    (file: string, type: string) => (_req: FastifyRequest, reply: FastifyReply) => {
      reply.header("Content-Type", type);
      reply.send(readFileSync(join(WEBAPP_DIR, file)));
    };
  app.get("/", serveFile("index.html", "text/html; charset=utf-8"));
  app.get("/app.js", serveFile("app.js", "application/javascript; charset=utf-8"));
  app.get("/style.css", serveFile("style.css", "text/css; charset=utf-8"));
  app.get("/health", async () => ({ ok: true }));

  // ---- Reels feed ----
  app.post("/api/reels", async (req) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    let userId: number | null = null;
    if (tg) {
      const user = await prisma.user.upsert({
        where: { telegramId: tg.id },
        update: { username: tg.username, firstName: tg.first_name },
        create: {
          telegramId: tg.id,
          username: tg.username,
          firstName: tg.first_name,
          languageCode: tg.language_code,
        },
      });
      userId = user.id;
    }

    const items = await prisma.content.findMany({
      where: { status: "published" },
      orderBy: { id: "desc" },
      take: 30,
    });

    let unlocked = new Set<number>();
    let subscribed = false;
    if (userId) {
      const u = await prisma.unlock.findMany({ where: { userId }, select: { contentId: true } });
      unlocked = new Set(u.map((x) => x.contentId));
      const sub = await prisma.subscription.findUnique({ where: { userId } });
      subscribed = !!sub && sub.status === "active" && sub.until > new Date();
    }

    return {
      subscribed,
      subPriceStars: config.subPriceStars,
      subDays: config.subDays,
      items: items.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        priceStars: c.priceStars,
        reelUrl: `/media/reel/${c.id}`,
        unlocked: unlocked.has(c.id) || c.priceStars === 0 || subscribed,
      })),
    };
  });

  // ---- Ochish / yetkazish ----
  app.post("/api/unlock", async (req, reply) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    if (!tg) return reply.code(401).send({ error: "unauthorized" });

    const body = (req.body ?? {}) as { contentId?: number };
    const contentId = Number(body.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });

    const content = await prisma.content.findFirst({ where: { id: contentId, status: "published" } });
    if (!content) return reply.code(404).send({ error: "not found" });

    const user = await prisma.user.findUnique({ where: { telegramId: tg.id } });
    const alreadyUnlocked = user
      ? await prisma.unlock.findUnique({ where: { userId_contentId: { userId: user.id, contentId } } })
      : null;
    const sub = user ? await prisma.subscription.findUnique({ where: { userId: user.id } }) : null;
    const subscribed = !!sub && sub.status === "active" && sub.until > new Date();

    if (content.priceStars === 0 || alreadyUnlocked || subscribed) {
      const source = content.priceStars === 0 ? "free" : alreadyUnlocked ? "unlock" : "subscription";
      await deliverContent(tg.id, contentId, source);
      return { status: "delivered" };
    }

    const invoiceLink = await createStarsInvoiceLink(contentId, tg.id);
    return { status: "invoice", invoiceLink };
  });

  // ---- Obuna invoice (Mini App) ----
  app.post("/api/subscribe", async (req, reply) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    await prisma.user.upsert({
      where: { telegramId: tg.id },
      update: {},
      create: { telegramId: tg.id, username: tg.username, firstName: tg.first_name, languageCode: tg.language_code },
    });
    const invoiceLink = await createSubscriptionInvoiceLink(tg.id);
    return { invoiceLink };
  });

  // ---- Profil: obuna, balans, mening kontentim ----
  app.post("/api/me", async (req, reply) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    const user = await prisma.user.upsert({
      where: { telegramId: tg.id },
      update: { username: tg.username, firstName: tg.first_name },
      create: { telegramId: tg.id, username: tg.username, firstName: tg.first_name, languageCode: tg.language_code },
    });

    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const subActive = !!sub && sub.status === "active" && sub.until > new Date();
    const bal = await creatorBalance(user.id);
    const list = await prisma.content.findMany({ where: { creatorId: user.id }, orderBy: { id: "desc" }, take: 50 });
    const earned = await prisma.unlock.groupBy({
      by: ["contentId"],
      _sum: { creatorEarned: true },
      where: { content: { creatorId: user.id } },
    });
    const em = new Map(earned.map((e) => [e.contentId, e._sum.creatorEarned ?? 0]));

    return {
      user: { firstName: user.firstName, username: user.username },
      subscription: { active: subActive, until: subActive ? sub!.until.toISOString() : null },
      subPriceStars: config.subPriceStars,
      subDays: config.subDays,
      balance: bal,
      minWithdraw: config.minWithdrawStars,
      creatorShare: config.creatorSharePercent,
      content: list.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        views: c.viewCount,
        unlocks: c.unlockCount,
        earned: em.get(c.id) ?? 0,
      })),
    };
  });

  // ---- Payout so'rovi (Mini App) ----
  app.post("/api/withdraw", async (req, reply) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    if (!tg) return reply.code(401).send({ error: "unauthorized" });
    return requestPayout(tg.id);
  });

  // ---- Video yuklash (Mini App, multipart) ----
  app.post("/api/upload", async (req, reply) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    if (!tg) return reply.code(401).send({ error: "unauthorized" });

    const fields: Record<string, string> = {};
    const files: Record<string, { buffer: Buffer; filename: string }> = {};
    for await (const part of req.parts()) {
      if (part.type === "file") {
        files[part.fieldname] = { buffer: await part.toBuffer(), filename: part.filename || "video.mp4" };
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!files.reel || !files.video) return reply.code(400).send({ error: "reel va to'liq video kerak" });
    const title = (fields.title ?? "").trim();
    const price = Math.max(0, parseInt(fields.price ?? "0", 10) || 0);
    if (!title) return reply.code(400).send({ error: "sarlavha kerak" });

    try {
      const content = await ingestCreatorUpload(tg.id, files.reel, files.video, title, price);
      return { status: "pending", id: content.id };
    } catch (e) {
      return reply.code(500).send({ error: "Yuklashda xatolik (fayl juda katta bo'lishi mumkin — max 50MB)" });
    }
  });

  // ---- Ko'rishni hisoblash ----
  app.post("/api/view", async (req, reply) => {
    const initData = (req.headers["x-init-data"] as string) || "";
    const tg = validateInitData(initData);
    const body = (req.body ?? {}) as { contentId?: number };
    const contentId = Number(body.contentId);
    if (!contentId) return reply.code(400).send({ error: "contentId required" });
    const user = tg ? await prisma.user.findUnique({ where: { telegramId: tg.id } }) : null;
    await prisma.view.create({ data: { contentId, userId: user?.id ?? null } });
    await prisma.content.update({ where: { id: contentId }, data: { viewCount: { increment: 1 } } });
    return { ok: true };
  });

  // ---- Reel media proxy (qisqa videoni Telegram'dan oqim qilib beradi) ----
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
