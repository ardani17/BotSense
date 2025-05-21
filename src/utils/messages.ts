import TelegramBot from 'node-telegram-bot-api';

export const sendNotRegistered = (
  bot: TelegramBot,
  chatId: number,
  from?: TelegramBot.User
) => {
  const displayName = from?.first_name || from?.username || 'Pengguna';
  const id = from?.id ?? 'unknown';
  bot.sendMessage(chatId, `Maaf ${displayName} (${id}) Anda tidak terdaftar untuk menggunakan bot ini.`);
}; 