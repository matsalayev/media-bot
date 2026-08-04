import { config } from "./config";

/** USDT summani Telegram Stars soniga aylantiradi (invoice uchun). 0 = bepul. */
export function usdtToStars(usdt: number): number {
  if (!usdt || usdt <= 0) return 0;
  return Math.max(1, Math.round(usdt / config.starUsd));
}

/** Stars sonini USDT qiymatga (taxminiy) aylantiradi. */
export function starsToUsdt(stars: number): number {
  return (stars || 0) * config.starUsd;
}

/** USDT summani 2 kasr bilan ko'rsatadi. */
export function fmtUsd(n: number): string {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}
