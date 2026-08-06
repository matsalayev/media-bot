// Cryptomus to'lovlarini kuzatuvchi + payout/refund reconciler.
// Webhook birlamchi (tez), bu poll esa zaxira (webhook o'tkazib yuborilса ham yopadi).
import { prisma } from "./db";
import { cryptomusEnabled, paymentStatus, isPaid, isTerminalUnpaid } from "./cryptomus";
import { deliverCryptoUnlock, reconcilePayouts, reconcileRefunds, notifyAdmins } from "./bot";

// Invoice lifetime 60 daqiqa. TTL uni ancha oshiб qo'yamiz — kech tasdiqlangan to'lov ham yetkazilsin.
const ORDER_TTL_MIN = 180;
const MAX_DELIVER_ATTEMPTS = 6;
let timer: NodeJS.Timeout | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = any;
type SettleResult = "delivered" | "unpaid_terminal" | "pending";

/**
 * Bitta buyurtmani Cryptomus statusi bo'yicha hal qiladi.
 *  - "delivered": to'landi va yetkazildi
 *  - "unpaid_terminal": Cryptomus'da yakuniy bekor/muvaffaqiyatsiz → expire xavfsiz
 *  - "pending": hali tasdiqlanmoqda YOKI status olib bo'lmadi (noma'lum) → EXPIRE QILMASLIK kerak
 */
export async function settleOrder(order: OrderRow): Promise<SettleResult> {
  if (order.status !== "pending") return "pending";
  let st: string;
  try {
    st = await paymentStatus(order.nonce);
  } catch {
    return "pending"; // tarmoq/noma'lum — expire qilmaymiz
  }
  if (isPaid(st)) {
    const upd = await prisma.order.updateMany({ where: { id: order.id, status: "pending" }, data: { status: "paid" } });
    if (upd.count !== 1) return "pending"; // boshqa tsikl oldi
    try {
      const ok = await deliverCryptoUnlock(order.buyerTgId, order.contentId, order.amountUsdt);
      if (!ok) throw new Error("yetkazib bo'lmadi (video/user yo'q)");
      return "delivered";
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
      return "pending"; // to'langan, lekin yetkazilmadi — expire qilmaymiz (qayta urinamiz)
    }
  }
  if (isTerminalUnpaid(st)) return "unpaid_terminal";
  return "pending"; // check/process/confirm_check va h.k. — hali tugamagan
}

/** Webhook shu bilan bitta buyurtmani darhol hal qiladi. */
export async function settleOrderByNonce(nonce: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { nonce } });
  if (order) await settleOrder(order);
}

/** Zaxira poll: kutayotgan buyurtmalarni tekshiradi; FAQAT yakuniy-to'lanmagan yoki juda eski bo'lsa expire. */
export async function checkPendingOrders(): Promise<number> {
  const pending = await prisma.order.findMany({ where: { status: "pending" }, orderBy: { id: "asc" }, take: 50 });
  let delivered = 0;
  const nowMs = Date.now();
  for (const order of pending) {
    const r = await settleOrder(order);
    if (r === "delivered") {
      delivered++;
      continue;
    }
    if (r === "unpaid_terminal") {
      await prisma.order.updateMany({ where: { id: order.id, status: "pending" }, data: { status: "expired" } });
      continue;
    }
    // pending/noma'lum: faqat invoice muddatidan ancha o'tган (TTL) bo'lsa expire — kech tasdiq ham yetgan bo'lardi
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
