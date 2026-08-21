import { bot } from "./bot-core";
import { register as registerStart } from "./handlers/start";
import { register as registerUpload } from "./handlers/upload";
import { register as registerPayments } from "./handlers/payments";
import { register as registerEarnings } from "./handlers/earnings";
import { register as registerModeration } from "./handlers/moderation";
import { register as registerAdmin } from "./handlers/admin";

export { bot, notifyAdmins, notifyUserById } from "./bot-core";
export type { MyContext } from "./bot-core";
export { createContent, deliverContent, sendUnlockedVideo } from "./handlers/content";
export { createStarsInvoice, creatorStarsBalance } from "./handlers/payments";
export { requestStarsPayout, setTonWallet } from "./handlers/earnings";
export { createComplaint, createReport, assertCanUpload, takedownContent, banUser, unbanUser } from "./handlers/moderation";
export { getCrmData, getUsersData } from "./handlers/admin";
export { requestPayout } from "./handlers/payout-tron";

registerStart(bot);
registerUpload(bot);
registerPayments(bot);
registerEarnings(bot);
registerModeration(bot);
registerAdmin(bot);

bot.catch((err) => console.error("Bot xatosi:", err.error));
