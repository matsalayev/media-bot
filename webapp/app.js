/* global Telegram */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) {
    try {
      tg.setHeaderColor("#000000");
    } catch (e) {}
  }
}
const initData = (tg && tg.initData) || "";
const HEADERS = { "Content-Type": "application/json", "X-Init-Data": initData };
const enc = encodeURIComponent;

// ---------------- i18n ----------------
const UI = {
  uz: {
    profile: "Profil", myContent: "Mening kontentim", liked: "Yoqtirganlar", saved: "Saqlangan",
    uploadTitle: "Video joylash", fReel: "Qisqa REELS video", fVideo: "To'liq video", fTitle: "Sarlavha",
    fPrice: "Narx (⭐, 0 = bepul)", uploadHint: "Maks. 50MB. Darhol joylanadi.", post: "Video joylash",
    uploadBtn: "Yuklash", watchFull: "To'liq ko'rish", unlock: "To'liq ochish",
    sentToChat: "✅ Video chatingizga yuborildi", paymentFailed: "To'lov amalga oshmadi", connErr: "Ulanishda xatolik",
    savedToast: "Saqlandi", removedToast: "Olib tashlandi", noContent: "Hozircha kontent yo'q. ➕ orqali qo'shing.",
    balanceTitle: "Creator daromadi", totalEarned: "Jami ishlangan", available: "Mavjud balans", withdrawBtn: "Yechish",
    minWithdraw: "Yechish uchun min.", myContentEmpty: "Hali kontent yo'q.", likedEmpty: "Yoqtirgan yo'q.",
    savedEmpty: "Saqlangan yo'q.", selectFiles: "Reel va to'liq videoni tanlang", enterTitle: "Sarlavha kiriting",
    uploading: "Yuklanmoqda…", uploadedOk: "✅ Joylandi!", errGeneric: "Xatolik yuz berdi", free: "bepul",
  },
  ru: {
    profile: "Профиль", myContent: "Мои видео", liked: "Понравившиеся", saved: "Сохранённые",
    uploadTitle: "Загрузить видео", fReel: "Короткое REELS видео", fVideo: "Полное видео", fTitle: "Название",
    fPrice: "Цена (⭐, 0 = бесплатно)", uploadHint: "Макс. 50MB. Публикуется сразу.", post: "Загрузить видео",
    uploadBtn: "Загрузить", watchFull: "Смотреть полностью", unlock: "Открыть полностью",
    sentToChat: "✅ Видео отправлено в чат", paymentFailed: "Оплата не прошла", connErr: "Ошибка соединения",
    savedToast: "Сохранено", removedToast: "Удалено", noContent: "Пока нет контента. Добавьте через ➕.",
    balanceTitle: "Доход автора", totalEarned: "Всего заработано", available: "Доступно", withdrawBtn: "Вывести",
    minWithdraw: "Для вывода мин.", myContentEmpty: "Пока нет контента.", likedEmpty: "Нет понравившихся.",
    savedEmpty: "Нет сохранённых.", selectFiles: "Выберите reel и полное видео", enterTitle: "Введите название",
    uploading: "Загрузка…", uploadedOk: "✅ Опубликовано!", errGeneric: "Произошла ошибка", free: "бесплатно",
  },
  en: {
    profile: "Profile", myContent: "My content", liked: "Liked", saved: "Saved",
    uploadTitle: "Upload video", fReel: "Short REELS video", fVideo: "Full video", fTitle: "Title",
    fPrice: "Price (⭐, 0 = free)", uploadHint: "Max 50MB. Published instantly.", post: "Upload video",
    uploadBtn: "Upload", watchFull: "Watch full", unlock: "Unlock full",
    sentToChat: "✅ Video sent to your chat", paymentFailed: "Payment failed", connErr: "Connection error",
    savedToast: "Saved", removedToast: "Removed", noContent: "No content yet. Add via ➕.",
    balanceTitle: "Creator earnings", totalEarned: "Total earned", available: "Available", withdrawBtn: "Withdraw",
    minWithdraw: "Min to withdraw:", myContentEmpty: "No content yet.", likedEmpty: "Nothing liked.",
    savedEmpty: "Nothing saved.", selectFiles: "Select reel and full video", enterTitle: "Enter a title",
    uploading: "Uploading…", uploadedOk: "✅ Published!", errGeneric: "Something went wrong", free: "free",
  },
};
let LANG = "uz";
function L(key) {
  return (UI[LANG] && UI[LANG][key]) || UI.uz[key] || key;
}
function localize() {
  const set = (id, key) => {
    const e = document.getElementById(id);
    if (e) e.textContent = L(key);
  };
  set("lProfile", "profile");
  set("lMyContent", "myContent");
  set("lLiked", "liked");
  set("lSaved", "saved");
  set("lUploadTitle", "uploadTitle");
  set("lFReel", "fReel");
  set("lFVideo", "fVideo");
  set("lFTitle", "fTitle");
  set("lFPrice", "fPrice");
  set("lHint", "uploadHint");
  const ou = document.getElementById("openUpload");
  if (ou) ou.textContent = "➕ " + L("post");
  const du = document.getElementById("doUpload");
  if (du) du.textContent = L("uploadBtn");
}

// ---------------- Telegram-uslub ikonlar ----------------
const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.4C6.9 16.9 3.5 13.7 3.5 9.5 3.5 6.9 5.5 5 8 5c1.7 0 3.2 1 4 2.4C12.8 6 14.3 5 16 5c2.5 0 4.5 1.9 4.5 4.5 0 4.2-3.4 7.4-8.5 10.9z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
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

// ---------------- Reels feed ----------------
function watchLabel(it) {
  if (it.unlocked || it.priceStars === 0) return "▶ " + L("watchFull");
  return "⭐ " + it.priceStars + " — " + L("unlock");
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

  const badge = document.createElement("div");
  badge.className = "muted-badge";
  badge.textContent = "🔇";
  v.addEventListener("click", () => {
    v.muted = !v.muted;
    badge.textContent = v.muted ? "🔇" : "🔊";
    if (v.paused) v.play().catch(() => {});
  });

  const actions = document.createElement("div");
  actions.className = "reel-actions";

  const likeBtn = document.createElement("button");
  likeBtn.className = "action" + (it.liked ? " liked" : "");
  likeBtn.innerHTML = ICON.heart + '<span class="action-count">' + (it.likeCount || 0) + "</span>";
  likeBtn.addEventListener("click", () => toggleLike(it, likeBtn));

  const saveBtn = document.createElement("button");
  saveBtn.className = "action" + (it.saved ? " saved" : "");
  saveBtn.innerHTML = ICON.bookmark;
  saveBtn.addEventListener("click", () => toggleSave(it, saveBtn));

  const shareBtn = document.createElement("button");
  shareBtn.className = "action";
  shareBtn.innerHTML = ICON.share + '<span class="action-count">' + (it.shareCount || 0) + "</span>";
  shareBtn.addEventListener("click", () => shareReel(it, shareBtn));

  actions.appendChild(likeBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(shareBtn);

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
  ov.appendChild(title);
  ov.appendChild(desc);
  ov.appendChild(btn);

  el.appendChild(v);
  el.appendChild(badge);
  el.appendChild(actions);
  el.appendChild(ov);
  return el;
}

async function toggleLike(it, btn) {
  try {
    const r = await fetch("/api/like", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    it.liked = d.liked;
    it.likeCount = d.likeCount;
    btn.classList.toggle("liked", d.liked);
    const c = btn.querySelector(".action-count");
    if (c) c.textContent = d.likeCount;
  } catch (e) {
    toast(L("connErr"));
  }
}

async function toggleSave(it, btn) {
  try {
    const r = await fetch("/api/save", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    it.saved = d.saved;
    btn.classList.toggle("saved", d.saved);
    toast(d.saved ? L("savedToast") : L("removedToast"));
  } catch (e) {
    toast(L("connErr"));
  }
}

async function shareReel(it, btn) {
  try {
    const r = await fetch("/api/share", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
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

async function unlock(it, btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/unlock", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    if (d.status === "delivered") {
      toast(L("sentToChat"));
    } else if (d.status === "invoice" && d.invoiceLink && tg && tg.openInvoice) {
      tg.openInvoice(d.invoiceLink, (status) => {
        if (status === "paid") {
          toast(L("sentToChat"));
          it.unlocked = true;
          btn.textContent = watchLabel(it);
        } else if (status === "failed") {
          toast(L("paymentFailed"));
        }
      });
    } else {
      toast(L("errGeneric"));
    }
  } catch (e) {
    toast(L("connErr"));
  } finally {
    btn.disabled = false;
  }
}

const seen = new Set();
function setupAutoplay() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target.querySelector("video");
        if (!v) continue;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
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

async function load(focus) {
  let data;
  try {
    const r = await fetch("/api/reels", { method: "POST", headers: HEADERS, body: JSON.stringify({ focus: focus || 0 }) });
    data = await r.json();
  } catch (e) {
    feed.innerHTML = '<div class="empty">' + L("connErr") + "</div>";
    return;
  }
  if (data.lang) LANG = data.lang;
  localize();
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

// ---------------- Profil / Yuklash ----------------
function pauseFeed() {
  document.querySelectorAll(".reel video").forEach((v) => v.pause());
}
function resumeFeed() {
  const reels = document.querySelectorAll(".reel");
  const st = feed.scrollTop;
  for (const r of reels) {
    if (Math.abs(r.offsetTop - st) < window.innerHeight / 2) {
      const v = r.querySelector("video");
      if (v) v.play().catch(() => {});
      break;
    }
  }
}

const screenStack = [];
function openScreen(id, onOpen) {
  document.getElementById(id).hidden = false;
  screenStack.push(id);
  pauseFeed();
  if (tg && tg.BackButton) tg.BackButton.show();
  if (onOpen) onOpen();
}
function closeTop() {
  const id = screenStack.pop();
  if (id) document.getElementById(id).hidden = true;
  if (!screenStack.length) {
    if (tg && tg.BackButton) tg.BackButton.hide();
    resumeFeed();
  }
}
if (tg && tg.BackButton) tg.BackButton.onClick(closeTop);
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeTop));
document.getElementById("profileBtn").addEventListener("click", () => openScreen("profile", loadMe));
document.getElementById("openUpload").addEventListener("click", () => openScreen("upload"));
document.getElementById("doUpload").addEventListener("click", doUpload);

function simpleList(container, rows, emptyKey) {
  if (!rows.length) {
    container.innerHTML = '<div class="list-empty">' + L(emptyKey) + "</div>";
    return;
  }
  container.innerHTML = "";
  for (const it of rows) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.cursor = "pointer";
    row.innerHTML =
      '<span class="row-title">' + escapeHtml(it.title) + "</span>" +
      '<span class="row-stats">' + (it.priceStars > 0 ? it.priceStars + "⭐" : L("free")) + "</span>";
    row.addEventListener("click", () => {
      while (screenStack.length) closeTop();
      load(it.id);
    });
    container.appendChild(row);
  }
}

async function loadMe() {
  const balCard = document.getElementById("balCard");
  const myContent = document.getElementById("myContent");
  const likedList = document.getElementById("likedList");
  const savedList = document.getElementById("savedList");
  balCard.innerHTML = '<div class="card-title">…</div>';
  myContent.innerHTML = "";
  likedList.innerHTML = "";
  savedList.innerHTML = "";

  let d;
  try {
    const r = await fetch("/api/me", { method: "POST", headers: HEADERS, body: "{}" });
    d = await r.json();
  } catch (e) {
    balCard.innerHTML = '<div class="card-title">' + L("connErr") + "</div>";
    return;
  }
  if (d.lang) {
    LANG = d.lang;
    localize();
  }

  const b = d.balance || { earned: 0, available: 0 };
  balCard.innerHTML =
    '<div class="card-title">' + L("balanceTitle") + " (" + d.creatorShare + "%)</div>" +
    '<div class="card-row"><span>' + L("totalEarned") + "</span><b>" + b.earned + " ⭐</b></div>" +
    '<div class="card-row"><span>' + L("available") + "</span><b>" + b.available + " ⭐</b></div>";
  if (b.available >= d.minWithdraw) {
    const wb = document.createElement("button");
    wb.className = "primary";
    wb.textContent = L("withdrawBtn") + " — " + b.available + " ⭐";
    wb.addEventListener("click", () => withdraw(wb));
    balCard.appendChild(wb);
  } else {
    const h = document.createElement("div");
    h.className = "hint";
    h.style.textAlign = "left";
    h.style.marginTop = "6px";
    h.textContent = L("minWithdraw") + " " + d.minWithdraw + " ⭐";
    balCard.appendChild(h);
  }

  const items = d.content || [];
  if (!items.length) {
    myContent.innerHTML = '<div class="list-empty">' + L("myContentEmpty") + "</div>";
  } else {
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<span class="row-title">' + escapeHtml(it.title) + "</span>" +
        '<span class="row-stats">👁 ' + it.views + " · 🔓 " + it.unlocks + " · ❤️ " + it.likes + " · 💰 " + it.earned + "⭐</span>";
      myContent.appendChild(row);
    }
  }

  simpleList(likedList, d.liked || [], "likedEmpty");
  simpleList(savedList, d.saved || [], "savedEmpty");
}

async function withdraw(btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/withdraw", { method: "POST", headers: HEADERS, body: "{}" });
    const d = await r.json();
    toast(d.message || L("errGeneric"));
    loadMe();
  } catch (e) {
    toast(L("connErr"));
    btn.disabled = false;
  }
}

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
    const r = await fetch("/api/upload", { method: "POST", headers: { "X-Init-Data": initData }, body: fd });
    const d = await r.json();
    if (d.status === "published") {
      toast(L("uploadedOk"));
      document.getElementById("upReel").value = "";
      document.getElementById("upVideo").value = "";
      document.getElementById("upTitle").value = "";
      document.getElementById("upPrice").value = "0";
      closeTop();
      load();
    } else {
      toast(d.error || L("errGeneric"));
    }
  } catch (e) {
    toast(L("connErr"));
  } finally {
    btn.disabled = false;
    btn.textContent = L("uploadBtn");
  }
}

// start_param (share havolasi) — o'sha kontentni birinchi ko'rsatish
let startFocus = 0;
try {
  const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
  const m = sp && /^c(\d+)$/.exec(sp);
  if (m) startFocus = Number(m[1]);
} catch (e) {}

load(startFocus);
