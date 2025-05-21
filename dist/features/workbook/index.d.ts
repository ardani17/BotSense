import TelegramBot from 'node-telegram-bot-api';
interface WorkbookCommandDependencies {
    isUserRegistered: (userId: number) => boolean;
    hasWorkbookAccess?: (userId: number) => boolean;
    getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null;
    setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null) => void;
    ensureUserDataDir: (userId: number) => string;
}
export declare const registerWorkbookCommands: (bot: TelegramBot, deps: WorkbookCommandDependencies) => void;
export {};
