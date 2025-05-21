import TelegramBot from 'node-telegram-bot-api';

interface KmlCommandDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasKmlAccess: (userId: number) => boolean;
  getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null) => void;
  ensureUserDataDir: (userId: number) => string;
}

export const registerKmlCommands = (
  bot: TelegramBot,
  deps: KmlCommandDependencies
): void => {
  const { isUserRegistered, hasKmlAccess, getUserMode, setUserMode, ensureUserDataDir } = deps;

  // KML mode command - placeholder
  bot.onText(/\/kml/, (msg) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasKmlAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur /kml.');
      return;
    }
    
    // Set user mode to kml
    setUserMode(userId, 'kml');
    
    bot.sendMessage(
      msg.chat.id,
      '⚠️ Fitur KML masih dalam tahap pengembangan dan belum berfungsi dengan sempurna.\n\n' +
      'Ketik /menu untuk kembali ke menu utama.'
    );
  });
};
