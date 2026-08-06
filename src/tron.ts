// Native TRON (USDT-TRC20) mijozi — uchinchi tomonsiz.
// Qabul: hot-wallet manziliga kelgan USDT'ni TronGrid orqali kuzatamiz (deposit watcher).
// To'lov (payout/refund yechish): hot-wallet kaliti bilan on-chain USDT transfer imzolaymiz.
// Kalit FAQAT server .env'da (TRON_HOTWALLET_PRIVKEY).
import { TronWeb } from "tronweb";
import { config } from "./config";

const USDT = config.usdtTrc20Contract;
const DECIMALS = 6;

// Minimal TRC20 ABI — ABI'ni zanjirdan yuklashning (va rate-limit'ning) oldini oladi.
const TRC20_ABI = [
  { constant: true, inputs: [{ name: "who", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { constant: false, inputs: [{ name: "_to", type: "address" }, { name: "_value", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

export function tronEnabled(): boolean {
  return !!(config.tronHotWalletAddress && config.tronHotWalletPrivkey);
}

export function hotWalletAddress(): string {
  return config.tronHotWalletAddress;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _tw: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tw(): any {
  if (_tw) return _tw;
  const opts: Record<string, unknown> = { fullHost: config.tronFullHost };
  if (config.tronApiKey) opts.headers = { "TRON-PRO-API-KEY": config.tronApiKey };
  if (config.tronHotWalletPrivkey) opts.privateKey = config.tronHotWalletPrivkey;
  _tw = new TronWeb(opts);
  return _tw;
}

/** TRC20 (TRON) manzil to'g'rimi (base58check + prefiks) — tronweb'ning rasmiy tekshiruvi. */
export function isTrc20Address(a: string): boolean {
  const s = (a ?? "").trim();
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s)) return false;
  try {
    return TronWeb.isAddress(s);
  } catch {
    return false;
  }
}

export function usdtToUnits(usdt: number): string {
  // 6 kasr; xatolikdan qochish uchun butun songa yaxlitlaymiz
  return BigInt(Math.round(usdt * 10 ** DECIMALS)).toString();
}
export function unitsToUsdt(units: string | number | bigint): number {
  return Number(BigInt(units)) / 10 ** DECIMALS;
}

/** Hot-wallet TRX balansi (gaz/energiya monitoringi uchun). */
export async function getTrxBalance(address = config.tronHotWalletAddress): Promise<number> {
  const sun = await tw().trx.getBalance(address);
  return Number(sun) / 1e6;
}

/** Berilgan manzilning USDT balansi (on-chain). */
export async function getUsdtBalance(address: string): Promise<number> {
  const c = await tw().contract(TRC20_ABI, USDT);
  const bal = await c.balanceOf(address).call();
  return unitsToUsdt(bal.toString());
}

export type IncomingTransfer = {
  txID: string;
  from: string;
  to: string;
  amountUsdt: number;
  timestamp: number; // ms
};

/**
 * Hot-wallet'ga kelgan (only_to) TASDIQLANGAN (only_confirmed) USDT o'tkazmalarini oladi.
 * TronGrid REST — tronweb emas (kuzatuvchi uchun eng ishonchli).
 */
export async function fetchIncomingUsdt(
  minTimestampMs: number,
  address = config.tronHotWalletAddress,
): Promise<IncomingTransfer[]> {
  const url =
    `${config.tronFullHost}/v1/accounts/${address}/transactions/trc20` +
    `?only_confirmed=true&only_to=true&limit=200&order_by=block_timestamp,asc` +
    `&contract_address=${USDT}&min_timestamp=${Math.max(0, Math.floor(minTimestampMs))}`;
  const headers: Record<string, string> = {};
  if (config.tronApiKey) headers["TRON-PRO-API-KEY"] = config.tronApiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TronGrid ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = await res.json();
  if (!j || j.success === false) throw new Error(`TronGrid: ${j?.error ?? "no data"}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(j.data) ? j.data : [];
  const out: IncomingTransfer[] = [];
  for (const r of rows) {
    const ci = r?.token_info?.address;
    if (ci && ci !== USDT) continue; // faqat USDT
    if (r?.type && r.type !== "Transfer") continue;
    if (r?.to !== address) continue; // xavfsizlik: faqat bizga kelganlar
    out.push({
      txID: String(r.transaction_id),
      from: String(r.from ?? ""),
      to: String(r.to ?? ""),
      amountUsdt: unitsToUsdt(String(r.value ?? "0")),
      timestamp: Number(r.block_timestamp ?? 0),
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignedTxn = { txID: string; signed: any };

/**
 * USDT transferini QURADI va IMZOLAYDI — lekin broadcast QILMAYDI.
 * txID broadcast'dan oldin ma'lum bo'ladi → uni saqlab qo'yib, tarmoq uzilsa
 * ham qayta yubormasdan on-chain holatni tekshirish mumkin (idempotentlik).
 */
export async function signUsdtTransfer(toAddress: string, amountUsdt: number): Promise<SignedTxn> {
  if (!tronEnabled()) throw new Error("TRON hot-wallet sozlanmagan");
  if (!isTrc20Address(toAddress)) throw new Error("noto'g'ri TRC20 manzil");
  if (!(amountUsdt > 0)) throw new Error("summa noto'g'ri");
  const t = tw();
  const tx = await t.transactionBuilder.triggerSmartContract(
    USDT,
    "transfer(address,uint256)",
    { feeLimit: Math.floor(config.payoutFeeLimitTrx * 1e6) },
    [
      { type: "address", value: toAddress },
      { type: "uint256", value: usdtToUnits(amountUsdt) },
    ],
    config.tronHotWalletAddress,
  );
  if (!tx || !tx.transaction) throw new Error("tranzaksiya qurilmadi");
  const signed = await t.trx.sign(tx.transaction);
  const txID: string = signed?.txID;
  if (!txID) throw new Error("imzo txID bermadi");
  return { txID, signed };
}

/**
 * Imzolangan tranzaksiyani tarmoqqa uzatadi. Broadcast rad etilsa throw qiladi.
 * DIQQAT: tronweb 6.x sendRawTransaction rad etilganда ham `transaction` maydonini
 * qaytaradi, shuning uchun FAQAT `result === true` ni muvaffaqiyat deb hisoblaymiz.
 * Xato xabari "broadcast rad etildi: CODE ..." ko'rinishida — chaqiruvchi shu prefiks
 * bo'yicha "node aniq rad etdi (tarmoqqa kirmadi)" ni ajratadi.
 */
export async function broadcastSigned(s: SignedTxn): Promise<void> {
  const res = await tw().trx.sendRawTransaction(s.signed);
  if (res && res.result === true) return;
  const code = res?.code ?? "UNKNOWN";
  let msg = "";
  try {
    msg = res?.message ? Buffer.from(res.message, "hex").toString("utf8") : "";
  } catch {
    msg = String(res?.message ?? "");
  }
  throw new Error(`broadcast rad etildi: ${code} ${msg}`.trim());
}

/** Broadcast xatosi node tomonidan ANIQ rad etilganmi (tarmoqqa kirmagan — xavfsiz refund). */
export function isDefiniteBroadcastReject(errMsg: string): boolean {
  const m = String(errMsg || "");
  if (!m.startsWith("broadcast rad etildi")) return false; // tarmoq/noma'lum xato — refund qilmaymiz
  // Noaniq kodlar: DUP (allaqachon yuborilgan), OTHER_ERROR/SERVER_BUSY (pool'ga tushган
  // bo'lishi mumkin) — refund qilmaymiz, on-chain tekshiruvga (txSucceeded) yo'naltiramiz.
  if (/DUP_TRANSACTION|OTHER_ERROR|SERVER_BUSY/i.test(m)) return false;
  return true;
}

/**
 * Qulaylik: imzolash + broadcast + txID. (Idempotentlik kerak bo'lsa
 * signUsdtTransfer + broadcastSigned'dan foydalaning.)
 */
export async function sendUsdt(toAddress: string, amountUsdt: number): Promise<string> {
  const s = await signUsdtTransfer(toAddress, amountUsdt);
  await broadcastSigned(s);
  return s.txID;
}

/** Tranzaksiya on-chain muvaffaqiyatli bajarildimi (SUCCESS). null = hali noma'lum. */
export async function txSucceeded(txid: string): Promise<boolean | null> {
  try {
    const info = await tw().trx.getTransactionInfo(txid);
    if (!info || !info.id) return null; // hali blокка tushmagan
    const res = info.receipt?.result;
    if (res === "SUCCESS" || (info.contractRet && info.contractRet === "SUCCESS")) return true;
    if (res || info.contractRet) return false; // REVERT/OUT_OF_ENERGY va h.k.
    // receipt bor, lekin natija maydoni yo'q — tekshirilgan, muvaffaqiyat deb hisoblaymiz
    return true;
  } catch {
    return null;
  }
}
