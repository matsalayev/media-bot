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
let tcui = null;

// ---------------- i18n ----------------
const UI = {
  uz: {
    navReels: "Media", navSaved: "Saqlangan", navEarning: "Daromad", navProfile: "Profil",
    profile: "Profil", myContent: "Mening videolarim", liked: "Yoqtirganlar", saved: "Saqlangan", earning: "Daromad",
    uploadTitle: "Video joylash", fReel: "Qisqa REELS video", fVideo: "To'liq video", fTitle: "Sarlavha",
    fPrice: "Narx (USDT, 0 = bepul)", uploadHint: "Maks. 50MB. Darhol joylanadi.", uploadBtn: "Yuklash",
    watchFull: "To'liq ko'rish", unlock: "Ochish", sentToChat: "✅ Video chatingizga yuborildi",
    paymentFailed: "To'lov amalga oshmadi", connErr: "Ulanishda xatolik", savedToast: "Saqlandi", removedToast: "Olib tashlandi",
    noContent: "Hozircha video yo'q.\n➕ orqali birinchi bo'lib qo'shing!", totalEarned: "Jami ishlangan", available: "Mavjud balans",
    withdrawBtn: "Yechish", minWithdraw: "Yechish uchun min.", myContentEmpty: "Hali video yo'q. ➕ bilan qo'shing.",
    likedEmpty: "Yoqtirgan yo'q.", savedEmpty: "Saqlangan yo'q.", selectFiles: "Reel va to'liq videoni tanlang",
    enterTitle: "Sarlavha kiriting", uploading: "Yuklanmoqda…", uploadedOk: "✅ Joylandi!", errGeneric: "Xatolik yuz berdi",
    free: "bepul", walletTitle: "TON hamyon (USDT olish uchun)", walletPlaceholder: "TON manzil (UQ… yoki EQ…)",
    walletSave: "Saqlash", walletSavedToast: "✅ Hamyon saqlandi", walletNeeded: "Avval TON hamyon manzilingizni saqlang",
    withdrawing: "Yuborilmoqda…", paymentPending: "⏳ To'lov tekshirilmoqda…", walletErr: "Hamyon ulanmadi",
    editVideo: "Videoni tahrirlash", save: "Saqlash", deleteBtn: "O'chirish", cancelBtn: "Bekor qilish",
    deleteAsk: "Videoni o'chirasizmi?", deleted: "🗑 O'chirildi", updated: "✅ Saqlandi",
    views: "ko'rish", sales: "sotildi", videosN: "video", earnedShort: "ishlangan", price: "Narx",
  },
  ru: {
    navReels: "Media", navSaved: "Сохранённые", navEarning: "Доход", navProfile: "Профиль",
    profile: "Профиль", myContent: "Мои видео", liked: "Понравившиеся", saved: "Сохранённые", earning: "Доход",
    uploadTitle: "Загрузить видео", fReel: "Короткое REELS видео", fVideo: "Полное видео", fTitle: "Название",
    fPrice: "Цена (USDT, 0 = бесплатно)", uploadHint: "Макс. 50MB. Публикуется сразу.", uploadBtn: "Загрузить",
    watchFull: "Смотреть", unlock: "Открыть", sentToChat: "✅ Видео отправлено в чат",
    paymentFailed: "Оплата не прошла", connErr: "Ошибка соединения", savedToast: "Сохранено", removedToast: "Удалено",
    noContent: "Пока нет видео.\nДобавьте первым через ➕!", totalEarned: "Всего заработано", available: "Доступно",
    withdrawBtn: "Вывести", minWithdraw: "Мин. для вывода", myContentEmpty: "Пока нет видео. Добавьте через ➕.",
    likedEmpty: "Нет понравившихся.", savedEmpty: "Нет сохранённых.", selectFiles: "Выберите reel и полное видео",
    enterTitle: "Введите название", uploading: "Загрузка…", uploadedOk: "✅ Опубликовано!", errGeneric: "Произошла ошибка",
    free: "бесплатно", walletTitle: "TON кошелёк (для USDT)", walletPlaceholder: "TON адрес (UQ… или EQ…)",
    walletSave: "Сохранить", walletSavedToast: "✅ Кошелёк сохранён", walletNeeded: "Сначала сохраните TON адрес",
    withdrawing: "Отправка…", paymentPending: "⏳ Проверяем оплату…", walletErr: "Кошелёк не подключён",
    editVideo: "Редактировать видео", save: "Сохранить", deleteBtn: "Удалить", cancelBtn: "Отмена",
    deleteAsk: "Удалить видео?", deleted: "🗑 Удалено", updated: "✅ Сохранено",
    views: "просм.", sales: "продано", videosN: "видео", earnedShort: "заработано", price: "Цена",
  },
  en: {
    navReels: "Media", navSaved: "Saved", navEarning: "Earnings", navProfile: "Profile",
    profile: "Profile", myContent: "My videos", liked: "Liked", saved: "Saved", earning: "Earnings",
    uploadTitle: "Upload video", fReel: "Short REELS video", fVideo: "Full video", fTitle: "Title",
    fPrice: "Price (USDT, 0 = free)", uploadHint: "Max 50MB. Published instantly.", uploadBtn: "Upload",
    watchFull: "Watch", unlock: "Unlock", sentToChat: "✅ Video sent to your chat",
    paymentFailed: "Payment failed", connErr: "Connection error", savedToast: "Saved", removedToast: "Removed",
    noContent: "No videos yet.\nBe the first via ➕!", totalEarned: "Total earned", available: "Available",
    withdrawBtn: "Withdraw", minWithdraw: "Min to withdraw", myContentEmpty: "No videos yet. Add via ➕.",
    likedEmpty: "Nothing liked.", savedEmpty: "Nothing saved.", selectFiles: "Select reel and full video",
    enterTitle: "Enter a title", uploading: "Uploading…", uploadedOk: "✅ Published!", errGeneric: "Something went wrong",
    free: "free", walletTitle: "TON wallet (to receive USDT)", walletPlaceholder: "TON address (UQ… or EQ…)",
    walletSave: "Save", walletSavedToast: "✅ Wallet saved", walletNeeded: "Save your TON wallet address first",
    withdrawing: "Sending…", paymentPending: "⏳ Verifying payment…", walletErr: "Wallet not connected",
    editVideo: "Edit video", save: "Save", deleteBtn: "Delete", cancelBtn: "Cancel",
    deleteAsk: "Delete this video?", deleted: "🗑 Deleted", updated: "✅ Saved",
    views: "views", sales: "sales", videosN: "videos", earnedShort: "earned", price: "Price",
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
}

// ---------------- Ikonlar (Telegram-uslub) ----------------
const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.4C6.9 16.9 3.5 13.7 3.5 9.5 3.5 6.9 5.5 5 8 5c1.7 0 3.2 1 4 2.4C12.8 6 14.3 5 16 5c2.5 0 4.5 1.9 4.5 4.5 0 4.2-3.4 7.4-8.5 10.9z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z"/></svg>',
  // Telegram "forward" (uzatish) — o'ngga burilgan strelka
  share: '<svg viewBox="0 0 24 24"><path d="M12 7V4l8 7-8 7v-3.1c-4.6 0-7.9 1.4-10 4.6.7-6.4 4-10.2 10-11.5z"/></svg>',
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

  actions.append(likeBtn, saveBtn, shareBtn);

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

  el.append(v, mute, actions, ov);
  return el;
}

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
function getTC() {
  if (tcui) return tcui;
  if (!window.TON_CONNECT_UI) return null;
  try {
    tcui = new window.TON_CONNECT_UI.TonConnectUI({ manifestUrl: location.origin + "/tonconnect-manifest.json" });
  } catch (e) {
    return null;
  }
  return tcui;
}
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
async function buyCrypto(it, btn) {
  const tc = getTC();
  if (!tc) return toast(L("walletErr"));
  btn.disabled = true;
  try {
    if (!tc.connected) await tc.connectWallet();
    const addr = tc.account && tc.account.address;
    if (!addr) {
      toast(L("walletErr"));
      btn.disabled = false;
      return;
    }
    const d = await (await fetch("/api/order", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id, address: addr }) })).json();
    if (d.status === "already") {
      it.unlocked = true;
      btn.textContent = watchLabel(it);
      return deliverFree(it, btn);
    }
    if (d.status !== "ok") {
      toast(d.error || L("errGeneric"));
      btn.disabled = false;
      return;
    }
    await tc.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: d.toJettonWallet, amount: d.amountTon, payload: d.payloadBase64 }],
    });
    toast(L("paymentPending"));
    pollOrder(d.nonce, it, btn, 0);
  } catch (e) {
    toast(L("paymentFailed"));
    btn.disabled = false;
  }
}
function pollOrder(nonce, it, btn, tries) {
  if (tries > 45) {
    btn.disabled = false;
    return;
  }
  setTimeout(async () => {
    try {
      const d = await (await fetch("/api/order/status", { method: "POST", headers: HEADERS, body: JSON.stringify({ nonce }) })).json();
      if (d.status === "paid") {
        it.unlocked = true;
        btn.textContent = watchLabel(it);
        btn.disabled = false;
        toast(L("sentToChat"));
        return;
      }
      if (d.status === "expired") {
        toast(L("paymentFailed"));
        btn.disabled = false;
        return;
      }
    } catch (e) {}
    pollOrder(nonce, it, btn, tries + 1);
  }, 4000);
}

// ---------------- Autoplay ----------------
const seen = new Set();
function setupAutoplay() {
  const io = new IntersectionObserver(
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
  document.querySelectorAll(".reel").forEach((r) => io.observe(r));
}
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
  const items = (data && data.items) || [];
  if (!items.length) {
    feed.innerHTML = '<div class="empty">' + L("noContent") + "</div>";
    return;
  }
  feed.innerHTML = "";
  for (const it of items) feed.appendChild(renderReel(it));
  feed.scrollTop = 0;
  setupAutoplay();
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
  const b = d.balance || { earned: 0, available: 0 };
  const content = d.content || [];
  const totalSales = content.reduce((s, c) => s + (c.unlocks || 0), 0);
  card.innerHTML =
    '<div class="card-title">' + L("totalEarned") + " (" + d.creatorShare + "%)</div>" +
    '<div class="big">$' + usd(b.earned) + "</div>" +
    '<div class="stat-grid">' +
    '<div class="box"><div class="n">' + content.length + '</div><div class="l">' + L("videosN") + "</div></div>" +
    '<div class="box"><div class="n">' + totalSales + '</div><div class="l">' + L("sales") + "</div></div>" +
    '<div class="box"><div class="n">$' + usd(b.available) + '</div><div class="l">' + L("available") + "</div></div>" +
    "</div>";
  fillGrid(
    list,
    content.map((c) =>
      gridCard(c, {
        editable: true,
        statsHtml: "👁 " + c.views + " · 🔓 " + c.unlocks + " · 💰 $" + usd(c.earned),
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

  const b = d.balance || { earned: 0, available: 0 };
  balCard.className = "card stat";
  balCard.innerHTML =
    '<div class="card-title">' + L("available") + "</div>" +
    '<div class="big">$' + usd(b.available) + "</div>" +
    '<div class="sub">' + L("totalEarned") + ": $" + usd(b.earned) + " · creator " + d.creatorShare + "%</div>";
  const wb = document.createElement("button");
  wb.className = "primary";
  wb.style.marginTop = "16px";
  const can = b.available >= d.minWithdraw && !!d.tonWallet && !!d.payoutEnabled;
  if (can) {
    wb.textContent = "💸 " + L("withdrawBtn") + " — $" + usd(b.available);
    wb.addEventListener("click", () => withdraw(wb));
  } else {
    wb.textContent = "💸 " + L("withdrawBtn");
    wb.disabled = true;
  }
  balCard.appendChild(wb);
  if (!can) {
    const h = document.createElement("div");
    h.className = "hint";
    h.style.textAlign = "left";
    h.textContent = !d.tonWallet ? L("walletNeeded") : b.available < d.minWithdraw ? L("minWithdraw") + " $" + usd(d.minWithdraw) : "";
    if (h.textContent) balCard.appendChild(h);
  }

  walletCard.innerHTML = '<div class="card-title">' + L("walletTitle") + "</div>";
  const inp = document.createElement("input");
  inp.className = "wallet-input";
  inp.type = "text";
  inp.placeholder = L("walletPlaceholder");
  inp.value = d.tonWallet || "";
  const wsave = document.createElement("button");
  wsave.className = "primary";
  wsave.style.marginTop = "8px";
  wsave.textContent = L("walletSave");
  wsave.addEventListener("click", () => saveWallet(inp.value, wsave));
  walletCard.append(inp, wsave);

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
