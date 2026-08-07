import { createHmac, timingSafeEqual } from "crypto";
import { config } from "./config";

export interface TgUser {
  id: string;
  first_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Telegram Mini App initData'sini tekshiradi (HMAC-SHA256).
 * Hujjat: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): TgUser | null {
  if (!initData || !config.botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest(); // Buffer
  // Constant-time solishtirish (timing side-channel'дан himoya)
  let hashBuf: Buffer;
  try {
    hashBuf = Buffer.from(hash, "hex");
  } catch {
    return null;
  }
  if (hashBuf.length !== computed.length || !timingSafeEqual(computed, hashBuf)) return null;

  // Yangililik (freshness) — auth_date MAJBURIY, 24 soat
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const u = JSON.parse(userRaw) as { id: number; first_name?: string; username?: string; language_code?: string };
    return {
      id: String(u.id),
      first_name: u.first_name,
      username: u.username,
      language_code: u.language_code,
    };
  } catch {
    return null;
  }
}
