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
    uz: "🎬 Media'ga xush kelibsiz!\n\nQisqa videolarni ko'ring, yoqqanini Telegram Stars ⭐ bilan oching — to'liq video shu chatga keladi.\n\n💡 O'z videongizni joylab, har sotuvdan 90% ishlang: /upload",
    ru: "🎬 Добро пожаловать в Media!\n\nСмотрите короткие видео, понравившееся открывайте за Telegram Stars ⭐ — полное видео придёт в этот чат.\n\n💡 Публикуйте свои видео и зарабатывайте 90% с продажи: /upload",
    en: "🎬 Welcome to Media!\n\nWatch short videos and unlock the ones you like with Telegram Stars ⭐ — the full video is sent to this chat.\n\n💡 Post your own videos and earn 90% per sale: /upload",
  },
  openApp: { uz: "🎬 Ochish", ru: "🎬 Открыть", en: "🎬 Open" },
  help: {
    uz: "🎬 Menyudagi «Media» tugmasi orqali ilovani oching.\n\n/upload — video joylash\n/mycontent — mening kontentim\n/earnings — daromadim (USDT)\n/wallet — TRC20 hamyon ulash\n/withdraw — USDT'ni hamyonga yechish\n/lang — tilni o'zgartirish",
    ru: "🎬 Откройте приложение кнопкой «Media» в меню.\n\n/upload — загрузить видео\n/mycontent — мои видео\n/earnings — мой доход (USDT)\n/wallet — привязать TRC20 кошелёк\n/withdraw — вывести USDT на кошелёк\n/lang — сменить язык",
    en: "🎬 Open the app via the «Media» menu button.\n\n/upload — post a video\n/mycontent — my content\n/earnings — my earnings (USDT)\n/wallet — link TRC20 wallet\n/withdraw — withdraw USDT to wallet\n/lang — change language",
  },
  adminPanel: {
    uz: "🛠 Admin panel — barcha buyruqlar\n\n👤 Foydalanuvchi:\n/start — boshlash / til tanlash\n/upload — video joylash\n/mycontent — mening kontentim\n/earnings — daromad (USDT)\n/wallet — TRC20 hamyon ulash\n/withdraw — USDT'ni hamyonga yechish\n/terms — foydalanish shartlari\n/lang — tilni o'zgartirish\n/help — yordam\n/cancel — jarayonni bekor qilish\n\n🔑 Admin:\n/admin — shu panel\n/add — video qo'shish (admin)\n/balance — statistika + hot-wallet\n/hotwallet — hot-wallet manzili va balansi (USDT/TRX)\n/payouts — payout tarixi\n/complaints — aldov shikoyatlari\n/resolvepayout — payoutni qo'lda hal qilish\n/credit <tgId> <usdt> — balansni qo'lda to'ldirish\n\n🛡 Moderatsiya:\n/reports — shikoyatlar ro'yxati\n/takedown <id> — kontentni o'chirish\n/ban <tgId> — foydalanuvchini bloklash\n/unban <tgId> — blokdan chiqarish",
    ru: "🛠 Админ-панель — все команды\n\n👤 Пользователь:\n/start — начать / выбрать язык\n/upload — загрузить видео\n/mycontent — мои видео\n/earnings — доход (USDT)\n/wallet — привязать TRC20 кошелёк\n/withdraw — вывести USDT на кошелёк\n/lang — сменить язык\n/help — помощь\n/cancel — отменить процесс\n\n🔑 Админ:\n/admin — эта панель\n/add — добавить видео (админ)\n/balance — статистика + hot-wallet\n/hotwallet — адрес и баланс hot-wallet (USDT/TRX)\n/payouts — история выплат\n/complaints — жалобы на обман\n/resolvepayout — выплата вручную\n/credit <tgId> <usdt> — пополнить баланс вручную",
    en: "🛠 Admin panel — all commands\n\n👤 User:\n/start — start / choose language\n/upload — post a video\n/mycontent — my content\n/earnings — earnings (USDT)\n/wallet — link TRC20 wallet\n/withdraw — withdraw USDT to wallet\n/lang — change language\n/help — help\n/cancel — cancel the flow\n\n🔑 Admin:\n/admin — this panel\n/add — add a video (admin)\n/balance — stats + hot-wallet\n/hotwallet — hot-wallet address and balance (USDT/TRX)\n/payouts — payout history\n/complaints — bait complaints\n/resolvepayout — resolve a payout manually\n/credit <tgId> <usdt> — top up a balance manually",
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
    uz: "3/3 — Sarlavha va narxni (USDT) yuboring:\nSarlavha | narx\nMasalan:  Qiziqarli video | 1.5   (0 = bepul)",
    ru: "3/3 — Отправьте название и цену (USDT):\nНазвание | цена\nНапример:  Интересное видео | 1.5   (0 = бесплатно)",
    en: "3/3 — Send title and price (USDT):\nTitle | price\nE.g.:  Cool video | 1.5   (0 = free)",
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
    uz: "💰 Daromadingiz\n\nJami ishlangan: {earned} USDT\nYechilgan/jarayonda: {reserved} USDT\nMavjud: {available} USDT\n\nTON hamyon: {wallet}\nUlush: siz {share}%, platforma {plat}%\n\nYechish: /withdraw (min {min} USDT)\nHamyonni ulash: /wallet <manzil>",
    ru: "💰 Ваш доход\n\nВсего заработано: {earned} USDT\nВыведено/в процессе: {reserved} USDT\nДоступно: {available} USDT\n\nTON кошелёк: {wallet}\nДоля: вы {share}%, платформа {plat}%\n\nВывод: /withdraw (мин {min} USDT)\nПривязать кошелёк: /wallet <адрес>",
    en: "💰 Your earnings\n\nTotal earned: {earned} USDT\nWithdrawn/in progress: {reserved} USDT\nAvailable: {available} USDT\n\nTON wallet: {wallet}\nShare: you {share}%, platform {plat}%\n\nWithdraw: /withdraw (min {min} USDT)\nLink wallet: /wallet <address>",
  },
  earningsStars: {
    uz: "💰 Daromadingiz\n\nJami ishlangan: {earned} ⭐\nMavjud (yechish uchun): {available} ⭐\nUlush: siz {share}%, platforma {plat}%\n\nYechish: /withdraw (min {min} ⭐)\nⓘ Yechilgan Stars admin tomonidan qo'lda tarqatiladi.",
    ru: "💰 Ваш доход\n\nВсего заработано: {earned} ⭐\nДоступно (для вывода): {available} ⭐\nДоля: вы {share}%, платформа {plat}%\n\nВывод: /withdraw (мин {min} ⭐)\nⓘ Выведенные Stars распределяет админ вручную.",
    en: "💰 Your earnings\n\nTotal earned: {earned} ⭐\nAvailable (to withdraw): {available} ⭐\nShare: you {share}%, platform {plat}%\n\nWithdraw: /withdraw (min {min} ⭐)\nⓘ Withdrawn Stars are distributed manually by the admin.",
  },
  withdrawMin: {
    uz: "Yechish uchun kamida {min} USDT kerak. Mavjud: {available} USDT",
    ru: "Для вывода нужно минимум {min} USDT. Доступно: {available} USDT",
    en: "Minimum {min} USDT required to withdraw. Available: {available} USDT",
  },
  needWallet: {
    uz: "Avval TRC20 (TRON) hamyon manzilingizni ulang:\n/wallet <manzil>\n(yoki ilova profilidan)",
    ru: "Сначала привяжите адрес TRC20 (TRON) кошелька:\n/wallet <адрес>\n(или в профиле приложения)",
    en: "First link your TRC20 (TRON) wallet address:\n/wallet <address>\n(or in the app profile)",
  },
  walletPrompt: {
    uz: "TRC20 (TRON) hamyoningizni ulang (yechilgan USDT shu manzilga tushadi):\n/wallet <manzil>\n\n{current}",
    ru: "Привяжите TRC20 (TRON) кошелёк (выведенный USDT придёт на этот адрес):\n/wallet <адрес>\n\n{current}",
    en: "Link your TRC20 (TRON) wallet (withdrawn USDT arrives to this address):\n/wallet <address>\n\n{current}",
  },
  walletCurrent: {
    uz: "Joriy: {addr}",
    ru: "Текущий: {addr}",
    en: "Current: {addr}",
  },
  walletSaved: {
    uz: "✅ TRC20 hamyon saqlandi:\n{addr}",
    ru: "✅ TRC20 кошелёк сохранён:\n{addr}",
    en: "✅ TRC20 wallet saved:\n{addr}",
  },
  walletInvalid: {
    uz: "❌ Noto'g'ri TRC20 manzil. Manzil «T» bilan boshlanadi (masalan Trust Wallet / Binance TRON).",
    ru: "❌ Неверный TRC20 адрес. Адрес начинается с «T» (например Trust Wallet / Binance TRON).",
    en: "❌ Invalid TRC20 address. It starts with «T» (e.g. Trust Wallet / Binance TRON).",
  },
  payoutPending: {
    uz: "⏳ Oldingi yechish so'rovingiz hali jarayonda. Biroz kuting.",
    ru: "⏳ Ваш предыдущий вывод ещё обрабатывается. Подождите немного.",
    en: "⏳ Your previous withdrawal is still processing. Please wait.",
  },
  payoutOffline: {
    uz: "⚙️ Yechish hozircha o'chiq (hot-wallet sozlanmoqda). Keyinroq urinib ko'ring.",
    ru: "⚙️ Вывод пока отключён (настраивается hot-wallet). Попробуйте позже.",
    en: "⚙️ Withdrawals are off (hot-wallet is being set up). Try again later.",
  },
  payoutNoLiquidity: {
    uz: "⏳ Hozircha yechib bo'lmadi (texnik sabab). Tez orada hal bo'ladi.",
    ru: "⏳ Вывод временно недоступен (техническая причина). Скоро исправим.",
    en: "⏳ Withdrawal is temporarily unavailable (technical). It'll be fixed soon.",
  },
  withdrawPaid: {
    uz: "✅ {amount} USDT hamyoningizga yuborildi:\n{addr}",
    ru: "✅ {amount} USDT отправлено на ваш кошелёк:\n{addr}",
    en: "✅ {amount} USDT sent to your wallet:\n{addr}",
  },
  withdrawProcessing: {
    uz: "⏳ {amount} USDT yuborildi, tarmoq tasdig'i kutilmoqda.",
    ru: "⏳ {amount} USDT отправлено, ожидается подтверждение сети.",
    en: "⏳ {amount} USDT sent, awaiting network confirmation.",
  },
  withdrawFailed: {
    uz: "❌ Yechishda xatolik yuz berdi. Admin xabardor qilindi.",
    ru: "❌ Ошибка при выводе. Администратор уведомлён.",
    en: "❌ Withdrawal failed. The admin has been notified.",
  },
  terms: {
    uz: "📄 Foydalanish shartlari\n\n1. Media — kontent almashish platformasi. Pullik kontent Telegram Stars ⭐ orqali sotib olinadi.\n\n2. Sotib olingan kontent uchun to'lov qaytarilmaydi — quyidagi aldov holatidan tashqari.\n\n3. 🛡 Aldov himoyasi: agar qisqa reel to'liq videoga mos kelmasa (aldov), «⚠️ Shikoyat» tugmasi orqali murojaat qilishingiz mumkin. Admin tekshiradi; tasdiqlansa to'lovingizning 90% qaytariladi (10% tizim komissiyasi qaytarilmaydi).\n\n4. Mualliflar har sotuvdan 90% oladi, platforma 10% komissiya oladi.\n\n5. Kontent uchun javobgarlik uni joylagan muallifda. Noqonuniy yoki aldov kontent taqiqlanadi.\n\n6. Hamyoningiz va kalitlaringiz xavfsizligi o'zingizga bog'liq.\n\nDavom etish uchun shartlarni qabul qiling.",
    ru: "📄 Условия использования\n\n1. Media — платформа обмена контентом. Платный контент покупается за Telegram Stars ⭐.\n\n2. Оплата за купленный контент не возвращается — кроме случая обмана ниже.\n\n3. 🛡 Защита от обмана: если короткий reel не соответствует полному видео (обман), вы можете подать «⚠️ Жалобу». Админ проверит; при подтверждении вернётся 90% оплаты (10% комиссии не возвращается).\n\n4. Авторы получают 90% с каждой продажи, платформа — 10% комиссии.\n\n5. Ответственность за контент несёт автор. Незаконный или мошеннический контент запрещён.\n\n6. Безопасность вашего кошелька и ключей — на вас.\n\nЧтобы продолжить, примите условия.",
    en: "📄 Terms of Use\n\n1. Media is a content-sharing platform. Paid content is purchased with Telegram Stars ⭐.\n\n2. Payment for purchased content is non-refundable — except for the bait case below.\n\n3. 🛡 Fraud protection: if a short reel does not match the full video (bait), you may file a «⚠️ Complaint». The admin reviews it; if approved, 90% of your payment is refunded (the 10% platform commission is non-refundable).\n\n4. Creators earn 90% of each sale; the platform takes a 10% commission.\n\n5. Creators are responsible for their content. Illegal or fraudulent content is prohibited.\n\n6. The security of your wallet and keys is your own responsibility.\n\nTo continue, please accept the terms.",
  },
  termsAgree: { uz: "✅ Roziman", ru: "✅ Принимаю", en: "✅ I agree" },
  termsAccepted: {
    uz: "✅ Rahmat! Endi bemalol foydalanishingiz mumkin.",
    ru: "✅ Спасибо! Теперь можете пользоваться.",
    en: "✅ Thanks! You can now use the app.",
  },
  complaintBtn: {
    uz: "⚠️ Shikoyat (aldov)",
    ru: "⚠️ Жалоба (обман)",
    en: "⚠️ Report (bait)",
  },
  complaintFiled: {
    uz: "✅ Shikoyatingiz qabul qilindi. Admin tekshiradi — aldov tasdiqlansa, 90% pul qaytariladi.",
    ru: "✅ Жалоба принята. Админ проверит — при подтверждении обмана вернётся 90%.",
    en: "✅ Complaint received. The admin will review — if confirmed, 90% is refunded.",
  },
  complaintExists: {
    uz: "Bu kontent bo'yicha shikoyatingiz allaqachon bor.",
    ru: "По этому контенту жалоба уже есть.",
    en: "You already have a complaint for this content.",
  },
  complaintNeedBuy: {
    uz: "Shikoyat qilish uchun avval kontentni sotib olgan bo'lishingiz kerak.",
    ru: "Чтобы пожаловаться, сначала нужно купить контент.",
    en: "You must purchase the content before reporting it.",
  },
  complaintTooLate: {
    uz: "Shikoyat muddati o'tgan (sotib olganга {days} kundan ko'p bo'ldi).",
    ru: "Срок жалобы истёк (прошло более {days} дн. с покупки).",
    en: "The complaint window has closed (more than {days} days since purchase).",
  },
  refundBuyer: {
    uz: "✅ «{title}» bo'yicha shikoyatingiz tasdiqlandi. {amount} USDT balansingizga qaytarildi (yechib olishingiz mumkin).",
    ru: "✅ Ваша жалоба по «{title}» подтверждена. {amount} USDT возвращено на ваш баланс (можно вывести).",
    en: "✅ Your complaint about «{title}» was approved. {amount} USDT was credited to your balance (you can withdraw it).",
  },
  refundRejected: {
    uz: "«{title}» bo'yicha shikoyatingiz ko'rib chiqildi, lekin aldov tasdiqlanmadi.",
    ru: "Ваша жалоба по «{title}» рассмотрена, но обман не подтверждён.",
    en: "Your complaint about «{title}» was reviewed, but bait was not confirmed.",
  },
  refundClawback: {
    uz: "⚠️ «{title}» uchun aldov shikoyati tasdiqlandi. {amount} USDT balansingizdan qaytarib olindi.",
    ru: "⚠️ Жалоба на обман по «{title}» подтверждена. {amount} USDT списано с вашего баланса.",
    en: "⚠️ A bait complaint for «{title}» was approved. {amount} USDT was clawed back from your balance.",
  },
  withdrawMinStars: {
    uz: "Yechish uchun kamida {min} ⭐ kerak (sizda {available} ⭐).",
    ru: "Для вывода нужно минимум {min} ⭐ (у вас {available} ⭐).",
    en: "Minimum to withdraw is {min} ⭐ (you have {available} ⭐).",
  },
  withdrawRequested: {
    uz: "⏳ Yechish so'rovi yuborildi: {amount} ⭐. Admin tez orada hisobingizga tarqatadi.",
    ru: "⏳ Запрос на вывод отправлен: {amount} ⭐. Админ скоро распределит на ваш счёт.",
    en: "⏳ Withdrawal requested: {amount} ⭐. The admin will distribute it to you shortly.",
  },
  refundBuyerStars: {
    uz: "✅ «{title}» bo'yicha shikoyatingiz tasdiqlandi. {amount} ⭐ hisobingizga qaytarildi.",
    ru: "✅ Ваша жалоба по «{title}» подтверждена. {amount} ⭐ возвращено на ваш счёт.",
    en: "✅ Your complaint about «{title}» was approved. {amount} ⭐ was refunded to you.",
  },
  refundClawbackStars: {
    uz: "⚠️ «{title}» uchun aldov tasdiqlandi. {amount} ⭐ daromadingizdan olib tashlandi.",
    ru: "⚠️ Обман по «{title}» подтверждён. {amount} ⭐ снято с вашего дохода.",
    en: "⚠️ Bait for «{title}» was confirmed. {amount} ⭐ was removed from your earnings.",
  },
  banned: {
    uz: "⛔ Hisobingiz qoidabuzarlik uchun bloklangan. Yuklash, sotib olish va yechish mumkin emas.",
    ru: "⛔ Ваш аккаунт заблокирован за нарушение. Загрузка, покупка и вывод недоступны.",
    en: "⛔ Your account is banned for a violation. Upload, purchase and withdrawal are disabled.",
  },
  uploadRateLimit: {
    uz: "Juda ko'p video yukladingiz. Bir soatdan so'ng urinib ko'ring.",
    ru: "Вы загрузили слишком много видео. Попробуйте через час.",
    en: "You've uploaded too many videos. Try again in an hour.",
  },
  contentRemoved: {
    uz: "🚫 «{title}» videongiz qoidabuzarlik uchun o'chirildi.",
    ru: "🚫 Ваше видео «{title}» удалено за нарушение правил.",
    en: "🚫 Your video «{title}» was removed for a policy violation.",
  },
  reportSent: {
    uz: "✅ Shikoyatingiz yuborildi. Admin ko'rib chiqadi. Rahmat!",
    ru: "✅ Жалоба отправлена. Админ рассмотрит. Спасибо!",
    en: "✅ Report sent. The admin will review it. Thank you!",
  },
};

export function t(lang: string | null | undefined, key: keyof typeof S, vars?: Record<string, string | number>): string {
  const l = normLang(lang);
  const entry = S[key];
  let s = entry ? entry[l] : String(key);
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
