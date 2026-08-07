// DARAJA — creator rag'batlantirish mantig'i.
// Daraja = qualifying (matured, refunded emas, arms-length, tekshirilgan xaridor) daromad
// + konsentratsiya cheklovi bo'yicha. Oylik bonus pool komissiyaning bir qismidan (o'zini moliyalaydi).
import { prisma } from "./db";
import { config } from "./config";

export function tierByKey(key: string) {
  return config.tiers.find((t) => t.key === key) ?? config.tiers[0];
}

export function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Xaridor "tekshirilgan"mi: akkaunt yoshi >= min VA >= min BOSHQA creatordan xarid qilgan. */
export async function buyerVerified(userId: number): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!u) return false;
  const ageDays = (Date.now() - new Date(u.createdAt).getTime()) / 86400000;
  if (ageDays < config.buyerVerifyMinAgeDays) return false;
  // Ushbu xaridor pul to'lab ochgan DISTINCT creatorlar (o'zidan boshqa)
  const unlocks = await prisma.unlock.findMany({
    where: { userId, refunded: false, creatorEarned: { gt: 0 } },
    select: { content: { select: { creatorId: true } } },
  });
  const creators = new Set<number>();
  for (const un of unlocks) {
    const cid = un.content?.creatorId;
    if (cid && cid !== userId) creators.add(cid);
  }
  return creators.size >= config.buyerVerifyMinCreators;
}

/** Creatorning qualifying daromadi (Stars) + tekshirilgan xaridorlar soni (konsentratsiya cheklovi bilan). */
export async function qualifyingFor(creatorId: number): Promise<{ qStars: number; buyers: number }> {
  const contents = await prisma.content.findMany({ where: { creatorId }, select: { id: true } });
  const ids = contents.map((c) => c.id);
  if (!ids.length) return { qStars: 0, buyers: 0 };
  const cutoff = new Date(Date.now() - config.disputeWindowDays * 86400000);
  const rows = await prisma.unlock.groupBy({
    by: ["userId"],
    _sum: { creatorEarned: true },
    where: { contentId: { in: ids }, refunded: false, countsForTier: true, creatorEarned: { gt: 0 }, createdAt: { lt: cutoff } },
  });
  const buyers = rows.length;
  const rawTotal = rows.reduce((s, r) => s + (r._sum.creatorEarned ?? 0), 0);
  const cap = (rawTotal * config.buyerConcentrationCapPct) / 100; // bitta xaridor max ulushi
  const qStars = Math.floor(rows.reduce((s, r) => s + Math.min(r._sum.creatorEarned ?? 0, cap), 0));
  return { qStars, buyers };
}

/** qUsd va xaridorlar soniga qarab eng yuqori mos darajani tanlaydi (dual-gate). */
export function pickTier(qUsd: number, buyers: number) {
  let picked = config.tiers[0];
  for (const t of config.tiers) if (qUsd >= t.usd && buyers >= t.buyers) picked = t;
  return picked;
}

/** Bitta creator darajasini qayta hisoblaydi va User cache'ni yangilaydi (o'zgarsa TierChange yozadi). */
export async function recomputeTier(creatorId: number): Promise<void> {
  const { qStars, buyers } = await qualifyingFor(creatorId);
  const qUsd = qStars * config.starUsd;
  const picked = pickTier(qUsd, buyers);
  const user = await prisma.user.findUnique({ where: { id: creatorId }, select: { tier: true } });
  if (!user) return;
  await prisma.user.update({
    where: { id: creatorId },
    data: {
      tier: picked.key,
      tierSharePercent: picked.share,
      lifetimeEarnedStars: qStars,
      verifiedBuyerCount: buyers,
      isVerifiedCreator: picked.verified,
      featuredBoost: picked.featuredBoost,
      tierUpdatedAt: new Date(),
    },
  });
  if (user.tier !== picked.key) {
    await prisma.tierChange.create({
      data: { userId: creatorId, fromTier: user.tier, toTier: picked.key, atEarnedStars: qStars, atBuyers: buyers },
    });
  }
}

/** Kontenti bor barcha creatorlar darajasini qayta hisoblaydi (kichik platforma uchun yetarli). */
export async function recomputeAllTiers(): Promise<number> {
  const creators = await prisma.content.findMany({ where: { creatorId: { not: null } }, select: { creatorId: true }, distinct: ["creatorId"] });
  let n = 0;
  for (const c of creators) {
    if (c.creatorId) {
      await recomputeTier(c.creatorId).catch(() => {});
      n++;
    }
  }
  return n;
}

/** Creatorning kreditlangan (yechishga tayyor) bonuslari — creatorStarsBalance'ga qo'shiladi. */
export async function creditedBonusStars(userId: number): Promise<number> {
  const agg = await prisma.creatorBonus.aggregate({ _sum: { amountStars: true }, where: { userId, status: "credited" } });
  return agg._sum.amountStars ?? 0;
}

/**
 * Berilgan oy uchun bonus pool quradi (bir marta — @@unique(userId,periodYm)).
 * pool = bonusPoolPercent% × (o'sha oydagi NET komissiya Stars). Har creatorга
 * qualifying daromadi × daraja vazni bo'yicha ulush. Grant "pending", disputeWindow'дан keyin kreditlanadi.
 */
export async function buildMonthlyPool(periodYm: string): Promise<{ pool: number; grants: number }> {
  // Idempotentlik @@unique([userId, periodYm]) bilan — qayta ishga tushsa yo'q grantlar to'ldiriladi,
  // borlar P2002'да no-op bo'ladi (qisman xatoда grant abadiy yo'qolmaydi).
  const [y, m] = periodYm.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  // NET komissiya (refunded emas) shu oyda
  const commAgg = await prisma.unlock.aggregate({
    _sum: { platformFee: true },
    where: { refunded: false, createdAt: { gte: start, lt: end } },
  });
  const netCommission = commAgg._sum.platformFee ?? 0;
  const pool = Math.floor((netCommission * config.bonusPoolPercent) / 100);
  if (pool <= 0) return { pool: 0, grants: 0 };

  // Har creatorning shu oydagi qualifying daromadi (arms-length, tekshirilgan xaridor)
  const contents = await prisma.content.findMany({ where: { creatorId: { not: null } }, select: { id: true, creatorId: true } });
  const c2creator = new Map(contents.map((c) => [c.id, c.creatorId]));
  const rows = await prisma.unlock.groupBy({
    by: ["contentId"],
    _sum: { creatorEarned: true, platformFee: true },
    where: { refunded: false, countsForTier: true, createdAt: { gte: start, lt: end } },
  });
  const monthQ = new Map<number, number>();
  const monthFee = new Map<number, number>(); // har creator o'z komissiya hissasi (self-funding cheklovi)
  for (const r of rows) {
    const cid = c2creator.get(r.contentId);
    if (!cid) continue;
    monthQ.set(cid, (monthQ.get(cid) ?? 0) + (r._sum.creatorEarned ?? 0));
    monthFee.set(cid, (monthFee.get(cid) ?? 0) + (r._sum.platformFee ?? 0));
  }
  if (!monthQ.size) return { pool: 0, grants: 0 };

  // Vazn = qualifying × daraja vazni (joriy daraja)
  const users = await prisma.user.findMany({ where: { id: { in: [...monthQ.keys()] } }, select: { id: true, tier: true } });
  const uTier = new Map(users.map((u) => [u.id, u.tier]));
  let totalWeight = 0;
  const weights = new Map<number, number>();
  for (const [cid, q] of monthQ) {
    const w = q * tierByKey(uTier.get(cid) ?? "bronze").weight;
    weights.set(cid, w);
    totalWeight += w;
  }
  if (totalWeight <= 0) return { pool: 0, grants: 0 };

  const maturesAt = new Date(Date.now() + config.disputeWindowDays * 86400000);
  let grants = 0;
  for (const [cid, w] of weights) {
    // Self-funding cheklovi: creator o'z komissiya hissasidan ko'p bonus ololmaydi
    // (Sybil wash-trading orqali boshqalar komissiyasini o'zlashtirolmaydi). Ortiqcha taqsimlanmaydi.
    const amount = Math.min(Math.floor((pool * w) / totalWeight), monthFee.get(cid) ?? 0);
    if (amount <= 0) continue;
    try {
      await prisma.creatorBonus.create({
        data: {
          userId: cid,
          periodYm,
          amountStars: amount,
          amountUsdt: Math.round(amount * config.starUsd * 100) / 100,
          basisStars: monthQ.get(cid) ?? 0,
          tierAtGrant: uTier.get(cid) ?? "bronze",
          status: "pending",
          maturesAt,
        },
      });
      grants++;
    } catch (e) {
      if ((e as { code?: string })?.code !== "P2002") console.warn("bonus grant xato:", (e as Error).message); // dublikatдан boshqasini logga chiqaramiz
    }
  }
  return { pool, grants };
}

/** Muddati yetgan "pending" bonuslarni "credited" qiladi (yechishga tayyor bo'ladi). */
export async function matureBonuses(): Promise<number> {
  const due = await prisma.creatorBonus.findMany({ where: { status: "pending", maturesAt: { lte: new Date() } }, take: 500 });
  let n = 0;
  for (const b of due) {
    const upd = await prisma.creatorBonus.updateMany({ where: { id: b.id, status: "pending" }, data: { status: "credited" } });
    if (upd.count === 1) n++;
  }
  return n;
}
