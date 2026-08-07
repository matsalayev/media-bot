/* global Telegram */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    if (tg.setHeaderColor) tg.setHeaderColor("#0b0b0f");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#0b0b0f");
  } catch (e) {}
}
const initData = (tg && tg.initData) || "";
const HEADERS = { "Content-Type": "application/json", "X-Init-Data": initData };
const enc = encodeURIComponent;

// ---------------- i18n ----------------
const UI = {
  uz: {
    navReels: "Media", navSaved: "Saqlangan", navEarning: "Daromad", navProfile: "Profil",
    profile: "Profil", myContent: "Mening videolarim", liked: "Yoqtirganlar", saved: "Saqlangan", earning: "Daromad",
    uploadTitle: "Video joylash", fReel: "Qisqa REELS video", fVideo: "To'liq video", fTitle: "Sarlavha",
    fPrice: "Narx (USDT, 0 = bepul)", uploadHint: "Maks. 50MB. Darhol joylanadi.", uploadBtn: "Yuklash",
    watchFull: "To'liq ko'rish", unlock: "Ochish", sentToChat: "✅ Video chatingizga yuborildi",
    sentToChatHint: "✅ To'landi! Video chatga yuborildi. Kelmasa — botni oching va /start bosing.",
    paymentFailed: "To'lov amalga oshmadi", connErr: "Ulanishda xatolik", savedToast: "Saqlandi", removedToast: "Olib tashlandi",
    noContent: "Hozircha video yo'q.\n➕ orqali birinchi bo'lib qo'shing!", totalEarned: "Jami ishlangan", available: "Mavjud balans",
    withdrawBtn: "Yechish", minWithdraw: "Yechish uchun min.", myContentEmpty: "Hali video yo'q. ➕ bilan qo'shing.",
    likedEmpty: "Yoqtirgan yo'q.", savedEmpty: "Saqlangan yo'q.", selectFiles: "Reel va to'liq videoni tanlang",
    enterTitle: "Sarlavha kiriting", uploading: "Yuklanmoqda…", uploadedOk: "✅ Joylandi!", errGeneric: "Xatolik yuz berdi",
    free: "bepul", walletTitle: "USDT-TRC20 hamyon (yechish uchun)", walletPlaceholder: "TRC20 manzil (T… bilan boshlanadi)",
    payOpen: "💳 To'lov sahifasi ochildi — USDT-TRC20 to'lang, video keladi", bannedMsg: "⛔ Hisobingiz bloklangan",
    walletSave: "Saqlash", walletSavedToast: "✅ Hamyon saqlandi", walletNeeded: "Avval TRC20 hamyon manzilingizni saqlang",
    withdrawing: "Yuborilmoqda…", paymentPending: "⏳ To'lov tekshirilmoqda…", walletErr: "Hamyon ulanmadi",
    editVideo: "Videoni tahrirlash", save: "Saqlash", deleteBtn: "O'chirish", cancelBtn: "Bekor qilish",
    deleteAsk: "Videoni o'chirasizmi?", deleted: "🗑 O'chirildi", updated: "✅ Saqlandi",
    views: "ko'rish", sales: "sotildi", videosN: "video", earnedShort: "ishlangan", price: "Narx",
    reportBtn: "Aldov — shikoyat qilish", reportAsk: "Bu reel to'liq videoga mos kelmadimi? Aldov shikoyati yuborilsinmi?",
    termsTitle: "Foydalanish shartlari", termsAgree: "✅ Roziman",
    termsText: "Media — kontent platformasi. Pullik kontent Telegram Stars ⭐ orqali sotib olinadi.\n\n• Sotib olingan kontent uchun to'lov qaytarilmaydi — aldov holatidan tashqari.\n• 🛡 Aldov himoyasi: qisqa reel to'liq videoga mos kelmasa, «⚠️ Shikoyat» qiling. Admin tasdiqlasa, to'lovingizning 90% qaytariladi (10% komissiya qaytmaydi).\n• Mualliflar har sotuvdan 90%, platforma 10% oladi.\n• Kontent uchun javobgarlik uni joylagan muallifda.\n• Hamyoningiz va kalitlaringiz xavfsizligi o'zingizga bog'liq.\n\nDavom etish uchun shartlarni qabul qiling.",
    reportTitle: "Shikoyat qilish", reportThanks: "✅ Shikoyat yuborildi", catIllegal: "🚫 Noqonuniy kontent", catSexual: "🔞 Jinsiy / voyaga yetmagan", catCopyright: "©️ Mualliflik huquqi", catViolence: "⚔️ Zo'ravonlik", catOther: "• Boshqa sabab",
    topupTitle: "Balansni to'ldirish", topupBtn: "To'ldirish", balanceTitle: "Balansingiz", close: "Yopish", copied: "📋 Nusxalandi", feeNote: "tarmoq haqi", payoutSoon: "⚙️ Hozircha o'chiq, keyinroq urinib ko'ring", heldNote: "⏳ Pishmoqda (nizolar oynasi):", withdrawNote: "Yechish so'rovi adminga boradi va qo'lda tarqatiladi.", shareWord: "ulush", buyersShort: "xaridor", almostThere: "deyarli tayyor!", maxTier: "Eng yuqori daraja!", pendingBonus: "Kutilayotgan bonus",
    topupPick: "To'ldirish summasini tanlang (USDT):", topupNeed: "Bu video uchun kamida", topupSendExact: "AYNAN shu summani yuboring (USDT-TRC20):", topupAddress: "Manzil (TRON / TRC20):", topupWaiting: "To'lov kutilmoqda…", topupDone: "Balans to'ldirildi!", topupExpired: "Muddati o'tdi — qayta urinib ko'ring", topupNote: "⚠️ Faqat TRON (TRC20) tarmog'ida, AYNAN yuqoridagi summada yuboring. 1–2 daqiqada tushadi.",
  },
  ru: {
    navReels: "Media", navSaved: "Сохранённые", navEarning: "Доход", navProfile: "Профиль",
    profile: "Профиль", myContent: "Мои видео", liked: "Понравившиеся", saved: "Сохранённые", earning: "Доход",
    uploadTitle: "Загрузить видео", fReel: "Короткое REELS видео", fVideo: "Полное видео", fTitle: "Название",
    fPrice: "Цена (USDT, 0 = бесплатно)", uploadHint: "Макс. 50MB. Публикуется сразу.", uploadBtn: "Загрузить",
    watchFull: "Смотреть", unlock: "Открыть", sentToChat: "✅ Видео отправлено в чат",
    sentToChatHint: "✅ Оплачено! Видео отправлено в чат. Если не пришло — откройте бота и нажмите /start.",
    paymentFailed: "Оплата не прошла", connErr: "Ошибка соединения", savedToast: "Сохранено", removedToast: "Удалено",
    noContent: "Пока нет видео.\nДобавьте первым через ➕!", totalEarned: "Всего заработано", available: "Доступно",
    withdrawBtn: "Вывести", minWithdraw: "Мин. для вывода", myContentEmpty: "Пока нет видео. Добавьте через ➕.",
    likedEmpty: "Нет понравившихся.", savedEmpty: "Нет сохранённых.", selectFiles: "Выберите reel и полное видео",
    enterTitle: "Введите название", uploading: "Загрузка…", uploadedOk: "✅ Опубликовано!", errGeneric: "Произошла ошибка",
    free: "бесплатно", walletTitle: "USDT-TRC20 кошелёк (для вывода)", walletPlaceholder: "TRC20 адрес (начинается с T…)",
    payOpen: "💳 Открыта страница оплаты — оплатите USDT-TRC20, видео придёт", bannedMsg: "⛔ Ваш аккаунт заблокирован",
    walletSave: "Сохранить", walletSavedToast: "✅ Кошелёк сохранён", walletNeeded: "Сначала сохраните TRC20 адрес",
    withdrawing: "Отправка…", paymentPending: "⏳ Проверяем оплату…", walletErr: "Кошелёк не подключён",
    editVideo: "Редактировать видео", save: "Сохранить", deleteBtn: "Удалить", cancelBtn: "Отмена",
    deleteAsk: "Удалить видео?", deleted: "🗑 Удалено", updated: "✅ Сохранено",
    views: "просм.", sales: "продано", videosN: "видео", earnedShort: "заработано", price: "Цена",
    reportBtn: "Обман — пожаловаться", reportAsk: "Этот reel не соответствует полному видео? Отправить жалобу на обман?",
    termsTitle: "Условия использования", termsAgree: "✅ Принимаю",
    termsText: "Media — платформа контента. Платный контент покупается за Telegram Stars ⭐.\n\n• Оплата за купленный контент не возвращается — кроме случая обмана.\n• 🛡 Защита от обмана: если короткий reel не соответствует полному видео, подайте «⚠️ Жалобу». При подтверждении вернётся 90% (10% комиссии не возвращается).\n• Авторы получают 90% с продажи, платформа — 10%.\n• Ответственность за контент несёт автор.\n• Безопасность кошелька и ключей — на вас.\n\nЧтобы продолжить, примите условия.",
    reportTitle: "Пожаловаться", reportThanks: "✅ Жалоба отправлена", catIllegal: "🚫 Незаконный контент", catSexual: "🔞 Секс / несовершеннолетние", catCopyright: "©️ Авторские права", catViolence: "⚔️ Насилие", catOther: "• Другое",
    topupTitle: "Пополнить баланс", topupBtn: "Пополнить", balanceTitle: "Ваш баланс", close: "Закрыть", copied: "📋 Скопировано", feeNote: "сетевая комиссия", payoutSoon: "⚙️ Пока отключено, попробуйте позже", heldNote: "⏳ Созревает (окно споров):", withdrawNote: "Запрос на вывод уходит админу и распределяется вручную.", shareWord: "доля", buyersShort: "покуп.", almostThere: "почти!", maxTier: "Максимальный уровень!", pendingBonus: "Ожидаемый бонус",
    topupPick: "Выберите сумму пополнения (USDT):", topupNeed: "Для этого видео минимум", topupSendExact: "Отправьте ТОЧНО эту сумму (USDT-TRC20):", topupAddress: "Адрес (TRON / TRC20):", topupWaiting: "Ожидаем оплату…", topupDone: "Баланс пополнен!", topupExpired: "Срок истёк — попробуйте снова", topupNote: "⚠️ Только сеть TRON (TRC20), ТОЧНО указанной суммой. Зачислится за 1–2 минуты.",
  },
  en: {
    navReels: "Media", navSaved: "Saved", navEarning: "Earnings", navProfile: "Profile",
    profile: "Profile", myContent: "My videos", liked: "Liked", saved: "Saved", earning: "Earnings",
    uploadTitle: "Upload video", fReel: "Short REELS video", fVideo: "Full video", fTitle: "Title",
    fPrice: "Price (USDT, 0 = free)", uploadHint: "Max 50MB. Published instantly.", uploadBtn: "Upload",
    watchFull: "Watch", unlock: "Unlock", sentToChat: "✅ Video sent to your chat",
    sentToChatHint: "✅ Paid! The video was sent to your chat. If it didn't arrive, open the bot and press /start.",
    paymentFailed: "Payment failed", connErr: "Connection error", savedToast: "Saved", removedToast: "Removed",
    noContent: "No videos yet.\nBe the first via ➕!", totalEarned: "Total earned", available: "Available",
    withdrawBtn: "Withdraw", minWithdraw: "Min to withdraw", myContentEmpty: "No videos yet. Add via ➕.",
    likedEmpty: "Nothing liked.", savedEmpty: "Nothing saved.", selectFiles: "Select reel and full video",
    enterTitle: "Enter a title", uploading: "Uploading…", uploadedOk: "✅ Published!", errGeneric: "Something went wrong",
    free: "free", walletTitle: "USDT-TRC20 wallet (for withdrawal)", walletPlaceholder: "TRC20 address (starts with T…)",
    payOpen: "💳 Payment page opened — pay USDT-TRC20 and the video will arrive", bannedMsg: "⛔ Your account is banned",
    walletSave: "Save", walletSavedToast: "✅ Wallet saved", walletNeeded: "Save your TRC20 wallet address first",
    withdrawing: "Sending…", paymentPending: "⏳ Verifying payment…", walletErr: "Wallet not connected",
    editVideo: "Edit video", save: "Save", deleteBtn: "Delete", cancelBtn: "Cancel",
    deleteAsk: "Delete this video?", deleted: "🗑 Deleted", updated: "✅ Saved",
    views: "views", sales: "sales", videosN: "videos", earnedShort: "earned", price: "Price",
    reportBtn: "Report bait", reportAsk: "Doesn't this reel match the full video? Send a bait complaint?",
    termsTitle: "Terms of Use", termsAgree: "✅ I agree",
    termsText: "Media is a content platform. Paid content is purchased with Telegram Stars ⭐.\n\n• Payment for purchased content is non-refundable — except in cases of bait.\n• 🛡 Fraud protection: if a short reel doesn't match the full video, file a «⚠️ Complaint». If approved, 90% is refunded (the 10% commission is non-refundable).\n• Creators earn 90% per sale, the platform takes 10%.\n• Creators are responsible for their content.\n• The security of your wallet and keys is your own responsibility.\n\nAccept the terms to continue.",
    reportTitle: "Report", reportThanks: "✅ Report sent", catIllegal: "🚫 Illegal content", catSexual: "🔞 Sexual / minors", catCopyright: "©️ Copyright", catViolence: "⚔️ Violence", catOther: "• Other",
    topupTitle: "Top up balance", topupBtn: "Top up", balanceTitle: "Your balance", close: "Close", copied: "📋 Copied", feeNote: "network fee", payoutSoon: "⚙️ Off for now, try again later", heldNote: "⏳ Maturing (dispute window):", withdrawNote: "Withdrawal request goes to the admin and is distributed manually.", shareWord: "share", buyersShort: "buyers", almostThere: "almost there!", maxTier: "Top tier!", pendingBonus: "Pending bonus",
    topupPick: "Choose a top-up amount (USDT):", topupNeed: "For this video at least", topupSendExact: "Send EXACTLY this amount (USDT-TRC20):", topupAddress: "Address (TRON / TRC20):", topupWaiting: "Waiting for payment…", topupDone: "Balance topped up!", topupExpired: "Expired — please try again", topupNote: "⚠️ Only TRON (TRC20) network, EXACTLY the amount above. Credited in 1–2 minutes.",
  },
};
let LANG = "uz";
function L(k) {
  return (UI[LANG] && UI[LANG][k]) || UI.uz[k] || k;
}
function localize() {
  const set = (id, k) => {
    const e = document.getElementById(id);
    if (e) e.textContent = L(k);
  };
  set("nReels", "navReels"); set("nSaved", "navSaved"); set("nEarning", "navEarning"); set("nProfile", "navProfile");
  set("lSaved", "saved"); set("lUploadTitle", "uploadTitle"); set("lEarning", "earning"); set("lProfile", "profile");
  set("lMyContent", "myContent"); set("lLiked", "liked");
  set("lFReel", "fReel"); set("lFVideo", "fVideo"); set("lFTitle", "fTitle"); set("lFPrice", "fPrice"); set("lHint", "uploadHint");
  set("doUpload", "uploadBtn");
  set("lEditTitle", "editVideo"); set("lEName", "fTitle"); set("lEPrice", "price");
  set("edSave", "save"); set("edDelete", "deleteBtn"); set("edCancel", "cancelBtn");
  set("tgTitle", "termsTitle"); set("tgAgree", "termsAgree");
}

// ---------------- Foydalanish shartlari ----------------
function showTerms() {
  document.getElementById("tgText").textContent = L("termsText");
  document.getElementById("tgTitle").textContent = L("termsTitle");
  document.getElementById("tgAgree").textContent = L("termsAgree");
  document.getElementById("termsGate").hidden = false;
}
async function acceptTerms() {
  const btn = document.getElementById("tgAgree");
  btn.disabled = true;
  try {
    await fetch("/api/accept-terms", { method: "POST", headers: HEADERS, body: "{}" });
    document.getElementById("termsGate").hidden = true;
  } catch (e) {
    btn.disabled = false;
    toast(L("connErr"));
  }
}
function needTerms(d) {
  if (d && d.needTerms) {
    showTerms();
    return true;
  }
  return false;
}
document.getElementById("tgAgree").addEventListener("click", acceptTerms);

// ---------------- Ikonlar (Telegram-uslub) ----------------
const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.4C6.9 16.9 3.5 13.7 3.5 9.5 3.5 6.9 5.5 5 8 5c1.7 0 3.2 1 4 2.4C12.8 6 14.3 5 16 5c2.5 0 4.5 1.9 4.5 4.5 0 4.2-3.4 7.4-8.5 10.9z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z"/></svg>',
  // Telegram "forward" (uzatish) — o'ngga burilgan strelka
  share: '<svg viewBox="0 0 24 24"><path d="M12 7V4l8 7-8 7v-3.1c-4.6 0-7.9 1.4-10 4.6.7-6.4 4-10.2 10-11.5z"/></svg>',
  // Bayroq — shikoyat (moderatsiya)
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 5h11l-2 3.4L16 12H5"/></svg>',
  // Ovoz YOQ (muted) — dinamik + xoch
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>',
  // Ovoz BOR — dinamik + to'lqinlar
  soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.6a4.2 4.2 0 010 6.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M18.7 6a7.5 7.5 0 010 12" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

const feed = document.getElementById("feed");
const toastEl = document.getElementById("toast");
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function usd(n) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

// ---------------- Tab boshqaruvi ----------------
let currentTab = "reels";
function showTab(name) {
  currentTab = name;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  document.querySelectorAll("#nav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "reels") resumeFeed();
  else pauseFeed();
  if (name === "saved") renderSaved();
  if (name === "earning") renderEarning();
  if (name === "profile") renderProfile();
}
document.querySelectorAll("#nav .nav-item").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.getElementById("resetBtn").addEventListener("click", () => load()); // boshiga qaytish + yangilash

// ---------------- Reels ----------------
function watchLabel(it) {
  if (it.unlocked || it.priceUsdt === 0) return "▶ " + L("watchFull");
  return "💎 $" + usd(it.priceUsdt) + " — " + L("unlock");
}
function renderReel(it) {
  const el = document.createElement("div");
  el.className = "reel";
  el.dataset.id = it.id;

  const v = document.createElement("video");
  v.src = it.reelUrl;
  v.loop = true;
  v.muted = true;
  v.playsInline = true;
  v.setAttribute("webkit-playsinline", "");
  v.preload = "metadata";

  const mute = document.createElement("button");
  mute.className = "mute-badge";
  mute.innerHTML = ICON.soundOff;
  const toggleMute = () => {
    v.muted = !v.muted;
    mute.innerHTML = v.muted ? ICON.soundOff : ICON.soundOn;
    if (v.paused) v.play().catch(() => {});
  };
  mute.addEventListener("click", toggleMute);
  v.addEventListener("click", toggleMute);

  const actions = document.createElement("div");
  actions.className = "reel-actions";

  const likeBtn = document.createElement("button");
  likeBtn.className = "action" + (it.liked ? " liked" : "");
  likeBtn.innerHTML = ICON.heart + '<span class="action-count">' + (it.likeCount || 0) + "</span>";
  likeBtn.addEventListener("click", () => toggleLike(it, likeBtn));

  const saveBtn = document.createElement("button");
  saveBtn.className = "action" + (it.saved ? " saved" : "");
  saveBtn.innerHTML = ICON.bookmark + '<span class="action-count">' + (it.saveCount || 0) + "</span>";
  saveBtn.addEventListener("click", () => toggleSave(it, saveBtn));

  const shareBtn = document.createElement("button");
  shareBtn.className = "action share";
  shareBtn.innerHTML = ICON.share + '<span class="action-count">' + (it.shareCount || 0) + "</span>";
  shareBtn.addEventListener("click", () => shareReel(it, shareBtn));

  const flagBtn = document.createElement("button");
  flagBtn.className = "action report-flag";
  flagBtn.innerHTML = ICON.flag;
  flagBtn.addEventListener("click", () => openReportSheet(it.id));

  actions.append(likeBtn, saveBtn, shareBtn, flagBtn);

  const ov = document.createElement("div");
  ov.className = "overlay";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = it.title || "";
  const desc = document.createElement("div");
  desc.className = "desc";
  desc.textContent = it.description || "";
  const btn = document.createElement("button");
  btn.className = "watch";
  btn.textContent = watchLabel(it);
  btn.addEventListener("click", () => unlock(it, btn));
  ov.append(title, desc, btn);
  if (it.canReport) {
    const rep = document.createElement("button");
    rep.className = "report-link";
    rep.textContent = "⚠️ " + L("reportBtn");
    rep.addEventListener("click", () => reportReel(it, rep));
    ov.appendChild(rep);
  }

  el.append(v, mute, actions, ov);
  return el;
}

async function reportReel(it, el) {
  const send = async () => {
    try {
      const d = await (await fetch("/api/complaint", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) })).json();
      toast(d.message || L("errGeneric"));
      if (d.ok) {
        it.canReport = false;
        if (el) el.remove();
      }
    } catch (e) {
      toast(L("connErr"));
    }
  };
  if (tg && tg.showConfirm) tg.showConfirm(L("reportAsk"), (ok) => ok && send());
  else if (window.confirm(L("reportAsk"))) send();
}

// Umumiy shikoyat (moderatsiya) — toifa tanlash
function openReportSheet(contentId) {
  const cats = [
    ["illegal", L("catIllegal")],
    ["sexual", L("catSexual")],
    ["copyright", L("catCopyright")],
    ["violence", L("catViolence")],
    ["other", L("catOther")],
  ];
  const wrap = document.getElementById("repCats");
  wrap.innerHTML = "";
  cats.forEach(([code, label]) => {
    const b = document.createElement("button");
    b.className = "rep-cat";
    b.textContent = label;
    b.addEventListener("click", () => submitReport(contentId, code));
    wrap.appendChild(b);
  });
  document.getElementById("lReportTitle").textContent = L("reportTitle");
  document.getElementById("repCancel").textContent = L("cancelBtn");
  document.getElementById("reportSheet").hidden = false;
}
async function submitReport(contentId, category) {
  document.getElementById("reportSheet").hidden = true;
  try {
    const d = await (await fetch("/api/report", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId, category }) })).json();
    toast(d.message || L("reportThanks"));
  } catch (e) {
    toast(L("connErr"));
  }
}
document.getElementById("repCancel").addEventListener("click", () => (document.getElementById("reportSheet").hidden = true));
document.getElementById("reportSheet").addEventListener("click", (e) => {
  if (e.target.id === "reportSheet") document.getElementById("reportSheet").hidden = true;
});

async function toggleLike(it, btn) {
  try {
    const d = await (await fetch("/api/like", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) })).json();
    it.liked = d.liked;
    it.likeCount = d.likeCount;
    btn.classList.toggle("liked", d.liked);
    const c = btn.querySelector(".action-count");
    if (c) c.textContent = d.likeCount;
    meCache = null;
  } catch (e) {
    toast(L("connErr"));
  }
}
async function toggleSave(it, btn) {
  try {
    const d = await (await fetch("/api/save", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) })).json();
    it.saved = d.saved;
    it.saveCount = d.saveCount;
    btn.classList.toggle("saved", d.saved);
    const c = btn.querySelector(".action-count");
    if (c) c.textContent = d.saveCount;
    toast(d.saved ? L("savedToast") : L("removedToast"));
    meCache = null;
  } catch (e) {
    toast(L("connErr"));
  }
}
async function shareReel(it, btn) {
  try {
    const d = await (await fetch("/api/share", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) })).json();
    const c = btn.querySelector(".action-count");
    if (c) c.textContent = (Number(c.textContent) || 0) + 1;
    if (d.link && tg && tg.openTelegramLink) {
      tg.openTelegramLink("https://t.me/share/url?url=" + enc(d.link) + "&text=" + enc(it.title || "Media"));
    } else if (d.link) {
      toast(d.link);
    }
  } catch (e) {
    toast(L("connErr"));
  }
}

// ---------------- Ochish / sotib olish ----------------
async function unlock(it, btn) {
  if (it.unlocked || it.priceUsdt === 0) return deliverFree(it, btn);
  return buyCrypto(it, btn);
}
async function deliverFree(it, btn) {
  btn.disabled = true;
  try {
    const d = await (await fetch("/api/unlock", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) })).json();
    toast(d.status === "delivered" ? L("sentToChat") : L("errGeneric"));
  } catch (e) {
    toast(L("connErr"));
  } finally {
    btn.disabled = false;
  }
}
// Telegram Stars bilan sotib olamiz — invoice ochiladi, to'lovdan keyin video chatga keladi.
async function buyCrypto(it, btn) {
  btn.disabled = true;
  try {
    const d = await (await fetch("/api/buy", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) })).json();
    if (needTerms(d)) {
      btn.disabled = false;
      return;
    }
    if (d.banned) {
      toast(L("bannedMsg"));
      btn.disabled = false;
      return;
    }
    if (d.status === "delivered") {
      it.unlocked = true;
      btn.textContent = watchLabel(it);
      btn.disabled = false;
      toast(L("sentToChat"));
      return;
    }
    if (d.status === "invoice" && d.link && tg && tg.openInvoice) {
      tg.openInvoice(d.link, (status) => {
        if (status === "paid") {
          it.unlocked = true;
          btn.textContent = watchLabel(it);
          toast(L("sentToChatHint"));
        } else if (status === "failed") {
          toast(L("paymentFailed"));
        }
        btn.disabled = false;
      });
      return;
    }
    toast(d.error || L("errGeneric"));
    btn.disabled = false;
  } catch (e) {
    toast(L("connErr"));
    btn.disabled = false;
  }
}

// ---------------- Balansni to'ldirish (USDT-TRC20) ----------------
let topupPollTimer = null;
async function openTopup(minAmount, it, btn) {
  let d;
  try {
    d = await getMe();
  } catch (e) {
    return void toast(L("connErr"));
  }
  if (!d.topupEnabled) return void toast(L("payoutSoon"));
  const amounts = d.topupAmounts && d.topupAmounts.length ? d.topupAmounts.slice() : [3, 5, 10, 20, 50];
  const need = Math.max(1, Math.ceil(minAmount || 1));
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.innerHTML =
    '<div class="sheet topup-sheet">' +
    '<div class="sheet-title">' + L("topupTitle") + "</div>" +
    '<div class="topup-body"></div>' +
    '<button class="ghost sheet-close">' + L("close") + "</button>" +
    "</div>";
  document.body.appendChild(overlay);
  const body = overlay.querySelector(".topup-body");
  const close = () => {
    if (topupPollTimer) clearTimeout(topupPollTimer);
    overlay.remove();
  };
  overlay.querySelector(".sheet-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const chips = document.createElement("div");
  chips.className = "amount-chips";
  amounts.forEach((a) => {
    const c = document.createElement("button");
    c.className = "chip" + (a >= need ? "" : " dim");
    c.textContent = "$" + a;
    c.addEventListener("click", () => startTopup(a, body, it, btn, close));
    chips.appendChild(c);
  });
  body.innerHTML = '<div class="topup-hint">' + L("topupPick") + "</div>";
  body.appendChild(chips);
  if (need > 1) {
    const nh = document.createElement("div");
    nh.className = "topup-hint";
    nh.textContent = L("topupNeed") + " $" + usd(need);
    body.appendChild(nh);
  }
}

async function startTopup(amount, body, it, btn, close) {
  body.innerHTML = '<div class="topup-hint">…</div>';
  let d;
  try {
    d = await (await fetch("/api/topup", { method: "POST", headers: HEADERS, body: JSON.stringify({ amount }) })).json();
  } catch (e) {
    return void (body.innerHTML = '<div class="topup-hint">' + L("connErr") + "</div>");
  }
  if (needTerms(d)) return void close();
  if (!d || d.status !== "ok") return void (body.innerHTML = '<div class="topup-hint">' + ((d && d.error) || L("errGeneric")) + "</div>");
  const amt = d.amountUsdt;
  body.innerHTML =
    '<div class="topup-hint">' + L("topupSendExact") + "</div>" +
    '<div class="copy-field"><span class="cf-val">' + amt + ' USDT</span><button class="cf-btn" data-copy="' + amt + '">📋</button></div>' +
    '<div class="topup-hint">' + L("topupAddress") + "</div>" +
    '<div class="copy-field"><span class="cf-val addr">' + d.address + '</span><button class="cf-btn" data-copy="' + d.address + '">📋</button></div>' +
    '<div class="topup-status">⏳ ' + L("topupWaiting") + "</div>" +
    '<div class="topup-note">' + L("topupNote") + "</div>";
  body.querySelectorAll(".cf-btn").forEach((b) =>
    b.addEventListener("click", () => {
      copyText(b.getAttribute("data-copy"));
      toast(L("copied"));
    }),
  );
  pollTopup(d.depositId, body, it, btn, close, 0);
}

function pollTopup(depositId, body, it, btn, close, tries) {
  if (tries > 150) return; // ~10 daqiqa
  topupPollTimer = setTimeout(async () => {
    let d;
    try {
      d = await (await fetch("/api/topup/status", { method: "POST", headers: HEADERS, body: JSON.stringify({ depositId }) })).json();
    } catch (e) {
      return pollTopup(depositId, body, it, btn, close, tries + 1);
    }
    const st = body.querySelector(".topup-status");
    if (d.status === "credited") {
      meCache = null;
      if (st) st.textContent = "✅ " + L("topupDone") + " $" + usd(d.balance);
      toast("✅ " + L("topupDone"));
      setTimeout(() => {
        close();
        if (it && btn) buyCrypto(it, btn);
        else renderProfile();
      }, 1200);
      return;
    }
    if (d.status === "expired") {
      if (st) st.textContent = "❌ " + L("topupExpired");
      return;
    }
    pollTopup(depositId, body, it, btn, close, tries + 1);
  }, 4000);
}

function copyText(v) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(String(v));
    else {
      const ta = document.createElement("textarea");
      ta.value = String(v);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  } catch (e) {}
}

// ---------------- Autoplay + cheksiz aylanish ----------------
const seen = new Set();
let io = null;
let allItems = []; // sahifadagi barcha reels (aylanish uchun)
let cycleIdx = 0; // keyingi qo'shiladigan element (aylanadi)
let appending = false;

function ensureIO() {
  if (io) return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target.querySelector("video");
        if (!v) continue;
        if (e.isIntersecting && e.intersectionRatio > 0.6 && currentTab === "reels") {
          v.play().catch(() => {});
          const id = e.target.dataset.id;
          if (id && !seen.has(id)) {
            seen.add(id);
            fetch("/api/view", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: Number(id) }) }).catch(() => {});
          }
        } else {
          v.pause();
        }
      }
    },
    { threshold: [0, 0.6, 1] },
  );
  return io;
}
function observeReels() {
  const o = ensureIO();
  feed.querySelectorAll(".reel:not([data-obs])").forEach((r) => {
    r.setAttribute("data-obs", "1");
    o.observe(r);
  });
}
// allItems'dan n ta reel qo'shadi (tugasa boshidan aylanadi — cheksiz)
function appendBatch(n) {
  if (!allItems.length) return;
  const frag = document.createDocumentFragment();
  for (let k = 0; k < n; k++) {
    frag.appendChild(renderReel(allItems[cycleIdx % allItems.length]));
    cycleIdx++;
  }
  feed.appendChild(frag);
  observeReels();
  trimTop();
}
// Ko'rinishdan ancha yuqoridagi reels'ni DOM'dan olib tashlaymiz (video dekoderlarini bo'shatib, crashning oldini olamiz).
// Har reel aynan viewport balandligida — shuning uchun scrollTop'ni aniq to'g'irlaymiz (sakramaydi).
function trimTop() {
  const reels = feed.querySelectorAll(".reel");
  if (reels.length <= 12) return;
  const h = feed.clientHeight || window.innerHeight;
  const curIdx = Math.round(feed.scrollTop / h);
  const removable = curIdx - 5;
  if (removable <= 0) return;
  for (let i = 0; i < removable; i++) {
    const v = reels[i].querySelector("video");
    if (v) {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch (e) {}
    }
    reels[i].remove();
  }
  feed.scrollTop -= removable * h;
}
// oxiriga yaqinlashganda yana qo'shamiz (hech qachon tugamaydi)
feed.addEventListener(
  "scroll",
  () => {
    if (currentTab !== "reels" || !allItems.length) return;
    if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - feed.clientHeight * 1.5 && !appending) {
      appending = true;
      appendBatch(Math.min(Math.max(allItems.length, 4), 8));
      setTimeout(() => {
        appending = false;
      }, 300);
    }
  },
  { passive: true },
);
function pauseFeed() {
  document.querySelectorAll(".reel video").forEach((v) => v.pause());
}
function resumeFeed() {
  const st = feed.scrollTop;
  for (const r of document.querySelectorAll(".reel")) {
    if (Math.abs(r.offsetTop - st) < window.innerHeight / 2) {
      const v = r.querySelector("video");
      if (v) v.play().catch(() => {});
      break;
    }
  }
}

async function load(focus) {
  let data;
  try {
    data = await (await fetch("/api/reels", { method: "POST", headers: HEADERS, body: JSON.stringify({ focus: focus || 0 }) })).json();
  } catch (e) {
    feed.innerHTML = '<div class="empty">' + L("connErr") + "</div>";
    return;
  }
  if (data.lang) {
    LANG = data.lang;
    localize();
  }
  if (data.acceptedTerms === false) showTerms();
  const items = (data && data.items) || [];
  if (!items.length) {
    feed.innerHTML = '<div class="empty">' + L("noContent") + "</div>";
    return;
  }
  feed.innerHTML = "";
  allItems = items;
  cycleIdx = 0;
  appendBatch(items.length); // birinchi to'plam; keyin scroll bo'yicha aylanib qo'shiladi
  feed.scrollTop = 0;
}

// ---------------- /api/me (cache) ----------------
let meCache = null;
async function getMe(force) {
  if (meCache && !force) return meCache;
  const d = await (await fetch("/api/me", { method: "POST", headers: HEADERS, body: "{}" })).json();
  if (d.lang) {
    LANG = d.lang;
    localize();
  }
  meCache = d;
  return d;
}
function rowEl({ title, statsHtml, priceUsdt, onClick, showChevron }) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    '<div class="row-main"><div class="row-title">' + escapeHtml(title) + "</div>" +
    (statsHtml ? '<div class="row-stats">' + statsHtml + "</div>" : "") + "</div>" +
    (priceUsdt !== undefined ? '<div class="row-price">' + (priceUsdt > 0 ? "$" + usd(priceUsdt) : L("free")) + "</div>" : "") +
    (showChevron ? '<div class="chev">›</div>' : "");
  if (onClick) row.addEventListener("click", onClick);
  return row;
}
function fillList(container, rows, emptyKey) {
  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = '<div class="list-empty">' + L(emptyKey) + "</div>";
    return;
  }
  rows.forEach((r) => container.appendChild(r));
}
function gridCard(it, opts) {
  opts = opts || {};
  const card = document.createElement("div");
  card.className = "gcard";
  if (it.reelUrl) {
    const v = document.createElement("video");
    v.className = "gthumb";
    v.src = it.reelUrl + "#t=0.1";
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.setAttribute("webkit-playsinline", "");
    card.appendChild(v);
  } else {
    const d = document.createElement("div");
    d.className = "gthumb";
    card.appendChild(d);
  }
  const price = document.createElement("div");
  price.className = "gprice" + (it.priceUsdt > 0 ? " paid" : "");
  price.textContent = it.priceUsdt > 0 ? "$" + usd(it.priceUsdt) : L("free");
  card.appendChild(price);
  if (opts.editable) {
    const e = document.createElement("div");
    e.className = "gedit";
    e.textContent = "✏️";
    card.appendChild(e);
  }
  const meta = document.createElement("div");
  meta.className = "gmeta";
  meta.innerHTML = '<div class="gtitle">' + escapeHtml(it.title) + "</div>" + (opts.statsHtml ? '<div class="gstats">' + opts.statsHtml + "</div>" : "");
  card.appendChild(meta);
  if (opts.onClick) card.addEventListener("click", opts.onClick);
  return card;
}
function fillGrid(container, cards, emptyKey) {
  container.innerHTML = "";
  if (!cards.length) {
    container.innerHTML = '<div class="list-empty" style="grid-column:1/-1">' + L(emptyKey) + "</div>";
    return;
  }
  cards.forEach((c) => container.appendChild(c));
}
function openFromList(id) {
  showTab("reels");
  load(id);
}

// ---------------- Saqlangan ----------------
async function renderSaved() {
  const el = document.getElementById("savedList");
  el.innerHTML = '<div class="list-empty">…</div>';
  let d;
  try {
    d = await getMe();
  } catch (e) {
    return void (el.innerHTML = '<div class="list-empty">' + L("connErr") + "</div>");
  }
  fillGrid(
    el,
    (d.saved || []).map((it) => gridCard(it, { onClick: () => openFromList(it.id) })),
    "savedEmpty",
  );
}

// ---------------- Daromad (earning) ----------------
async function renderEarning() {
  const card = document.getElementById("earnCard");
  const list = document.getElementById("myContent");
  card.innerHTML = '<div class="card-title">…</div>';
  list.innerHTML = "";
  let d;
  try {
    d = await getMe();
  } catch (e) {
    return void (card.innerHTML = '<div class="card-title">' + L("connErr") + "</div>");
  }
  const balanceStars = d.balanceStars || 0;
  const earnedStars = d.earnedStars || 0;
  const content = d.content || [];
  const totalSales = content.reduce((s, c) => s + (c.unlocks || 0), 0);
  card.innerHTML =
    '<div class="card-title">' + L("totalEarned") + " (" + d.creatorShare + "%)</div>" +
    '<div class="big">' + earnedStars + " ⭐</div>" +
    '<div class="stat-grid">' +
    '<div class="box"><div class="n">' + content.length + '</div><div class="l">' + L("videosN") + "</div></div>" +
    '<div class="box"><div class="n">' + totalSales + '</div><div class="l">' + L("sales") + "</div></div>" +
    '<div class="box"><div class="n">' + Math.max(0, balanceStars) + ' ⭐</div><div class="l">' + L("available") + "</div></div>" +
    "</div>";
  fillGrid(
    list,
    content.map((c) =>
      gridCard(c, {
        editable: true,
        statsHtml: "👁 " + c.views + " · 🔓 " + c.unlocks + " · 💰 " + (c.earned || 0) + " ⭐",
        onClick: () => openEdit(c),
      }),
    ),
    "myContentEmpty",
  );
}

// ---------------- Tahrir oynasi ----------------
let editId = null;
function openEdit(c) {
  editId = c.id;
  document.getElementById("edTitle").value = c.title || "";
  document.getElementById("edPrice").value = c.priceUsdt || 0;
  document.getElementById("editSheet").hidden = false;
}
function closeEdit() {
  document.getElementById("editSheet").hidden = true;
  editId = null;
}
document.getElementById("edCancel").addEventListener("click", closeEdit);
document.getElementById("editSheet").addEventListener("click", (e) => {
  if (e.target.id === "editSheet") closeEdit();
});
document.getElementById("edSave").addEventListener("click", async () => {
  if (!editId) return;
  const title = document.getElementById("edTitle").value.trim();
  const priceUsdt = Math.max(0, parseFloat(document.getElementById("edPrice").value) || 0);
  const btn = document.getElementById("edSave");
  btn.disabled = true;
  try {
    const d = await (await fetch("/api/content/update", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: editId, title, priceUsdt }) })).json();
    if (d.ok) {
      toast(L("updated"));
      meCache = null;
      closeEdit();
      renderEarning();
      load();
    } else toast(d.error || L("errGeneric"));
  } catch (e) {
    toast(L("connErr"));
  } finally {
    btn.disabled = false;
  }
});
document.getElementById("edDelete").addEventListener("click", () => {
  if (!editId) return;
  const doDelete = async () => {
    const id = editId;
    try {
      const d = await (await fetch("/api/content/delete", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: id }) })).json();
      if (d.ok) {
        toast(L("deleted"));
        meCache = null;
        closeEdit();
        renderEarning();
        load();
      } else toast(d.error || L("errGeneric"));
    } catch (e) {
      toast(L("connErr"));
    }
  };
  if (tg && tg.showConfirm) tg.showConfirm(L("deleteAsk"), (ok) => ok && doDelete());
  else if (window.confirm(L("deleteAsk"))) doDelete();
});

// ---------------- Profil ----------------
async function renderProfile() {
  const top = document.getElementById("profileTop");
  const balCard = document.getElementById("balCard");
  const walletCard = document.getElementById("walletCard");
  const likedList = document.getElementById("likedList");
  balCard.innerHTML = '<div class="card-title">…</div>';
  let d;
  try {
    d = await getMe();
  } catch (e) {
    return void (balCard.innerHTML = '<div class="card-title">' + L("connErr") + "</div>");
  }
  const name = (d.user && (d.user.firstName || d.user.username)) || "User";
  top.innerHTML =
    '<div class="avatar">' + escapeHtml(name.slice(0, 1).toUpperCase()) + "</div>" +
    '<div class="who"><div class="n">' + escapeHtml(name) + "</div>" +
    (d.user && d.user.username ? '<div class="u">@' + escapeHtml(d.user.username) + "</div>" : "") + "</div>";

  const balanceStars = d.balanceStars || 0;
  const earnedStars = d.earnedStars || 0;
  const minW = d.minWithdrawStars || 100;
  // DARAJA kartasi
  const dj = d.daraja || {};
  const tierEmoji = { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎", diamond: "👑" };
  let darajaHtml = "";
  if (dj.tier) {
    darajaHtml =
      '<div class="daraja"><div class="dj-top"><span class="dj-badge tier-' + dj.tier + '">' + (tierEmoji[dj.tier] || "🎖") + " " + esc(dj.tierName || "") + (dj.verified ? " ✅" : "") + '</span>' +
      '<span class="dj-share">' + (dj.sharePercent || 90) + "% " + L("shareWord") + "</span></div>";
    if (dj.next) {
      const parts = [];
      if (dj.next.needUsd > 0) parts.push("+$" + dj.next.needUsd);
      if (dj.next.needBuyers > 0) parts.push("+" + dj.next.needBuyers + " " + L("buyersShort"));
      darajaHtml += '<div class="dj-next">→ ' + esc(dj.next.name) + " (" + dj.next.share + "%): " + (parts.length ? parts.join(" · ") : L("almostThere")) + "</div>";
    } else {
      darajaHtml += '<div class="dj-next">👑 ' + L("maxTier") + "</div>";
    }
    if (dj.pendingBonusStars > 0) darajaHtml += '<div class="dj-bonus">🎁 ' + L("pendingBonus") + ": " + dj.pendingBonusStars + " ⭐</div>";
    darajaHtml += "</div>";
  }
  balCard.className = "card stat";
  balCard.innerHTML =
    darajaHtml +
    '<div class="card-title">' + L("balanceTitle") + "</div>" +
    '<div class="big">' + Math.max(0, balanceStars) + " ⭐</div>" +
    '<div class="sub">' + L("totalEarned") + ": " + earnedStars + " ⭐ · creator " + (dj.sharePercent || d.creatorShare) + "%</div>";
  // Yechish so'rovi tugmasi (admin qo'lda tarqatadi)
  const wb = document.createElement("button");
  wb.className = "primary";
  wb.style.marginTop = "16px";
  const can = balanceStars >= minW && !!d.payoutEnabled;
  if (can) {
    wb.textContent = "💸 " + L("withdrawBtn") + " — " + balanceStars + " ⭐";
    wb.addEventListener("click", () => withdraw(wb));
  } else {
    wb.textContent = "💸 " + L("withdrawBtn");
    wb.disabled = true;
  }
  balCard.appendChild(wb);
  const hint = balanceStars < minW ? L("minWithdraw") + " " + minW + " ⭐" : L("withdrawNote");
  if (hint) {
    const h = document.createElement("div");
    h.className = "hint";
    h.style.textAlign = "left";
    h.textContent = hint;
    balCard.appendChild(h);
  }
  // Telegram Stars'da hamyon kerak emas
  walletCard.innerHTML = "";

  fillGrid(
    likedList,
    (d.liked || []).map((it) => gridCard(it, { onClick: () => openFromList(it.id) })),
    "likedEmpty",
  );

  renderLangRow();
}
function renderLangRow() {
  const row = document.getElementById("langRow");
  row.innerHTML = "";
  [["uz", "O'zbek"], ["ru", "Русский"], ["en", "English"]].forEach(([code, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = LANG === code ? "on" : "";
    b.addEventListener("click", async () => {
      LANG = code;
      localize();
      renderLangRow();
      await fetch("/api/lang", { method: "POST", headers: HEADERS, body: JSON.stringify({ lang: code }) }).catch(() => {});
      meCache = null;
      load();
    });
    row.appendChild(b);
  });
}

async function withdraw(btn) {
  btn.disabled = true;
  btn.textContent = L("withdrawing");
  try {
    const d = await (await fetch("/api/withdraw", { method: "POST", headers: HEADERS, body: "{}" })).json();
    if (needTerms(d)) {
      btn.disabled = false;
      return;
    }
    toast(d.message || L("errGeneric"));
    meCache = null;
    renderProfile();
  } catch (e) {
    toast(L("connErr"));
    btn.disabled = false;
  }
}
async function saveWallet(address, btn) {
  address = (address || "").trim();
  if (!address) return toast(L("walletNeeded"));
  btn.disabled = true;
  try {
    const d = await (await fetch("/api/wallet", { method: "POST", headers: HEADERS, body: JSON.stringify({ address }) })).json();
    if (d.ok) {
      toast(L("walletSavedToast"));
      meCache = null;
      renderProfile();
    } else {
      toast(d.message || L("errGeneric"));
      btn.disabled = false;
    }
  } catch (e) {
    toast(L("connErr"));
    btn.disabled = false;
  }
}

// ---------------- Yuklash ----------------
document.getElementById("doUpload").addEventListener("click", doUpload);
async function doUpload() {
  const reel = document.getElementById("upReel").files[0];
  const video = document.getElementById("upVideo").files[0];
  const title = document.getElementById("upTitle").value.trim();
  const price = document.getElementById("upPrice").value || "0";
  const btn = document.getElementById("doUpload");
  if (!reel || !video) return toast(L("selectFiles"));
  if (!title) return toast(L("enterTitle"));
  btn.disabled = true;
  btn.textContent = L("uploading");
  try {
    const fd = new FormData();
    fd.append("reel", reel);
    fd.append("video", video);
    fd.append("title", title);
    fd.append("price", price);
    const d = await (await fetch("/api/upload", { method: "POST", headers: { "X-Init-Data": initData }, body: fd })).json();
    if (needTerms(d)) return;
    if (d.status === "published") {
      toast(L("uploadedOk"));
      document.getElementById("upReel").value = "";
      document.getElementById("upVideo").value = "";
      document.getElementById("upTitle").value = "";
      document.getElementById("upPrice").value = "0";
      meCache = null;
      showTab("reels");
      load();
    } else toast(d.error || L("errGeneric"));
  } catch (e) {
    toast(L("connErr"));
  } finally {
    btn.disabled = false;
    btn.textContent = L("uploadBtn");
  }
}

// ---------------- Start ----------------
let startFocus = 0;
try {
  const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
  const m = sp && /^c(\d+)$/.exec(sp);
  if (m) startFocus = Number(m[1]);
} catch (e) {}
load(startFocus);
