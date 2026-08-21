import { InlineKeyboard, InputFile } from "grammy";
import { randomUUID } from "crypto";
import { config } from "../config";
import { prisma } from "../db";
import { bot, isAdmin } from "../bot-core";
import { s3Enabled, putReelToS3, publicUrlFor } from "../storage";
import { t, normLang } from "../i18n";
import { usdtToStars } from "../pricing";

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

export async function recordUnlock(
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
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

export function isCantDeliver(e: unknown): boolean {
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
  await recordUnlock(user.id, contentId, { source, starsPaid, chargeId, countsForTier: false });
  try {
    await bot.api.sendVideo(telegramId, content.videoFileId, { caption: `🎬 ${content.title}`, supports_streaming: true });
  } catch (e) {
    if (isCantDeliver(e)) return true;
    throw e;
  }
  return true;
}

export async function sendUnlockedVideo(buyerTelegramId: string, contentId: number): Promise<boolean> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content || !content.videoFileId) return false;
  const user = await prisma.user.findUnique({ where: { telegramId: buyerTelegramId } });
  const lang = normLang(user?.lang);
  try {
    await bot.api.sendVideo(buyerTelegramId, content.videoFileId, {
      caption: `🎬 ${content.title}`,
      supports_streaming: true,
      reply_markup: new InlineKeyboard().text(t(lang, "complaintBtn"), `complain:${contentId}`),
    });
  } catch (e) {
    if (isCantDeliver(e)) return true;
    throw e;
  }
  return true;
}
