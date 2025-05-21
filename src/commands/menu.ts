import TelegramBot from 'node-telegram-bot-api';

interface MenuCommandDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasLocationAccess: (userId: number) => boolean;
  hasRarAccess: (userId: number) => boolean;
  hasWorkbookAccess: (userId: number) => boolean;
  hasOcrAccess: (userId: number) => boolean;
  hasKmlAccess: (userId: number) => boolean;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null) => void;
}

export const registerMenuCommand = (
  bot: TelegramBot,
  deps: MenuCommandDependencies
): void => {
  const { isUserRegistered, hasLocationAccess, hasRarAccess, hasWorkbookAccess, hasOcrAccess, hasKmlAccess, setUserMode } = deps;

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
    
    if (hasKmlAccess(userId)) {
      availableCommands.push('/kml - Masuk ke mode KML');
    }
    
    const menuText = availableCommands.join('\n');
    
    bot.sendMessage(msg.chat.id, menuText);
  });
};
