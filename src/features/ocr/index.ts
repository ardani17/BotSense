import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { ocrSpace, OcrSpaceLanguages } from 'ocr-space-api-wrapper';

interface OcrCommandDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasOcrAccess: (userId: number) => boolean;
  getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null) => void;
  ensureUserDataDir: (userId: number) => string;
}

// Interface for tracking user OCR state
interface UserOcrState {
  processingImage: boolean;
  imagesProcessed: number;
  lastImagePath?: string;
}

// In-memory storage for user OCR states
const userOcrStates = new Map<number, UserOcrState>();

export const registerOcrCommands = (
  bot: TelegramBot,
  deps: OcrCommandDependencies
): void => {
  const { isUserRegistered, hasOcrAccess, getUserMode, setUserMode, ensureUserDataDir } = deps;

  // Helper function to initialize or reset user OCR state
  const initUserOcrState = (userId: number): UserOcrState => {
    const state: UserOcrState = {
      processingImage: false,
      imagesProcessed: 0
    };
    userOcrStates.set(userId, state);
    return state;
  };

  // Helper function to get user OCR state
  const getUserOcrState = (userId: number): UserOcrState => {
    let state = userOcrStates.get(userId);
    if (!state) {
      state = initUserOcrState(userId);
    }
    return state;
  };

  // Function to download image
  const downloadImage = async (url: string, filepath: string): Promise<void> => {
    const writer = fs.createWriteStream(filepath);
  
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
  
    response.data.pipe(writer);
  
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', (err) => reject(err));
    });
  };

  // Function to perform OCR on an image
  const performOcr = async (imagePath: string): Promise<string> => {
    try {
      // OCR.space supports these languages: https://ocr.space/OCRAPI#:~:text=Language%20parameter,eng%2C%20ger%2C%20por%2C%20spa%2C%20fre%2C%20ita%2C%20pol%2C%20rus%20and%20jpn)
      // Using English as default since Indonesian is not supported
      const ocrLanguage: OcrSpaceLanguages = 'eng';

      console.log(`Starting OCR with OCR.space API, language: ${ocrLanguage}`);
      
      // Get API key from environment variables or use default
      const apiKey = process.env.OCR_API_KEY || 'K85863150788957';
      
      // Call OCR.space API
      const result = await ocrSpace(imagePath, {
        apiKey: apiKey,
        language: ocrLanguage,
        isOverlayRequired: false,
        scale: true,
        isTable: false,
        OCREngine: '2' // More accurate OCR engine
      });
      
      // Extract text from response
      if (result && result.ParsedResults && result.ParsedResults.length > 0) {
        return result.ParsedResults[0].ParsedText;
      } else {
        return 'Tidak ada teks yang terdeteksi dalam gambar.';
      }
    } catch (error) {
      console.error('Error performing OCR:', error);
      return `Error: Failed to extract text from image. Details: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  // Clean up OCR directory for a user
  const cleanupOcrDirectory = (userId: number): void => {
    const userDir = ensureUserDataDir(userId);
    const ocrDir = path.join(userDir, 'ocr_files');
    
    if (fs.existsSync(ocrDir)) {
      fs.readdirSync(ocrDir).forEach(file => {
        const filePath = path.join(ocrDir, file);
        try {
          if (fs.lstatSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error(`Error removing file ${filePath}:`, error);
        }
      });
    }
  };

  // Main OCR mode command
  bot.onText(/\/ocr/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      const displayName = msg.from?.first_name || msg.from?.username || 'Pengguna';
      bot.sendMessage(chatId, `Maaf ${displayName} (${userId ?? 'unknown'}) Anda tidak terdaftar untuk menggunakan bot ini.`);
      return;
    }
    
    // Check for OCR access
    if (!hasOcrAccess(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak memiliki akses ke fitur /ocr.');
      return;
    }
    
    // Set user mode to OCR
    setUserMode(userId, 'ocr');
    
    // Ensure OCR directory exists
    const userDir = ensureUserDataDir(userId);
    const ocrDir = path.join(userDir, 'ocr_files');
    fs.ensureDirSync(ocrDir);
    
    // Initialize OCR state with default language (English + Indonesian)
    initUserOcrState(userId);
    
    bot.sendMessage(
      chatId,
      'Anda sekarang dalam mode OCR. Perintah yang tersedia:\n' +
      '- Kirim gambar untuk mengekstrak teks (menggunakan OCR dalam Bahasa Inggris)\n' +
      '- /ocr_clear - Hapus semua file OCR\n\n' +
      'Ketik /menu untuk kembali ke menu utama.'
    );
  });

  // Clear OCR files
  bot.onText(/\/ocr_clear/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    if (!hasOcrAccess(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'ocr') {
      bot.sendMessage(
        chatId,
        'Anda harus berada dalam mode OCR untuk menggunakan perintah ini. Ketik /ocr untuk masuk ke mode OCR.'
      );
      return;
    }
    
    cleanupOcrDirectory(userId);
    bot.sendMessage(chatId, 'Semua file OCR telah dihapus.');
  });

  // Handle photo messages for OCR processing
  bot.on('photo', async (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    if (!hasOcrAccess(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'ocr') {
      return;
    }
    
    try {
      const state = getUserOcrState(userId);
      
      if (state.processingImage) {
        bot.sendMessage(chatId, 'Sedang memproses gambar, mohon tunggu...');
        return;
      }
      
      state.processingImage = true;
      
      const userDir = ensureUserDataDir(userId);
      const ocrDir = path.join(userDir, 'ocr_files');
      fs.ensureDirSync(ocrDir);
      
      // Get highest resolution photo
      const photo = msg.photo![msg.photo!.length - 1];
      const fileId = photo.file_id;
      
      const statusMsg = await bot.sendMessage(chatId, 'Memproses gambar, mohon tunggu...');
      
      // Get file link
      const fileLink = await bot.getFileLink(fileId);
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileName = `image_${timestamp}.jpg`;
      const filePath = path.join(ocrDir, fileName);
      
      // Download image
      await downloadImage(fileLink, filePath);
      
      // Store last image path
      state.lastImagePath = filePath;
      
      // Perform OCR
      const extractedText = await performOcr(filePath);
      
      if (!extractedText || extractedText.trim() === '') {
        await bot.sendMessage(chatId, 'Tidak ada teks yang terdeteksi dalam gambar.');
      } else {
        // Send extracted text
        await bot.sendMessage(
          chatId,
          `📝 *Hasil OCR*:\n\n${extractedText}`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // Update counter
      state.imagesProcessed++;
      state.processingImage = false;
    } catch (error) {
      console.error('Error processing photo for OCR:', error);
      bot.sendMessage(chatId, 'Terjadi kesalahan saat memproses gambar. Silakan coba lagi.');
      
      // Reset processing flag
      const state = getUserOcrState(userId);
      state.processingImage = false;
    }
  });
  
  // Handle document messages for OCR processing
  bot.on('document', async (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    if (!hasOcrAccess(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'ocr') {
      return;
    }
    
    const document = msg.document;
    if (!document) return;
    
    // Check if document is an image
    const mimeType = document.mime_type || '';
    if (!mimeType.startsWith('image/')) {
      bot.sendMessage(chatId, 'Hanya file gambar yang dapat diproses dengan OCR. Silakan kirim file gambar.');
      return;
    }
    
    try {
      const state = getUserOcrState(userId);
      
      if (state.processingImage) {
        bot.sendMessage(chatId, 'Sedang memproses gambar, mohon tunggu...');
        return;
      }
      
      state.processingImage = true;
      
      const userDir = ensureUserDataDir(userId);
      const ocrDir = path.join(userDir, 'ocr_files');
      fs.ensureDirSync(ocrDir);
      
      const fileId = document.file_id;
      
      const statusMsg = await bot.sendMessage(chatId, 'Memproses dokumen gambar, mohon tunggu...');
      
      // Get file link
      const fileLink = await bot.getFileLink(fileId);
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileName = `document_${timestamp}.jpg`;
      const filePath = path.join(ocrDir, fileName);
      
      // Download image
      await downloadImage(fileLink, filePath);
      
      // Store last image path
      state.lastImagePath = filePath;
      
      // Perform OCR
      const extractedText = await performOcr(filePath);
      
      if (!extractedText || extractedText.trim() === '') {
        await bot.sendMessage(chatId, 'Tidak ada teks yang terdeteksi dalam gambar.');
      } else {
        // Send extracted text
        await bot.sendMessage(
          chatId,
          `📝 *Hasil OCR*:\n\n${extractedText}`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // Update counter
      state.imagesProcessed++;
      state.processingImage = false;
    } catch (error) {
      console.error('Error processing document for OCR:', error);
      bot.sendMessage(chatId, 'Terjadi kesalahan saat memproses dokumen. Silakan coba lagi.');
      
      // Reset processing flag
      const state = getUserOcrState(userId);
      state.processingImage = false;
    }
  });
}; 