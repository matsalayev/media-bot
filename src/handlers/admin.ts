import { Bot, InlineKeyboard } from "grammy";
import { MyContext, bot as botInstance, isAdmin, notifyAdmins } from "../bot-core";
import { config } from "../config";
import { prisma } from "../db";
import { t, normLang } from "../i18n";
import { fmtUsd } from "../pricing";
import { tronEnabled, hotWalletAddress, getUsdtBalance, getTrxBalance } from "../tron";
import { markPayoutPaid, failAndRefundPayout, adjustBalance } from "../ledger";

export async function getCrmData(rangeDays?: number) {
  const usd = config.starUsd;
  const since = rangeDays && rangeDays > 0 ? new Date(Date.now() - rangeDays * 86400000) : undefined;
  const rangeWhere = since ? { createdAt: { gte: since } } : {};

  const agg = await prisma.unlock.aggregate({
    _sum: { starsPaid: true, platformFee: true, creatorEarned: true },
    _count: true,
    where: { refunded: false, ...rangeWhere },
  });
  const buyers = await prisma.unlock.findMany({ where: { refunded: false, ...rangeWhere }, select: { userId: true }, distinct: ["userId"] });
  const refundedAgg = await prisma.unlock.aggregate({ _sum: { starsPaid: true }, where: { refunded: true, ...rangeWhere } });
  const paidAgg = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { status: "paid", ...rangeWhere } });

  const pendingAgg = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { status: { in: ["requested", "processing"] } } });
  const earnedAllAgg = await prisma.unlock.aggregate({ _sum: { creatorEarned: true }, where: { refunded: false } });
  const reservedAllAgg = await prisma.payout.aggregate({ _sum: { amountStars: true }, where: { status: { in: ["requested", "processing", "paid"] } } });

  const creditedBonusAllAgg = await prisma.creatorBonus.aggregate({ _sum: { amountStars: true }, where: { status: "credited" } });
  const totalStars = agg._sum.starsPaid ?? 0;
  const commissionStars = agg._sum.platformFee ?? 0;
  const creatorStars = agg._sum.creatorEarned ?? 0;
  const undistributed = (earnedAllAgg._sum.creatorEarned ?? 0) + (creditedBonusAllAgg._sum.amountStars ?? 0) - (reservedAllAgg._sum.amountStars ?? 0);

  const contents = await prisma.content.findMany({ select: { id: true, creatorId: true, status: true } });
  const c2creator = new Map<number, number | null>();
  const videosByCreator = new Map<number, number>();
  for (const c of contents) {
    c2creator.set(c.id, c.creatorId ?? null);
    if (c.creatorId && c.status === "published") videosByCreator.set(c.creatorId, (videosByCreator.get(c.creatorId) ?? 0) + 1);
  }

  const byContent = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarned: true }, _count: true, where: { refunded: false, ...rangeWhere } });
  const per = new Map<number, { sales: number; starsEarned: number }>();
  for (const r of byContent) {
    const cid = c2creator.get(r.contentId);
    if (!cid) continue;
    const e = per.get(cid) ?? { sales: 0, starsEarned: 0 };
    e.sales += r._count;
    e.starsEarned += r._sum.creatorEarned ?? 0;
    per.set(cid, e);
  }
  const byContentAll = await prisma.unlock.groupBy({ by: ["contentId"], _sum: { creatorEarned: true }, where: { refunded: false } });
  const earnedAllByCreator = new Map<number, number>();
  for (const r of byContentAll) {
    const cid = c2creator.get(r.contentId);
    if (!cid) continue;
    earnedAllByCreator.set(cid, (earnedAllByCreator.get(cid) ?? 0) + (r._sum.creatorEarned ?? 0));
  }
  const payoutRows = await prisma.payout.groupBy({ by: ["userId", "status"], _sum: { amountStars: true } });
  const paidByCreator = new Map<number, number>();
  const reservedByCreator = new Map<number, number>();
  for (const r of payoutRows) {
    const amt = r._sum.amountStars ?? 0;
    if (r.status === "paid") paidByCreator.set(r.userId, (paidByCreator.get(r.userId) ?? 0) + amt);
    if (["requested", "processing", "paid"].includes(r.status)) reservedByCreator.set(r.userId, (reservedByCreator.get(r.userId) ?? 0) + amt);
  }

  const creatorIds = new Set<number>([...earnedAllByCreator.keys(), ...per.keys(), ...videosByCreator.keys()]);
  const users = await prisma.user.findMany({ where: { id: { in: [...creatorIds] } }, select: { id: true, telegramId: true, username: true, firstName: true, tier: true } });
  const uMap = new Map(users.map((u) => [u.id, u]));
  const bonusRows = await prisma.creatorBonus.groupBy({ by: ["userId"], _sum: { amountStars: true }, where: { status: "pending" } });
  const pendingBonusByCreator = new Map(bonusRows.map((b) => [b.userId, b._sum.amountStars ?? 0]));
  const creditedRows = await prisma.creatorBonus.groupBy({ by: ["userId"], _sum: { amountStars: true }, where: { status: "credited" } });
  const creditedBonusByCreator = new Map(creditedRows.map((b) => [b.userId, b._sum.amountStars ?? 0]));
  const creators = [...creatorIds]
    .map((id) => {
      const u = uMap.get(id);
      const rangeE = per.get(id) ?? { sales: 0, starsEarned: 0 };
      const available = (earnedAllByCreator.get(id) ?? 0) + (creditedBonusByCreator.get(id) ?? 0) - (reservedByCreator.get(id) ?? 0);
      return {
        userId: id,
        telegramId: u?.telegramId ?? "",
        username: u?.username ?? null,
        firstName: u?.firstName ?? null,
        tier: u?.tier ?? "bronze",
        videos: videosByCreator.get(id) ?? 0,
        sales: rangeE.sales,
        starsEarned: rangeE.starsEarned,
        usdValue: Math.round(rangeE.starsEarned * usd * 100) / 100,
        availableStars: Math.max(0, available),
        paidStars: paidByCreator.get(id) ?? 0,
        pendingBonusStars: pendingBonusByCreator.get(id) ?? 0,
      };
    })
    .sort((a, b) => b.starsEarned - a.starsEarned);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthComm = await prisma.unlock.aggregate({ _sum: { platformFee: true }, where: { refunded: false, createdAt: { gte: monthStart } } });
  const bonusPoolThisMonth = Math.floor(((monthComm._sum.platformFee ?? 0) * config.bonusPoolPercent) / 100);

  const round2 = (n: number) => Math.round(n * usd * 100) / 100;
  return {
    range: { days: rangeDays ?? 0, label: rangeDays ? `${rangeDays}d` : "all" },
    rates: { starUsd: usd, creatorSharePercent: config.creatorSharePercent, minWithdrawStars: config.minWithdrawStars, platformMode: config.paymentMode, bonusPoolPercent: config.bonusPoolPercent },
    totals: {
      totalStars,
      totalUsd: round2(totalStars),
      commissionStars,
      commissionUsd: round2(commissionStars),
      creatorStars,
      creatorUsd: round2(creatorStars),
      blendedCommissionPct: totalStars > 0 ? Math.round((commissionStars / totalStars) * 1000) / 10 : 0,
      sales: agg._count ?? 0,
      distinctBuyers: buyers.length,
      refundedStars: refundedAgg._sum.starsPaid ?? 0,
      paidOutStars: paidAgg._sum.amountStars ?? 0,
      pendingPayoutStars: pendingAgg._sum.amountStars ?? 0,
      undistributedLiabilityStars: Math.max(0, undistributed),
      undistributedLiabilityUsd: round2(Math.max(0, undistributed)),
      activeCreators: per.size,
      totalCreators: videosByCreator.size,
      bonusPoolThisMonthStars: bonusPoolThisMonth,
      bonusPoolThisMonthUsd: round2(bonusPoolThisMonth),
    },
    creators,
  };
}

export async function getUsersData(limit = 500) {
  const total = await prisma.user.count();
  const users = await prisma.user.findMany({
    orderBy: { id: "desc" },
    take: limit,
    select: { id: true, telegramId: true, username: true, firstName: true, createdAt: true, isBanned: true, isAdmin: true, tier: true },
  });
  const ids = users.map((u) => u.id);
  const buys = await prisma.unlock.groupBy({ by: ["userId"], _sum: { starsPaid: true }, _count: true, where: { userId: { in: ids }, starsPaid: { gt: 0 } } });
  const spentMap = new Map(buys.map((b) => [b.userId, { spent: b._sum.starsPaid ?? 0, count: b._count }]));
  const vids = await prisma.content.groupBy({ by: ["creatorId"], _count: true, where: { creatorId: { in: ids }, status: "published" } });
  const vidMap = new Map(vids.map((v) => [v.creatorId, v._count]));
  return {
    total,
    shown: users.length,
    users: users.map((u) => ({
      userId: u.id,
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      joined: u.createdAt,
      banned: u.isBanned,
      admin: u.isAdmin,
      tier: u.tier,
      videos: vidMap.get(u.id) ?? 0,
      purchases: spentMap.get(u.id)?.count ?? 0,
      spentStars: spentMap.get(u.id)?.spent ?? 0,
    })),
  };
}

export function register(bot: Bot<MyContext>) {
  bot.command("payouts", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const list = await prisma.payout.findMany({ orderBy: { id: "desc" }, take: 20, include: { user: true } });
    if (!list.length) return ctx.reply("Payout tarixi bo'sh.");
    const icon: Record<string, string> = { paid: "✅", processing: "⏳", failed: "❌", requested: "⭐", rejected: "🚫" };
    const lines = list.map((p) => {
      const tx = p.txHash ?? p.tonTxHash;
      const amt = p.amountStars > 0 ? `${p.amountStars} ⭐` : `${fmtUsd(p.amountUsdt)} USDT`;
      return (
        `${icon[p.status] ?? "•"} #${p.id} @${p.user.username ?? p.user.telegramId} · ${amt} · ${p.status}` +
        (tx ? `\n   tx: ${tx.slice(0, 16)}…` : "")
      );
    });
    await ctx.reply("💸 Payoutlar (oxirgi 20):\n\n" + lines.join("\n"));
  });

  bot.command("resolvepayout", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const [idRaw, st, tx] = (ctx.match ?? "").toString().trim().split(/\s+/);
    const id = Number(idRaw);
    if (!id || (st !== "paid" && st !== "failed")) return ctx.reply("Foydalanish: /resolvepayout <id> paid|failed [txHash]");
    const p = await prisma.payout.findUnique({ where: { id } });
    if (!p || p.status !== "processing") return ctx.reply("Bunday 'processing' payout topilmadi.");
    if (st === "paid") {
      await markPayoutPaid(id, tx ?? p.txHash ?? "manual");
      return ctx.reply(`✅ Payout #${id} → paid`);
    }
    const ok = await failAndRefundPayout(id, "admin: manual failed");
    await ctx.reply(ok ? `✅ Payout #${id} → failed (balans qaytdi)` : `Payout #${id} allaqachon hal qilingan.`);
  });

  bot.command("credit", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const [tgId, amtRaw, ...noteArr] = (ctx.match ?? "").toString().trim().split(/\s+/);
    const amt = Math.round((Number(amtRaw) || 0) * 1e6) / 1e6;
    if (!tgId || !(amt > 0)) return ctx.reply("Foydalanish: /credit <telegramId> <usdt> [izoh]");
    const u = await prisma.user.findUnique({ where: { telegramId: tgId } });
    if (!u) return ctx.reply("Foydalanuvchi topilmadi.");
    const after = await adjustBalance(u.id, amt, "admin_adjust", { note: noteArr.join(" ").slice(0, 120) || "admin credit" });
    const dep = await prisma.deposit.findFirst({ where: { userId: u.id, status: "pending", expectedAmount: amt } });
    if (dep) {
      await prisma.deposit
        .updateMany({ where: { id: dep.id, status: "pending" }, data: { status: "credited", txHash: "manual:" + dep.id, actualAmount: amt, creditedAt: new Date() } })
        .catch(() => {});
    }
    await botInstance.api.sendMessage(tgId, `✅ Balansingiz to'ldirildi: +${fmtUsd(amt)} USDT\nJoriy balans: ${fmtUsd(after)} USDT`).catch(() => {});
    await ctx.reply(`✅ @${u.username ?? tgId} balansi: ${fmtUsd(after)} USDT${dep ? " (deposit #" + dep.id + " yopildi)" : ""}`);
  });

  bot.command("hotwallet", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    if (!tronEnabled()) return ctx.reply("⚙️ TRON hot-wallet sozlanmagan (.env: TRON_HOTWALLET_*).");
    const addr = hotWalletAddress();
    let usdt: number | null = null;
    let trx: number | null = null;
    try { usdt = await getUsdtBalance(addr); } catch { /* API/rate-limit */ }
    try { trx = await getTrxBalance(addr); } catch { /* API */ }
    await ctx.reply(
      `🏦 Hot-wallet (TRON)\n${addr}\n\n` +
        `💵 USDT: ${usdt === null ? "noma'lum (API/kalit)" : fmtUsd(usdt) + " USDT"}\n` +
        `⛽ TRX (gaz): ${trx === null ? "noma'lum" : trx.toFixed(1) + " TRX"}\n\n` +
        `To'ldirishlar shu yerga tushadi; payout/refund yechish shundan chiqadi. Gaz (TRX) kamaysa payout to'xtaydi — TRX to'ldiring.`,
    );
  });

  bot.command("balance", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    if (config.paymentMode !== "tron") {
      const d = await getCrmData();
      const tt = d.totals;
      const money = (u: number) => "$" + u.toFixed(2);
      let s = "📊 Platforma statistikasi (Stars)\n";
      s += `\n💰 Jami yig'ilgan: ${tt.totalStars} ⭐ (${money(tt.totalUsd)})`;
      s += `\n🏦 Komissiya (${tt.blendedCommissionPct}%): ${tt.commissionStars} ⭐ (${money(tt.commissionUsd)})`;
      s += `\n👥 Creatorlar: ${tt.creatorStars} ⭐ (${money(tt.creatorUsd)})`;
      s += `\n💸 To'langan: ${tt.paidOutStars} ⭐ · ⏳ Kutilayotgan: ${tt.pendingPayoutStars} ⭐`;
      s += `\n👛 Tarqatilmagan majburiyat: ${tt.undistributedLiabilityStars} ⭐`;
      s += `\n🎁 Bonus pool (shu oy): ${tt.bonusPoolThisMonthStars} ⭐`;
      s += `\n\nTo'liq panel: /crm`;
      return void (await ctx.reply(s));
    }
    const feeAgg = await prisma.unlock.aggregate({ _sum: { platformFeeUsdt: true, creatorEarnedUsdt: true }, where: { refunded: false } });
    const paidAgg = await prisma.payout.aggregate({ _sum: { amountUsdt: true }, where: { status: "paid" } });
    const refAgg = await prisma.refund.aggregate({ _sum: { amountUsdt: true }, where: { status: "credited" } });
    const balAgg = await prisma.user.aggregate({ _sum: { balanceUsdt: true } });
    const depAgg = await prisma.deposit.aggregate({ _sum: { actualAmount: true }, where: { status: "credited" } });
    let out = "📊 Platforma statistikasi\n";
    out += `\n💰 To'ldirilgan (jami): ${fmtUsd(depAgg._sum.actualAmount ?? 0)} USDT`;
    out += `\n🏦 Komissiya (${100 - config.creatorSharePercent}%): ${fmtUsd(feeAgg._sum.platformFeeUsdt ?? 0)} USDT`;
    out += `\n👥 Creatorlar (${config.creatorSharePercent}%): ${fmtUsd(feeAgg._sum.creatorEarnedUsdt ?? 0)} USDT`;
    out += `\n💸 To'langan payout: ${fmtUsd(paidAgg._sum.amountUsdt ?? 0)} USDT`;
    out += `\n↩️ Refund (balansga): ${fmtUsd(refAgg._sum.amountUsdt ?? 0)} USDT`;
    out += `\n👛 Userlar balansi (jami majburiyat): ${fmtUsd(balAgg._sum.balanceUsdt ?? 0)} USDT`;
    if (tronEnabled()) {
      const addr = hotWalletAddress();
      let usdt: number | null = null;
      try { usdt = await getUsdtBalance(addr); } catch { /* API */ }
      out += `\n\n🏦 Hot-wallet USDT: ${usdt === null ? "noma'lum" : fmtUsd(usdt) + " USDT"}`;
      if (usdt !== null) out += `\n   (majburiyatdan ${usdt >= (balAgg._sum.balanceUsdt ?? 0) ? "✅ yetarli" : "⚠️ KAM!"})`;
    } else {
      out += "\n\n⚙️ TRON hot-wallet hali sozlanmagan.";
    }
    await ctx.reply(out);
  });

  bot.callbackQuery(/^spayout_ok:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const id = Number(ctx.match[1]);
    await prisma.payout.updateMany({ where: { id, status: { in: ["requested", "processing"] } }, data: { status: "paid" } });
    const p = await prisma.payout.findUnique({ where: { id }, include: { user: true } });
    if (p) await botInstance.api.sendMessage(p.user.telegramId, `✅ ${p.amountStars} ⭐ hisobingizga tarqatildi.`).catch(() => {});
    await ctx.answerCallbackQuery("✅ To'landi");
    await ctx.editMessageReplyMarkup().catch(() => {});
  });

  bot.callbackQuery(/^spayout_no:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
    const id = Number(ctx.match[1]);
    const upd = await prisma.payout.updateMany({ where: { id, status: { in: ["requested", "processing"] } }, data: { status: "rejected" } });
    if (upd.count === 1) {
      const p = await prisma.payout.findUnique({ where: { id }, include: { user: true } });
      if (p) await botInstance.api.sendMessage(p.user.telegramId, `❌ ${p.amountStars} ⭐ yechish so'rovingiz rad etildi. Balansingiz saqlanib qoldi.`).catch(() => {});
    }
    await ctx.answerCallbackQuery("Rad etildi");
    await ctx.editMessageReplyMarkup().catch(() => {});
  });

  bot.command("crm", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const d = await getCrmData();
    const tt = d.totals;
    const money = (u: number) => "$" + u.toFixed(2);
    let out = "📊 CRM (jami)\n\n";
    out += `💰 Jami yig'ilgan: ${tt.totalStars} ⭐ (${money(tt.totalUsd)})\n`;
    out += `🏦 Komissiya (${tt.blendedCommissionPct}%): ${tt.commissionStars} ⭐ (${money(tt.commissionUsd)})\n`;
    out += `👥 Creatorlar topgani: ${tt.creatorStars} ⭐ (${money(tt.creatorUsd)})\n`;
    out += `🛒 Sotuvlar: ${tt.sales} · ${tt.distinctBuyers} xaridor\n`;
    out += `⏳ Kutilayotgan payout: ${tt.pendingPayoutStars} ⭐\n`;
    out += `👛 Tarqatilmagan balans: ${tt.undistributedLiabilityStars} ⭐ (${money(tt.undistributedLiabilityUsd)})\n`;
    out += `🎭 Faol creatorlar: ${tt.activeCreators}/${tt.totalCreators}`;
    if (d.creators.length) {
      out += "\n\n🏆 Top creatorlar:\n";
      d.creators.slice(0, 5).forEach((c, i) => {
        out += `${i + 1}. ${c.firstName ?? c.username ?? c.telegramId}: ${c.starsEarned} ⭐ (${c.sales} sotuv)\n`;
      });
    }
    const url = config.webappUrl ? config.webappUrl.replace(/\/$/, "") + "/admin" : "";
    const kb = url ? new InlineKeyboard().webApp("📊 To'liq CRM panel", url) : undefined;
    await ctx.reply(out, kb ? { reply_markup: kb } : {});
  });

  bot.command("users", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    const d = await getUsersData(15);
    let out = `👥 Foydalanuvchilar: ${d.total}\n\nSo'nggilar:\n`;
    d.users.slice(0, 15).forEach((u) => {
      const nm = u.username ? "@" + u.username : u.firstName || u.telegramId;
      const badge = u.admin ? " 🛠" : u.banned ? " ⛔" : "";
      out += `• ${nm}${badge} — 🎬${u.videos} · 🛒${u.purchases} · ${u.spentStars}⭐\n`;
    });
    const url = config.webappUrl ? config.webappUrl.replace(/\/$/, "") + "/admin" : "";
    const kb = url ? new InlineKeyboard().webApp("👥 To'liq ro'yxat", url) : undefined;
    await ctx.reply(out, kb ? { reply_markup: kb } : {});
  });

  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const status = ctx.myChatMember.new_chat_member.status;
    if (
      (chat.type === "channel" || chat.type === "group" || chat.type === "supergroup") &&
      (status === "administrator" || status === "member")
    ) {
      await notifyAdmins(`📦 Bot «${("title" in chat && chat.title) || chat.id}» ga qo'shildi (${status}).\n\nSTORAGE_CHANNEL_ID:\n${chat.id}`);
    }
  });
}
