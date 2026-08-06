// Cryptomus to'lov protsessori (USDT-TRC20). Xarid = hosted invoice; payout/refund = mass-payout API.
// Hot-wallet, gaz, TON Connect yo'q — hammasini Cryptomus bajaradi.
import crypto from "crypto";
import { config } from "./config";

const API = "https://api.cryptomus.com/v1";

export function cryptomusEnabled(): boolean {
  return !!(config.cryptomusMerchant && config.cryptomusPaymentKey && config.cryptomusPayoutKey);
}

/** sign = md5( base64(json_body) + api_key ) */
function sign(bodyStr: string, key: string): string {
  return crypto.createHash("md5").update(Buffer.from(bodyStr).toString("base64") + key).digest("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(path: string, body: Record<string, unknown>, key: string): Promise<any> {
  const bodyStr = JSON.stringify(body);
  const res = await fetch(API + path, {
    method: "POST",
    headers: { merchant: config.cryptomusMerchant, sign: sign(bodyStr, key), "Content-Type": "application/json" },
    body: bodyStr,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  if (data.state !== 0) {
    throw new Error(`cryptomus ${path}: ${String(data.message ?? JSON.stringify(data.errors ?? data)).slice(0, 200)}`);
  }
  return data.result;
}

/** TRC20 (TRON) manzil formatini tekshiradi. */
export function isTrc20Address(a: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test((a ?? "").trim());
}

/** To'lov statusi yakuniy muvaffaqiyatmi. */
export function isPaid(status: string): boolean {
  return status === "paid" || status === "paid_over";
}

/** Hosted invoice yaratadi — foydalanuvchi shu sahifada USDT-TRC20 to'laydi. */
export async function createInvoice(
  orderId: string,
  amountUsdt: number,
  callbackUrl: string,
  returnUrl: string,
): Promise<{ uuid: string; url: string }> {
  const r = await call(
    "/payment",
    {
      amount: amountUsdt.toFixed(2),
      currency: "USDT",
      network: "tron",
      order_id: orderId,
      url_callback: callbackUrl,
      url_return: returnUrl,
      url_success: returnUrl,
      lifetime: 3600,
    },
    config.cryptomusPaymentKey,
  );
  return { uuid: String(r.uuid), url: String(r.url) };
}

/** To'lov statusini Cryptomus'dan bevosita so'raydi (webhook'ga ishonchdan mustaqil, ishonchli). */
export async function paymentStatus(orderId: string): Promise<string> {
  const r = await call("/payment/info", { order_id: orderId }, config.cryptomusPaymentKey);
  return String(r.payment_status ?? r.status ?? "");
}

/** Creator/refund uchun USDT-TRC20 payout (Cryptomus gazni o'zi to'laydi). */
export async function createPayout(
  orderId: string,
  amountUsdt: number,
  address: string,
  callbackUrl: string,
): Promise<{ uuid: string; status: string }> {
  const r = await call(
    "/payout",
    {
      amount: amountUsdt.toFixed(2),
      currency: "USDT",
      network: "tron",
      order_id: orderId,
      address: address.trim(),
      is_subtract: config.payoutFeeFromBalance ? "1" : "0",
      url_callback: callbackUrl,
    },
    config.cryptomusPayoutKey,
  );
  return { uuid: String(r.uuid), status: String(r.status ?? "process") };
}

/** Payout statusini Cryptomus'dan so'raydi. */
export async function payoutStatus(orderId: string): Promise<string> {
  const r = await call("/payout/info", { order_id: orderId }, config.cryptomusPayoutKey);
  return String(r.status ?? "");
}

/** Payout yakuniy holatlari. */
export function payoutIsPaid(status: string): boolean {
  return status === "paid";
}
export function payoutIsFailed(status: string): boolean {
  return status === "fail" || status === "cancel" || status === "system_fail";
}

/** Merchant USDT balansi (best-effort — /balance javob strukturasi murakkab). */
export async function merchantUsdtBalance(): Promise<number | null> {
  try {
    const r = await call("/balance", {}, config.cryptomusPaymentKey);
    // r: [{ balance: [{ currency_code, balance, ... }], ... }] ko'rinishida bo'lishi mumkin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flat: any[] = Array.isArray(r) ? r.flatMap((x) => x?.balance ?? x) : [];
    const usdt = flat.find((b) => (b?.currency_code ?? b?.currency) === "USDT");
    return usdt ? Number(usdt.balance) : null;
  } catch {
    return null;
  }
}
