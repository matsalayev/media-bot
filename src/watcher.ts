// USDT (TON Connect) to'lovlarini on-chain kuzatuvchi + payout reconciler.
import { prisma } from "./db";
import { tonEnabled, fetchIncomingUsdt } from "./ton";
import { deliverCryptoUnlock, reconcilePayouts, notifyAdmins } from "./bot";

const ORDER_TTL_MIN = 30; // to'lanmagan buyurtma shu vaqtdan keyin eskiradi
const MAX_DELIVER_ATTEMPTS = 6; // yetkazishning maksimal urinishlari
let timer: NodeJS.Timeout | null = null;

/** Kutayotgan buyurtmalarni platformaga kelgan USDT to'lovlari bilan solishtirib, kontentni yetkazadi. */
export async function checkPendingOrders(): Promise<number> {
  const pending = await prisma.order.findMany({ where: { status: "pending" }, orderBy: { id: "asc" }, take: 100 });
  if (!pending.length) return 0;

  // eng eski pending buyurtma vaqti — shu vaqtgacha sahifalab yig'amiz (window'dan chiqib ketmasligi uchun)
  const oldestMs = Math.min(...pending.map((o) => new Date(o.createdAt).getTime()));
  const sinceUnix = Math.floor(oldestMs / 1000) - 60;

  let incoming: Array<{ comment: string; usdt: number; txHash: string; from: string; ts: number }>;
  try {
    incoming = await fetchIncomingUsdt(sinceUnix, 5);
  } catch (e) {
    console.warn("watcher: tonapi xato:", (e as Error).message);
    return 0;
  }

  // comment -> eng katta summali to'lov
  const byComment = new Map<string, { usdt: number; txHash: string; from: string }>();
  for (const tx of incoming) {
    if (!tx.comment) continue;
    const prev = byComment.get(tx.comment);
    if (!prev || tx.usdt > prev.usdt) byComment.set(tx.comment, { usdt: tx.usdt, txHash: tx.txHash, from: tx.from });
  }

  let delivered = 0;
  const nowMs = Date.now();
  for (const order of pending) {
    const match = byComment.get(order.nonce);
    // fail-CLOSED: match yo'q yoki summa (NaN ham) yetarli emas bo'lsa — yetkazmaymiz
    if (match && match.usdt + 1e-6 >= order.amountUsdt) {
      // Atomik da'vo: faqat pending -> paid o'tkaza olsak yetkazamiz (ikki marta emas)
      const upd = await prisma.order.updateMany({
        where: { id: order.id, status: "pending" },
        data: { status: "paid", txHash: match.txHash, fromAddr: match.from },
      });
      if (upd.count !== 1) continue; // boshqa tsikl allaqachon oldi
      try {
        const ok = await deliverCryptoUnlock(order.buyerTgId, order.contentId, order.amountUsdt, match.txHash);
        if (!ok) throw new Error("yetkazib bo'lmadi (video yoki user yo'q)");
        delivered++;
      } catch (e) {
        // yetkazishda xato — recordUnlock idempotent, shuning uchun 'pending'ga qaytarib qayta urinamiz
        const attempts = order.attempts + 1;
        if (attempts < MAX_DELIVER_ATTEMPTS) {
          await prisma.order.updateMany({ where: { id: order.id, status: "paid" }, data: { status: "pending", attempts } });
        } else {
          await prisma.order.updateMany({ where: { id: order.id, status: "paid" }, data: { attempts } });
          await notifyAdmins(
            `⚠️ Buyurtma #${order.id} to'landi, lekin yetkazib bo'lmadi (${MAX_DELIVER_ATTEMPTS} urinish).\nXaridor: ${order.buyerTgId} · kontent #${order.contentId}\n${(e as Error).message}`,
          ).catch(() => {});
        }
        console.error("watcher: yetkazishda xato:", (e as Error).message);
      }
      continue;
    }
    // to'lanmagan + eskirgan → expired. txHash:null — bir marta ham 'paid' bo'lmagan (rollback bo'lgani expired bo'lmasin)
    if (nowMs - new Date(order.createdAt).getTime() > ORDER_TTL_MIN * 60 * 1000) {
      await prisma.order.updateMany({ where: { id: order.id, status: "pending", txHash: null }, data: { status: "expired" } });
    }
  }
  return delivered;
}

/** Davriy kuzatuv: kelgan to'lovlar + chiquvchi payoutlarni reconcile. */
export function startPaymentWatcher(intervalMs = 8000): void {
  if (!tonEnabled()) {
    console.log("💤 To'lov watcher o'chiq (TON_MNEMONIC yo'q).");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    checkPendingOrders().catch((e) => console.warn("watcher tick xato:", (e as Error).message));
    reconcilePayouts().catch((e) => console.warn("reconcile tick xato:", (e as Error).message));
  }, intervalMs);
  console.log("👀 To'lov watcher + payout reconciler ishga tushdi.");
}
