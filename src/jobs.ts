// DARAJA fon ishlari: soatlik daraja qayta hisoblash + bonus maturation + oylik pool.
// (Startда darhol ishga tushib, mavjud creatorlar darajasini "backfill" ham qiladi.)
import { config } from "./config";
import { prisma } from "./db";
import { recomputeAllTiers, matureBonuses, buildMonthlyPool, ym } from "./incentives";

let timer: NodeJS.Timeout | null = null;
let busy = false;

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await recomputeAllTiers().catch((e) => console.warn("recomputeTiers:", (e as Error).message));
    await matureBonuses().catch((e) => console.warn("matureBonuses:", (e as Error).message));
    // Oldingi oy pooli — dispute oynasi o'tgach quramiz (idempotent). Faqat ~1 hafta oynada
    // qayta urinamiz (qisman qurilish/crash to'ldirilsin), keyin to'xtaymiz — har soat qayta ishlamasin.
    const now = new Date();
    const d = now.getDate();
    if (d > config.disputeWindowDays && d <= config.disputeWindowDays + 7) {
      const prior = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      await buildMonthlyPool(ym(prior)).catch((e) => console.warn("buildPool:", (e as Error).message));
    }
    await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").catch(() => {});
  } finally {
    busy = false;
  }
}

export function startIncentiveJobs(intervalMs = 60 * 60 * 1000): void {
  if (!config.incentivesEnabled) {
    console.log("💤 DARAJA rag'batlantirish o'chiq (INCENTIVES_ENABLED=0).");
    return;
  }
  if (timer) return;
  timer = setInterval(() => void tick(), intervalMs);
  void tick();
  console.log("🏆 DARAJA rag'batlantirish jobs (daraja + oylik bonus pool).");
}
