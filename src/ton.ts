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

/**
 * Creator manziliga USDT (jetton) yuboradi.
 * @returns hash — tashqi xabar hash'i; confirmed — seqno oshdimi (tarmoq qabul qildi).
 */
export async function sendUsdt(to: string, amountUsdt: number): Promise<{ hash: string; confirmed: boolean }> {
  const { client, wallet, secretKey } = await ctx();
  const dest = Address.parse(to.trim());
  const jettonUnits = BigInt(Math.round(amountUsdt * 10 ** USDT_DECIMALS));
  if (jettonUnits <= 0n) throw new Error("summa 0");

  const master = client.open(JettonMaster.create(Address.parse(config.usdtJettonMaster)));
  const myJettonWallet = await master.getWalletAddress(wallet.address);

  const body = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(0n, 64) // query_id
    .storeCoins(jettonUnits) // yuboriladigan USDT (jetton birligida)
    .storeAddress(dest) // qabul qiluvchi (owner)
    .storeAddress(wallet.address) // response_destination — ortiqcha TON qaytadi
    .storeMaybeRef(null) // custom_payload
    .storeCoins(0n) // forward_ton_amount
    .storeBit(false) // forward_payload — bo'sh (inline)
    .endCell();

  const opened = client.open(wallet);
  let seqno = 0;
  try {
    seqno = await opened.getSeqno();
  } catch {
    seqno = 0; // hali deploy bo'lmagan bo'lsa — birinchi tranzaksiya deploy qiladi
  }
  const transfer = opened.createTransfer({
    seqno,
    secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
    messages: [internal({ to: myJettonWallet, value: toNano("0.05"), bounce: true, body })],
  });
  const hash = transfer.hash().toString("hex");
  await opened.send(transfer);

  // seqno oshguncha kutamiz (tarmoq tasdig'i)
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
      confirmed = true;
      break;
    }
  }
  return { hash, confirmed };
}

/** Hot-wallet manzili va balansi (USDT + TON). */
export async function getHotWalletInfo(): Promise<{ address: string; ton: number; usdt: number }> {
  const { client, wallet } = await ctx();
  let ton = 0;
  try {
    ton = Number(await client.getBalance(wallet.address)) / 1e9;
  } catch {
    ton = 0;
  }
  let usdt = 0;
  try {
    const master = client.open(JettonMaster.create(Address.parse(config.usdtJettonMaster)));
    const jw = await master.getWalletAddress(wallet.address);
    const res = await client.runMethod(jw, "get_wallet_data");
    usdt = Number(res.stack.readBigNumber()) / 10 ** USDT_DECIMALS;
  } catch {
    usdt = 0; // jetton wallet hali deploy bo'lmagan bo'lishi mumkin
  }
  return { address: wallet.address.toString({ bounceable: false }), ton, usdt };
}
