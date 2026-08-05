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
  minWithdrawUsdt: Number(process.env.MIN_WITHDRAW_USDT ?? 1), // minimal yechish (USDT)
  // TON tarmog'ida USDT payout uchun "hot wallet"
  tonMnemonic: process.env.TON_MNEMONIC ?? "", // 24 so'zli hot-wallet seed (bo'sh bo'lsa payout o'chiq)
  tonApiEndpoint: process.env.TON_API_ENDPOINT ?? "https://toncenter.com/api/v2/jsonRPC",
  tonApiKey: process.env.TON_API_KEY ?? "", // toncenter API key (rate-limit uchun tavsiya)
  usdtJettonMaster: process.env.USDT_JETTON_MASTER ?? "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs", // TON'dagi rasmiy USD₮
  tonWalletVersion: process.env.TON_WALLET_VERSION ?? "v5r1", // v5r1 (Tonkeeper default) | v4
  // TON Connect USDT to'lovlari (kontent sotib olish)
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
