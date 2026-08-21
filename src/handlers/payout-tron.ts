import { bot as botInstance, notifyAdmins } from "../bot-core";
import { config } from "../config";
import { prisma } from "../db";
import { t, normLang } from "../i18n";
import { fmtUsd } from "../pricing";
import {
  tronEnabled,
  signUsdtTransfer,
  broadcastSigned,
  txSucceeded,
  isDefiniteBroadcastReject,
} from "../tron";
import {
  createWithdrawal,
  withdrawableBalance,
  markPayoutPaid,
  failAndRefundPayout,
  attachPayoutTx,
} from "../ledger";

let payoutChain: Promise<unknown> = Promise.resolve();

export function requestPayout(
  telegramId: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; payoutId?: number; amount?: number }> {
  const run = payoutChain.then(() => requestPayoutInner(telegramId, lang));
  payoutChain = run.catch(() => {});
  return run;
}

async function requestPayoutInner(
  telegramId: string,
  lang?: string,
): Promise<{ ok: boolean; message: string; payoutId?: number; amount?: number }> {
  const l = normLang(lang);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return { ok: false, message: t(l, "startFirst") };
  if (user.isBanned) return { ok: false, message: t(l, "banned") };
  if (!tronEnabled()) return { ok: false, message: t(l, "payoutOffline") };
  if (!user.tonWallet) return { ok: false, message: t(l, "needWallet") };

  const pending = await prisma.payout.findFirst({ where: { userId: user.id, status: "processing" } });
  if (pending) return { ok: false, message: t(l, "payoutPending") };

  const avail = await withdrawableBalance(user.id);
  const amount = Math.floor(avail * 100) / 100;
  const cr = await createWithdrawal(user.id, user.tonWallet, amount);
  if (cr.status === "bad_address") return { ok: false, message: t(l, "walletInvalid") };
  if (cr.status === "too_small")
    return { ok: false, message: t(l, "withdrawMin", { min: fmtUsd(config.minWithdrawUsdt), available: fmtUsd(avail) }) };
  if (cr.status === "insufficient")
    return { ok: false, message: t(l, "withdrawMin", { min: fmtUsd(config.minWithdrawUsdt), available: fmtUsd(cr.balance) }) };

  void notifyAdmins(
    `💸 Yechish #${cr.payoutId}\n@${user.username ?? user.telegramId}\n${fmtUsd(cr.grossUsdt)} → ${fmtUsd(cr.netUsdt)} USDT (tarmoq haqi ${fmtUsd(config.withdrawFeeUsdt)})\n→ ${user.tonWallet}`,
  ).catch(() => {});

  let signed: { txID: string; signed: unknown };
  try {
    signed = await signUsdtTransfer(user.tonWallet, cr.netUsdt);
  } catch (se) {
    await failAndRefundPayout(cr.payoutId, "imzo/qurish: " + String((se as Error)?.message ?? se).slice(0, 120));
    await notifyAdmins(`⚠️ Yechish #${cr.payoutId} imzo/qurish xatosi — balans qaytdi.\n${String((se as Error)?.message ?? se).slice(0, 150)}`).catch(() => {});
    return { ok: false, message: t(l, "withdrawFailed") };
  }

  const attached = await attachPayoutTx(cr.payoutId, signed.txID);
  if (!attached) {
    await notifyAdmins(`⚠️ Yechish #${cr.payoutId} broadcast oldidan bekor qilindi (holat o'zgargan) — jo'natilmadi.`).catch(() => {});
    return { ok: false, message: t(l, "withdrawFailed") };
  }

  try {
    await broadcastSigned(signed);
    await markPayoutPaid(cr.payoutId, signed.txID);
    await botInstance.api.sendMessage(telegramId, `✅ ${fmtUsd(cr.netUsdt)} USDT hamyoningizga yuborildi.\ntx: ${signed.txID}`).catch(() => {});
  } catch (be) {
    const msg = String((be as Error)?.message ?? be);
    if (isDefiniteBroadcastReject(msg)) {
      await failAndRefundPayout(cr.payoutId, "broadcast rad: " + msg.slice(0, 100));
      return { ok: false, message: t(l, "withdrawFailed") };
    }
    const ok = await txSucceeded(signed.txID);
    if (ok === true) {
      await markPayoutPaid(cr.payoutId, signed.txID);
      await botInstance.api.sendMessage(telegramId, `✅ ${fmtUsd(cr.netUsdt)} USDT hamyoningizga yuborildi.\ntx: ${signed.txID}`).catch(() => {});
    } else if (ok === false) {
      await failAndRefundPayout(cr.payoutId, "broadcast/REVERT: " + msg.slice(0, 100));
      return { ok: false, message: t(l, "withdrawFailed") };
    } else {
      await notifyAdmins(`⏳ Yechish #${cr.payoutId} holati noaniq (tx ${signed.txID}) — reconciler/admin tekshiradi.`).catch(() => {});
    }
  }
  return { ok: true, message: t(l, "withdrawProcessing", { amount: fmtUsd(cr.netUsdt) }), payoutId: cr.payoutId, amount: cr.netUsdt };
}
