import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import ExcelJS from 'exceljs';

interface WorkbookCommandDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasWorkbookAccess?: (userId: number) => boolean;
  getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | 'geotags' | null;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | 'geotags' | null) => void;
  ensureUserDataDir: (userId: number) => string;
}

// User workbook state management
interface UserWorkbookState {
  newFolderPath: string;
  imageCounter: number;
  videoCounter: number;
  downloadFlag: boolean;
  downloadCount: number;
}

// In-memory storage for user workbook states
const userWorkbookStates = new Map<number, UserWorkbookState>();

export const registerWorkbookCommands = (
  bot: TelegramBot,
  deps: WorkbookCommandDependencies
): void => {
  const { isUserRegistered, hasWorkbookAccess, getUserMode, setUserMode, ensureUserDataDir } = deps;

  // Helper function to initialize or reset user workbook state
  const initUserWorkbookState = (userId: number): UserWorkbookState => {
    const state: UserWorkbookState = {
      newFolderPath: "",
      imageCounter: 1,
      videoCounter: 1,
      downloadFlag: false,
      downloadCount: 0
    };
    userWorkbookStates.set(userId, state);
    return state;
  };

  // Helper function to get user workbook state
  const getUserWorkbookState = (userId: number): UserWorkbookState => {
    let state = userWorkbookStates.get(userId);
    if (!state) {
      state = initUserWorkbookState(userId);
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

  // Function to get folder size
  const getFolderSize = (folderPath: string): number => {
    let totalSize = 0;
    const files = fs.readdirSync(folderPath);
    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        totalSize += getFolderSize(filePath); // Recursive for sub-folders
      } else {
        totalSize += fs.statSync(filePath).size;
      }
    });
    return totalSize;
  };

  // Function to clear media folder for a user
  const clearMediaFolder = (userId: number): void => {
    const userDir = ensureUserDataDir(userId);
    const mediaFolderPath = path.join(userDir, 'workbook_media');
    
    if (fs.existsSync(mediaFolderPath)) {
      fs.readdirSync(mediaFolderPath).forEach(file => {
        const filePath = path.join(mediaFolderPath, file);
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      });
    }
  };

  // Main workbook mode command
  bot.onText(/\/workbook/, (msg) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      const displayName = msg.from?.first_name || msg.from?.username || 'Pengguna';
      bot.sendMessage(msg.chat.id, `Maaf ${displayName} (${userId ?? 'unknown'}) Anda tidak terdaftar untuk menggunakan bot ini.`);
      return;
    }
    
    // Check for workbook access if the function is provided
    if (hasWorkbookAccess && !hasWorkbookAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur /workbook.');
      return;
    }
    
    // Set user mode to workbook
    setUserMode(userId, 'workbook');
    
    // Ensure user media directory exists
    const userDir = ensureUserDataDir(userId);
    const mediaFolderPath = path.join(userDir, 'workbook_media');
    fs.ensureDirSync(mediaFolderPath);
    
    // Initialize workbook state
    initUserWorkbookState(userId);
    
    bot.sendMessage(
      msg.chat.id,
      'Anda sekarang dalam mode Workbook. Perintah yang tersedia:\n' +
      '- Ketik nama sheet (contoh: "sheet1") untuk membuat sheet baru\n' +
      '- Kirim foto untuk disimpan ke sheet yang aktif\n' +
      '- Ketik "send" untuk menghasilkan file Excel dengan semua gambar\n' +
      '- Ketik "cek" untuk melihat daftar sheet yang telah dibuat\n' +
      '- Ketik "clear" untuk menghapus semua sheet\n\n' +
      'Ketik /menu untuk kembali ke menu utama.'
    );
  });

  // Process messages in workbook mode
  bot.on('message', async (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'workbook') {
      return;
    }
    
    try {
      const userDir = ensureUserDataDir(userId);
      const mediaFolderPath = path.join(userDir, 'workbook_media');
      const state = getUserWorkbookState(userId);
      
      // Handle "clear" command
      if (msg.text && msg.text.toLowerCase() === 'clear') {
        clearMediaFolder(userId);
        bot.sendMessage(chatId, "Semua sheet telah dihapus.");
        state.downloadCount = 0;
        state.newFolderPath = "";
        return;
      }
      
      // Handle "cek" command to check available sheets
      if (msg.text && msg.text.toLowerCase() === 'cek') {
        if (!fs.existsSync(mediaFolderPath)) {
          bot.sendMessage(chatId, "Belum ada sheet yang dibuat.");
          return;
        }
        
        const folders = fs.readdirSync(mediaFolderPath)
          .filter(file => fs.lstatSync(path.join(mediaFolderPath, file)).isDirectory());
        
        if (folders.length === 0) {
          bot.sendMessage(chatId, "Belum ada sheet yang dibuat.");
          return;
        }
        
        let folderList = '';
        let totalSizeInBytes = 0;
        
        for (const folder of folders) {
          const folderPath = path.join(mediaFolderPath, folder);
          const folderSizeInBytes = getFolderSize(folderPath);
          totalSizeInBytes += folderSizeInBytes;
          const folderSizeInMegabytes = folderSizeInBytes / (1024*1024);
          folderList += `${folder} (Ukuran: ${folderSizeInMegabytes.toFixed(2)} MB)\n`;
        }
        
        const totalSizeInMegabytes = totalSizeInBytes / (1024*1024);
        bot.sendMessage(
          chatId, 
          `Berikut adalah daftar sheet yang telah dibuat:\n${folderList}\nTotal Ukuran: ${totalSizeInMegabytes.toFixed(2)} MB`
        );
        return;
      }
      
      // Handle "send" command to generate Excel file
      if (msg.text && msg.text.toLowerCase() === 'send') {
        if (!fs.existsSync(mediaFolderPath)) {
          bot.sendMessage(chatId, "Tidak ada sheet yang tersedia. Silakan buat sheet terlebih dahulu.");
          return;
        }
        
        const folders = fs.readdirSync(mediaFolderPath)
          .filter(folder => fs.lstatSync(path.join(mediaFolderPath, folder)).isDirectory());
        
        if (folders.length === 0) {
          bot.sendMessage(chatId, "Tidak ada sheet yang tersedia. Silakan buat sheet terlebih dahulu.");
          return;
        }
        
        const statusMsg = await bot.sendMessage(chatId, "Membuat file Excel...");
        
        const workbook = new ExcelJS.Workbook();
        
        for (const folder of folders) {
          // Create a new worksheet with folder name
          const ws = workbook.addWorksheet(folder);
          
          // Get all images in the folder
          const folderPath = path.join(mediaFolderPath, folder);
          const imageFiles = fs.readdirSync(folderPath)
            .filter(file => file.endsWith('.jpg'))
            .sort((a, b) => {
              // Extract timestamps from filenames
              const timeA = parseInt(a.split('_')[1]);
              const timeB = parseInt(b.split('_')[1]);
              return timeA - timeB;
            });
          
          for (let i = 0; i < imageFiles.length; i++) {
            const imageFile = imageFiles[i];
            const imagePath = path.join(folderPath, imageFile);
            const image = fs.readFileSync(imagePath);
            
            // Add image to workbook
            const imageId = workbook.addImage({
              buffer: image,
              extension: 'jpeg',
            });
            
            // Set image location in worksheet
            const col = String.fromCharCode(65 + ((i % 5) * 2));
            const row = Math.floor(i / 5) * 7 + 1;
            
            // Set cell size for image
            ws.getColumn(col).width = 17;  // Column width
            ws.getRow(row).height = 40;    // Row height
            
            // Set width for next column (spacing)
            const nextCol = String.fromCharCode(col.charCodeAt(0) + 1);
            ws.getColumn(nextCol).width = 1;
            
            // Add image to worksheet
            ws.addImage(imageId, `${col}${row}:${col}${row + 5}`);
          }
        }
        
        // Save workbook as Excel file
        const excelFilePath = path.join(mediaFolderPath, 'ImageAllSheet.xlsx');
        await workbook.xlsx.writeFile(excelFilePath);
        
        // Get file size in MB
        const fileSizeInBytes = fs.statSync(excelFilePath).size;
        const fileSizeInMegabytes = fileSizeInBytes / (1024*1024);
        
        // Check if file size exceeds 50MB
        if (fileSizeInMegabytes > 50) {
          bot.sendMessage(chatId, "Maaf, ukuran file melebihi 50MB dan tidak bisa dikirim.");
        } else {
          // Send Excel file
          await bot.sendDocument(chatId, excelFilePath);
          bot.sendMessage(chatId, `File Excel berhasil dibuat dengan ukuran ${fileSizeInMegabytes.toFixed(2)} MB.`);
        }
        
        return;
      }
      
      // Handle sheet name creation
      if (msg.text && msg.text !== "clear" && msg.text !== "send" && msg.text !== "cek" && !msg.text.startsWith('/')) {
        const newFolderName = msg.text;
        state.newFolderPath = path.join(mediaFolderPath, newFolderName);
        
        // Create folder if it doesn't exist
        if (!fs.existsSync(state.newFolderPath)) {
          fs.mkdirSync(state.newFolderPath);
        }
        
        state.imageCounter = 1;
        state.videoCounter = 1;
        state.downloadCount = 0;
        
        bot.sendMessage(
          chatId, 
          `Sheet dengan nama ${newFolderName} telah dibuat. Anda sekarang bisa mengirim foto.`
        );
        return;
      }
      
      // Check if sheet is selected
      if (state.newFolderPath === "") {
        if (msg.photo) {
          bot.sendMessage(chatId, "Silakan ketik nama sheet (contoh: 'sheet1') untuk membuat sheet baru terlebih dahulu.");
        }
        return;
      }
      
      // Process photo
      if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileURI = await bot.getFileLink(fileId);
        
        const timestamp = new Date().getTime();
        const fileName = `image_${timestamp}.jpg`;
        const downloadPath = path.join(state.newFolderPath, fileName);
        
        try {
          await downloadImage(fileURI, downloadPath);
          state.imageCounter++;
          state.downloadFlag = true;
          state.downloadCount++;
          
          bot.sendMessage(chatId, `Foto ke-${state.downloadCount} berhasil disimpan ke sheet "${path.basename(state.newFolderPath)}".`);
        } catch (downloadError) {
          console.error('Error downloading image:', downloadError);
          bot.sendMessage(chatId, "Terjadi kesalahan saat mengunduh foto. Silakan coba lagi.");
        }
        return;
      }
      
      // Handle other unsupported media types
      if (msg.video || msg.document || msg.location || msg.sticker || msg.audio || msg.voice || msg.contact || msg.poll) {
        bot.sendMessage(chatId, "Maaf, hanya foto yang dapat diproses dalam mode Workbook.");
        return;
      }
      
    } catch (error) {
      console.error('An error occurred:', error);
      bot.sendMessage(chatId, "Maaf, terjadi kesalahan. Silakan coba lagi atau hubungi admin.");
    }
  });
}; 