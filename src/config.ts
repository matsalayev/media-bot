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
  creatorSharePercent: Number(process.env.CREATOR_SHARE_PERCENT ?? 70), // creator ulushi %
  minWithdrawStars: Number(process.env.MIN_WITHDRAW_STARS ?? 100),
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
