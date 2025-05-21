import TelegramBot from 'node-telegram-bot-api';
interface RarCommandDependencies {
    isUserRegistered: (userId: number) => boolean;
    hasRarAccess: (userId: number) => boolean;
    getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null;
    setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null) => void;
    ensureUserDataDir: (userId: number) => string;
}
export declare const registerRarCommands: (bot: TelegramBot, deps: RarCommandDependencies) => void;
export {};
