import TelegramBot from 'node-telegram-bot-api';
import sharp from 'sharp';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs-extra';

interface GeotagsState {
  pendingPhotoFileId?: string;
  alwaysTagLocation?: TelegramBot.Location;
  isWaitingForStickyLocation?: boolean;
  customDateTime?: Date;
}

interface GeotagsDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasGeotagsAccess: (userId: number) => boolean;
  getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | 'geotags' | null;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | 'geotags' | null) => void;
  ensureUserDataDir: (userId: number) => string;
}

const userStates = new Map<number, GeotagsState>();

function getUserState(chatId: number): GeotagsState {
  if (!userStates.has(chatId)) {
    userStates.set(chatId, {});
  }
  return userStates.get(chatId)!;
}

// Utility functions
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function splitAddressIntoLines(
  address: string,
  maxCharsPerLine: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let remainingAddress = address.trim();

  for (let i = 0; i < maxLines && remainingAddress.length > 0; i++) {
    let currentLine: string;
    if (remainingAddress.length <= maxCharsPerLine) {
      currentLine = remainingAddress;
      remainingAddress = "";
    } else if (i === maxLines - 1) {
      currentLine = remainingAddress.substring(0, maxCharsPerLine - 3) + "...";
      remainingAddress = "";
    } else {
      let breakPoint = -1;
      for (let j = Math.min(remainingAddress.length - 1, maxCharsPerLine); j >= 0; j--) {
        if (remainingAddress[j] === ' ' || remainingAddress[j] === ',') {
          if (j > 0) {
            breakPoint = j;
            break;
          }
        }
      }

      if (breakPoint !== -1) {
        const includeSeparator = (remainingAddress[breakPoint] === ',');
        currentLine = remainingAddress.substring(0, breakPoint + (includeSeparator ? 1 : 0)).trim();
        remainingAddress = remainingAddress.substring(breakPoint + 1).trim();
      } else {
        currentLine = remainingAddress.substring(0, maxCharsPerLine);
        remainingAddress = remainingAddress.substring(maxCharsPerLine).trim();
      }
    }
    lines.push(escapeXml(currentLine));
    if (remainingAddress.length === 0) break;
  }
  return lines;
}

function degreesToDms(lat: number, lon: number): { latDms: string; lonDms: string } {
  const latAbs = Math.abs(lat);
  const latDegrees = Math.floor(latAbs);
  const latMinutes = Math.floor((latAbs - latDegrees) * 60);
  const latSeconds = Math.round(((latAbs - latDegrees) * 60 - latMinutes) * 60);
  const latDirection = lat >= 0 ? 'N' : 'S';
  const lonAbs = Math.abs(lon);
  const lonDegrees = Math.floor(lonAbs);
  const lonMinutes = Math.floor((lonAbs - lonDegrees) * 60);
  const lonSeconds = Math.round(((lonAbs - lonDegrees) * 60 - lonMinutes) * 60);
  const lonDirection = lon >= 0 ? 'E' : 'W';
  return {
    latDms: `${latDegrees}°${latMinutes}'${latSeconds}" ${latDirection}`,
    lonDms: `${lonDegrees}°${lonMinutes}'${lonSeconds}" ${lonDirection}`,
  };
}

async function fetchAddressFromCoordinates(latitude: number, longitude: number): Promise<string> {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=0`;
  try {
    const response = await axios.get(nominatimUrl, {
      headers: { 'User-Agent': 'TelegramGeotagBot/1.0 (Project Pribadi)' },
      timeout: 10000,
    });
    if (response.data && response.data.display_name) {
      return response.data.display_name;
    }
    return "Alamat tidak ditemukan";
  } catch (error) {
    console.error("Error fetching address:", error);
    return "Gagal mengambil alamat";
  }
}

async function fetchMapboxStaticImage(latitude: number, longitude: number): Promise<Buffer> {
  const mapWidth = 200;
  const mapHeight = 200;
  const zoomLevel = 15;
  const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s(${longitude},${latitude})/${longitude},${latitude},${zoomLevel}/${mapWidth}x${mapHeight}?access_token=${process.env.MAPBOX_API_KEY}`;
  
  try {
    const response = await axios.get(mapUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Error fetching map:", error);
    const fallbackSvg = `<svg width="${mapWidth}" height="${mapHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${mapWidth}" height="${mapHeight}" fill="#DDDDDD" /><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="#555555">Map Error</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="10" fill="#777777">(Map fetch failed)</text></svg>`;
    return sharp(Buffer.from(fallbackSvg)).png().toBuffer();
  }
}

async function generateGeotagImage(
  latitude: number,
  longitude: number,
  customDateTime?: Date
): Promise<Buffer> {
  const mapTileBuffer = await fetchMapboxStaticImage(latitude, longitude);
  const mapImage = sharp(mapTileBuffer);
  let mapMetadata = { width: 200, height: 200 };
  try {
    const meta = await mapImage.metadata();
    mapMetadata = { width: meta.width || 200, height: meta.height || 200 };
  } catch (e) {
    console.error("Error getting map metadata:", e);
  }

  const rawAddress = await fetchAddressFromCoordinates(latitude, longitude);
  const now = customDateTime ? new Date(customDateTime) : new Date();
  const dateFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeFormatter = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStrParts = dateFormatter.formatToParts(now);
  const dayName = dateStrParts.find(p => p.type === 'weekday')?.value || '';
  const day = dateStrParts.find(p => p.type === 'day')?.value || '';
  const month = dateStrParts.find(p => p.type === 'month')?.value || '';
  const year = dateStrParts.find(p => p.type === 'year')?.value || '';
  const timeStr = timeFormatter.format(now).replace(/\./g, ':');
  const dateTimeString = `${dayName}, ${day}-${month}-${year} ${timeStr}`;
  const { latDms, lonDms } = degreesToDms(latitude, longitude);

  // Layout settings
  const geotagWidth = 600;
  const mapAreaWidth = mapMetadata.width;
  const mapAreaHeight = mapMetadata.height;
  const textSectionWidth = geotagWidth - mapAreaWidth;
  
  const textPadding = 15;
  const addressFontSize = 10;
  const headerFontSize = 16;
  const coordValFontSize = 16;
  const coordLabelFontSize = 16;
  const datetimeFontSize = 16;
  const lineSpacing = 4;
  const sectionSpacing = 8;

  const addressLines = splitAddressIntoLines(rawAddress, 75, 3);
  
  let accumulatedTextHeight = textPadding;
  if (addressLines.length > 0) {
    accumulatedTextHeight += (addressLines.length * addressFontSize);
    if (addressLines.length > 1) {
      accumulatedTextHeight += ((addressLines.length - 1) * lineSpacing);
    }
  }

  accumulatedTextHeight += sectionSpacing;
  const coordBlockHeight = 
    headerFontSize +
    (lineSpacing + 2) +
    (sectionSpacing / 2) +
    coordValFontSize +
    (lineSpacing + 2) +
    (sectionSpacing / 2) +
    coordValFontSize +
    (lineSpacing + 2);
  accumulatedTextHeight += coordBlockHeight;
  accumulatedTextHeight += sectionSpacing;
  accumulatedTextHeight += datetimeFontSize;
  accumulatedTextHeight += textPadding;

  const calculatedTextHeight = accumulatedTextHeight;
  const geotagHeight = Math.max(mapAreaHeight, calculatedTextHeight);

  let current_y_svg = 0;
  const svgTextElements: string[] = [];

  current_y_svg += textPadding;
  addressLines.forEach((line, index) => {
    current_y_svg += addressFontSize;
    svgTextElements.push(`<text x="${textPadding}" y="${current_y_svg}" class="address">${line}</text>`);
    if (index < addressLines.length - 1) {
      current_y_svg += lineSpacing;
    }
  });

  current_y_svg += sectionSpacing;
  const y_coord_block_start_svg = current_y_svg;

  current_y_svg += headerFontSize;
  const y_coord_headers_svg = current_y_svg;
  svgTextElements.push(`<text x="${textPadding}" y="${y_coord_headers_svg}" class="header">Decimal</text>`);
  svgTextElements.push(`<text x="${textSectionWidth / 2 + textPadding}" y="${y_coord_headers_svg}" class="header">DMS</text>`);

  const y_line_under_headers_svg = y_coord_headers_svg + lineSpacing + 2;
  svgTextElements.push(`<line x1="${textPadding - 5}" y1="${y_line_under_headers_svg}" x2="${textSectionWidth - textPadding + 5}" y2="${y_line_under_headers_svg}" class="line-style"/>`);

  current_y_svg = y_line_under_headers_svg + sectionSpacing / 2;
  current_y_svg += coordValFontSize;
  const y_lat_values_svg = current_y_svg;
  svgTextElements.push(`<text x="${textPadding}" y="${y_lat_values_svg}" class="text"><tspan class="label">Latitude</tspan> <tspan class="value">${escapeXml(latitude.toFixed(6))}</tspan></text>`);
  svgTextElements.push(`<text x="${textSectionWidth / 2 + textPadding}" y="${y_lat_values_svg}" class="text value">${escapeXml(latDms)}</text>`);

  const y_line_between_rows_svg = y_lat_values_svg + lineSpacing + 2;
  svgTextElements.push(`<line x1="${textPadding - 5}" y1="${y_line_between_rows_svg}" x2="${textSectionWidth - textPadding + 5}" y2="${y_line_between_rows_svg}" class="line-style"/>`);

  current_y_svg = y_line_between_rows_svg + sectionSpacing / 2;
  current_y_svg += coordValFontSize;
  const y_lon_values_svg = current_y_svg;
  svgTextElements.push(`<text x="${textPadding}" y="${y_lon_values_svg}" class="text"><tspan class="label">Longitude</tspan> <tspan class="value">${escapeXml(longitude.toFixed(6))}</tspan></text>`);
  svgTextElements.push(`<text x="${textSectionWidth / 2 + textPadding}" y="${y_lon_values_svg}" class="text value">${escapeXml(lonDms)}</text>`);
  
  const y_coord_block_end_svg = y_lon_values_svg + lineSpacing + 2;

  const y_vertical_line_start_svg = y_coord_block_start_svg - (headerFontSize*0.3);
  svgTextElements.push(`<line x1="${textSectionWidth / 2}" y1="${y_vertical_line_start_svg}" x2="${textSectionWidth / 2}" y2="${y_coord_block_end_svg}" class="line-style"/>`);
  
  const actual_y_datetime_for_svg = geotagHeight - textPadding - (datetimeFontSize * 0.2);
  svgTextElements.push(`<text x="${textPadding}" y="${actual_y_datetime_for_svg}" class="datetime">${escapeXml(dateTimeString.toUpperCase())}</text>`);

  const textSvg = `
    <svg width="${textSectionWidth}" height="${geotagHeight}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .text { font-family: Arial, sans-serif; fill: #FFFFFF; }
        .label { font-weight: normal; font-size: ${coordLabelFontSize}px; fill: #FFFFFF;}
        .value { font-weight: bold; font-size: ${coordValFontSize}px; fill: #FFFFFF;}
        .header { font-size: ${headerFontSize}px; font-weight: bold; fill: #FFFFFF; }
        .address { font-size: ${addressFontSize}px; font-weight: bold; fill: #FFFFFF; }
        .datetime { font-size: ${datetimeFontSize}px; fill: #FFFFFF; font-weight: bold;}
        .line-style { stroke: #FFFFFF; stroke-width:0.5; }
      </style>
      ${svgTextElements.join('\n')}
    </svg>
  `;
  const textImageBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

  return sharp({
    create: {
      width: geotagWidth,
      height: geotagHeight,
      channels: 4,
      background: { r: 169, g: 169, b: 169, alpha: 1 },
    },
  })
    .composite([
      { input: mapTileBuffer, gravity: 'northwest', top: Math.floor((geotagHeight - mapAreaHeight) / 2), left: 0 },
      { input: textImageBuffer, gravity: 'northeast', top: 0, left: mapAreaWidth },
    ])
    .png()
    .toBuffer();
}

async function overlayGeotagOnPhoto(photoBuffer: Buffer, geotagBuffer: Buffer): Promise<Buffer> {
  const mainImage = sharp(photoBuffer);
  const mainMetadata = await mainImage.metadata();
  if (!mainMetadata.width) {
    throw new Error("Tidak dapat membaca metadata lebar gambar utama.");
  }
  const resizedGeotagBuffer = await sharp(geotagBuffer).resize({ width: mainMetadata.width }).toBuffer();
  return mainImage.composite([{ input: resizedGeotagBuffer, gravity: 'south' }]).jpeg({ quality: 90 }).toBuffer();
}

async function processPhotoWithGeotag(
  bot: TelegramBot,
  chatId: number,
  photoFileId: string,
  location: TelegramBot.Location,
  customDateTime?: Date
) {
  let processingMessage: TelegramBot.Message | undefined;
  try {
    processingMessage = await bot.sendMessage(chatId, "⏳ Memproses gambar Anda... Mohon tunggu sebentar.");
    const fileStream = bot.getFileStream(photoFileId);
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }
    const photoBuffer = Buffer.concat(chunks);
    const geotagBuffer = await generateGeotagImage(location.latitude, location.longitude, customDateTime);
    const finalImageBuffer = await overlayGeotagOnPhoto(photoBuffer, geotagBuffer);
    await bot.sendPhoto(chatId, finalImageBuffer, { caption: "Berikut foto Anda dengan geotag:" });
    if (processingMessage) {
      bot.deleteMessage(chatId, processingMessage.message_id);
    }
  } catch (error) {
    console.error("Error processing image:", error);
    bot.sendMessage(chatId, "❌ Maaf, terjadi kesalahan saat memproses gambar Anda.");
    if (processingMessage) {
      bot.deleteMessage(chatId, processingMessage.message_id);
    }
  }
}

function customDateParser(dateString: string): Date | null {
  const parts = dateString.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!parts) return null;
  const year = parseInt(parts[1], 10);
  const month = parseInt(parts[2], 10) - 1;
  const day = parseInt(parts[3], 10);
  const hours = parseInt(parts[4], 10);
  const minutes = parseInt(parts[5], 10);
  const date = new Date(year, month, day, hours, minutes);
  if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day &&
      date.getHours() === hours && date.getMinutes() === minutes) {
    return date;
  }
  return null;
}

export function registerGeotagsCommands(
  bot: TelegramBot,
  dependencies: GeotagsDependencies
): void {
  const { isUserRegistered, hasGeotagsAccess, getUserMode, setUserMode } = dependencies;

  // Command: /geotags
  bot.onText(/^\/geotags(?:\s|$)/, (msg) => {
    const userId = msg.from?.id;
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, "Anda tidak terdaftar untuk menggunakan bot ini.");
      return;
    }

    if (!hasGeotagsAccess(userId)) {
      bot.sendMessage(msg.chat.id, "Anda tidak memiliki akses ke fitur Geotags.");
      return;
    }

    setUserMode(userId, 'geotags');
    const helpMessage = `
Selamat datang di Mode Geotags!

📷 *Mode Standar (1 Foto, 1 Lokasi):*
1. Kirim sebuah foto.
2. Segera kirim lokasi Anda menggunakan fitur "Location" Telegram.
   Bot akan otomatis menambahkan geotag ke foto tersebut.

🔁 \`/alwaystag\` - *Mode Lokasi Menempel:*
- Ketik \`/alwaystag\` untuk mengaktifkan atau menonaktifkan mode ini.
- Saat mode ini pertama kali diaktifkan, bot akan meminta Anda mengirimkan satu lokasi.
- Lokasi ini akan digunakan untuk semua foto yang Anda kirim selanjutnya.

⏱️ \`/set_time {YYYY-MM-DD HH:MM}\` - *Atur Waktu Manual:*
- Format: \`YYYY-MM-DD HH:MM\`
- Contoh: \`/set_time 2024-12-25 15:30\`
- Reset: \`/set_time reset\`

Untuk keluar dari mode Geotags, ketik /menu
    `;
    bot.sendMessage(msg.chat.id, helpMessage.trim(), { parse_mode: 'Markdown' });
  });

  // Command: /alwaystag
  bot.onText(/^\/alwaystag(?:\s|$)/, (msg) => {
    const userId = msg.from?.id;
    if (!userId || !isUserRegistered(userId) || !hasGeotagsAccess(userId)) return;

    // Hanya izinkan perintah ini ketika berada dalam mode geotags
    const currentMode = getUserMode(userId);
    if (currentMode !== 'geotags') {
      return;
    }

    const userState = getUserState(msg.chat.id);
    if (userState.alwaysTagLocation) {
      delete userState.alwaysTagLocation;
      delete userState.isWaitingForStickyLocation;
      bot.sendMessage(msg.chat.id, "📍 AlwaysTag mode NONAKTIF. Setiap foto akan memerlukan lokasi baru.");
    } else {
      userState.isWaitingForStickyLocation = true;
      delete userState.alwaysTagLocation;
      bot.sendMessage(msg.chat.id, "📍 AlwaysTag mode AKTIF.\nSilakan kirim lokasi yang ingin Anda gunakan untuk beberapa foto ke depan. Untuk menonaktifkan, ketik /alwaystag lagi.");
    }
  });

  // Command: /set_time
  bot.onText(/^\/set_time(?: (.+))?/, (msg, match) => {
    const userId = msg.from?.id;
    if (!userId || !isUserRegistered(userId) || !hasGeotagsAccess(userId)) return;

    // Hanya izinkan ketika mode geotags aktif
    const currentMode = getUserMode(userId);
    if (currentMode !== 'geotags') {
      return;
    }

    const userState = getUserState(msg.chat.id);
    const arg = match ? match[1] : null;

    if (!arg) {
      bot.sendMessage(msg.chat.id, "Gunakan format: /set_time YYYY-MM-DD HH:MM\nContoh: /set_time 2024-01-20 10:30\nAtau /set_time reset untuk menggunakan waktu saat ini.");
      return;
    }

    if (arg.toLowerCase() === 'reset') {
      delete userState.customDateTime;
      bot.sendMessage(msg.chat.id, "⏱️ Pengaturan waktu manual dihapus. Bot akan menggunakan waktu saat ini.");
    } else {
      const parsedDate = customDateParser(arg);
      if (parsedDate) {
        userState.customDateTime = parsedDate;
        bot.sendMessage(msg.chat.id, `⏱️ Waktu manual diatur ke: ${parsedDate.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}`);
      } else {
        bot.sendMessage(msg.chat.id, "Format tanggal/waktu tidak valid. Gunakan YYYY-MM-DD HH:MM\nContoh: /set_time 2024-01-20 10:30");
      }
    }
  });

  // Handle location messages
  bot.on('location', async (msg) => {
    const userId = msg.from?.id;
    if (!userId || !isUserRegistered(userId) || !hasGeotagsAccess(userId)) return;
    if (!msg.location) return;

    // Jalankan hanya jika user berada di mode geotags
    const currentMode = getUserMode(userId);
    if (currentMode !== 'geotags') return;

    const userState = getUserState(msg.chat.id);
    const receivedLocation = msg.location;

    if (userState.isWaitingForStickyLocation) {
      userState.alwaysTagLocation = receivedLocation;
      delete userState.isWaitingForStickyLocation;
      bot.sendMessage(msg.chat.id, `📍 Lokasi telah diatur untuk mode AlwaysTag: ${receivedLocation.latitude.toFixed(5)}, ${receivedLocation.longitude.toFixed(5)}. Foto berikutnya akan menggunakan lokasi ini.`);
      if (userState.pendingPhotoFileId) {
        const photoFileId = userState.pendingPhotoFileId;
        delete userState.pendingPhotoFileId;
        await processPhotoWithGeotag(bot, msg.chat.id, photoFileId, receivedLocation, userState.customDateTime);
      }
    } else if (userState.alwaysTagLocation) {
      userState.alwaysTagLocation = receivedLocation;
      bot.sendMessage(msg.chat.id, `📍 Lokasi AlwaysTag diperbarui: ${receivedLocation.latitude.toFixed(5)}, ${receivedLocation.longitude.toFixed(5)}.`);
      if (userState.pendingPhotoFileId) {
        const photoFileId = userState.pendingPhotoFileId;
        delete userState.pendingPhotoFileId;
        await processPhotoWithGeotag(bot, msg.chat.id, photoFileId, receivedLocation, userState.customDateTime);
      }
    } else {
      if (userState.pendingPhotoFileId) {
        const photoFileId = userState.pendingPhotoFileId;
        delete userState.pendingPhotoFileId;
        await processPhotoWithGeotag(bot, msg.chat.id, photoFileId, receivedLocation, userState.customDateTime);
      } else {
        bot.sendMessage(msg.chat.id, "📌 Lokasi diterima. Mohon kirim foto terlebih dahulu untuk mode standar atau aktifkan /alwaystag.");
      }
    }
  });

  // Handle photo messages
  bot.on('photo', async (msg) => {
    const userId = msg.from?.id;
    if (!userId || !isUserRegistered(userId) || !hasGeotagsAccess(userId)) return;
    // Jalankan hanya jika user berada di mode geotags
    const currentMode = getUserMode(userId);
    if (currentMode !== 'geotags') return;
    if (!msg.photo || msg.photo.length === 0) {
      bot.sendMessage(msg.chat.id, "Gagal menerima foto.");
      return;
    }

    const photoFileId = msg.photo[msg.photo.length - 1].file_id;
    const userState = getUserState(msg.chat.id);

    if (userState.alwaysTagLocation && !userState.isWaitingForStickyLocation) {
      bot.sendMessage(msg.chat.id, "✔️ Foto diterima. Menggunakan lokasi AlwaysTag...");
      await processPhotoWithGeotag(bot, msg.chat.id, photoFileId, userState.alwaysTagLocation, userState.customDateTime);
    } else {
      userState.pendingPhotoFileId = photoFileId;
      if (userState.isWaitingForStickyLocation) {
        bot.sendMessage(msg.chat.id, "✔️ Foto diterima. Bot sedang menunggu Anda mengirimkan lokasi untuk diatur sebagai default AlwaysTag.");
      } else {
        bot.sendMessage(msg.chat.id, "✔️ Foto diterima! Sekarang, silakan kirim lokasi Anda.");
      }
    }
  });
}