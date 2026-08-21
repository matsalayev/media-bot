import { Bot } from "grammy";
import { MyContext, isAdmin, upsertUser, userLang } from "../bot-core";
import { createContent } from "./content";
import { assertCanUpload } from "./moderation";
import { t, normLang } from "../i18n";
import { fmtUsd } from "../pricing";

export function register(bot: Bot<MyContext>) {
  bot.command("add", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return;
    ctx.session.step = "reel";
    ctx.session.mode = "admin";
    ctx.session.draft = {};
    await ctx.reply(t(await userLang(String(ctx.from?.id)), "uploadStart"));
  });

  bot.command("upload", async (ctx) => {
    if (!ctx.from) return;
    await upsertUser({ id: String(ctx.from.id), username: ctx.from.username, first_name: ctx.from.first_name });
    ctx.session.step = "reel";
    ctx.session.mode = "creator";
    ctx.session.draft = {};
    await ctx.reply(t(await userLang(String(ctx.from.id)), "uploadStart"));
  });

  bot.command("cancel", async (ctx) => {
    ctx.session.step = undefined;
    ctx.session.mode = undefined;
    ctx.session.draft = {};
    await ctx.reply(t(await userLang(String(ctx.from?.id)), "cancelled"));
  });

  bot.on("message:video", async (ctx) => {
    if (!ctx.session.step || !ctx.from) return;
    const lang = await userLang(String(ctx.from.id));
    const fileId = ctx.message.video.file_id;
    if (ctx.session.step === "reel") {
      ctx.session.draft.reelFileId = fileId;
      ctx.session.step = "video";
      await ctx.reply(t(lang, "uploadFull"));
    } else if (ctx.session.step === "video") {
      ctx.session.draft.videoFileId = fileId;
      ctx.session.step = "meta";
      await ctx.reply(t(lang, "uploadMeta"));
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "meta" || !ctx.from) return next();
    const lang = await userLang(String(ctx.from.id));
    const [titleRaw, priceRaw] = ctx.message.text.split("|");
    const title = (titleRaw ?? "").trim();
    const price = Math.max(0, parseFloat((priceRaw ?? "0").trim().replace(",", ".")) || 0);
    const d = ctx.session.draft;
    if (!title || !d.reelFileId || !d.videoFileId) return ctx.reply(t(lang, "incomplete"));
    const can = await assertCanUpload(String(ctx.from.id), lang);
    if (!can.ok) {
      ctx.session.step = undefined;
      ctx.session.mode = undefined;
      ctx.session.draft = {};
      return ctx.reply(can.message);
    }
    await ctx.reply(t(lang, "saving"));
    const content = await createContent(String(ctx.from.id), { fileId: d.reelFileId }, { fileId: d.videoFileId }, title, price);
    ctx.session.step = undefined;
    ctx.session.mode = undefined;
    ctx.session.draft = {};
    await ctx.reply(t(lang, "published", { title: content.title, price: price === 0 ? t(lang, "free") : fmtUsd(price) + " USDT" }));
  });
}
