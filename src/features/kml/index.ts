import TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs-extra';
import * as path from 'path';

interface KmlCommandDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasKmlAccess: (userId: number) => boolean;
  getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null) => void;
  ensureUserDataDir: (userId: number) => string;
}

// --- Tipe Data ---
interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface NamedPoint extends GeoPoint {
  name: string;
  timestamp: number;
}

interface LineTrack {
  name: string;
  coordinates: GeoPoint[];
  timestamp: number;
}

// Struktur data untuk setiap pengguna
interface UserKmlData {
  placemarks: NamedPoint[];
  lines: LineTrack[];
  activeLine?: {
    name: string;
    points: GeoPoint[];
  } | null;
  persistentPointName?: string | null;
}

// In-memory storage untuk nama titik berikutnya
const nextPointNameMap = new Map<number, string>();

// In-memory storage untuk data KML pengguna
const userKmlDataMap = new Map<number, UserKmlData>();

export const registerKmlCommands = (
  bot: TelegramBot,
  deps: KmlCommandDependencies
): void => {
  const { isUserRegistered, hasKmlAccess, getUserMode, setUserMode, ensureUserDataDir } = deps;

  // --- Fungsi Utilitas Penyimpanan ---
  const defaultUserKmlData = (): UserKmlData => ({
    placemarks: [],
    lines: [],
    activeLine: null,
    persistentPointName: null,
  });

  // Fungsi untuk memuat data KML pengguna dari penyimpanan
  const loadUserKmlData = (userId: number): UserKmlData => {
    // Cek jika sudah ada di memory
    if (userKmlDataMap.has(userId)) {
      return userKmlDataMap.get(userId) as UserKmlData;
    }

    const userDir = ensureUserDataDir(userId);
    const storagePath = path.join(userDir, 'kml_data.json');

    if (!fs.existsSync(storagePath)) {
      const defaultData = defaultUserKmlData();
      userKmlDataMap.set(userId, defaultData);
      return defaultData;
    }

    try {
      const data = fs.readFileSync(storagePath, 'utf-8');
      const userData: UserKmlData = JSON.parse(data);
      
      // Pastikan semua field ada dengan menggabungkan dengan default data
      const completeUserData = { ...defaultUserKmlData(), ...userData };
      userKmlDataMap.set(userId, completeUserData);
      
      return completeUserData;
    } catch (error) {
      console.error("Error reading or parsing KML storage file:", error);
      
      // Backup file yang rusak jika ada
      const backupPath = path.join(userDir, `kml_data_backup_${Date.now()}.json`);
      if (fs.existsSync(storagePath)) {
        try {
          fs.copyFileSync(storagePath, backupPath);
          console.log(`KML data backup created at ${backupPath}`);
        } catch (backupError) {
          console.error("Failed to create backup of corrupted KML storage:", backupError);
        }
      }
      
      const defaultData = defaultUserKmlData();
      userKmlDataMap.set(userId, defaultData);
      return defaultData;
    }
  };

  // Fungsi untuk menyimpan data KML pengguna
  const saveUserKmlData = (userId: number, kmlData: UserKmlData): void => {
    // Update di memory
    userKmlDataMap.set(userId, kmlData);
    
    // Simpan ke disk
    const userDir = ensureUserDataDir(userId);
    const storagePath = path.join(userDir, 'kml_data.json');
    
    try {
      fs.writeFileSync(storagePath, JSON.stringify(kmlData, null, 2));
    } catch (error) {
      console.error(`Error saving KML data for user ${userId}:`, error);
    }
  };

  // Fungsi untuk escape karakter XML
  const escapeXml = (unsafe: string | undefined | null): string => {
    if (typeof unsafe !== 'string') {
      return '';
    }
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  // Fungsi untuk membuat konten KML
  const createKmlContent = (userData: UserKmlData, docName: string = 'Data KML Pengguna'): string => {
    let kmlPlacemarks = '';
    
    // Tambahkan titik-titik individu
    userData.placemarks.forEach((point) => {
      kmlPlacemarks += `
    <Placemark>
      <name>${escapeXml(point.name)}</name>
      <Point>
        <coordinates>${point.longitude},${point.latitude},0</coordinates>
      </Point>
    </Placemark>`;
    });
    
    // Tambahkan garis-garis yang sudah disimpan
    userData.lines.forEach((line) => {
      if (line.coordinates.length < 2) return;
      let coordsString = '';
      line.coordinates.forEach(coord => {
        coordsString += `${coord.longitude},${coord.latitude},0\n`;
      });
      
      kmlPlacemarks += `
    <Placemark>
      <name>${escapeXml(line.name)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordsString.trim()}</coordinates>
      </LineString>
    </Placemark>`;
    });
    
    // Tambahkan garis yang sedang dibuat (jika ada dan memiliki cukup titik)
    if (userData.activeLine && userData.activeLine.points.length >= 2) {
      let activeCoordsString = '';
      userData.activeLine.points.forEach(coord => {
        activeCoordsString += `${coord.longitude},${coord.latitude},0\n`;
      });
      
      kmlPlacemarks += `
    <Placemark>
      <name>${escapeXml(userData.activeLine.name)} (Sedang dibuat)</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${activeCoordsString.trim()}</coordinates>
      </LineString>
    </Placemark>`;
    }
    
    // Buat dokumen KML lengkap
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(docName)}</name>${kmlPlacemarks}
  </Document>
</kml>`;
  };

  // KML mode command
  bot.onText(/\/kml/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasKmlAccess(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak memiliki akses ke fitur /kml.');
      return;
    }
    
    // Set user mode to kml
    setUserMode(userId, 'kml');
    
    // Ensure KML directories exist
    const userDir = ensureUserDataDir(userId);
    fs.ensureDirSync(path.join(userDir, 'kml_output'));
    
    // Initialize KML data for the user if not exists
    loadUserKmlData(userId);
    
    bot.sendMessage(
      chatId,
      'Anda sekarang dalam mode KML. Perintah yang tersedia:\n\n' +
      '📍 *Titik Individual:*\n' +
      '• Kirim *Lokasi* (via attachment) - Menambahkan titik.\n' +
      '• `/add <lat> <lon> [nama_titik]` - Menambahkan titik via teks.\n' +
      '• `/addpoint <nama_titik>` - Menetapkan nama untuk *satu* titik berikutnya.\n' +
      '• `/alwayspoint [nama_titik]` - Menetapkan nama default tetap untuk titik individual. Kosongkan nama untuk menghapus.\n\n' +
      '〰️ *Garis/Jalur:*\n' +
      '• `/startline [nama_garis_opsional]` - Memulai pembuatan garis.\n' +
      '• `/endline` - Menyimpan garis aktif.\n' +
      '• `/cancelline` - Membatalkan garis aktif.\n\n' +
      '💾 *Data & KML:*\n' +
      '• `/mydata` - Menampilkan semua data tersimpan.\n' +
      '• `/createkml` - Membuat file KML.\n' +
      '• `/cleardata` - Menghapus SEMUA data Anda.\n\n' +
      'Ketik /menu untuk kembali ke menu utama.',
      { parse_mode: 'Markdown' }
    );
  });

  // Perintah /help untuk KML
  bot.onText(/\/help/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    bot.sendMessage(
      chatId,
      "📜 *Perintah yang Tersedia dalam Mode KML:*\n\n" +
      "📍 *Titik Individual:*\n" +
      "• Kirim *Lokasi* (via attachment) - Menambahkan titik.\n" +
      "• `/add <lat> <lon> [nama_titik]` - Menambahkan titik via teks (prioritas nama tertinggi).\n" +
      "• `/addpoint <nama_titik>` - Menetapkan nama untuk *satu* titik berikutnya (prioritas nama kedua).\n" +
      "• `/alwayspoint [nama_titik]` - Menetapkan nama default tetap untuk titik individual (prioritas nama ketiga). Kosongkan nama untuk menghapus.\n\n" +
      "〰️ *Garis/Jalur:*\n" +
      "• `/startline [nama_garis_opsional]` - Memulai pembuatan garis.\n" +
      "• `/endline` - Menyimpan garis aktif.\n" +
      "• `/cancelline` - Membatalkan garis aktif.\n\n" +
      "💾 *Data & KML:*\n" +
      "• `/mydata` - Menampilkan semua data tersimpan (termasuk status alwayspoint).\n" +
      "• `/createkml` - Membuat file KML.\n" +
      "• `/cleardata` - Menghapus SEMUA data Anda.",
      { parse_mode: "Markdown" }
    );
  });

  // PERINTAH /alwayspoint [nama_titik_opsional]
  bot.onText(/^\/alwayspoint\s*(.*)$/, (msg, match) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    const persistentNameInput = match ? match[1].trim() : '';
    const userData = loadUserKmlData(userId);

    if (persistentNameInput) {
      userData.persistentPointName = persistentNameInput;
      saveUserKmlData(userId, userData);
      bot.sendMessage(chatId, `✅ Nama default tetap untuk titik individual sekarang adalah: "${escapeXml(persistentNameInput)}".`);
    } else {
      const oldName = userData.persistentPointName;
      userData.persistentPointName = null;
      saveUserKmlData(userId, userData);
      if (oldName) {
        bot.sendMessage(chatId, `🗑️ Nama default tetap ("${escapeXml(oldName)}") telah dihapus.`);
      } else {
        bot.sendMessage(chatId, `ℹ️ Tidak ada nama default tetap yang aktif untuk dihapus.`);
      }
    }
  });

  // Perintah /addpoint <nama>
  bot.onText(/\/addpoint (.+)/, (msg, match) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    const pointName = match ? match[1].trim() : null;
    if (pointName) {
      nextPointNameMap.set(chatId, pointName);
      bot.sendMessage(chatId, `📝 Nama "${escapeXml(pointName)}" akan digunakan untuk *titik individual berikutnya* (jika tidak ada garis aktif & tidak ada nama di /add).`);
    } else {
      bot.sendMessage(chatId, "Gunakan format: /addpoint <nama_titik>");
    }
  });

  // Menerima pesan Lokasi (Attachment)
  bot.on('location', (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    if (!msg.location) {
      console.error(`[User ${userId}] No location data in location message`);
      return;
    }

    try {
      const { latitude, longitude } = msg.location;
      console.log(`[User ${userId}] KML: Received location - Lat: ${latitude}, Lon: ${longitude}`);
      
      const userData = loadUserKmlData(userId);

      if (userData.activeLine) {
        console.log(`[User ${userId}] Adding point to active line: "${userData.activeLine.name}"`);
        
        if (!Array.isArray(userData.activeLine.points)) {
          console.error(`[User ${userId}] CRITICAL: userData.activeLine.points is not an array! Correcting.`);
          userData.activeLine.points = [];
        }
        
        userData.activeLine.points.push({ latitude, longitude });
        saveUserKmlData(userId, userData);
        
        const messageText = `↪️ Titik (Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}) ditambahkan ke garis "${escapeXml(userData.activeLine.name)}". Total ${userData.activeLine.points.length} titik.`;
        bot.sendMessage(chatId, messageText);
      } else {
        let pointName: string;
        const pointNameFromMap = nextPointNameMap.get(chatId);

        if (pointNameFromMap) {
          pointName = pointNameFromMap;
          console.log(`[User ${userId}] Using name from /addpoint: "${pointName}"`);
          nextPointNameMap.delete(chatId);
        } else if (userData.persistentPointName) {
          pointName = userData.persistentPointName;
          console.log(`[User ${userId}] Using name from /alwayspoint: "${pointName}"`);
        } else {
          pointName = `Titik Terlampir ${userData.placemarks.length + 1}`;
          console.log(`[User ${userId}] Using default name: "${pointName}"`);
        }
        
        if (!Array.isArray(userData.placemarks)) {
          console.error(`[User ${userId}] CRITICAL: userData.placemarks is not an array! Correcting.`);
          userData.placemarks = [];
        }
        
        userData.placemarks.push({ 
          latitude, 
          longitude, 
          name: pointName, 
          timestamp: Date.now() 
        });
        
        saveUserKmlData(userId, userData);
        
        const messageText = `📍 Lokasi individual "${escapeXml(pointName)}" (Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}) telah disimpan!`;
        bot.sendMessage(chatId, messageText);
      }
    } catch (error: any) {
      console.error(`[User ${userId}] KML location handler error:`, error.message, error.stack);
      bot.sendMessage(chatId, "Maaf, terjadi kesalahan saat memproses lokasi Anda.");
    }
  });

  // Perintah /add <latitude> <longitude> [nama_titik]
  bot.onText(/^\/add\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*(.*)$/, (msg, match) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    if (!match) return;

    try {
      const latStr = match[1];
      const lonStr = match[2];
      const nameInput = match[3] ? match[3].trim() : '';

      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lonStr);

      if (isNaN(latitude) || isNaN(longitude) || 
          latitude < -90 || latitude > 90 || 
          longitude < -180 || longitude > 180) {
        bot.sendMessage(chatId, "Koordinat tidak valid atau di luar jangkauan.");
        return;
      }
      
      console.log(`[User ${userId}] KML: add command - Lat: ${latitude}, Lon: ${longitude}, Name: "${nameInput}"`);
      
      const userData = loadUserKmlData(userId);

      if (userData.activeLine) {
        if (!Array.isArray(userData.activeLine.points)) {
          console.error(`[User ${userId}] CRITICAL: userData.activeLine.points is not an array! Correcting.`);
          userData.activeLine.points = [];
        }
        
        userData.activeLine.points.push({ latitude, longitude });
        saveUserKmlData(userId, userData);
        
        let messageText = `↪️ Titik (Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}) via teks ditambahkan ke garis "${escapeXml(userData.activeLine.name)}". Total ${userData.activeLine.points.length} titik.`;
        
        if (nameInput) {
          messageText += ` (Nama "${escapeXml(nameInput)}" dari perintah /add diabaikan).`;
        }
        
        bot.sendMessage(chatId, messageText);
      } else {
        let finalPointName: string;
        
        if (nameInput) {
          finalPointName = nameInput;
          console.log(`[User ${userId}] /add: Using name from command input: "${finalPointName}"`);
        } else {
          const pointNameFromMap = nextPointNameMap.get(chatId);
          
          if (pointNameFromMap) {
            finalPointName = pointNameFromMap;
            console.log(`[User ${userId}] /add: Using name from /addpoint: "${finalPointName}"`);
            nextPointNameMap.delete(chatId);
          } else if (userData.persistentPointName) {
            finalPointName = userData.persistentPointName;
            console.log(`[User ${userId}] /add: Using name from /alwayspoint: "${finalPointName}"`);
          } else {
            finalPointName = `Koordinat Manual ${userData.placemarks.length + 1}`;
            console.log(`[User ${userId}] /add: Using default name: "${finalPointName}"`);
          }
        }
        
        if (!Array.isArray(userData.placemarks)) {
          console.error(`[User ${userId}] CRITICAL: userData.placemarks is not an array! Correcting.`);
          userData.placemarks = [];
        }
        
        userData.placemarks.push({ 
          latitude, 
          longitude, 
          name: finalPointName, 
          timestamp: Date.now() 
        });
        
        saveUserKmlData(userId, userData);
        
        const messageText = `📍 Titik individual "${escapeXml(finalPointName)}" (Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}) via teks telah disimpan!`;
        bot.sendMessage(chatId, messageText);
      }
    } catch (error: any) {
      console.error(`[User ${userId}] KML /add handler error:`, error.message, error.stack);
      bot.sendMessage(chatId, "Maaf, terjadi kesalahan saat memproses perintah /add Anda.");
    }
  });

  // Perintah pembuatan garis/jalur
  
  // Perintah /startline [nama_garis_opsional]
  bot.onText(/^\/startline\s*(.*)$/, (msg, match) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    const lineNameInput = match ? match[1].trim() : '';
    const userData = loadUserKmlData(userId);
    
    if (userData.activeLine) {
      bot.sendMessage(chatId, `⚠️ Anda sudah sedang membuat garis "${escapeXml(userData.activeLine.name)}". Selesaikan atau batalkan dulu dengan /endline atau /cancelline.`);
      return;
    }
    
    const lineName = lineNameInput || `Garis ${userData.lines.length + 1}`;
    userData.activeLine = { name: lineName, points: [] };
    saveUserKmlData(userId, userData);
    
    bot.sendMessage(chatId, `🏁 Memulai garis baru: "${escapeXml(lineName)}". Kirimkan lokasi (attachment atau via /add) untuk menambahkan titik. Gunakan /endline untuk menyimpan atau /cancelline untuk batal.`);
  });

  // Perintah /endline
  bot.onText(/\/endline/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    const userData = loadUserKmlData(userId);
    
    if (!userData.activeLine) {
      bot.sendMessage(chatId, "Tidak ada garis yang sedang aktif dibuat. Mulai dengan /startline.");
      return;
    }
    
    if (userData.activeLine.points.length < 2) {
      bot.sendMessage(chatId, `⚠️ Garis "${escapeXml(userData.activeLine.name)}" memiliki ${userData.activeLine.points.length} titik. Minimal 2 titik diperlukan. Tambahkan titik lagi atau gunakan /cancelline.`);
      return;
    }
    
    const finishedLine: LineTrack = {
      name: userData.activeLine.name,
      coordinates: userData.activeLine.points,
      timestamp: Date.now(),
    };
    
    if (!Array.isArray(userData.lines)) {
      userData.lines = [];
    }
    
    userData.lines.push(finishedLine);
    const savedLineName = userData.activeLine.name;
    userData.activeLine = null;
    saveUserKmlData(userId, userData);
    
    bot.sendMessage(chatId, `✅ Garis "${escapeXml(savedLineName)}" dengan ${finishedLine.coordinates.length} titik berhasil disimpan!`);
  });

  // Perintah /cancelline
  bot.onText(/\/cancelline/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    const userData = loadUserKmlData(userId);
    
    if (!userData.activeLine) {
      bot.sendMessage(chatId, "Tidak ada garis yang sedang aktif untuk dibatalkan.");
      return;
    }
    
    const cancelledLineName = userData.activeLine.name;
    userData.activeLine = null;
    saveUserKmlData(userId, userData);
    
    bot.sendMessage(chatId, `❌ Pembuatan garis "${escapeXml(cancelledLineName)}" telah dibatalkan.`);
  });

  // Perintah /mydata
  bot.onText(/\/mydata/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    const userData = loadUserKmlData(userId);
    let response = "📜 *Data KML Tersimpan Anda:*\n\n";
    let hasData = false;

    if (userData.persistentPointName) {
      response += `📌 Nama default tetap aktif: "*${escapeXml(userData.persistentPointName)}*"\n   (Gunakan \`/alwayspoint\` tanpa nama untuk menghapus)\n\n`;
      hasData = true;
    }

    if (userData.placemarks && userData.placemarks.length > 0) {
      hasData = true;
      response += "📍 *Titik Individual:*\n";
      userData.placemarks.forEach((point, index) => {
        response += `${index + 1}. ${escapeXml(point.name)} (Lat: ${point.latitude.toFixed(4)}, Lon: ${point.longitude.toFixed(4)})\n`;
      });
      response += "\n";
    }

    if (userData.lines && userData.lines.length > 0) {
      hasData = true;
      response += "〰️ *Garis/Jalur Tersimpan:*\n";
      userData.lines.forEach((line, index) => {
        response += `${index + 1}. ${escapeXml(line.name)} (${line.coordinates.length} titik)\n`;
      });
      response += "\n";
    }

    if (userData.activeLine) {
      hasData = true;
      response += `🚧 *Garis Sedang Dibuat:*\n`;
      response += `• ${escapeXml(userData.activeLine.name)} (${userData.activeLine.points.length} titik ditambahkan)\n\n`;
    }

    if (!hasData) {
      response += "Anda belum menyimpan data apapun atau mengatur nama default tetap.";
    }
    
    bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
  });

  // Perintah /createkml [nama_dokumen_opsional]
  bot.onText(/^\/createkml\s*(.*)$/, async (msg, match) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    // Ambil nama dokumen KML dari input, jika ada
    const kmlDocNameInput = match ? match[1].trim() : ''; 
    console.log(`[User ${userId}] KML: createkml command with document name: "${kmlDocNameInput}"`);

    const userData = loadUserKmlData(userId);
    const userFirstName = msg.from?.first_name || msg.from?.username || 'Pengguna';

    const hasPlacemarks = userData.placemarks && userData.placemarks.length > 0;
    const hasLines = userData.lines && userData.lines.length > 0;
    const hasActiveValidLine = userData.activeLine && userData.activeLine.points.length >= 2;

    if (!hasPlacemarks && !hasLines && !hasActiveValidLine) {
      bot.sendMessage(chatId, "Anda belum menyimpan data (titik atau garis yang valid) untuk dibuat KML.");
      return;
    }

    // Tentukan nama dokumen KML final
    const finalDocName = kmlDocNameInput || `KML Data - ${userFirstName}`;
    console.log(`[User ${userId}] Using KML document name: "${finalDocName}"`);

    const kmlContent = createKmlContent(userData, finalDocName);

    const userDir = ensureUserDataDir(userId);
    const kmlOutputDir = path.join(userDir, 'kml_output');
    fs.ensureDirSync(kmlOutputDir);
    
    const fileName = `kml_output_${Date.now()}.kml`;
    const filePath = path.join(kmlOutputDir, fileName);

    try {
      fs.writeFileSync(filePath, kmlContent);
      await bot.sendDocument(chatId, filePath, {
        caption: `Berikut adalah file KML Anda dengan nama dokumen "${escapeXml(finalDocName)}", ${userFirstName}.`
      });
      
      // Optional: Hapus file setelah dikirim untuk menghemat ruang
      fs.unlinkSync(filePath);
    } catch (error: any) {
      console.error(`[User ${userId}] Error creating or sending KML:`, error.message, error.stack);
      bot.sendMessage(chatId, "Maaf, terjadi kesalahan saat membuat atau mengirim file KML.");
    }
  });

  // Perintah /cleardata
  bot.onText(/\/cleardata/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'kml') {
      return;
    }
    
    saveUserKmlData(userId, defaultUserKmlData());
    nextPointNameMap.delete(chatId);
    
    bot.sendMessage(chatId, "🗑️ Semua data KML Anda (titik, garis, sesi garis aktif, dan nama default tetap) telah dihapus.");
  });
}; 