// Pul (USDT balans) operatsiyalari — hammasi atomik va LedgerEntry bilan jurnallanadi.
// Bu qatlam FAQAT DB + TRON bilan ishlaydi (bot'ni import qilmaydi — tsikl bo'lmasin).
// Yon ta'sirlar (bildirishnoma, strike) chaqiruvchida (bot.ts) bajariladi.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { isTrc20Address } from "./tron";

const D = 1e6;
export function round6(x: number): number {
  return Math.round(x * D) / D;
}

/** Balans yetarli emasligini bildiruvchi maxsus xato (chaqiruvchi "insufficient" ga aylantiradi). */
export class InsufficientBalanceError extends Error {
  insufficient = true;
  constructor() {
    super("INSUFFICIENT");
  }
}

// Atomik balans o'zgarishi + jurnal yozuvi (mavjud tranzaksiya ichida ishlaydi).
// Debet bitta SHARTLI UPDATE bilan bajariladi — read-modify-write poygasi (double-spend)
// bo'lmaydi (Postgres'da ham xavfsiz). allowNegative=true bo'lsa manfiy balansga ruxsat
// (refund clawback uchun). Kredit (delta>=0) doim ruxsat.
async function applyDelta(
  txn: Prisma.TransactionClient,
  userId: number,
  deltaUsdt: number,
  type: string,
  opts?: { refType?: string; refId?: number; note?: string; allowNegative?: boolean },
): Promise<number> {
  const delta = round6(deltaUsdt);
  const allowNegative = opts?.allowNegative ?? delta >= 0;
  let n: number;
  if (allowNegative) {
    n = await txn.$executeRaw`UPDATE "User" SET "balanceUsdt" = ROUND("balanceUsdt" + ${delta}, 6) WHERE "id" = ${userId}`;
  } else {
    n = await txn.$executeRaw`UPDATE "User" SET "balanceUsdt" = ROUND("balanceUsdt" + ${delta}, 6) WHERE "id" = ${userId} AND "balanceUsdt" + ${delta} >= -0.0000001`;
  }
  if (n === 0) {
    const exists = await txn.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) throw new Error("user topilmadi");
    throw new InsufficientBalanceError();
  }
  const u = await txn.user.findUnique({ where: { id: userId }, select: { balanceUsdt: true } });
  const after = u?.balanceUsdt ?? 0;
  await txn.ledgerEntry.create({
    data: {
      userId,
      deltaUsdt: delta,
      type,
      balanceAfter: after,
      refType: opts?.refType ?? null,
      refId: opts?.refId ?? null,
      note: opts?.note ?? null,
    },
  });
  return after;
}

/**
 * Yechish mumkin bo'lgan balans = balans − hali "pishmagan" daromad.
 * Nizolar oynasi (disputeWindowDays) ichidagi yangi daromad yechilmaydi — shu bilan
 * firibgar creator ko'p sotib, aldov shikoyatlari kelishidan oldin pulni yechib
 * ketolmaydi (platforma qoplanmagan majburiyat ostida qolmaydi). To'ldirish (topup)
 * har doim yechilishi mumkin.
 */
export async function withdrawableBalance(userId: number): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { balanceUsdt: true } });
  const balance = u?.balanceUsdt ?? 0;
  if (config.disputeWindowDays <= 0) return Math.max(0, round6(balance));
  const cutoff = new Date(Date.now() - config.disputeWindowDays * 86400000);
  const agg = await prisma.unlock.aggregate({
    _sum: { creatorEarnedUsdt: true },
    where: { refunded: false, createdAt: { gt: cutoff }, content: { creatorId: userId } },
  });
  const unmatured = agg._sum.creatorEarnedUsdt ?? 0;
  return Math.max(0, round6(balance - unmatured));
}

/** Balansni bevosita o'zgartirish (admin tuzatish va h.k.). */
export function adjustBalance(
  userId: number,
  deltaUsdt: number,
  type: string,
  opts?: { refType?: string; refId?: number; note?: string },
): Promise<number> {
  return prisma.$transaction((txn) => applyDelta(txn, userId, deltaUsdt, type, opts));
}

// ---------- TO'LDIRISH (top-up) ----------

/**
 * Noyob kutilayotgan summa bilan to'ldirish so'rovi yaratadi (moslash uchun).
 * Noyoblik DB darajasida partial unique index (expectedAmount WHERE status='pending')
 * bilan kafolatlanadi — P2002 kelsa boshqa offset bilan qayta urinamiz (TOCTOU yo'q).
 */
export async function createTopup(userId: number, baseAmountUsdt: number) {
  const base = round6(baseAmountUsdt);
  for (let i = 0; i < 30; i++) {
    const offset = (Math.floor(Math.random() * 9000) + 1) / D; // 0.000001..0.009000
    const expected = round6(base + offset);
    // Backstop: index bo'lmasa ham (connection_limit=1 yozuvlarni serializatsiya qiladi) —
    // asosiy kafolat P2002 (partial unique index), bu esa tez old-filtr.
    const clash = await prisma.deposit.findFirst({ where: { status: "pending", expectedAmount: expected }, select: { id: true } });
    if (clash) continue;
    try {
      return await prisma.deposit.create({
        data: { userId, address: config.tronHotWalletAddress, expectedAmount: expected, status: "pending" },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") continue; // shu summa band — boshqa offset
      throw e;
    }
  }
  throw new Error("noyob summa topilmadi — qayta urinib ko'ring");
}

export type DepositCreditResult =
  | { status: "credited"; userId: number; depositId: number; amountUsdt: number; balanceAfter: number }
  | { status: "duplicate" }
  | { status: "nomatch" };

/** Kelgan USDT o'tkazmasini kutilayotgan to'ldirishga moslab, balansga kreditlaydi. */
export async function creditIncomingDeposit(
  txID: string,
  amountUsdt: number,
): Promise<DepositCreditResult> {
  const amt = round6(amountUsdt);
  return prisma.$transaction(async (txn) => {
    const dup = await txn.deposit.findUnique({ where: { txHash: txID } });
    if (dup) return { status: "duplicate" as const };
    const dep = await txn.deposit.findFirst({
      where: { status: "pending", expectedAmount: amt },
      orderBy: { id: "asc" },
    });
    if (!dep) return { status: "nomatch" as const };
    const upd = await txn.deposit.updateMany({
      where: { id: dep.id, status: "pending" },
      data: { status: "credited", txHash: txID, actualAmount: amt, creditedAt: new Date() },
    });
    if (upd.count !== 1) return { status: "duplicate" as const }; // boshqa tsikl oldi
    const after = await applyDelta(txn, dep.userId, amt, "topup", {
      refType: "deposit",
      refId: dep.id,
      note: `tx ${txID.slice(0, 12)}`,
    });
    return { status: "credited" as const, userId: dep.userId, depositId: dep.id, amountUsdt: amt, balanceAfter: after };
  });
}

/** Muddati o'tgan to'ldirish so'rovlarini yopadi. */
export async function expireOldDeposits(): Promise<number> {
  const cutoff = new Date(Date.now() - config.depositTtlMin * 60 * 1000);
  const r = await prisma.deposit.updateMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
    data: { status: "expired" },
  });
  return r.count;
}

// ---------- SOTIB OLISH (balansdan, off-chain) ----------

export type PurchaseResult =
  | { status: "ok"; unlockId: number }
  | { status: "already" }
  | { status: "insufficient"; balance: number; price: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function purchaseFromBalance(buyerId: number, content: any): Promise<PurchaseResult> {
  const price = round6(content.priceUsdt);
  const creatorEarn = round6((price * config.creatorSharePercent) / 100);
  const platformFee = round6(price - creatorEarn);
  // Creator o'z kontentini "sotib olmaydi" — bepul egasi (debet yo'q)
  if (content.creatorId && content.creatorId === buyerId) return { status: "already" };
  try {
    return await prisma.$transaction(async (txn) => {
      const existing = await txn.unlock.findUnique({
        where: { userId_contentId: { userId: buyerId, contentId: content.id } },
      });
      if (existing && !existing.refunded) return { status: "already" as const };
      const u = await txn.user.findUnique({ where: { id: buyerId } });
      if (!u) throw new Error("user topilmadi");
      if (u.balanceUsdt + 1e-9 < price) return { status: "insufficient" as const, balance: u.balanceUsdt, price };
      await applyDelta(txn, buyerId, -price, "purchase", { refType: "content", refId: content.id });
      if (content.creatorId && content.creatorId !== buyerId) {
        await applyDelta(txn, content.creatorId, creatorEarn, "earning", { refType: "content", refId: content.id });
      }
      let unlockId: number;
      if (existing) {
        const up = await txn.unlock.update({
          where: { id: existing.id },
          data: { refunded: false, source: "balance", creatorEarnedUsdt: creatorEarn, platformFeeUsdt: platformFee },
        });
        unlockId = up.id;
      } else {
        const cr = await txn.unlock.create({
          data: { userId: buyerId, contentId: content.id, source: "balance", creatorEarnedUsdt: creatorEarn, platformFeeUsdt: platformFee },
        });
        unlockId = cr.id;
      }
      await txn.content.update({ where: { id: content.id }, data: { unlockCount: { increment: 1 } } });
      return { status: "ok" as const, unlockId };
    });
  } catch (e) {
    if ((e as { insufficient?: boolean }).insufficient) return { status: "insufficient", balance: 0, price };
    throw e;
  }
}

// ---------- YECHISH (withdrawal, on-chain) ----------

export type WithdrawalCreate =
  | { status: "ok"; payoutId: number; grossUsdt: number; netUsdt: number }
  | { status: "bad_address" }
  | { status: "too_small"; min: number }
  | { status: "insufficient"; balance: number };

/** Balansdan yechish: atomik debet + Payout(processing) yaratadi. On-chain jo'natish alohida. */
export async function createWithdrawal(
  userId: number,
  toAddress: string,
  amountUsdt: number,
): Promise<WithdrawalCreate> {
  const amt = round6(amountUsdt);
  const fee = round6(config.withdrawFeeUsdt);
  if (!isTrc20Address(toAddress)) return { status: "bad_address" };
  if (amt < config.minWithdrawUsdt || amt <= fee) return { status: "too_small", min: config.minWithdrawUsdt };
  try {
    return await prisma.$transaction(async (txn) => {
      const u = await txn.user.findUnique({ where: { id: userId } });
      if (!u || u.balanceUsdt + 1e-9 < amt) return { status: "insufficient" as const, balance: u?.balanceUsdt ?? 0 };
      const payout = await txn.payout.create({
        data: { userId, amountUsdt: amt, toAddress, status: "processing" },
      });
      await applyDelta(txn, userId, -amt, "withdrawal", { refType: "payout", refId: payout.id });
      return { status: "ok" as const, payoutId: payout.id, grossUsdt: amt, netUsdt: round6(amt - fee) };
    });
  } catch (e) {
    if ((e as { insufficient?: boolean }).insufficient) return { status: "insufficient", balance: 0 };
    throw e;
  }
}

/** Payout muvaffaqiyatli — txHash saqlab, "paid" qilamiz (CAS). */
export async function markPayoutPaid(payoutId: number, txHash: string): Promise<void> {
  await prisma.payout.updateMany({
    where: { id: payoutId, status: "processing" },
    data: { status: "paid", txHash },
  });
}

/**
 * Payout MUVAFFAQIYATSIZ (on-chain jo'natilmagani ANIQ) — balansni qaytaramiz (CAS bilan bir marta).
 * onlyIfNoTx=true: FAQAT txHash hali null bo'lsa qaytaradi — inline oqim broadcast'dan oldin
 * txHash biriktirib ulgurgan bo'lsa, reconciler xato refund qilib ikki marta to'lamaydi.
 */
export async function failAndRefundPayout(
  payoutId: number,
  reason: string,
  opts?: { onlyIfNoTx?: boolean },
): Promise<boolean> {
  return prisma.$transaction(async (txn) => {
    const p = await txn.payout.findUnique({ where: { id: payoutId } });
    if (!p || p.status !== "processing") return false;
    const upd = opts?.onlyIfNoTx
      ? await txn.payout.updateMany({ where: { id: payoutId, status: "processing", txHash: null }, data: { status: "failed", note: reason.slice(0, 180) } })
      : await txn.payout.updateMany({ where: { id: payoutId, status: "processing" }, data: { status: "failed", note: reason.slice(0, 180) } });
    if (upd.count !== 1) return false;
    await applyDelta(txn, p.userId, p.amountUsdt, "withdrawal_refund", {
      refType: "payout",
      refId: p.id,
      note: reason.slice(0, 120),
    });
    return true;
  });
}

/**
 * Payout'ga txHash bog'lash (broadcast'dan OLDIN). CAS bittani yangilaganini qaytaradi.
 * false = payout endi 'processing' emas (reconciler failed/refund qilib bo'lgan) →
 * chaqiruvchi BROADCAST QILMASLIGI kerak (ikki marta to'lovning oldini oladi).
 */
export async function attachPayoutTx(payoutId: number, txHash: string): Promise<boolean> {
  const r = await prisma.payout.updateMany({ where: { id: payoutId, status: "processing" }, data: { txHash } });
  return r.count === 1;
}

// ---------- REFUND (aldov — off-chain balans clawback) ----------

export type FraudRefundResult =
  | { status: "ok"; refundId: number; buyerId: number; creatorId: number | null; refundUsdt: number }
  | { status: "not_refundable" };

/**
 * Aldov refund: xaridorga 90% qaytadi, creatordan clawback, platforma 10% qoladi.
 * Kontent unpublish qilinadi. (Strike + bildirishnoma bot.ts'da.)
 */
export async function processFraudRefund(
  contentId: number,
  buyerTgId: string,
  complaintId?: number,
): Promise<FraudRefundResult> {
  return prisma.$transaction(async (txn) => {
    const buyer = await txn.user.findUnique({ where: { telegramId: buyerTgId } });
    const content = await txn.content.findUnique({ where: { id: contentId } });
    if (!buyer || !content) return { status: "not_refundable" as const };
    const unlock = await txn.unlock.findUnique({
      where: { userId_contentId: { userId: buyer.id, contentId } },
    });
    if (!unlock || unlock.refunded) return { status: "not_refundable" as const };
    const refundUsdt = round6(unlock.creatorEarnedUsdt); // = 90% (platforma 10% qoladi)
    // 1) unlock refunded (CAS)
    const upd = await txn.unlock.updateMany({
      where: { id: unlock.id, refunded: false },
      data: { refunded: true },
    });
    if (upd.count !== 1) return { status: "not_refundable" as const };
    // 2) xaridorga refund
    await applyDelta(txn, buyer.id, refundUsdt, "refund_credit", { refType: "content", refId: contentId, note: "aldov refund" });
    // 3) creatordan clawback (balans manfiy bo'lishi mumkin — kelajakdagi daromaddan qoplanadi)
    if (content.creatorId) {
      await applyDelta(txn, content.creatorId, -refundUsdt, "refund_clawback", {
        refType: "content",
        refId: contentId,
        note: "aldov clawback",
        allowNegative: true,
      });
    }
    // 4) audit + unpublish
    const refund = await txn.refund.create({
      data: { contentId, buyerTgId, amountUsdt: refundUsdt, status: "credited", complaintId: complaintId ?? null },
    });
    await txn.content.update({ where: { id: contentId }, data: { status: "rejected", rejectionReason: "Aldov shikoyati tasdiqlandi" } });
    if (complaintId) {
      await txn.complaint.updateMany({ where: { id: complaintId }, data: { status: "approved" } });
    }
    return {
      status: "ok" as const,
      refundId: refund.id,
      buyerId: buyer.id,
      creatorId: content.creatorId ?? null,
      refundUsdt,
    };
  });
}
