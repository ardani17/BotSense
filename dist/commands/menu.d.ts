import TelegramBot from 'node-telegram-bot-api';
interface MenuCommandDependencies {
    isUserRegistered: (userId: number) => boolean;
    hasLocationAccess: (userId: number) => boolean;
    hasRarAccess: (userId: number) => boolean;
    hasWorkbookAccess: (userId: number) => boolean;
    hasOcrAccess: (userId: number) => boolean;
    setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | null) => void;
}
export declare const registerMenuCommand: (bot: TelegramBot, deps: MenuCommandDependencies) => void;
export {};
