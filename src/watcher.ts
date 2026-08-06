// Cryptomus to'lovlarini kuzatuvchi + payout/refund reconciler.
// Webhook birlamchi (tez), bu poll esa zaxira (webhook o'tkazib yuborilса ham yopadi).
import { prisma } from "./db";
import { cryptomusEnabled, paymentStatus, isPaid } from "./cryptomus";
import { deliverCryptoUnlock, reconcilePayouts, reconcileRefunds, notifyAdmins } from "./bot";

const ORDER_TTL_MIN = 60; // Cryptomus invoice lifetime bilan mos
const MAX_DELIVER_ATTEMPTS = 6;
let timer: NodeJS.Timeout | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any;

/** Bitta buyurtmani Cryptomus statusi bo'yicha hal qiladi: to'langan bo'lsa CAS + yetkazish. */
export async function settleOrder(order: OrderRow): Promise<boolean> {
  if (order.status !== "pending") return false;
  let st: string;
  try {
    st = await paymentStatus(order.nonce);
  } catch {
    return false; // Cryptomus xatosi — keyingi tsiklda
  }
  if (!isPaid(st)) return false;

  // Atomik da'vo: faqat pending -> paid o'tkaza olsak yetkazamiz (ikki marta emas)
  const upd = await prisma.order.updateMany({ where: { id: order.id, status: "pending" }, data: { status: "paid" } });
  if (upd.count !== 1) return false;
  try {
    const ok = await deliverCryptoUnlock(order.buyerTgId, order.contentId, order.amountUsdt);
    if (!ok) throw new Error("yetkazib bo'lmadi (video/user yo'q)");
    return true;
  } catch (e) {
    const attempts = (order.attempts ?? 0) + 1;
    if (attempts < MAX_DELIVER_ATTEMPTS) {
      await prisma.order.updateMany({ where: { id: order.id, status: "paid" }, data: { status: "pending", attempts } });
    } else {
      await prisma.order.updateMany({ where: { id: order.id, status: "paid" }, data: { attempts } });
      await notifyAdmins(
        `⚠️ Buyurtma #${order.id} to'landi, lekin yetkazib bo'lmadi (${MAX_DELIVER_ATTEMPTS} urinish).\nXaridor: ${order.buyerTgId} · kontent #${order.contentId}\n${(e as Error).message}`,
      ).catch(() => {});
    }
    return false;
  }
}

/** Webhook shu bilan bitta buyurtmani darhol hal qiladi. */
export async function settleOrderByNonce(nonce: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { nonce } });
  if (order) await settleOrder(order);
}

/** Zaxira poll: barcha kutayotgan buyurtmalarni Cryptomus statusi bo'yicha tekshiradi. */
export async function checkPendingOrders(): Promise<number> {
  const pending = await prisma.order.findMany({ where: { status: "pending" }, orderBy: { id: "asc" }, take: 50 });
  let delivered = 0;
  const nowMs = Date.now();
  for (const order of pending) {
    const ok = await settleOrder(order);
    if (ok) {
      delivered++;
      continue;
    }
    // to'lanmagan + eskirgan → expired (settleOrder allaqachon final tekshiruvni qildi)
    if (nowMs - new Date(order.createdAt).getTime() > ORDER_TTL_MIN * 60 * 1000) {
      await prisma.order.updateMany({ where: { id: order.id, status: "pending" }, data: { status: "expired" } });
    }
  }
  return delivered;
}

/** Davriy kuzatuv + reconcilerlar. */
export function startPaymentWatcher(intervalMs = 10000): void {
  if (!cryptomusEnabled()) {
    console.log("💤 To'lov watcher o'chiq (Cryptomus sozlanmagan).");
    return;
  }
  if (timer) return;
  timer = setInterval(() => {
    checkPendingOrders().catch((e) => console.warn("watcher tick xato:", (e as Error).message));
    reconcilePayouts().catch((e) => console.warn("payout reconcile xato:", (e as Error).message));
    reconcileRefunds().catch((e) => console.warn("refund reconcile xato:", (e as Error).message));
  }, intervalMs);
  console.log("👀 To'lov watcher + payout/refund reconciler (Cryptomus).");
}
