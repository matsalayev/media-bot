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
    uz: "🎬 Menyudagi «Media» tugmasi orqali ilovani oching.\n\n/upload — video joylash\n/mycontent — mening kontentim\n/earnings — daromadim (USDT)\n/wallet — TON hamyonni ulash\n/withdraw — USDT'ni hamyonga yechish\n/lang — tilni o'zgartirish",
    ru: "🎬 Откройте приложение кнопкой «Media» в меню.\n\n/upload — загрузить видео\n/mycontent — мои видео\n/earnings — мой доход (USDT)\n/wallet — привязать TON кошелёк\n/withdraw — вывести USDT на кошелёк\n/lang — сменить язык",
    en: "🎬 Open the app via the «Media» menu button.\n\n/upload — post a video\n/mycontent — my content\n/earnings — my earnings (USDT)\n/wallet — link TON wallet\n/withdraw — withdraw USDT to wallet\n/lang — change language",
  },
  adminPanel: {
    uz: "🛠 Admin panel — barcha buyruqlar\n\n👤 Foydalanuvchi:\n/start — boshlash / til tanlash\n/upload — video joylash\n/mycontent — mening kontentim\n/earnings — daromad (USDT)\n/wallet — TON hamyonni ulash\n/withdraw — USDT'ni hamyonga yechish\n/terms — foydalanish shartlari\n/lang — tilni o'zgartirish\n/help — yordam\n/cancel — jarayonni bekor qilish\n\n🔑 Admin:\n/admin — shu panel\n/add — video qo'shish (admin)\n/balance — Stars balansi + komissiya + hot-wallet\n/hotwallet — hot-wallet manzili va balansi\n/payouts — payout tarixi\n/complaints — aldov shikoyatlari\n/resolvepayout — payoutni qo'lda hal qilish",
    ru: "🛠 Админ-панель — все команды\n\n👤 Пользователь:\n/start — начать / выбрать язык\n/upload — загрузить видео\n/mycontent — мои видео\n/earnings — доход (USDT)\n/wallet — привязать TON кошелёк\n/withdraw — вывести USDT на кошелёк\n/lang — сменить язык\n/help — помощь\n/cancel — отменить процесс\n\n🔑 Админ:\n/admin — эта панель\n/add — добавить видео (админ)\n/balance — баланс Stars + комиссия + hot-wallet\n/hotwallet — адрес и баланс hot-wallet\n/payouts — история выплат",
    en: "🛠 Admin panel — all commands\n\n👤 User:\n/start — start / choose language\n/upload — post a video\n/mycontent — my content\n/earnings — earnings (USDT)\n/wallet — link TON wallet\n/withdraw — withdraw USDT to wallet\n/lang — change language\n/help — help\n/cancel — cancel the flow\n\n🔑 Admin:\n/admin — this panel\n/add — add a video (admin)\n/balance — Stars balance + commission + hot-wallet\n/hotwallet — hot-wallet address and balance\n/payouts — payout history",
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
  withdrawMin: {
    uz: "Yechish uchun kamida {min} USDT kerak. Mavjud: {available} USDT",
    ru: "Для вывода нужно минимум {min} USDT. Доступно: {available} USDT",
    en: "Minimum {min} USDT required to withdraw. Available: {available} USDT",
  },
  needWallet: {
    uz: "Avval TON hamyon manzilingizni ulang:\n/wallet <manzil>\n(yoki ilova profilidan)",
    ru: "Сначала привяжите адрес TON кошелька:\n/wallet <адрес>\n(или в профиле приложения)",
    en: "First link your TON wallet address:\n/wallet <address>\n(or in the app profile)",
  },
  walletPrompt: {
    uz: "TON hamyoningizni ulang (USDT shu manzilga tushadi):\n/wallet <manzil>\n\n{current}",
    ru: "Привяжите TON кошелёк (USDT придёт на этот адрес):\n/wallet <адрес>\n\n{current}",
    en: "Link your TON wallet (USDT arrives to this address):\n/wallet <address>\n\n{current}",
  },
  walletCurrent: {
    uz: "Joriy: {addr}",
    ru: "Текущий: {addr}",
    en: "Current: {addr}",
  },
  walletSaved: {
    uz: "✅ TON hamyon saqlandi:\n{addr}",
    ru: "✅ TON кошелёк сохранён:\n{addr}",
    en: "✅ TON wallet saved:\n{addr}",
  },
  walletInvalid: {
    uz: "❌ Noto'g'ri TON manzil. Tonkeeper'dan to'liq manzilni nusxalang.",
    ru: "❌ Неверный TON адрес. Скопируйте полный адрес из Tonkeeper.",
    en: "❌ Invalid TON address. Copy the full address from Tonkeeper.",
  },
  payoutPending: {
    uz: "⏳ Oldingi yechish so'rovingiz hali jarayonda. Biroz kuting.",
    ru: "⏳ Ваш предыдущий вывод ещё обрабатывается. Подождите немного.",
    en: "⏳ Your previous withdrawal is still processing. Please wait.",
  },
  payoutOffline: {
    uz: "⚙️ Payout hozircha sozlanmoqda. Keyinroq urinib ko'ring.",
    ru: "⚙️ Выплаты пока настраиваются. Попробуйте позже.",
    en: "⚙️ Payouts are being set up. Please try again later.",
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
    uz: "📄 Foydalanish shartlari\n\n1. Media — kontent almashish platformasi. Pullik kontent USDT (TON tarmog'i) orqali sotib olinadi.\n\n2. To'lovlar blokcheynda amalga oshadi va qaytarib bo'lmaydi — quyidagi holatdan tashqari.\n\n3. 🛡 Aldov himoyasi: agar qisqa reel to'liq videoga mos kelmasa (aldov), «⚠️ Shikoyat» tugmasi orqali murojaat qilishingiz mumkin. Admin tekshiradi; tasdiqlansa to'lovingizning 90% qaytariladi (10% tizim komissiyasi qaytarilmaydi).\n\n4. Mualliflar har sotuvdan 90% oladi, platforma 10% komissiya oladi.\n\n5. Kontent uchun javobgarlik uni joylagan muallifda. Noqonuniy yoki aldov kontent taqiqlanadi.\n\n6. Hamyoningiz va kalitlaringiz xavfsizligi o'zingizga bog'liq.\n\nDavom etish uchun shartlarni qabul qiling.",
    ru: "📄 Условия использования\n\n1. Media — платформа обмена контентом. Платный контент покупается за USDT (сеть TON).\n\n2. Платежи проходят в блокчейне и не возвращаются — кроме случая ниже.\n\n3. 🛡 Защита от обмана: если короткий reel не соответствует полному видео (обман), вы можете подать «⚠️ Жалобу». Админ проверит; при подтверждении вернётся 90% оплаты (10% комиссии не возвращается).\n\n4. Авторы получают 90% с каждой продажи, платформа — 10% комиссии.\n\n5. Ответственность за контент несёт автор. Незаконный или мошеннический контент запрещён.\n\n6. Безопасность вашего кошелька и ключей — на вас.\n\nЧтобы продолжить, примите условия.",
    en: "📄 Terms of Use\n\n1. Media is a content-sharing platform. Paid content is purchased with USDT (TON network).\n\n2. Payments settle on-chain and are non-refundable — except as below.\n\n3. 🛡 Fraud protection: if a short reel does not match the full video (bait), you may file a «⚠️ Complaint». The admin reviews it; if approved, 90% of your payment is refunded (the 10% platform commission is non-refundable).\n\n4. Creators earn 90% of each sale; the platform takes a 10% commission.\n\n5. Creators are responsible for their content. Illegal or fraudulent content is prohibited.\n\n6. The security of your wallet and keys is your own responsibility.\n\nTo continue, please accept the terms.",
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
  refundBuyer: {
    uz: "✅ «{title}» bo'yicha shikoyatingiz tasdiqlandi. {amount} USDT hamyoningizga qaytarildi.",
    ru: "✅ Ваша жалоба по «{title}» подтверждена. {amount} USDT возвращено на кошелёк.",
    en: "✅ Your complaint about «{title}» was approved. {amount} USDT refunded to your wallet.",
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
};

export function t(lang: string | null | undefined, key: keyof typeof S, vars?: Record<string, string | number>): string {
  const l = normLang(lang);
  const entry = S[key];
  let s = entry ? entry[l] : String(key);
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
