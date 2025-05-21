import { config } from 'dotenv';
import * as fs from 'fs-extra';
import * as path from 'path';
import TelegramBot from 'node-telegram-bot-api';

// Load environment variables
config();

// Types
export interface UserState {
  mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null;
}

// Environment variables validation
if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN is required in .env file');
  process.exit(1);
}

if (!process.env.REGISTERED_USERS) {
  console.error('REGISTERED_USERS is required in .env file');
  process.exit(1);
}

if (!process.env.BASE_DATA_PATH) {
  console.error('BASE_DATA_PATH is required in .env file');
  process.exit(1);
}

// Bot initialization with options
const botOptions: TelegramBot.ConstructorOptions = { 
  polling: true 
};

const bot = new TelegramBot(process.env.BOT_TOKEN, botOptions);

// User state management (in-memory)
const userStates = new Map<number, UserState>();

// Parse registered users from environment variables
const registeredUsers = process.env.REGISTERED_USERS.split(',').map(id => parseInt(id.trim(), 10));
const locationAccessUsers = (process.env.LOKASI_ACCESS_USERS || '').split(',')
  .filter(id => id.trim() !== '')
  .map(id => parseInt(id.trim(), 10));
const rarAccessUsers = (process.env.RAR_ACCESS_USERS || '').split(',')
  .filter(id => id.trim() !== '')
  .map(id => parseInt(id.trim(), 10));
const workbookAccessUsers = (process.env.WORKBOOK_ACCESS_USERS || '').split(',')
  .filter(id => id.trim() !== '')
  .map(id => parseInt(id.trim(), 10));
const ocrAccessUsers = (process.env.OCR_ACCESS_USERS || '').split(',')
  .filter(id => id.trim() !== '')
  .map(id => parseInt(id.trim(), 10));
const kmlAccessUsers = (process.env.KML_ACCESS_USERS || '').split(',')
  .filter(id => id.trim() !== '')
  .map(id => parseInt(id.trim(), 10));

// Import feature modules
import { registerLocationCommands } from './features/location';
import { registerRarCommands } from './features/rar';
import { registerWorkbookCommands } from './features/workbook';
import { registerOcrCommands } from './features/ocr';
import { registerKmlCommands } from './features/kml';
import { registerMenuCommand } from './commands/menu';

// Authentication middleware
const isUserRegistered = (userId: number): boolean => {
  return registeredUsers.includes(userId);
};

// Authorization middleware for features
const hasLocationAccess = (userId: number): boolean => {
  return locationAccessUsers.includes(userId);
};

const hasRarAccess = (userId: number): boolean => {
  return rarAccessUsers.includes(userId);
};

const hasWorkbookAccess = (userId: number): boolean => {
  return workbookAccessUsers.includes(userId);
};

const hasOcrAccess = (userId: number): boolean => {
  return ocrAccessUsers.includes(userId);
};

const hasKmlAccess = (userId: number): boolean => {
  return kmlAccessUsers.includes(userId);
};

// User data directory management
const ensureUserDataDir = (userId: number): string => {
  const userDir = path.join(process.env.BASE_DATA_PATH!, userId.toString());
  fs.ensureDirSync(userDir);
  return userDir;
};

// Set user mode
const setUserMode = (userId: number, mode: UserState['mode']): void => {
  userStates.set(userId, { mode });
};

// Get user mode
const getUserMode = (userId: number): UserState['mode'] => {
  return userStates.get(userId)?.mode || null;
};

// Start the bot
const startBot = (): void => {
  // Register global commands and middleware
  bot.onText(/\/start/, (msg) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    // Reset user mode to null (not in any specific mode)
    setUserMode(userId, null);
    
    // Ensure user data directory exists
    ensureUserDataDir(userId);
    
    bot.sendMessage(msg.chat.id, 'Selamat datang! Ketik /menu untuk melihat opsi.');
  });

  // Register menu command
  registerMenuCommand(bot, {
    isUserRegistered,
    hasLocationAccess,
    hasRarAccess,
    hasWorkbookAccess,
    hasOcrAccess,
    hasKmlAccess,
    setUserMode
  });

  // Register feature modules
  registerLocationCommands(bot, {
    isUserRegistered,
    hasLocationAccess,
    getUserMode,
    setUserMode,
    ensureUserDataDir
  });

  registerRarCommands(bot, {
    isUserRegistered,
    hasRarAccess,
    getUserMode,
    setUserMode,
    ensureUserDataDir
  });

  registerWorkbookCommands(bot, {
    isUserRegistered,
    hasWorkbookAccess,
    getUserMode,
    setUserMode,
    ensureUserDataDir
  });

  registerOcrCommands(bot, {
    isUserRegistered,
    hasOcrAccess,
    getUserMode,
    setUserMode,
    ensureUserDataDir
  });

  registerKmlCommands(bot, {
    isUserRegistered,
    hasKmlAccess,
    getUserMode,
    setUserMode,
    ensureUserDataDir
  });

  // Handle unknown commands based on user mode
  bot.on('message', (msg) => {
    const userId = msg.from?.id;
    const text = msg.text;
    
    // Skip processing for registered commands or non-text messages
    if (!text || text.startsWith('/start') || text.startsWith('/menu') || 
        text.startsWith('/lokasi') || text.startsWith('/rar') || text.startsWith('/workbook') || text.startsWith('/ocr') || text.startsWith('/kml') ||
        text.startsWith('/zip') || text.startsWith('/extract') || text.startsWith('/kirim') ||
        text.startsWith('/alamat') || text.startsWith('/koordinat') || text.startsWith('/show_map') ||
        text.startsWith('/search') || text.startsWith('/stats') || text.startsWith('/help') ||
        text.startsWith('/cari') || text.startsWith('/extract-found') ||
        text.startsWith('/ukur') || text.startsWith('/ukur_motor') || text.startsWith('/ukur_mobil') ||
        text.startsWith('/batal') || text.startsWith('/ocr_clear') ||
        text.startsWith('/tambah') || text.startsWith('/lihat') || text.startsWith('/hapus') || text.startsWith('/buat') || text.startsWith('/bantuan')) {
      return;
    }
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    
    // If user sends a command that doesn't match the current mode
    if (text.startsWith('/') && currentMode) {
      bot.sendMessage(
        msg.chat.id, 
        `Perintah tidak valid dalam mode ${currentMode === 'location' ? 'Lokasi' : 
                                          currentMode === 'rar' ? 'Arsip' : 
                                          currentMode === 'workbook' ? 'Workbook' : 
                                          currentMode === 'ocr' ? 'OCR' : 
                                          currentMode === 'kml' ? 'KML' : 'Menu'}. ` +
        `Gunakan perintah terkait ${currentMode === 'location' ? 'lokasi' : 
                                   currentMode === 'rar' ? 'arsip' : 
                                   currentMode === 'workbook' ? 'workbook' : 
                                   currentMode === 'ocr' ? 'ocr' : 
                                   currentMode === 'kml' ? 'kml' : 'menu'}.`
      );
    }
  });

  console.log('Bot started successfully!');
};

// Start the bot
startBot();
