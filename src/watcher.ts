// Native TRON kuzatuvchisi:
//  1) hot-wallet'ga kelgan USDT to'ldirishlarni tanib, balansga kreditlaydi;
//  2) muddati o'tgan to'ldirishlarni yopadi;
//  3) "processing" payout'larni on-chain holat bo'yicha yakunlaydi (crash-recovery);
//  4) hot-wallet TRX (gaz) kamayganда adminni ogohlantiradi.
import { prisma } from "./db";
import { config } from "./config";
import { tronEnabled, fetchIncomingUsdt, getTrxBalance, txSucceeded } from "./tron";
import {
  creditIncomingDeposit,
  expireOldDeposits,
  markPayoutPaid,
  failAndRefundPayout,
} from "./ledger";
import { notifyAdmins, notifyUserById } from "./bot";

const POLL_LOOKBACK_MS = 60 * 60 * 1000; // qayta-skanlash xavfsizlik oynasi
const OVERLAP_MS = 2 * 60 * 1000;
const PAYOUT_NO_TX_GRACE_MS = 5 * 60 * 1000; // txHash'siz payout shundan keyin xavfsiz "failed" (inline oqim latensiyasidan ancha yuqori)

let timer: NodeJS.Timeout | null = null;
let tickBusy = false;
let lastPollTs = Date.now() - POLL_LOOKBACK_MS;
let lowTrxAlerted = false;
const alertedUnmatched = new Set<string>(); // takror admin-ogohlantirishning oldini oladi
const alertedStuck = new Set<number>(); // txHash bor, lekin on-chain topilmayotgan payout'lar
const STUCK_ALERT_MS = 30 * 60 * 1000; // shuncha vaqt noaniq bo'lsa admin ogohlantiriladi

/** Kelgan USDT to'ldirishlarni tekshiradi (server ham chaqira oladi — tezkorlik uchun). */
export async function checkDepositsNow(): Promise<void> {
  const since = lastPollTs - OVERLAP_MS;
  const txs = await fetchIncomingUsdt(since);
  let maxTs = lastPollTs;
  for (const t of txs) {
    if (t.timestamp > maxTs) maxTs = t.timestamp;
    const r = await creditIncomingDeposit(t.txID, t.amountUsdt);
    if (r.status === "credited") {
      alertedUnmatched.delete(t.txID);
      await notifyUserById(
        r.userId,
        `✅ Balans to'ldirildi: +${r.amountUsdt.toFixed(2)} USDT\nJoriy balans: ${r.balanceAfter.toFixed(2)} USDT`,
      ).catch(() => {});
    } else if (r.status === "nomatch" && !alertedUnmatched.has(t.txID)) {
      alertedUnmatched.add(t.txID);
      if (alertedUnmatched.size > 500) alertedUnmatched.clear();
      await notifyAdmins(
        `⚠️ Mos kelmagan to'lov: ${t.amountUsdt.toFixed(6)} USDT\nKimdan: ${t.from}\ntx: ${t.txID}\nKutilgan summaga mos emas — qo'lda tekshiring (/credit).`,
      ).catch(() => {});
    }
  }
  lastPollTs = maxTs;
}

/** "processing" payout'larni yakunlaydi. */
async function reconcilePayouts(): Promise<void> {
  const stuck = await prisma.payout.findMany({ where: { status: "processing" }, take: 50, orderBy: { id: "asc" } });
  for (const p of stuck) {
    if (p.txHash) {
      const ok = await txSucceeded(p.txHash);
      if (ok === true) {
        await markPayoutPaid(p.id, p.txHash);
        await notifyUserById(p.userId, `✅ Yechish yakunlandi: ${p.amountUsdt.toFixed(2)} USDT\ntx: ${p.txHash}`).catch(() => {});
      } else if (ok === false) {
        const refunded = await failAndRefundPayout(p.id, "on-chain muvaffaqiyatsiz (REVERT/energiya)");
        if (refunded)
          await notifyUserById(p.userId, `❌ Yechish amalga oshmadi — ${p.amountUsdt.toFixed(2)} USDT balansingizga qaytarildi.`).catch(() => {});
      } else if (Date.now() - new Date(p.createdAt).getTime() > STUCK_ALERT_MS && !alertedStuck.has(p.id)) {
        // ok === null uzoq vaqt — tx on-chain topilmayapti (crash/mempool tushdi). Avtomatik refund
        // XAVFLI (agar keyin tushsa ikki marta to'lov) → admin qo'lda /resolvepayout qilsin.
        alertedStuck.add(p.id);
        if (alertedStuck.size > 500) alertedStuck.clear();
        await notifyAdmins(
          `⚠️ Yechish #${p.id} uzoq vaqt noaniq (tx topilmayapti): ${p.amountUsdt.toFixed(2)} USDT → ${p.toAddress}\ntx: ${p.txHash}\nQo'lda tekshiring: on-chain bo'lsa /resolvepayout ${p.id} paid, bo'lmasa /resolvepayout ${p.id} failed`,
        ).catch(() => {});
      }
      // ok === null (yaqinda) → hali noma'lum, keyingi tsiklda
    } else if (Date.now() - new Date(p.createdAt).getTime() > PAYOUT_NO_TX_GRACE_MS) {
      // txHash yo'q + eski → hech qachon jo'natilmagan (imzolashdan oldin uzilgan): xavfsiz qaytarish.
      // onlyIfNoTx: inline oqim shu orada txHash biriktirgan bo'lsa refund qilmaymiz (ikki marta to'lov yo'q).
      const refunded = await failAndRefundPayout(p.id, "jo'natilmadi (imzolashdan oldin uzildi)", { onlyIfNoTx: true });
      if (refunded)
        await notifyUserById(p.userId, `❌ Yechish boshlanmadi — ${p.amountUsdt.toFixed(2)} USDT balansingizga qaytarildi. Qayta urinib ko'ring.`).catch(() => {});
    }
  }
}

async function checkGas(): Promise<void> {
  const trx = await getTrxBalance();
  if (trx < config.lowTrxAlertTrx && !lowTrxAlerted) {
    lowTrxAlerted = true;
    await notifyAdmins(
      `⚠️ Hot-wallet TRX kam: ${trx.toFixed(1)} TRX. Payout'lar (gaz) to'xtashi mumkin.\nTo'ldiring: ${config.tronHotWalletAddress}`,
    ).catch(() => {});
  } else if (trx >= config.lowTrxAlertTrx * 1.5) {
    lowTrxAlerted = false; // gisterezis
  }
}

/** Davriy kuzatuv. */
export function startPaymentWatcher(intervalMs = 15000): void {
  if (!tronEnabled()) {
    console.log("💤 TRON to'lov watcher o'chiq (hot-wallet sozlanmagan).");
    return;
  }
  if (timer) return;
  const tick = async () => {
    if (tickBusy) return;
    tickBusy = true;
    try {
      await checkDepositsNow().catch((e) => console.warn("deposit poll:", (e as Error).message));
      await expireOldDeposits().catch((e) => console.warn("expire deposits:", (e as Error).message));
      await reconcilePayouts().catch((e) => console.warn("payout reconcile:", (e as Error).message));
      await checkGas().catch((e) => console.warn("gas check:", (e as Error).message));
    } finally {
      tickBusy = false;
    }
  };
  timer = setInterval(tick, intervalMs);
  void tick();
  console.log("👀 TRON to'lov watcher (deposit + payout reconcile).");
}
