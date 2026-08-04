/* global Telegram */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Telegram mavzusiga moslash (native ko'rinish)
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

const subBtn = document.getElementById("subBtn");
subBtn.addEventListener("click", subscribe);

function updateSubBtn(data) {
  if (data && data.subscribed) {
    subBtn.hidden = false;
    subBtn.classList.add("active");
    subBtn.disabled = true;
    subBtn.textContent = "✓ Obuna faol";
  } else if (data && data.subPriceStars) {
    subBtn.hidden = false;
    subBtn.classList.remove("active");
    subBtn.disabled = false;
    subBtn.textContent = "⭐ Obuna — " + data.subPriceStars + "⭐ / cheksiz";
  } else {
    subBtn.hidden = true;
  }
}

async function subscribe() {
  subBtn.disabled = true;
  try {
    const r = await fetch("/api/subscribe", { method: "POST", headers: HEADERS, body: "{}" });
    const d = await r.json();
    if (d.invoiceLink && tg && tg.openInvoice) {
      tg.openInvoice(d.invoiceLink, (status) => {
        if (status === "paid") {
          toast("✅ Obuna faollashtirildi!");
          load();
          if (!document.getElementById("profile").hidden) loadMe();
        } else {
          subBtn.disabled = false;
          if (status === "failed") toast("To'lov amalga oshmadi");
        }
      });
    } else {
      subBtn.disabled = false;
      toast("Xatolik yuz berdi");
    }
  } catch (e) {
    subBtn.disabled = false;
    toast("Ulanishda xatolik");
  }
}

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
  el.appendChild(ov);
  return el;
}

async function unlock(it, btn) {
  btn.disabled = true;
  try {
    const r = await fetch("/api/unlock", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ contentId: it.id }),
    });
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

// Ko'rinib turgan reels'ni avtoijro etadi va ko'rishni hisoblaydi
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
            fetch("/api/view", {
              method: "POST",
              headers: HEADERS,
              body: JSON.stringify({ contentId: Number(id) }),
            }).catch(() => {});
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

async function load() {
  let data;
  try {
    const r = await fetch("/api/reels", { method: "POST", headers: HEADERS, body: "{}" });
    data = await r.json();
  } catch (e) {
    feed.innerHTML = '<div class="empty">Ulanishda xatolik.</div>';
    return;
  }
  updateSubBtn(data);
  const items = (data && data.items) || [];
  if (!items.length) {
    feed.innerHTML = "<div class=\"empty\">Hozircha kontent yo'q.<br>Admin bot orqali /add bilan qo'shadi.</div>";
    return;
  }
  feed.innerHTML = "";
  for (const it of items) feed.appendChild(renderReel(it));
  setupAutoplay();
}

// ==================== Profil / Yuklash ====================

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

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
  const subCard = document.getElementById("subCard");
  const balCard = document.getElementById("balCard");
  const myContent = document.getElementById("myContent");
  subCard.innerHTML = '<div class="card-title">Yuklanmoqda…</div>';
  balCard.innerHTML = "";
  myContent.innerHTML = "";

  let d;
  try {
    const r = await fetch("/api/me", { method: "POST", headers: HEADERS, body: "{}" });
    d = await r.json();
  } catch (e) {
    subCard.innerHTML = '<div class="card-title">Ulanishda xatolik</div>';
    return;
  }

  // Obuna
  if (d.subscription && d.subscription.active) {
    subCard.innerHTML = `<div class="card-title">Obuna</div><div class="card-main">✅ Faol — ${(d.subscription.until || "").slice(0, 10)} gacha</div>`;
  } else {
    subCard.innerHTML = `<div class="card-title">Obuna</div><div class="card-main">Obunasiz</div>`;
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = `⭐ Obuna bo'lish — ${d.subPriceStars}⭐ / ${d.subDays} kun`;
    btn.addEventListener("click", subscribe);
    subCard.appendChild(btn);
  }

  // Balans
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

  // Mening kontentim
  const items = d.content || [];
  if (!items.length) {
    myContent.innerHTML = '<div class="list-empty">Hali kontent yo\'q. ➕ orqali joylang.</div>';
  } else {
    const emoji = (s) => (s === "published" ? "🟢" : s === "pending" ? "🟡" : s === "rejected" ? "🔴" : "⚪");
    myContent.innerHTML = "";
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        `<span class="row-title">${emoji(it.status)} ${escapeHtml(it.title)}</span>` +
        `<span class="row-stats">👁 ${it.views} · 🔓 ${it.unlocks} · 💰 ${it.earned}⭐</span>`;
      myContent.appendChild(row);
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

load();
