import "dotenv/config";

export const config = {
  botToken: process.env.BOT_TOKEN ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  webappUrl: process.env.WEBAPP_URL ?? "", // Mini App public HTTPS URL
  publicUrl: process.env.PUBLIC_URL ?? process.env.WEBAPP_URL ?? "",
  port: Number(process.env.PORT ?? 3000),
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  subPriceStars: Number(process.env.SUB_PRICE_STARS ?? 150),
  subDays: Number(process.env.SUB_DAYS ?? 30),
  // Creator ekonomikasi
  creatorSharePercent: Number(process.env.CREATOR_SHARE_PERCENT ?? 90), // creator ulushi % (platforma 10%)
  minWithdrawStars: Number(process.env.MIN_WITHDRAW_STARS ?? 100), // (legacy)
  // Moderatsiya
  uploadsPerHour: Number(process.env.UPLOADS_PER_HOUR ?? 10), // bir userга soatiga max yuklash
  strikeBanThreshold: Number(process.env.STRIKE_BAN_THRESHOLD ?? 3), // shuncha strike'дан keyin auto-ban
  // Narxlash / payout birligi — USDT
  starUsd: Number(process.env.STAR_USD ?? 0.013), // 1 Star ≈ qancha USD (Telegram developer withdraw kursi)
  minWithdrawUsdt: Number(process.env.MIN_WITHDRAW_USDT ?? 5), // minimal yechish (USDT)
  withdrawFeeUsdt: Number(process.env.WITHDRAW_FEE_USDT ?? 1.5), // yechishda ushlanadigan tarmoq haqi (gazni qoplaydi)
  disputeWindowDays: Number(process.env.DISPUTE_WINDOW_DAYS ?? 3), // daromad shuncha kun "pishadi" (aldov himoyasi); 0 = o'chiq
  // TON tarmog'ida USDT payout uchun "hot wallet"
  tonMnemonic: process.env.TON_MNEMONIC ?? "", // 24 so'zli hot-wallet seed (bo'sh bo'lsa payout o'chiq)
  tonApiEndpoint: process.env.TON_API_ENDPOINT ?? "https://toncenter.com/api/v2/jsonRPC",
  tonApiKey: process.env.TON_API_KEY ?? "", // toncenter API key (rate-limit uchun tavsiya)
  usdtJettonMaster: process.env.USDT_JETTON_MASTER ?? "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", // TON'dagi rasmiy USD₮
  tonWalletVersion: process.env.TON_WALLET_VERSION ?? "v5r1", // v5r1 (Tonkeeper default) | v4
  // === Native TRON (USDT-TRC20) — o'zimizniki, uchinchi tomonsiz ===
  tronFullHost: process.env.TRON_FULL_HOST ?? "https://api.trongrid.io",
  tronApiKey: process.env.TRON_API_KEY ?? "", // TronGrid API kaliti (rate-limit uchun; tavsiya etiladi)
  tronHotWalletAddress: process.env.TRON_HOTWALLET_ADDRESS ?? "", // qabul + to'lov manzili
  tronHotWalletPrivkey: process.env.TRON_HOTWALLET_PRIVKEY ?? "", // faqat server .env (bo'sh bo'lsa payout o'chiq)
  usdtTrc20Contract: process.env.USDT_TRC20_CONTRACT ?? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // rasmiy USDT-TRC20
  depositTtlMin: Number(process.env.DEPOSIT_TTL_MIN ?? 120), // to'ldirish so'rovi amal qilish muddati (daqiqa)
  payoutFeeLimitTrx: Number(process.env.PAYOUT_FEE_LIMIT_TRX ?? 100), // bitta payout uchun max energy/gaz (TRX)
  topupAmounts: (process.env.TOPUP_AMOUNTS ?? "3,5,10,20,50") // taklif qilinadigan to'ldirish summalari (USDT)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0),
  lowTrxAlertTrx: Number(process.env.LOW_TRX_ALERT_TRX ?? 40), // hot-wallet TRX shundan kamaysa admin ogohlantiriladi
  // Cryptomus (eskirgan — native TRON'ga o'tildi)
  cryptomusMerchant: process.env.CRYPTOMUS_MERCHANT ?? "",
  cryptomusPaymentKey: process.env.CRYPTOMUS_PAYMENT_KEY ?? "",
  cryptomusPayoutKey: process.env.CRYPTOMUS_PAYOUT_KEY ?? "",
  payoutFeeFromBalance: (process.env.PAYOUT_FEE_FROM_BALANCE ?? "1") === "1", // tarmoq haqi platforma balansidan (creator to'liq oladi)
  // TON Connect USDT to'lovlari (eskirgan — Cryptomus'ga o'tildi)
  tonapiBase: process.env.TONAPI_BASE ?? "https://tonapi.io",
  tonapiKey: process.env.TONAPI_KEY ?? "", // ixtiyoriy (rate-limit uchun)
  purchaseGasTon: process.env.PURCHASE_GAS_TON ?? "0.1", // xaridor biriktiradigan gaz (ortiqchasi qaytadi)
  purchaseForwardTon: process.env.PURCHASE_FORWARD_TON ?? "0.02", // forward (comment/notification uchun)
  // TO'LIQ videolar shu yopiq kanal/gurux'ga yuboriladi (cheksiz xotira; bot admin bo'lishi kerak).
  // Bo'sh bo'lsa — birinchi admin chatiga yuboriladi.
  storageChannelId: process.env.STORAGE_CHANNEL_ID ?? "",
  // AWS S3 — REELS (qisqa) videolar shu yerga yuklanadi va stream qilinadi.
  awsRegion: process.env.AWS_REGION ?? "",
  awsBucket: process.env.AWS_BUCKET ?? "",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  awsPublicBaseUrl: process.env.AWS_PUBLIC_BASE_URL ?? "", // ixtiyoriy: CloudFront/CDN domeni
};

export function assertBotConfig(): void {
  if (!config.botToken) {
    throw new Error(
      "BOT_TOKEN o'rnatilmagan. .env fayliga @BotFather'dan olingan tokenni qo'shing.",
    );
  }
}
