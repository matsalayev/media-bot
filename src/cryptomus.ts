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

// Cryptomus biznes-xatosi (state!=0) — bu holda "Cryptomus javob berdi": not-found/validation.
// Tarmoq/parse xatosi esa TRANZIENT (noma'lum) — .cmBusiness qo'yilmaydi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(path: string, body: Record<string, unknown>, key: string): Promise<any> {
  const bodyStr = JSON.stringify(body);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { merchant: config.cryptomusMerchant, sign: sign(bodyStr, key), "Content-Type": "application/json" },
      body: bodyStr,
    });
    data = await res.json();
  } catch {
    throw new Error(`cryptomus ${path}: tarmoq xatosi`); // transient — cmBusiness YO'Q
  }
  if (data && data.state === 0) return data.result;
  const err = new Error(`cryptomus ${path}: ${String(data?.message ?? JSON.stringify(data?.errors ?? data)).slice(0, 200)}`);
  (err as Error & { cmBusiness?: boolean }).cmBusiness = true; // Cryptomus aniq javob berdi (biznes-xato)
  throw err;
}

// ---- TRC20 (TRON) manzil: format + base58check tekshiruvi ----
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Buffer | null {
  let num = 0n;
  for (const ch of s) {
    const idx = B58.indexOf(ch);
    if (idx < 0) return null;
    num = num * 58n + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = Buffer.from(hex, "hex");
  let leading = 0;
  for (const ch of s) {
    if (ch === "1") leading++;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leading, 0), body]);
}
/** TRC20 (TRON) manzil to'g'rimi — format + 0x41 prefiks + base58check summasi. */
export function isTrc20Address(a: string): boolean {
  const s = (a ?? "").trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return false;
  const dec = b58decode(s);
  if (!dec || dec.length !== 25 || dec[0] !== 0x41) return false;
  const payload = dec.subarray(0, 21);
  const checksum = dec.subarray(21, 25);
  const h = crypto.createHash("sha256").update(crypto.createHash("sha256").update(payload).digest()).digest();
  return h.subarray(0, 4).equals(checksum);
}

/** To'lov statusi yakuniy muvaffaqiyatmi. */
export function isPaid(status: string): boolean {
  return status === "paid" || status === "paid_over";
}

/** To'lov yakuniy MUVAFFAQIYATSIZ (boshqa hech qachon to'lanmaydi) — shundagina expire xavfsiz. */
export function isTerminalUnpaid(status: string): boolean {
  return status === "cancel" || status === "fail" || status === "system_fail";
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
      // is_subtract "0" = haq platforma balansidan (qabul qiluvchi TO'LIQ oladi); "1" = haq summadan yechiladi
      is_subtract: config.payoutFeeFromBalance ? "0" : "1",
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

/**
 * Payout statusi: mavjud bo'lsa status (string), Cryptomus'da YO'Q bo'lsa null,
 * tarmoq/noma'lum xatoda throw (chaqiruvchi "noma'lum" deb hisoblaydi — ikki marta to'lovning oldini olish).
 */
export async function payoutStatusOrNull(orderId: string): Promise<string | null> {
  try {
    return await payoutStatus(orderId);
  } catch (e) {
    if ((e as Error & { cmBusiness?: boolean }).cmBusiness) return null; // Cryptomus javob berdi: yo'q
    throw e; // tarmoq xatosi — noma'lum
  }
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
    // r = [{ balance: { merchant: [{currency_code:"USDT", balance:"..."}], user: [...] } }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merch: any[] = r?.[0]?.balance?.merchant ?? [];
    const usdt = merch.find((b) => b?.currency_code === "USDT" || b?.currency === "USDT");
    return usdt ? Number(usdt.balance) : null;
  } catch {
    return null;
  }
}
