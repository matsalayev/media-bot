// TON tarmog'ida USDT (jetton) to'lovlari — creator payout'lari uchun.
// Platforma "hot wallet"idan creatorning TON manziliga USDT yuboriladi.
import { TonClient, WalletContractV4, WalletContractV5R1, JettonMaster } from "@ton/ton";
import { Address, beginCell, internal, toNano, SendMode } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { config } from "./config";

const USDT_DECIMALS = 6; // TON'dagi USD₮ jetton 6 kasrli
const JETTON_TRANSFER_OP = 0xf8a7ea5;

/** TON payout sozlanganmi (hot-wallet mnemonic mavjudmi). */
export function tonEnabled(): boolean {
  return !!config.tonMnemonic;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: { client: TonClient; wallet: any; secretKey: Buffer } | null = null;

async function ctx() {
  if (cached) return cached;
  if (!config.tonMnemonic) throw new Error("TON_MNEMONIC o'rnatilmagan");
  const key = await mnemonicToPrivateKey(config.tonMnemonic.trim().split(/\s+/));
  const wallet =
    config.tonWalletVersion === "v4"
      ? WalletContractV4.create({ workchain: 0, publicKey: key.publicKey })
      : WalletContractV5R1.create({ workchain: 0, publicKey: key.publicKey });
  const client = new TonClient({ endpoint: config.tonApiEndpoint, apiKey: config.tonApiKey || undefined });
  cached = { client, wallet, secretKey: key.secretKey };
  return cached;
}

/** Manzilni tekshiradi va normallashtiradi (noto'g'ri bo'lsa xato tashlaydi). */
export function parseTonAddress(a: string): string {
  return Address.parse(a.trim()).toString({ bounceable: false });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// toncenter (TonClient) chaqiruvlari uchun qayta urinish — anonim/limit 429'larга chidamli
async function tcRetry<T>(fn: () => Promise<T>, tries = 4, gap = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(gap);
    }
  }
  throw last;
}

/**
 * Creator manziliga USDT (jetton) yuboradi. Barcha yuborishlar NAVBAT bilan (bitta seqno bir marta ishlatiladi).
 * confirmed — CHIQUVCHI USDT transfer on-chain topildimi (haqiqiy yetkazish isboti), shunchaki seqno emas.
 * DIQQAT: broadcast'dan KEYIN xato tashlamaydi (confirmed:false qaytaradi) — pul un-reserve bo'lib qolmasligi uchun.
 */
let sendChain: Promise<unknown> = Promise.resolve();
export function sendUsdt(to: string, amountUsdt: number, comment?: string): Promise<{ hash: string; confirmed: boolean }> {
  const run = sendChain.then(() => sendUsdtInner(to, amountUsdt, comment));
  sendChain = run.catch(() => {}); // navbatni uzmaslik uchun xatoni yutamiz
  return run;
}

async function sendUsdtInner(to: string, amountUsdt: number, comment?: string): Promise<{ hash: string; confirmed: boolean }> {
  const since = Math.floor(Date.now() / 1000);
  // --- BROADCAST'dan OLDIN (xato tashlashi mumkin — hali hech narsa yuborilmagan) ---
  const { client, wallet, secretKey } = await ctx();
  const dest = Address.parse(to.trim());
  const jettonUnits = BigInt(Math.round(amountUsdt * 10 ** USDT_DECIMALS));
  if (jettonUnits <= 0n) throw new Error("summa 0");
  const master = client.open(JettonMaster.create(Address.parse(config.usdtJettonMaster)));
  const myJettonWallet = await tcRetry(() => master.getWalletAddress(wallet.address));
  // comment — bu payout uchun noyob belgi (on-chain aynan shu payoutni topish uchun)
  let bb = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(0n, 64)
    .storeCoins(jettonUnits)
    .storeAddress(dest)
    .storeAddress(wallet.address)
    .storeMaybeRef(null)
    .storeCoins(comment ? toNano("0.01") : 0n); // forward_ton — comment yetkazilishi uchun
  bb = comment
    ? bb.storeBit(true).storeRef(beginCell().storeUint(0, 32).storeStringTail(comment).endCell())
    : bb.storeBit(false);
  const body = bb.endCell();
  const opened = client.open(wallet);
  // Wallet deploy bo'lganmi? Deployed bo'lsa seqno majburiy — 0 yuborsak tarmoq rad etadi (jimgina yo'qoladi).
  let deployed = false;
  try {
    const st = await tcRetry(() => client.getContractState(wallet.address), 3, 700);
    deployed = st.state === "active";
  } catch {
    deployed = false;
  }
  // Deployed bo'lsa seqno olishни talab qilamiz (fail bo'lsa throw — BROADCAST'dan oldin, xavfsiz).
  // Deploy bo'lmagan bo'lsa seqno=0 (birinchi tx uni deploy qiladi).
  const seqno: number = deployed ? await tcRetry<number>(() => opened.getSeqno(), 4, 800) : 0;
  const transfer = opened.createTransfer({
    seqno,
    secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
    messages: [internal({ to: myJettonWallet, value: toNano("0.08"), bounce: true, body })], // ortiqcha TON platformaga qaytadi
  });
  const hash = transfer.hash().toString("hex");
  // --- BROADCAST — bundan keyin XATO TASHLAMAYMIZ (yuborilgan bo'lishi mumkin) ---
  try {
    await opened.send(transfer);
  } catch {
    return { hash, confirmed: false }; // yuborilgan bo'lishi mumkin — reconciler on-chain tekshiradi
  }
  // Tasdiq: seqno oshdi VA chiquvchi USDT transfer haqiqatan dest'ga yetgani on-chain topildi
  let confirmed = false;
  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    let cur = seqno;
    try {
      cur = await opened.getSeqno();
    } catch {
      cur = seqno;
    }
    if (cur > seqno) {
      try {
        const o = await findOutgoingUsdt(dest.toString(), amountUsdt, since, comment, 2); // yangi tx — yuqori sahifalarда
        if (o.found) {
          confirmed = true;
          break;
        }
      } catch {
        /* keyingi urinishda tekshiramiz */
      }
    }
  }
  return { hash, confirmed };
}

/** Platforma (qabul qiluvchi) hamyon manzili. */
export async function getPlatformAddress(): Promise<string> {
  const { wallet } = await ctx();
  return wallet.address.toString({ bounceable: false });
}

function safeAddr(a?: string): string {
  try {
    return a ? Address.parse(a).toString() : "";
  } catch {
    return a ?? "";
  }
}

/**
 * Xaridor hamyoni platformaga USDT yuborishi uchun TON Connect tranzaksiyasini tayyorlaydi.
 * comment — buyurtma nonce'i (on-chain moslash uchun).
 */
export async function buildJettonPurchase(
  buyerAddress: string,
  amountUsdt: number,
  comment: string,
): Promise<{ toJettonWallet: string; amountTon: string; payloadBase64: string }> {
  const { client, wallet } = await ctx();
  const buyer = Address.parse(buyerAddress.trim());
  const jettonUnits = BigInt(Math.round(amountUsdt * 10 ** USDT_DECIMALS));
  if (jettonUnits <= 0n) throw new Error("summa 0");

  const master = client.open(JettonMaster.create(Address.parse(config.usdtJettonMaster)));
  const buyerJettonWallet = await master.getWalletAddress(buyer);

  const forwardPayload = beginCell().storeUint(0, 32).storeStringTail(comment).endCell(); // matnli comment
  const body = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(0n, 64) // query_id
    .storeCoins(jettonUnits)
    .storeAddress(wallet.address) // destination = platforma
    .storeAddress(buyer) // response_destination = xaridor (ortiqcha TON qaytadi)
    .storeMaybeRef(null) // custom_payload
    .storeCoins(toNano(config.purchaseForwardTon)) // forward_ton_amount
    .storeBit(true)
    .storeRef(forwardPayload) // forward_payload (ref, comment)
    .endCell();

  return {
    toJettonWallet: buyerJettonWallet.toString(),
    amountTon: toNano(config.purchaseGasTon).toString(),
    payloadBase64: body.toBoc().toString("base64"),
  };
}

// tonapi rate-limit himoyasi: so'rovlar KETMA-KET va minimal interval bilan; 429'da qayta uriniladi.
let tonapiLock: Promise<unknown> = Promise.resolve();
let lastTonapiAt = 0;
async function tonapiGet(url: string): Promise<Response> {
  const gap = config.tonapiKey ? 200 : 1100; // kalitsiz — sekinroq (429 oldini olish)
  const headers = config.tonapiKey ? { headers: { Authorization: `Bearer ${config.tonapiKey}` } } : undefined;
  const run = tonapiLock.then(async () => {
    const wait = gap - (Date.now() - lastTonapiAt);
    if (wait > 0) await sleep(wait);
    let r = await fetch(url, headers);
    for (let i = 0; i < 2 && r.status === 429; i++) {
      await sleep(1500);
      r = await fetch(url, headers);
    }
    lastTonapiAt = Date.now();
    return r;
  });
  tonapiLock = run.catch(() => {});
  return run;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tonapiEvents(limit: number, beforeLt?: number): Promise<any> {
  const { wallet } = await ctx();
  const addr = wallet.address.toString();
  let url = `${config.tonapiBase}/v2/accounts/${addr}/events?limit=${limit}`;
  if (beforeLt) url += `&before_lt=${beforeLt}`;
  const res = await tonapiGet(url);
  if (!res.ok) throw new Error("tonapi " + res.status);
  return res.json();
}

/** Platformaga KELGAN USDT to'lovlari (comment bilan). sinceUnix'ni qamrab olguncha sahifalab yig'adi. */
export async function fetchIncomingUsdt(
  sinceUnix: number,
  maxPages = 4,
): Promise<Array<{ comment: string; usdt: number; txHash: string; from: string; ts: number }>> {
  const { wallet } = await ctx();
  const platform = wallet.address.toString();
  const masterNorm = Address.parse(config.usdtJettonMaster).toString();
  const out: Array<{ comment: string; usdt: number; txHash: string; from: string; ts: number }> = [];
  let beforeLt: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await tonapiEvents(50, beforeLt);
    const events = data.events ?? [];
    if (!events.length) break;
    let oldest = Infinity;
    for (const ev of events) {
      const ts = Number(ev.timestamp ?? 0);
      if (ts) oldest = Math.min(oldest, ts);
      for (const act of ev.actions ?? []) {
        const jt = act.JettonTransfer ?? act.jettonTransfer;
        if (act.type !== "JettonTransfer" || !jt) continue;
        if (act.status && act.status !== "ok") continue;
        if (safeAddr(jt.recipient?.address) !== platform) continue; // faqat platformaga
        if (safeAddr(jt.jetton?.address) !== masterNorm) continue; // faqat USDT
        const decimals = Number(jt.jetton?.decimals ?? USDT_DECIMALS);
        const usdt = Number(jt.amount) / 10 ** decimals;
        if (!Number.isFinite(usdt)) continue;
        out.push({ comment: String(jt.comment ?? ""), usdt, txHash: String(ev.event_id ?? ""), from: safeAddr(jt.sender?.address), ts });
      }
    }
    beforeLt = data.next_from;
    if (!beforeLt || oldest <= sinceUnix) break;
  }
  return out;
}

/**
 * Platformadan `to` manziliga CHIQQAN USDT transferini topadi (payout tasdig'i / reconcile uchun).
 * comment berilsa — aynan shu payout belgisiga mos transferni qidiradi (noyob moslash).
 * exhausted=true — sahifa byudjeti tugadi, vaqt oynasi to'liq tekshirilmadi (⇒ "topilmadi" ishonchsiz).
 */
export async function findOutgoingUsdt(
  to: string,
  minUsdt: number,
  sinceUnix: number,
  comment?: string,
  maxPages = 8,
): Promise<{ found: boolean; txHash?: string; exhausted: boolean }> {
  const { wallet } = await ctx();
  const platform = wallet.address.toString();
  const dest = safeAddr(to);
  const masterNorm = Address.parse(config.usdtJettonMaster).toString();
  let beforeLt: number | undefined;
  let covered = false; // vaqt oynasini yoki barcha eventlarni to'liq ko'rib chiqdikmi
  for (let page = 0; page < maxPages; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await tonapiEvents(50, beforeLt);
    const events = data.events ?? [];
    if (!events.length) {
      covered = true;
      break;
    }
    let oldest = Infinity;
    for (const ev of events) {
      const ts = Number(ev.timestamp ?? 0);
      if (ts) oldest = Math.min(oldest, ts);
      for (const act of ev.actions ?? []) {
        const jt = act.JettonTransfer ?? act.jettonTransfer;
        if (act.type !== "JettonTransfer" || !jt) continue;
        if (act.status && act.status !== "ok") continue;
        if (safeAddr(jt.sender?.address) !== platform) continue; // platformadan chiqqan
        if (safeAddr(jt.recipient?.address) !== dest) continue; // aynan shu creatorga
        if (safeAddr(jt.jetton?.address) !== masterNorm) continue; // USDT
        if (comment && String(jt.comment ?? "") !== comment) continue; // aynan shu payout belgisi
        const decimals = Number(jt.jetton?.decimals ?? USDT_DECIMALS);
        const usdt = Number(jt.amount) / 10 ** decimals;
        if (Number.isFinite(usdt) && usdt + 1e-6 >= minUsdt && ts >= sinceUnix - 90) {
          return { found: true, txHash: String(ev.event_id ?? ""), exhausted: false };
        }
      }
    }
    beforeLt = data.next_from;
    if (!beforeLt || oldest <= sinceUnix - 90) {
      covered = true;
      break;
    }
  }
  return { found: false, exhausted: !covered };
}

/** Hot-wallet manzili va balansi (USDT + TON). */
export async function getHotWalletInfo(): Promise<{ address: string; ton: number; usdt: number }> {
  const { client, wallet } = await ctx();
  let ton = 0;
  try {
    ton = Number(await tcRetry(() => client.getBalance(wallet.address), 3, 700)) / 1e9;
  } catch {
    ton = 0;
  }
  let usdt = 0;
  try {
    const master = client.open(JettonMaster.create(Address.parse(config.usdtJettonMaster)));
    const jw = await tcRetry(() => master.getWalletAddress(wallet.address), 3, 700);
    const res = await tcRetry(() => client.runMethod(jw, "get_wallet_data"), 3, 700);
    usdt = Number(res.stack.readBigNumber()) / 10 ** USDT_DECIMALS;
  } catch {
    usdt = 0; // jetton wallet hali deploy bo'lmagan bo'lishi mumkin
  }
  return { address: wallet.address.toString({ bounceable: false }), ton, usdt };
}
