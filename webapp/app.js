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
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

// ==================== Reels feed ====================

function watchLabel(it) {
  if (it.unlocked) return "▶️ To'liq ko'rish";
  if (it.priceStars > 0) return "⭐ " + it.priceStars + " — To'liq ochish";
  return "▶️ To'liq ko'rish";
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

  // Yon tugmalar: like / save / share
  const actions = document.createElement("div");
  actions.className = "reel-actions";

  const likeBtn = document.createElement("button");
  likeBtn.className = "action";
  const likeCount = document.createElement("span");
  likeCount.className = "action-count";
  likeBtn.appendChild(document.createTextNode(it.liked ? "❤️" : "🤍"));
  likeBtn.appendChild(likeCount);
  likeCount.textContent = it.likeCount || 0;
  likeBtn.addEventListener("click", () => toggleLike(it, likeBtn, likeCount));

  const saveBtn = document.createElement("button");
  saveBtn.className = "action" + (it.saved ? " active" : "");
  saveBtn.textContent = "🔖";
  saveBtn.style.opacity = it.saved ? "1" : "0.55";
  saveBtn.addEventListener("click", () => toggleSave(it, saveBtn));

  const shareBtn = document.createElement("button");
  shareBtn.className = "action";
  shareBtn.appendChild(document.createTextNode("↗️"));
  const shareCount = document.createElement("span");
  shareCount.className = "action-count";
  shareCount.textContent = it.shareCount || 0;
  shareBtn.appendChild(shareCount);
  shareBtn.addEventListener("click", () => shareReel(it, shareCount));

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

async function toggleLike(it, btn, countEl) {
  try {
    const r = await fetch("/api/like", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    it.liked = d.liked;
    it.likeCount = d.likeCount;
    btn.childNodes[0].nodeValue = d.liked ? "❤️" : "🤍";
    countEl.textContent = d.likeCount;
  } catch (e) {
    toast("Ulanishda xatolik");
  }
}

async function toggleSave(it, btn) {
  try {
    const r = await fetch("/api/save", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    it.saved = d.saved;
    btn.classList.toggle("active", d.saved);
    btn.style.opacity = d.saved ? "1" : "0.55";
    toast(d.saved ? "🔖 Saqlandi" : "Olib tashlandi");
  } catch (e) {
    toast("Ulanishda xatolik");
  }
}

async function shareReel(it, countEl) {
  try {
    const r = await fetch("/api/share", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    if (countEl) countEl.textContent = (Number(countEl.textContent) || 0) + 1;
    if (d.link && tg && tg.openTelegramLink) {
      const url = "https://t.me/share/url?url=" + encodeURIComponent(d.link) + "&text=" + encodeURIComponent(it.title || "Kino");
      tg.openTelegramLink(url);
    } else if (d.link) {
      toast("Havola: " + d.link);
    }
  } catch (e) {
    toast("Ulanishda xatolik");
  }
}

async function unlock(it, btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/unlock", { method: "POST", headers: HEADERS, body: JSON.stringify({ contentId: it.id }) });
    const d = await r.json();
    if (d.status === "delivered") {
      toast("✅ Video Telegram chatingizga yuborildi");
    } else if (d.status === "invoice" && d.invoiceLink && tg && tg.openInvoice) {
      tg.openInvoice(d.invoiceLink, (status) => {
        if (status === "paid") {
          toast("✅ Ochildi — chatingizga yuborildi");
          it.unlocked = true;
          btn.textContent = watchLabel(it);
        } else if (status === "failed") {
          toast("To'lov amalga oshmadi");
        }
      });
    } else {
      toast("Xatolik yuz berdi");
    }
  } catch (e) {
    toast("Ulanishda xatolik");
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
    feed.innerHTML = '<div class="empty">Ulanishda xatolik.</div>';
    return;
  }
  const items = (data && data.items) || [];
  if (!items.length) {
    feed.innerHTML = "<div class=\"empty\">Hozircha kontent yo'q.<br>👤 profil → ➕ orqali qo'shing.</div>";
    return;
  }
  feed.innerHTML = "";
  for (const it of items) feed.appendChild(renderReel(it));
  feed.scrollTop = 0;
  setupAutoplay();
}

// ==================== Profil / Yuklash ====================

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

async function loadMe() {
  const balCard = document.getElementById("balCard");
  const myContent = document.getElementById("myContent");
  const savedList = document.getElementById("savedList");
  balCard.innerHTML = '<div class="card-title">Yuklanmoqda…</div>';
  myContent.innerHTML = "";
  savedList.innerHTML = "";

  let d;
  try {
    const r = await fetch("/api/me", { method: "POST", headers: HEADERS, body: "{}" });
    d = await r.json();
  } catch (e) {
    balCard.innerHTML = '<div class="card-title">Ulanishda xatolik</div>';
    return;
  }

  const b = d.balance || { earned: 0, available: 0 };
  balCard.innerHTML =
    `<div class="card-title">Creator daromadi (ulush ${d.creatorShare}%)</div>` +
    `<div class="card-row"><span>Jami ishlangan</span><b>${b.earned} ⭐</b></div>` +
    `<div class="card-row"><span>Mavjud balans</span><b>${b.available} ⭐</b></div>`;
  if (b.available >= d.minWithdraw) {
    const wb = document.createElement("button");
    wb.className = "primary";
    wb.textContent = `Yechish — ${b.available} ⭐`;
    wb.addEventListener("click", () => withdraw(wb));
    balCard.appendChild(wb);
  } else {
    const h = document.createElement("div");
    h.className = "hint";
    h.style.textAlign = "left";
    h.style.marginTop = "6px";
    h.textContent = `Yechish uchun min. ${d.minWithdraw} ⭐`;
    balCard.appendChild(h);
  }

  const items = d.content || [];
  if (!items.length) {
    myContent.innerHTML = '<div class="list-empty">Hali kontent yo\'q. ➕ orqali joylang.</div>';
  } else {
    const emoji = (s) => (s === "published" ? "🟢" : s === "pending" ? "🟡" : s === "rejected" ? "🔴" : "⚪");
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        `<span class="row-title">${emoji(it.status)} ${escapeHtml(it.title)}</span>` +
        `<span class="row-stats">👁 ${it.views} · 🔓 ${it.unlocks} · ❤️ ${it.likes} · 💰 ${it.earned}⭐</span>`;
      myContent.appendChild(row);
    }
  }

  const saved = d.saved || [];
  if (!saved.length) {
    savedList.innerHTML = '<div class="list-empty">Saqlangan yo\'q.</div>';
  } else {
    for (const it of saved) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.cursor = "pointer";
      row.innerHTML =
        `<span class="row-title">🔖 ${escapeHtml(it.title)}</span>` +
        `<span class="row-stats">${it.priceStars > 0 ? it.priceStars + "⭐" : "bepul"}</span>`;
      row.addEventListener("click", () => {
        while (screenStack.length) closeTop();
        load(it.id);
      });
      savedList.appendChild(row);
    }
  }
}

async function withdraw(btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/withdraw", { method: "POST", headers: HEADERS, body: "{}" });
    const d = await r.json();
    toast(d.message || (d.ok ? "So'rov yuborildi" : "Xatolik"));
    loadMe();
  } catch (e) {
    toast("Ulanishda xatolik");
    btn.disabled = false;
  }
}

async function doUpload() {
  const reel = document.getElementById("upReel").files[0];
  const video = document.getElementById("upVideo").files[0];
  const title = document.getElementById("upTitle").value.trim();
  const price = document.getElementById("upPrice").value || "0";
  const btn = document.getElementById("doUpload");
  if (!reel || !video) return toast("Reel va to'liq videoni tanlang");
  if (!title) return toast("Sarlavha kiriting");

  btn.disabled = true;
  btn.textContent = "Yuklanmoqda…";
  try {
    const fd = new FormData();
    fd.append("reel", reel);
    fd.append("video", video);
    fd.append("title", title);
    fd.append("price", price);
    const r = await fetch("/api/upload", { method: "POST", headers: { "X-Init-Data": initData }, body: fd });
    const d = await r.json();
    if (d.status === "pending") {
      toast("✅ Yuklandi — moderatsiyaga yuborildi");
      document.getElementById("upReel").value = "";
      document.getElementById("upVideo").value = "";
      document.getElementById("upTitle").value = "";
      document.getElementById("upPrice").value = "0";
      closeTop();
      loadMe();
    } else {
      toast(d.error || "Xatolik yuz berdi");
    }
  } catch (e) {
    toast("Yuklashda xatolik");
  } finally {
    btn.disabled = false;
    btn.textContent = "Yuklash";
  }
}

// start_param bilan ochilsa (share havolasi) — o'sha kontentni birinchi ko'rsatish
let startFocus = 0;
try {
  const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
  const m = sp && /^c(\d+)$/.exec(sp);
  if (m) startFocus = Number(m[1]);
} catch (e) {}

load(startFocus);
