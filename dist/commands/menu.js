"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMenuCommand = void 0;
const registerMenuCommand = (bot, deps) => {
    const { isUserRegistered, hasLocationAccess, hasRarAccess, hasWorkbookAccess, hasOcrAccess, setUserMode } = deps;
    bot.onText(/\/menu/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        // Reset user mode to null (no active mode)
        setUserMode(userId, null);
        // Build available commands menu based on user access
        const availableCommands = ['Menu Utama:'];
        if (hasLocationAccess(userId)) {
            availableCommands.push('/lokasi - Masuk ke mode Lokasi');
        }
        if (hasRarAccess(userId)) {
            availableCommands.push('/rar - Masuk ke mode Arsip');
        }
        if (hasWorkbookAccess(userId)) {
            availableCommands.push('/workbook - Masuk ke mode Workbook');
        }
        if (hasOcrAccess(userId)) {
            availableCommands.push('/ocr - Masuk ke mode OCR');
        }
        const menuText = availableCommands.join('\n');
        bot.sendMessage(msg.chat.id, menuText);
    });
};
exports.registerMenuCommand = registerMenuCommand;
//# sourceMappingURL=menu.js.map