import TelegramBot from 'node-telegram-bot-api';
interface OcrCommandDependencies {
    isUserRegistered: (userId: number) => boolean;
    hasOcrAccess: (userId: number) => boolean;
    getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null;
    setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null) => void;
    ensureUserDataDir: (userId: number) => string;
}
export declare const registerOcrCommands: (bot: TelegramBot, deps: OcrCommandDependencies) => void;
export {};
