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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRarCommands = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// In-memory storage for user upload states
const userUploadStates = new Map();
// In-memory storage for usage statistics
const userUsageStats = new Map();
const registerRarCommands = (bot, deps) => {
    const { isUserRegistered, hasRarAccess, getUserMode, setUserMode, ensureUserDataDir } = deps;
    // Helper function to initialize or reset user upload state
    const initUserUploadState = (userId, mode = null) => {
        userUploadStates.set(userId, {
            mode,
            files: [],
            timestamp: Date.now()
        });
    };
    // Helper function to get user upload state
    const getUserUploadState = (userId) => {
        return userUploadStates.get(userId);
    };
    // Helper function to add file to user upload state
    const addFileToUploadState = (userId, filePath) => {
        const state = getUserUploadState(userId);
        if (state) {
            state.files.push(filePath);
            state.timestamp = Date.now();
        }
    };
    // Helper function to initialize or get user usage stats
    const getUserStats = (userId) => {
        if (!userUsageStats.has(userId)) {
            userUsageStats.set(userId, {
                zipCount: 0,
                extractCount: 0,
                searchCount: 0,
                filesSent: 0,
                filesReceived: 0,
                lastUsed: Date.now()
            });
        }
        return userUsageStats.get(userId);
    };
    // Helper function to update user usage stats
    const updateUserStats = (userId, update) => {
        const stats = getUserStats(userId);
        Object.assign(stats, { ...update, lastUsed: Date.now() });
    };
    // Helper function to clean up user files
    const cleanupUserFiles = async (userId, filesToKeep = []) => {
        try {
            const userDir = ensureUserDataDir(userId);
            const rarFilesDir = path.join(userDir, 'rar_files');
            if (fs.existsSync(rarFilesDir)) {
                const files = fs.readdirSync(rarFilesDir);
                for (const file of files) {
                    const filePath = path.join(rarFilesDir, file);
                    // Skip files that should be kept
                    if (filesToKeep.includes(filePath)) {
                        continue;
                    }
                    if (fs.statSync(filePath).isDirectory()) {
                        fs.removeSync(filePath);
                    }
                    else {
                        fs.unlinkSync(filePath);
                    }
                }
            }
        }
        catch (error) {
            console.error('Error cleaning up user files:', error);
        }
    };
    // Main rar mode command
    bot.onText(/\/rar/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur /rar.');
            return;
        }
        // Set user mode to rar
        setUserMode(userId, 'rar');
        // Ensure rar files directory exists
        const userDir = ensureUserDataDir(userId);
        fs.ensureDirSync(path.join(userDir, 'rar_files'));
        // Reset user upload state
        initUserUploadState(userId);
        bot.sendMessage(msg.chat.id, 'Anda sekarang dalam mode Arsip. Perintah yang tersedia:\n' +
            '/zip - Mengompres file menjadi ZIP (kirim file yang ingin diarsipkan, lalu ketik /kirim)\n' +
            '/extract - Mengekstrak file arsip (kirim file ZIP/RAR, lalu ketik /kirim)\n' +
            '/search - Mencari file dalam arsip\n' +
            '/stats - Melihat statistik penggunaan fitur arsip\n' +
            '/help - Bantuan interaktif dengan contoh penggunaan\n\n' +
            'Ketik /menu untuk kembali ke menu utama.');
    });
    // Zip command - start collecting files to zip
    bot.onText(/\/zip/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        // Initialize user upload state for zip mode
        initUserUploadState(userId, 'zip');
        // Ensure user directories exist
        const userDir = ensureUserDataDir(userId);
        const rarFilesDir = path.join(userDir, 'rar_files');
        fs.ensureDirSync(rarFilesDir);
        // Clean up previous files
        cleanupUserFiles(userId);
        bot.sendMessage(msg.chat.id, 'Silakan kirim file-file yang ingin Anda arsipkan. Setelah selesai, ketik /kirim untuk membuat file ZIP.');
    });
    // Extract command - start collecting archive files to extract
    bot.onText(/\/extract/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        // Initialize user upload state for extract mode
        initUserUploadState(userId, 'extract');
        // Ensure user directories exist
        const userDir = ensureUserDataDir(userId);
        const rarFilesDir = path.join(userDir, 'rar_files');
        fs.ensureDirSync(rarFilesDir);
        // Clean up previous files
        cleanupUserFiles(userId);
        bot.sendMessage(msg.chat.id, 'Silakan kirim file arsip (ZIP atau RAR) yang ingin Anda ekstrak. Setelah selesai, ketik /kirim untuk mengekstrak file.');
    });
    // Search command - search files in archive before extracting
    bot.onText(/\/search/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        // Initialize user upload state for search mode
        initUserUploadState(userId, 'search');
        // Ensure user directories exist
        const userDir = ensureUserDataDir(userId);
        const rarFilesDir = path.join(userDir, 'rar_files');
        fs.ensureDirSync(rarFilesDir);
        // Clean up previous files
        cleanupUserFiles(userId);
        bot.sendMessage(msg.chat.id, 'Silakan kirim file arsip (ZIP atau RAR) yang ingin Anda cari isinya. ' +
            'Setelah mengirim file, ketik pola pencarian dengan format: /cari [pola]. ' +
            'Contoh: /cari *.jpg untuk mencari semua file JPG dalam arsip.');
    });
    // Stats command - show usage statistics
    bot.onText(/\/stats/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        // Get user stats
        const stats = getUserStats(userId);
        const lastUsedDate = new Date(stats.lastUsed).toLocaleString();
        bot.sendMessage(msg.chat.id, '📊 *Statistik Penggunaan Fitur Arsip*\n\n' +
            `🗜 Jumlah ZIP dibuat: ${stats.zipCount}\n` +
            `📂 Jumlah ekstraksi: ${stats.extractCount}\n` +
            `🔍 Jumlah pencarian: ${stats.searchCount}\n` +
            `📤 File dikirim ke bot: ${stats.filesReceived}\n` +
            `📥 File diterima dari bot: ${stats.filesSent}\n` +
            `🕒 Terakhir digunakan: ${lastUsedDate}`, { parse_mode: 'Markdown' });
    });
    // Help command - interactive help with examples
    bot.onText(/\/help/, (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        const helpMessage = '📚 *Bantuan Fitur Arsip*\n\n' +
            '*Cara Mengompres File:*\n' +
            '1. Ketik /zip untuk memulai\n' +
            '2. Kirim file yang ingin diarsipkan (bisa beberapa file)\n' +
            '3. Ketik /kirim untuk membuat file ZIP\n\n' +
            '*Cara Mengekstrak File:*\n' +
            '1. Ketik /extract untuk memulai\n' +
            '2. Kirim file ZIP atau RAR yang ingin diekstrak\n' +
            '3. Ketik /kirim untuk mengekstrak semua file\n\n' +
            '*Cara Mencari File dalam Arsip:*\n' +
            '1. Ketik /search untuk memulai\n' +
            '2. Kirim file ZIP atau RAR yang ingin dicari isinya\n' +
            '3. Ketik /cari [pola] untuk mencari file\n' +
            '   Contoh: /cari *.jpg atau /cari dokumen*.pdf\n\n' +
            '*Perintah Lainnya:*\n' +
            '/stats - Melihat statistik penggunaan\n' +
            '/menu - Kembali ke menu utama\n\n' +
            '*Catatan:*\n' +
            '- Ukuran file maksimum: 50MB\n' +
            '- File akan otomatis dihapus setelah diproses';
        bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
    });
    // Search pattern command - search files in archive with pattern
    bot.onText(/\/cari (.+)/, async (msg, match) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        const uploadState = getUserUploadState(userId);
        if (!uploadState || uploadState.mode !== 'search' || uploadState.files.length === 0) {
            bot.sendMessage(msg.chat.id, 'Anda harus mengirim file arsip terlebih dahulu dengan perintah /search.');
            return;
        }
        if (!match || !match[1]) {
            bot.sendMessage(msg.chat.id, 'Format pencarian tidak valid. Gunakan: /cari [pola]');
            return;
        }
        const searchPattern = match[1].trim();
        uploadState.searchPattern = searchPattern;
        try {
            const archiveFile = uploadState.files[0];
            const fileExt = path.extname(archiveFile).toLowerCase();
            if (fileExt !== '.zip' && fileExt !== '.rar') {
                bot.sendMessage(msg.chat.id, 'Format file tidak didukung. Hanya file ZIP dan RAR yang dapat dicari.');
                return;
            }
            bot.sendMessage(msg.chat.id, `🔍 Mencari file dengan pola: ${searchPattern}`);
            // Execute search command based on file extension
            let cmd = '';
            let result = '';
            if (fileExt === '.zip') {
                cmd = `unzip -l "${archiveFile}" | grep -i "${searchPattern}"`;
            }
            else if (fileExt === '.rar') {
                cmd = `unrar l "${archiveFile}" | grep -i "${searchPattern}"`;
            }
            try {
                const { stdout } = await execAsync(cmd);
                result = stdout.trim();
            }
            catch (error) {
                // grep returns non-zero exit code when no matches found
                result = '';
            }
            // Update user stats
            updateUserStats(userId, { searchCount: getUserStats(userId).searchCount + 1 });
            if (!result) {
                bot.sendMessage(msg.chat.id, `❌ Tidak ditemukan file yang cocok dengan pola: ${searchPattern}`);
                return;
            }
            // Format and send the search results
            const resultLines = result.split('\n');
            let formattedResult = `✅ Ditemukan ${resultLines.length} file yang cocok dengan pola: ${searchPattern}\n\n`;
            // Limit the number of lines to avoid message too long
            const maxLines = 20;
            const displayedLines = resultLines.slice(0, maxLines);
            formattedResult += displayedLines.join('\n');
            if (resultLines.length > maxLines) {
                formattedResult += `\n\n... dan ${resultLines.length - maxLines} file lainnya.`;
            }
            bot.sendMessage(msg.chat.id, formattedResult);
        }
        catch (error) {
            console.error('Error searching in archive:', error);
            bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat mencari dalam arsip. Pastikan utilitas yang diperlukan terinstal di server.');
        }
    });
    // Extract found files command has been removed as per user request
    // Handle file uploads
    bot.on('document', async (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            return;
        }
        if (!hasRarAccess(userId)) {
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            return;
        }
        const uploadState = getUserUploadState(userId);
        if (!uploadState || !uploadState.mode) {
            bot.sendMessage(msg.chat.id, 'Silakan gunakan /zip, /extract, atau /search terlebih dahulu untuk memulai proses.');
            return;
        }
        const document = msg.document;
        if (!document || !document.file_id) {
            bot.sendMessage(msg.chat.id, 'File tidak valid.');
            return;
        }
        try {
            // Ensure user directories exist
            const userDir = ensureUserDataDir(userId);
            const rarFilesDir = path.join(userDir, 'rar_files');
            fs.ensureDirSync(rarFilesDir);
            // Download the file
            const fileInfo = await bot.getFile(document.file_id);
            if (!fileInfo.file_path) {
                bot.sendMessage(msg.chat.id, 'Tidak dapat mengunduh file.');
                return;
            }
            // Get file extension
            const fileExt = path.extname(document.file_name || '').toLowerCase();
            // Validate file type for extract and search modes
            if ((uploadState.mode === 'extract' || uploadState.mode === 'search') &&
                fileExt !== '.zip' && fileExt !== '.rar') {
                bot.sendMessage(msg.chat.id, 'Hanya file ZIP dan RAR yang dapat diekstrak atau dicari. Silakan kirim file dengan format yang benar.');
                return;
            }
            // Generate a unique filename
            const timestamp = Date.now();
            const fileName = `${timestamp}_${document.file_name || `file${fileExt || ''}`}`;
            const filePath = path.join(rarFilesDir, fileName);
            // Download file URL
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
            // Use curl to download the file
            await execAsync(`curl -o "${filePath}" "${fileUrl}"`);
            // Add file to user's upload state
            addFileToUploadState(userId, filePath);
            // Update user stats
            updateUserStats(userId, { filesReceived: getUserStats(userId).filesReceived + 1 });
            let responseMessage = '';
            if (uploadState.mode === 'zip') {
                responseMessage = `File "${document.file_name || 'tanpa nama'}" berhasil diterima. ` +
                    `Total file: ${uploadState.files.length}. ` +
                    `Ketik /kirim untuk membuat arsip.`;
            }
            else if (uploadState.mode === 'extract') {
                responseMessage = `File "${document.file_name || 'tanpa nama'}" berhasil diterima. ` +
                    `Ketik /kirim untuk mengekstrak file.`;
            }
            else if (uploadState.mode === 'search') {
                responseMessage = `File "${document.file_name || 'tanpa nama'}" berhasil diterima. ` +
                    `Ketik /cari [pola] untuk mencari file dalam arsip. ` +
                    `Contoh: /cari *.jpg atau /cari dokumen*.pdf`;
            }
            bot.sendMessage(msg.chat.id, responseMessage);
        }
        catch (error) {
            console.error('Error handling file upload:', error);
            bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat menerima file. Silakan coba lagi nanti.');
        }
    });
    // Process the uploaded files when user sends /kirim
    bot.onText(/\/kirim/, async (msg) => {
        const userId = msg.from?.id;
        if (!userId || !isUserRegistered(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
            return;
        }
        if (!hasRarAccess(userId)) {
            bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur arsip.');
            return;
        }
        const currentMode = getUserMode(userId);
        if (currentMode !== 'rar') {
            bot.sendMessage(msg.chat.id, 'Anda harus berada dalam mode Arsip untuk menggunakan perintah ini. Ketik /rar untuk masuk ke mode Arsip.');
            return;
        }
        const uploadState = getUserUploadState(userId);
        if (!uploadState || !uploadState.mode) {
            bot.sendMessage(msg.chat.id, 'Silakan gunakan /zip atau /extract terlebih dahulu untuk memulai proses.');
            return;
        }
        if (uploadState.files.length === 0) {
            bot.sendMessage(msg.chat.id, 'Anda belum mengirimkan file apapun. Silakan kirim file terlebih dahulu.');
            return;
        }
        try {
            // Ensure user directories exist
            const userDir = ensureUserDataDir(userId);
            const rarFilesDir = path.join(userDir, 'rar_files');
            if (uploadState.mode === 'zip') {
                // Create ZIP file
                bot.sendMessage(msg.chat.id, 'Membuat file ZIP dari file yang dikirim...');
                // Generate output zip filename with timestamp
                const timestamp = Date.now();
                const zipFileName = `archive_${timestamp}.zip`;
                const zipFilePath = path.join(rarFilesDir, zipFileName);
                // Create a list of files to include in the zip
                const fileList = uploadState.files.map(file => `"${path.basename(file)}"`).join(' ');
                // Execute zip command
                const cmd = `cd "${rarFilesDir}" && zip -j "${zipFileName}" ${fileList}`;
                await execAsync(cmd);
                // Update user stats
                updateUserStats(userId, {
                    zipCount: getUserStats(userId).zipCount + 1,
                    filesSent: getUserStats(userId).filesSent + 1
                });
                // Send the zip file to the user
                await bot.sendDocument(msg.chat.id, zipFilePath, {
                    caption: `✅ File ZIP berhasil dibuat dengan ${uploadState.files.length} file.`
                });
                // Clean up all files except the zip file we just created
                await cleanupUserFiles(userId, [zipFilePath]);
                // Clean up the zip file after sending
                fs.unlinkSync(zipFilePath);
                // Reset user upload state
                initUserUploadState(userId);
            }
            else if (uploadState.mode === 'extract') {
                // Extract archive file
                bot.sendMessage(msg.chat.id, 'Mengekstrak file arsip...');
                // We should have only one file for extraction
                const archiveFile = uploadState.files[0];
                const fileExt = path.extname(archiveFile).toLowerCase();
                // Create extraction directory
                const timestamp = Date.now();
                const extractDir = path.join(rarFilesDir, `extracted_${timestamp}`);
                fs.ensureDirSync(extractDir);
                // Determine extraction command based on file extension
                let cmd = '';
                if (fileExt === '.zip') {
                    cmd = `unzip -o "${archiveFile}" -d "${extractDir}"`;
                }
                else if (fileExt === '.rar') {
                    cmd = `unrar x "${archiveFile}" "${extractDir}"`;
                }
                else {
                    bot.sendMessage(msg.chat.id, 'Format file tidak didukung. Hanya file ZIP dan RAR yang dapat diekstrak.');
                    return;
                }
                // Execute extraction command
                await execAsync(cmd);
                // Get list of extracted files
                const extractedFiles = fs.readdirSync(extractDir);
                if (extractedFiles.length === 0) {
                    bot.sendMessage(msg.chat.id, 'Tidak ada file yang diekstrak dari arsip.');
                    return;
                }
                // Update user stats
                updateUserStats(userId, {
                    extractCount: getUserStats(userId).extractCount + 1,
                    filesSent: getUserStats(userId).filesSent + extractedFiles.length
                });
                // Send each extracted file to the user
                bot.sendMessage(msg.chat.id, `✅ ${extractedFiles.length} file berhasil diekstrak dari arsip.`);
            }
        }
        catch (error) {
            console.error('Error processing uploaded files:', error);
            bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat memproses file. Silakan coba lagi nanti.');
        }
    });
};
exports.registerRarCommands = registerRarCommands;
//# sourceMappingURL=index.js.map