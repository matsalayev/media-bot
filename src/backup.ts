// SQLite prod.db ning izchil zaxira nusxasi (VACUUM INTO) + S3'ga off-box yuklash.
// Cron orqali soatiga ishga tushiriladi: node dist/backup.js
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { prisma } from "./db";
import { s3Enabled, putObjectToS3 } from "./storage";

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/opt/kino/backups";
const KEEP_LOCAL = 48; // oxirgi 48 ta (soatlik = 2 kun) local

async function main() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(BACKUP_DIR, `prod-${ts}.db`);

  // SQLite'ning izchil (WAL bilan ham) onlayn nusxasi
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file}'`);
  console.log("✅ backup:", file);

  // Off-box: S3'ga (disk yo'qolса ham saqlanib qoladi)
  if (s3Enabled()) {
    try {
      await putObjectToS3(`db-backups/prod-${ts}.db`, readFileSync(file), "application/x-sqlite3");
      console.log("✅ S3: db-backups/prod-" + ts + ".db");
    } catch (e) {
      console.error("⚠️ S3 backup xato:", (e as Error).message);
    }
  } else {
    console.warn("⚠️ S3 sozlanmagan — backup faqat local.");
  }

  // Local rotatsiya
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("prod-") && f.endsWith(".db"))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_LOCAL))) {
    try {
      unlinkSync(join(BACKUP_DIR, f));
    } catch (e) {
      /* ignore */
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("backup xato:", e);
  process.exit(1);
});
