import TelegramBot from 'node-telegram-bot-api';
interface LocationCommandDependencies {
    isUserRegistered: (userId: number) => boolean;
    hasLocationAccess: (userId: number) => boolean;
    getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null;
    setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null) => void;
    ensureUserDataDir: (userId: number) => string;
}
export declare const registerLocationCommands: (bot: TelegramBot, deps: LocationCommandDependencies) => void;
export {};
