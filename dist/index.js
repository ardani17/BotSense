"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
// Load environment variables
(0, dotenv_1.config)();
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
const botOptions = {
    polling: true
};
const bot = new node_telegram_bot_api_1.default(process.env.BOT_TOKEN, botOptions);
// User state management (in-memory)
const userStates = new Map();
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
// Import feature modules
const location_1 = require("./features/location");
const rar_1 = require("./features/rar");
const workbook_1 = require("./features/workbook");
const ocr_1 = require("./features/ocr");
const menu_1 = require("./commands/menu");
// Authentication middleware
const isUserRegistered = (userId) => {
    return registeredUsers.includes(userId);
};
// Authorization middleware for features
const hasLocationAccess = (userId) => {
    return locationAccessUsers.includes(userId);
};
const hasRarAccess = (userId) => {
    return rarAccessUsers.includes(userId);
};
const hasWorkbookAccess = (userId) => {
    return workbookAccessUsers.includes(userId);
};
const hasOcrAccess = (userId) => {
    return ocrAccessUsers.includes(userId);
};
// User data directory management
const ensureUserDataDir = (userId) => {
    const userDir = path.join(process.env.BASE_DATA_PATH, userId.toString());
    fs.ensureDirSync(userDir);
    return userDir;
};
// Set user mode
const setUserMode = (userId, mode) => {
    userStates.set(userId, { mode });
};
// Get user mode
const getUserMode = (userId) => {
    return userStates.get(userId)?.mode || null;
};
// Start the bot
const startBot = () => {
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
    (0, menu_1.registerMenuCommand)(bot, {
        isUserRegistered,
        hasLocationAccess,
        hasRarAccess,
        hasWorkbookAccess,
        hasOcrAccess,
        setUserMode
    });
    // Register feature modules
    (0, location_1.registerLocationCommands)(bot, {
        isUserRegistered,
        hasLocationAccess,
        getUserMode,
        setUserMode,
        ensureUserDataDir
    });
    (0, rar_1.registerRarCommands)(bot, {
        isUserRegistered,
        hasRarAccess,
        getUserMode,
        setUserMode,
        ensureUserDataDir
    });
    (0, workbook_1.registerWorkbookCommands)(bot, {
        isUserRegistered,
        hasWorkbookAccess,
        getUserMode,
        setUserMode,
        ensureUserDataDir
    });
    (0, ocr_1.registerOcrCommands)(bot, {
        isUserRegistered,
        hasOcrAccess,
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
            text.startsWith('/lokasi') || text.startsWith('/rar') || text.startsWith('/workbook') || text.startsWith('/ocr') ||
            text.startsWith('/zip') || text.startsWith('/extract') || text.startsWith('/kirim') ||
            text.startsWith('/alamat') || text.startsWith('/koordinat') || text.startsWith('/show_map') ||
            text.startsWith('/search') || text.startsWith('/stats') || text.startsWith('/help') ||
            text.startsWith('/cari') || text.startsWith('/extract-found') ||
            text.startsWith('/ukur') || text.startsWith('/ukur_motor') || text.startsWith('/ukur_mobil') ||
            text.startsWith('/batal') || text.startsWith('/ocr_clear')) {
            return;
        }
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        const currentMode = getUserMode(userId);
        // If user sends a command that doesn't match the current mode
        if (text.startsWith('/') && currentMode) {
            bot.sendMessage(msg.chat.id, `Perintah tidak valid dalam mode ${currentMode === 'location' ? 'Lokasi' : currentMode === 'rar' ? 'Arsip' : currentMode === 'workbook' ? 'Workbook' : currentMode === 'ocr' ? 'OCR' : 'Menu'}. ` +
                `Gunakan perintah terkait ${currentMode === 'location' ? 'lokasi' : currentMode === 'rar' ? 'arsip' : currentMode === 'workbook' ? 'workbook' : currentMode === 'ocr' ? 'ocr' : 'menu'}.`);
        }
    });
    console.log('Bot started successfully!');
};
// Start the bot
startBot();
//# sourceMappingURL=index.js.map