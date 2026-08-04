export type Lang = "uz" | "ru" | "en";

export function normLang(l?: string | null): Lang {
  return l === "ru" || l === "en" ? l : "uz";
}

type Entry = { uz: string; ru: string; en: string };

const S: Record<string, Entry> = {
  chooseLang: {
    uz: "Tilni tanlang:",
    ru: "Выберите язык:",
    en: "Choose your language:",
  },
  langSet: {
    uz: "✅ Til o'rnatildi.",
    ru: "✅ Язык установлен.",
    en: "✅ Language set.",
  },
  welcome: {
    uz: "🎬 Media'ga xush kelibsiz!\n\nQisqa videolarni ko'ring, yoqqanini Stars evaziga to'liq oching — video shu chatga yuboriladi.\n\n💡 O'z videongizni joylab pul ishlang: /upload",
    ru: "🎬 Добро пожаловать в Media!\n\nСмотрите короткие видео, понравившееся откройте полностью за Stars — видео придёт в этот чат.\n\n💡 Публикуйте свои видео и зарабатывайте: /upload",
    en: "🎬 Welcome to Media!\n\nWatch short videos, unlock the full one with Stars — it's sent to this chat.\n\n💡 Post your own videos and earn: /upload",
  },
  openApp: { uz: "🎬 Ochish", ru: "🎬 Открыть", en: "🎬 Open" },
  help: {
    uz: "🎬 Menyudagi «Media» tugmasi orqali ilovani oching.\n\n/upload — video joylash\n/mycontent — mening kontentim\n/earnings — daromadim\n/withdraw — balansni yechish\n/lang — tilni o'zgartirish",
    ru: "🎬 Откройте приложение кнопкой «Media» в меню.\n\n/upload — загрузить видео\n/mycontent — мои видео\n/earnings — мой доход\n/withdraw — вывод баланса\n/lang — сменить язык",
    en: "🎬 Open the app via the «Media» menu button.\n\n/upload — post a video\n/mycontent — my content\n/earnings — my earnings\n/withdraw — withdraw balance\n/lang — change language",
  },
  uploadStart: {
    uz: "🎬 Yangi video.\n\n1/3 — Qisqa REELS videoni (vertikal) yuboring.\n\nBekor qilish: /cancel",
    ru: "🎬 Новое видео.\n\n1/3 — Отправьте короткое REELS видео (вертикальное).\n\nОтмена: /cancel",
    en: "🎬 New video.\n\n1/3 — Send a short vertical REELS video.\n\nCancel: /cancel",
  },
  uploadFull: {
    uz: "2/3 — Endi TO'LIQ videoni yuboring.",
    ru: "2/3 — Теперь отправьте ПОЛНОЕ видео.",
    en: "2/3 — Now send the FULL video.",
  },
  uploadMeta: {
    uz: "3/3 — Sarlavha va narxni yuboring:\nSarlavha | narx\nMasalan:  Qiziqarli video | 50   (0 = bepul)",
    ru: "3/3 — Отправьте название и цену:\nНазвание | цена\nНапример:  Интересное видео | 50   (0 = бесплатно)",
    en: "3/3 — Send title and price:\nTitle | price\nE.g.:  Cool video | 50   (0 = free)",
  },
  saving: { uz: "⏳ Saqlanmoqda…", ru: "⏳ Сохранение…", en: "⏳ Saving…" },
  published: {
    uz: "✅ «{title}» joylandi! ({price})",
    ru: "✅ «{title}» опубликовано! ({price})",
    en: "✅ «{title}» published! ({price})",
  },
  free: { uz: "bepul", ru: "бесплатно", en: "free" },
  cancelled: { uz: "Bekor qilindi.", ru: "Отменено.", en: "Cancelled." },
  incomplete: {
    uz: "Ma'lumot to'liq emas. /upload bilan qaytadan boshlang.",
    ru: "Данные неполные. Начните заново: /upload",
    en: "Incomplete. Start again: /upload",
  },
  paymentDone: {
    uz: "✅ To'lov qabul qilindi — video shu chatga yuborildi.",
    ru: "✅ Оплата принята — видео отправлено в этот чат.",
    en: "✅ Payment received — the video was sent to this chat.",
  },
  startFirst: {
    uz: "Avval /start bosing.",
    ru: "Сначала нажмите /start.",
    en: "Press /start first.",
  },
  noContent: {
    uz: "Sizda hali kontent yo'q. /upload orqali joylang.",
    ru: "У вас пока нет контента. Загрузите через /upload.",
    en: "You have no content yet. Upload via /upload.",
  },
  earnings: {
    uz: "💰 Daromadingiz\n\nJami ishlangan: {earned} ⭐\nYechilgan/so'ralgan: {reserved} ⭐\nMavjud balans: {available} ⭐\n\nYechish: /withdraw (min {min} ⭐)\nUlush: siz {share}%, platforma {plat}%",
    ru: "💰 Ваш доход\n\nВсего заработано: {earned} ⭐\nВыведено/в запросе: {reserved} ⭐\nДоступно: {available} ⭐\n\nВывод: /withdraw (мин {min} ⭐)\nДоля: вы {share}%, платформа {plat}%",
    en: "💰 Your earnings\n\nTotal earned: {earned} ⭐\nWithdrawn/requested: {reserved} ⭐\nAvailable: {available} ⭐\n\nWithdraw: /withdraw (min {min} ⭐)\nShare: you {share}%, platform {plat}%",
  },
  withdrawMin: {
    uz: "Yechish uchun kamida {min} ⭐ kerak. Mavjud: {available} ⭐",
    ru: "Для вывода нужно минимум {min} ⭐. Доступно: {available} ⭐",
    en: "Minimum {min} ⭐ required to withdraw. Available: {available} ⭐",
  },
  withdrawOk: {
    uz: "✅ {amount} ⭐ yechish so'rovi qabul qilindi (#{id}). Admin ko'rib chiqadi.",
    ru: "✅ Запрос на вывод {amount} ⭐ принят (#{id}). Админ рассмотрит.",
    en: "✅ Withdrawal request for {amount} ⭐ accepted (#{id}). Admin will review.",
  },
};

export function t(lang: string | null | undefined, key: keyof typeof S, vars?: Record<string, string | number>): string {
  const l = normLang(lang);
  const entry = S[key];
  let s = entry ? entry[l] : String(key);
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
