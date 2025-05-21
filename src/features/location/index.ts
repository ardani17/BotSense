import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs-extra';

interface LocationCommandDependencies {
  isUserRegistered: (userId: number) => boolean;
  hasLocationAccess: (userId: number) => boolean;
  getUserMode: (userId: number) => 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null;
  setUserMode: (userId: number, mode: 'menu' | 'location' | 'rar' | 'workbook' | 'ocr' | 'kml' | null) => void;
  ensureUserDataDir: (userId: number) => string;
}

// Interface for tracking user measurement state
interface UserMeasurementState {
  isActive: boolean;
  firstPoint?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  secondPoint?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  timestamp: number;
  transportMode?: 'car' | 'motorcycle' | 'foot';
}

// Simpan koordinat terakhir untuk pengukuran ulang
interface LastMeasurement {
  firstPoint: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  secondPoint: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  timestamp: number;
}

// In-memory storage for user measurement states
const userMeasurementStates = new Map<number, UserMeasurementState>();

// In-memory storage for last measurement coordinates
const lastMeasurements = new Map<number, LastMeasurement>();

// Constants for measurement timeout (10 minutes)
const MEASUREMENT_TIMEOUT_MS = 10 * 60 * 1000;

// Constants for last measurement data retention (30 seconds)
const LAST_MEASUREMENT_RETENTION_MS = 30 * 1000;

// API key untuk OpenRouteService (perlu didaftarkan di https://openrouteservice.org/)
const ORS_API_KEY = process.env.ORS_API_KEY || '';

// Variabel untuk mencegah handler terpicu berulang kali
const processedCommands = new Map<number, Set<number>>();

// Helper function untuk menandai pesan sudah diproses
const markMessageAsProcessed = (userId: number, messageId: number): boolean => {
  if (!processedCommands.has(userId)) {
    processedCommands.set(userId, new Set());
  }
  
  const userProcessed = processedCommands.get(userId);
  if (userProcessed?.has(messageId)) {
    return false; // Pesan sudah diproses
  }
  
  userProcessed?.add(messageId);
  return true; // Pesan belum diproses sebelumnya
};

// Periodic cleanup untuk processedCommands (setiap 5 menit)
setInterval(() => {
  processedCommands.clear();
}, 5 * 60 * 1000);

export const registerLocationCommands = (
  bot: TelegramBot,
  deps: LocationCommandDependencies
): void => {
  const { isUserRegistered, hasLocationAccess, getUserMode, setUserMode, ensureUserDataDir } = deps;

  // Helper function to initialize or reset user measurement state
  const initUserMeasurementState = (userId: number): void => {
    userMeasurementStates.set(userId, {
      isActive: false,
      timestamp: Date.now()
    });
    console.log(`[Measurement] Reset state for user ${userId}`);
  };

  // Helper function to get user measurement state
  const getUserMeasurementState = (userId: number): UserMeasurementState | undefined => {
    return userMeasurementStates.get(userId);
  };

  // Helper function to log measurement state for debugging
  const logMeasurementState = (userId: number, action: string): void => {
    const state = getUserMeasurementState(userId);
    console.log(`[Measurement] ${action} - User: ${userId}, State:`, 
      state ? {
        isActive: state.isActive,
        hasFirstPoint: !!state.firstPoint,
        hasSecondPoint: !!state.secondPoint,
        age: Math.round((Date.now() - state.timestamp) / 1000) + 's'
      } : 'undefined'
    );
  };

  // Helper function to check for and clean up expired measurement states
  const checkAndCleanupMeasurementState = (userId: number): boolean => {
    const state = getUserMeasurementState(userId);
    if (!state) return false;
    
    const now = Date.now();
    const elapsed = now - state.timestamp;
    
    if (state.isActive && elapsed > MEASUREMENT_TIMEOUT_MS) {
      console.log(`[Measurement] Timeout for user ${userId} after ${Math.round(elapsed/1000)}s`);
      initUserMeasurementState(userId);
      return true;
    }
    
    return false;
  };

  // Helper function to calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Helper function to escape markdown properly for MarkdownV2 format
  const escapeMarkdown = (text: string): string => {
    // Escape Markdown special characters for MarkdownV2 format
    // These characters need to be escaped: _*[]()~`>#+-=|{}.!
    return text.replace(/([_*[\]()~`>#+=\-|{}.!])/g, '\\$1');
  };

  // Helper function for getting routes from OpenRouteService API
  const getRoute = async (
    startLat: number, 
    startLon: number, 
    endLat: number, 
    endLon: number, 
    transportMode: string = 'driving-car'
  ): Promise<{ distance: number; duration: number }> => {
    try {
      if (!ORS_API_KEY) {
        console.warn('ORS_API_KEY not configured. Falling back to direct distance calculation.');
        // Fallback to direct distance if API key not available
        const directDistance = calculateDistance(startLat, startLon, endLat, endLon);
        return { distance: directDistance, duration: directDistance / 50 * 3.6 }; // Rough estimation
      }

      // Call OpenRouteService Directions API
      const response = await axios.get('https://api.openrouteservice.org/v2/directions/' + transportMode, {
        params: {
          api_key: ORS_API_KEY,
          start: `${startLon},${startLat}`,
          end: `${endLon},${endLat}`
        },
        headers: {
          'Accept': 'application/geo+json;charset=UTF-8',
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.features && response.data.features.length > 0) {
        const route = response.data.features[0];
        return {
          distance: route.properties.summary.distance, // in meters
          duration: route.properties.summary.duration  // in seconds
        };
      }
      
      throw new Error('No route found');
    } catch (error) {
      console.error('Error fetching route:', error);
      // Fallback to direct distance
      const directDistance = calculateDistance(startLat, startLon, endLat, endLon);
      return { distance: directDistance, duration: directDistance / 50 * 3.6 }; // Rough estimation
    }
  };

  // Function to format duration in a readable way
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)} detik`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)} menit`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours} jam ${minutes} menit`;
    }
  };

  // Helper function to format and send measurement results
  const sendMeasurementResults = async (
    chatId: number,
    userId: number,
    firstPoint: { latitude: number; longitude: number; address?: string },
    secondPoint: { latitude: number; longitude: number; address?: string },
    distance: number,
    duration: number,
    transportMode: 'car' | 'motorcycle' | 'foot'
  ) => {
    try {
      // Store the measurement for possible reuse
      lastMeasurements.set(userId, {
        firstPoint: { ...firstPoint },
        secondPoint: { ...secondPoint },
        timestamp: Date.now()
      });
      
      // Format distance
      let formattedDistance = '';
      if (distance < 1000) {
        formattedDistance = `${Math.round(distance)} meter`;
      } else {
        formattedDistance = `${(distance / 1000).toFixed(2)} kilometer`;
      }
      
      // Format duration
      const formattedDuration = formatDuration(duration);
      
      // Generate OpenStreetMap route URL with appropriate transport mode
      let osmRouteUrl = '';
      if (transportMode === 'car') {
        osmRouteUrl = `https://www.openstreetmap.org/directions?engine=graphhopper_car&route=${firstPoint.latitude}%2C${firstPoint.longitude}%3B${secondPoint.latitude}%2C${secondPoint.longitude}`;
      } else if (transportMode === 'motorcycle') {
        osmRouteUrl = `https://www.openstreetmap.org/directions?engine=graphhopper_car&route=${firstPoint.latitude}%2C${firstPoint.longitude}%3B${secondPoint.latitude}%2C${secondPoint.longitude}`;
      } else {
        osmRouteUrl = `https://www.openstreetmap.org/directions?engine=graphhopper_foot&route=${firstPoint.latitude}%2C${firstPoint.longitude}%3B${secondPoint.latitude}%2C${secondPoint.longitude}`;
      }
      
      // Generate Google Maps URL as fallback
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${firstPoint.latitude},${firstPoint.longitude}&destination=${secondPoint.latitude},${secondPoint.longitude}&travelmode=${transportMode === 'foot' ? 'walking' : 'driving'}`;
      
      // Get human-readable transport mode text
      const transportText = transportMode === 'car' ? 'Mobil' : 
                          transportMode === 'motorcycle' ? 'Sepeda Motor' : 
                          'Pejalan Kaki';
      
      // Use HTML formatting instead of MarkdownV2 to avoid escaping issues
      await bot.sendMessage(
        chatId,
        `📏 <b>Hasil Pengukuran</b> (Mode: ${transportText})\n\n` +
        `<b>Titik Awal:</b>\n${firstPoint.address || 'Lokasi tidak diketahui'}\n(${firstPoint.latitude}, ${firstPoint.longitude})\n\n` +
        `<b>Titik Akhir:</b>\n${secondPoint.address || 'Lokasi tidak diketahui'}\n(${secondPoint.latitude}, ${secondPoint.longitude})\n\n` +
        `<b>Jarak Tempuh:</b> ${formattedDistance}\n` +
        `<b>Waktu Perkiraan:</b> ${formattedDuration}\n\n` +
        `<b>Lihat Rute:</b>\n` +
        `- <a href="${osmRouteUrl}">OpenStreetMap</a>\n` +
        `- <a href="${googleMapsUrl}">Google Maps</a>`,
        { 
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
      
      // Hanya tampilkan pesan alternatif jika bukan hasil dari pengukuran ulang
      // untuk menghindari loop pesan ganda
      const alternateModes: string[] = [];
      if (transportMode !== 'car') alternateModes.push("/ukur_mobil");
      if (transportMode !== 'motorcycle') alternateModes.push("/ukur_motor");
      if (transportMode !== 'foot') alternateModes.push("/ukur");
      
      if (alternateModes.length > 0) {
        // Gunakan setTimeout dengan jeda singkat untuk menghindari race condition
        setTimeout(() => {
          bot.sendMessage(
            chatId,
            `Anda dapat menggunakan ${alternateModes.join(' atau ')} dengan koordinat yang sama untuk melihat hasil lainnya. Data koordinat akan tersimpan selama 30 detik.`
          );
        }, 500);
      }
      
      // Send map with both points (midpoint)
      const midLat = (firstPoint.latitude + secondPoint.latitude) / 2;
      const midLon = (firstPoint.longitude + secondPoint.longitude) / 2;
      bot.sendLocation(chatId, midLat, midLon);
    } catch (error) {
      console.error('Error sending measurement results:', error);
      bot.sendMessage(
        chatId, 
        'Terjadi kesalahan saat menampilkan hasil pengukuran. Silakan coba lagi.'
      );
    }
  };

  // Helper function to check if last measurement is still valid
  const getLastMeasurement = (userId: number): LastMeasurement | null => {
    const lastMeasurement = lastMeasurements.get(userId);
    if (!lastMeasurement) return null;
    
    const now = Date.now();
    const elapsed = now - lastMeasurement.timestamp;
    
    // If data is too old, delete it and return null
    if (elapsed > LAST_MEASUREMENT_RETENTION_MS) {
      lastMeasurements.delete(userId);
      return null;
    }
    
    return lastMeasurement;
  };

  // Helper function to perform measurement with stored points
  const performStoredMeasurement = async (
    chatId: number, 
    userId: number,
    firstPoint: { latitude: number; longitude: number; address?: string },
    secondPoint: { latitude: number; longitude: number; address?: string },
    transportMode: 'car' | 'motorcycle' | 'foot'
  ) => {
    try {
      // Show that calculation is in progress
      const calculatingMsg = await bot.sendMessage(
        chatId,
        `Menghitung rute ${transportMode === 'car' ? 'mobil' : 
                          transportMode === 'motorcycle' ? 'sepeda motor' : 
                          'pejalan kaki'} dari titik yang sama...`
      );
      
      // Map transport mode to OpenRouteService profile
      let orsProfile = 'driving-car';
      if (transportMode === 'motorcycle') {
        orsProfile = 'driving-car'; // Use car as approximation for motorcycle
      } else if (transportMode === 'foot') {
        orsProfile = 'foot-walking';
      }
      
      // Get route information
      const routeInfo = await getRoute(
        firstPoint.latitude,
        firstPoint.longitude,
        secondPoint.latitude,
        secondPoint.longitude,
        orsProfile
      );
      
      // Send measurement results
      await sendMeasurementResults(
        chatId,
        userId,
        firstPoint,
        secondPoint,
        routeInfo.distance,
        routeInfo.duration,
        transportMode
      );
    } catch (error) {
      console.error('Error performing stored measurement:', error);
      bot.sendMessage(
        chatId, 
        'Terjadi kesalahan saat menghitung ulang rute. Silakan coba kembali dengan /ukur.'
      );
    }
  };

  // Main location mode command
  bot.onText(/\/lokasi/, (msg) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur /lokasi.');
      return;
    }
    
    // Set user mode to location
    setUserMode(userId, 'location');
    
    // Ensure location cache directory exists
    const userDir = ensureUserDataDir(userId);
    fs.ensureDirSync(path.join(userDir, 'lokasi_cache'));
    
    // Only initialize measurement state if it doesn't exist yet
    // This prevents resetting active measurements when /lokasi is called again
    if (!userMeasurementStates.has(userId)) {
      initUserMeasurementState(userId);
    } else {
      // Check for expired measurement state
      checkAndCleanupMeasurementState(userId);
    }
    
    bot.sendMessage(
      msg.chat.id,
      'Anda sekarang dalam mode Lokasi. Perintah yang tersedia:\n' +
      '/alamat [alamat] - Mendapatkan koordinat dari alamat\n' +
      '/koordinat [lat] [long] - Mendapatkan alamat dari koordinat\n' +
      '/show_map [lokasi] - Menampilkan peta lokasi\n' +
      '/ukur - Mengukur jarak dan rute antara dua titik (pejalan kaki)\n' +
      '/ukur_motor - Mengukur jarak dan rute untuk sepeda motor\n' +
      '/ukur_mobil - Mengukur jarak dan rute untuk mobil\n\n' +
      'Ketik /menu untuk kembali ke menu utama.\n\n' +
      'Anda juga dapat:\n' +
      '- Mengirim lokasi Telegram untuk mendapatkan koordinat dan alamat lengkap\n' +
      '- Mengirim koordinat (contoh: -7.6382862, 112.7372882) untuk mendapatkan lokasi dan alamat'
    );
  });

  // Get coordinates from address (simplified command)
  bot.onText(/\/alamat (.+)/, async (msg, match) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        msg.chat.id,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    const address = match?.[1];
    if (!address) {
      bot.sendMessage(msg.chat.id, 'Silakan masukkan alamat yang valid.');
      return;
    }
    
    try {
      bot.sendMessage(msg.chat.id, `Mencari koordinat untuk alamat: ${address}...`);
      
      // Using OpenStreetMap Nominatim API
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1
        },
        headers: {
          'User-Agent': 'TelegramBot/1.0'
        }
      });
      
      if (response.data && response.data.length > 0) {
        const location = response.data[0];
        const { lat, lon, display_name } = location;
        
        // Save to user's location cache
        const userDir = ensureUserDataDir(userId);
        const cacheDir = path.join(userDir, 'lokasi_cache');
        fs.ensureDirSync(cacheDir);
        
        const locationData = {
          query: address,
          result: {
            latitude: lat,
            longitude: lon,
            display_name
          },
          timestamp: new Date().toISOString()
        };
        
        const filename = `${Date.now()}_${address.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}.json`;
        fs.writeJsonSync(path.join(cacheDir, filename), locationData, { spaces: 2 });
        
        // Send location
        bot.sendLocation(msg.chat.id, parseFloat(lat), parseFloat(lon));
        
        bot.sendMessage(
          msg.chat.id,
          `📍 Koordinat untuk "${display_name}":\n` +
          `Latitude: ${lat}\n` +
          `Longitude: ${lon}\n\n` +
          `Untuk melihat di peta, ketik:\n` +
          `/show_map ${lat},${lon}`
        );
      } else {
        bot.sendMessage(msg.chat.id, 'Tidak dapat menemukan koordinat untuk alamat tersebut.');
      }
    } catch (error) {
      console.error('Error fetching coordinates:', error);
      bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat mencari koordinat. Silakan coba lagi nanti.');
    }
  });

  // Get address from coordinates (simplified command)
  bot.onText(/\/koordinat\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/, async (msg, match) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        msg.chat.id,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    const lat = match?.[1];
    const lon = match?.[2];
    
    if (!lat || !lon) {
      bot.sendMessage(msg.chat.id, 'Silakan masukkan koordinat yang valid.');
      return;
    }
    
    try {
      bot.sendMessage(msg.chat.id, `Mencari alamat untuk koordinat: ${lat}, ${lon}...`);
      
      // Using OpenStreetMap Nominatim API for reverse geocoding
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat,
          lon,
          format: 'json'
        },
        headers: {
          'User-Agent': 'TelegramBot/1.0'
        }
      });
      
      if (response.data && response.data.display_name) {
        const { display_name } = response.data;
        
        // Save to user's location cache
        const userDir = ensureUserDataDir(userId);
        const cacheDir = path.join(userDir, 'lokasi_cache');
        fs.ensureDirSync(cacheDir);
        
        const locationData = {
          query: `${lat},${lon}`,
          result: {
            latitude: lat,
            longitude: lon,
            display_name
          },
          timestamp: new Date().toISOString()
        };
        
        const filename = `${Date.now()}_reverse_${lat}_${lon}.json`;
        fs.writeJsonSync(path.join(cacheDir, filename), locationData, { spaces: 2 });
        
        // Send location
        bot.sendLocation(msg.chat.id, parseFloat(lat), parseFloat(lon));
        
        bot.sendMessage(
          msg.chat.id,
          `📍 Alamat untuk koordinat (${lat}, ${lon}):\n` +
          `${display_name}\n\n` +
          `Untuk melihat di peta, ketik:\n` +
          `/show_map ${lat},${lon}`
        );
      } else {
        bot.sendMessage(msg.chat.id, 'Tidak dapat menemukan alamat untuk koordinat tersebut.');
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat mencari alamat. Silakan coba lagi nanti.');
    }
  });

  // Show map for location
  bot.onText(/\/show_map (.+)/, async (msg, match) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        msg.chat.id,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    const locationQuery = match?.[1];
    if (!locationQuery) {
      bot.sendMessage(msg.chat.id, 'Silakan masukkan lokasi yang valid.');
      return;
    }
    
    try {
      // Check if the input is coordinates (lat,lon)
      const coordsMatch = locationQuery.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
      
      let lat: string, lon: string;
      
      if (coordsMatch) {
        // Direct coordinates provided
        lat = coordsMatch[1];
        lon = coordsMatch[2];
        
        // Send location directly
        bot.sendLocation(msg.chat.id, parseFloat(lat), parseFloat(lon));
        
        // Also send a link to OpenStreetMap
        const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=15`;
        bot.sendMessage(
          msg.chat.id,
          `🗺️ Lihat di OpenStreetMap:\n${osmUrl}`
        );
      } else {
        // Search for the location first
        bot.sendMessage(msg.chat.id, `Mencari lokasi: ${locationQuery}...`);
        
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: {
            q: locationQuery,
            format: 'json',
            limit: 1
          },
          headers: {
            'User-Agent': 'TelegramBot/1.0'
          }
        });
        
        if (response.data && response.data.length > 0) {
          const location = response.data[0];
          lat = location.lat;
          lon = location.lon;
          
          // Send location
          bot.sendLocation(msg.chat.id, parseFloat(lat), parseFloat(lon));
          
          // Also send a link to OpenStreetMap
          const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=15`;
          bot.sendMessage(
            msg.chat.id,
            `🗺️ ${location.display_name}\n\nLihat di OpenStreetMap:\n${osmUrl}`
          );
        } else {
          bot.sendMessage(msg.chat.id, 'Tidak dapat menemukan lokasi tersebut.');
        }
      }
    } catch (error) {
      console.error('Error showing map:', error);
      bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat menampilkan peta. Silakan coba lagi nanti.');
    }
  });

  // Measure distance and route between two points
  bot.onText(/^\/ukur$/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    // Skip jika pesan sudah diproses
    if (!userId || !msg.message_id || !markMessageAsProcessed(userId, msg.message_id)) {
      return;
    }
    
    if (!isUserRegistered(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        chatId,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    // Try to get last measurement
    const lastMeasurement = getLastMeasurement(userId);
    if (lastMeasurement) {
      // Use the stored coordinates for a new measurement with foot mode
      performStoredMeasurement(
        chatId,
        userId,
        lastMeasurement.firstPoint,
        lastMeasurement.secondPoint,
        'foot'
      );
    } else {
      // No stored coordinates, start a new measurement
      startNewMeasurement(msg, 'foot');
    }
  });

  // Extended ukur command dengan parameter mode transportasi
  bot.onText(/^\/ukur\s+(.+)$/, (msg, match) => {
    const userId = msg.from?.id;
    
    // Skip jika pesan sudah diproses
    if (!userId || !msg.message_id || !markMessageAsProcessed(userId, msg.message_id)) {
      return;
    }
    
    // Skip if it's already being handled by a specific command
    if (msg.text === '/ukur motor' || msg.text === '/ukur mobil' || msg.text === '/ukur jalan') {
      // Check if this is from our own processUpdate call
      const measurementState = getUserMeasurementState(userId);
      if (measurementState && measurementState.isActive) {
        // This is already being handled, so we continue
        return;
      }
    }
    
    startNewMeasurement(msg, undefined, match?.[1]);
  });

  // Measure with motorcycle transport mode
  bot.onText(/^\/ukur_motor$/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    // Skip jika pesan sudah diproses
    if (!userId || !msg.message_id || !markMessageAsProcessed(userId, msg.message_id)) {
      return;
    }
    
    if (!isUserRegistered(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        chatId,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }

    // Periksa apakah ada pengukuran aktif
    const measurementState = getUserMeasurementState(userId);
    if (measurementState && measurementState.isActive) {
      bot.sendMessage(
        chatId,
        'Anda sedang dalam proses pengukuran. Silakan selesaikan atau ketik /batal untuk membatalkan.'
      );
      return;
    }
    
    // Try to get last measurement
    const lastMeasurement = getLastMeasurement(userId);
    if (lastMeasurement) {
      // Use the stored coordinates for a new measurement with motorcycle mode
      performStoredMeasurement(
        chatId,
        userId,
        lastMeasurement.firstPoint,
        lastMeasurement.secondPoint,
        'motorcycle'
      );
    } else {
      // No stored coordinates, start a new measurement
      bot.processUpdate({
        update_id: 0,
        message: {
          ...msg,
          text: '/ukur motor'
        }
      });
    }
  });

  // Measure with car transport mode
  bot.onText(/^\/ukur_mobil$/, (msg) => {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    // Skip jika pesan sudah diproses
    if (!userId || !msg.message_id || !markMessageAsProcessed(userId, msg.message_id)) {
      return;
    }
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(chatId, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        chatId,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    // Try to get last measurement
    const lastMeasurement = getLastMeasurement(userId);
    if (lastMeasurement) {
      // Use the stored coordinates for a new measurement with car mode
      performStoredMeasurement(
        chatId,
        userId,
        lastMeasurement.firstPoint,
        lastMeasurement.secondPoint,
        'car'
      );
    } else {
      // No stored coordinates, start a new measurement
      bot.processUpdate({
        update_id: 0,
        message: {
          ...msg,
          text: '/ukur mobil'
        }
      });
    }
  });
  
  // Extended ukur command with transport mode parameter
  bot.onText(/\/ukur\s+(.+)/, (msg, match) => {
    // Skip if it's already being handled by a specific command
    if (msg.text === '/ukur motor' || msg.text === '/ukur mobil' || msg.text === '/ukur jalan') {
      const userId = msg.from?.id;
      if (userId) {
        // Check if this is from our own processUpdate call
        const measurementState = getUserMeasurementState(userId);
        if (measurementState && measurementState.isActive) {
          // This is already being handled, so we continue
          // Otherwise, this could be a manual user command
          return;
        }
      }
    }
    
    startNewMeasurement(msg, undefined, match?.[1]);
  });

  // Function to start a new measurement
  const startNewMeasurement = (msg: TelegramBot.Message, defaultMode: 'car' | 'motorcycle' | 'foot' = 'foot', transportArg?: string) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        msg.chat.id,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    // Check for and handle expired measurement state
    if (checkAndCleanupMeasurementState(userId)) {
      bot.sendMessage(
        msg.chat.id,
        'Sesi pengukuran sebelumnya telah kedaluwarsa dan direset.'
      );
    }
    
    // Check if transport mode is specified
    const transportArgValue = transportArg?.trim().toLowerCase();
    let transportMode: 'car' | 'motorcycle' | 'foot' = defaultMode; 
    
    if (transportArgValue === 'motor' || transportArgValue === 'motorcycle') {
      transportMode = 'motorcycle';
    } else if (transportArgValue === 'mobil' || transportArgValue === 'car') {
      transportMode = 'car';
    } else if (transportArgValue === 'jalan' || transportArgValue === 'kaki' || transportArgValue === 'foot') {
      transportMode = 'foot';
    }
    
    // Initialize or reset the measurement state
    initUserMeasurementState(userId);
    const measurementState = getUserMeasurementState(userId);
    if (measurementState) {
      measurementState.isActive = true;
      measurementState.transportMode = transportMode;
      logMeasurementState(userId, `Started new measurement with mode ${transportMode}`);
    }
    
    const transportText = transportMode === 'car' ? 'mobil' : 
                        transportMode === 'motorcycle' ? 'sepeda motor' : 'pejalan kaki';
    
    bot.sendMessage(
      msg.chat.id,
      `📏 *Pengukuran Jarak dan Rute* (Mode: ${transportText})\n\n` +
      'Silakan kirim titik pertama dengan salah satu cara berikut:\n' +
      '1. Kirim lokasi Telegram\n' +
      '2. Kirim koordinat (contoh: -7.257056, 112.648000)\n\n' +
      'Sesi pengukuran akan otomatis berakhir setelah 10 menit jika tidak diselesaikan.\n' +
      'Ketik /batal untuk membatalkan pengukuran.',
      { parse_mode: 'Markdown' }
    );
  };

  // Cancel measurement command
  bot.onText(/\/batal/, (msg) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      return;
    }
    
    const measurementState = getUserMeasurementState(userId);
    if (measurementState && measurementState.isActive) {
      logMeasurementState(userId, "Canceling measurement");
      initUserMeasurementState(userId);
      
      // Hapus juga data pengukuran terakhir
      lastMeasurements.delete(userId);
      
      bot.sendMessage(msg.chat.id, 'Pengukuran jarak dan rute dibatalkan.');
    }
  });

  // Measure distance between two coordinates
  bot.onText(/\/ukur\s+(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/, async (msg, match) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      bot.sendMessage(
        msg.chat.id,
        'Anda harus berada dalam mode Lokasi untuk menggunakan perintah ini. Ketik /lokasi untuk masuk ke mode Lokasi.'
      );
      return;
    }
    
    const lat1 = parseFloat(match?.[1] || '0');
    const lon1 = parseFloat(match?.[2] || '0');
    const lat2 = parseFloat(match?.[3] || '0');
    const lon2 = parseFloat(match?.[4] || '0');
    
    try {
      bot.sendMessage(msg.chat.id, 'Menghitung jarak dan rute...');
      
      // Get addresses for both points
      const [response1, response2] = await Promise.all([
        axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: { lat: lat1, lon: lon1, format: 'json' },
          headers: { 'User-Agent': 'TelegramBot/1.0' }
        }),
        axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: { lat: lat2, lon: lon2, format: 'json' },
          headers: { 'User-Agent': 'TelegramBot/1.0' }
        })
      ]);
      
      const address1 = response1.data?.display_name || 'Lokasi tidak diketahui';
      const address2 = response2.data?.display_name || 'Lokasi tidak diketahui';
      
      // Calculate distance using Haversine formula
      const distance = calculateDistance(lat1, lon1, lat2, lon2);
      
      // Format distance
      let formattedDistance = '';
      if (distance < 1000) {
        formattedDistance = `${Math.round(distance)} meter`;
      } else {
        formattedDistance = `${(distance / 1000).toFixed(2)} kilometer`;
      }
      
      // Generate OpenStreetMap route URL
      const osmRouteUrl = `https://www.openstreetmap.org/directions?engine=graphhopper_foot&route=${lat1}%2C${lon1}%3B${lat2}%2C${lon2}`;
      
      // Send results
      bot.sendMessage(
        msg.chat.id,
        `📏 *Hasil Pengukuran*\n\n` +
        `*Titik Awal:*\n${address1}\n(${lat1}, ${lon1})\n\n` +
        `*Titik Akhir:*\n${address2}\n(${lat2}, ${lon2})\n\n` +
        `*Jarak:* ${formattedDistance}\n\n` +
        `*Lihat Rute:*\n${osmRouteUrl}`,
        { parse_mode: 'Markdown' }
      );
      
      // Send map with both points
      const midLat = (lat1 + lat2) / 2;
      const midLon = (lon1 + lon2) / 2;
      bot.sendLocation(msg.chat.id, midLat, midLon);
      
    } catch (error) {
      console.error('Error measuring distance:', error);
      bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat menghitung jarak dan rute. Silakan coba lagi nanti.');
    }
  });

  // Handle location messages from Telegram
  bot.on('location', async (msg) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak terdaftar untuk menggunakan bot ini.');
      return;
    }
    
    if (!hasLocationAccess(userId)) {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda tidak memiliki akses ke fitur lokasi.');
      return;
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      return; // Ignore location messages when not in location mode
    }
    
    if (!msg.location) {
      bot.sendMessage(msg.chat.id, 'Lokasi tidak valid.');
      return;
    }
    
    const { latitude, longitude } = msg.location;
    
    // Check if in measurement mode
    const measurementState = getUserMeasurementState(userId);
    
    if (measurementState && measurementState.isActive) {
      // Check for expired measurement state
      if (checkAndCleanupMeasurementState(userId)) {
        bot.sendMessage(
          msg.chat.id,
          'Sesi pengukuran Anda telah kedaluwarsa. Silakan mulai pengukuran baru dengan perintah /ukur.'
        );
        return;
      }
      
      logMeasurementState(userId, `Processing location (${latitude}, ${longitude})`);
      
      try {
        // Get address for the location
        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: {
            lat: latitude,
            lon: longitude,
            format: 'json'
          },
          headers: {
            'User-Agent': 'TelegramBot/1.0'
          }
        });
        
        const address = response.data?.display_name || 'Lokasi tidak diketahui';
        
        // If first point is not set, set it
        if (!measurementState.firstPoint) {
          measurementState.firstPoint = {
            latitude,
            longitude,
            address
          };
          
          // Update timestamp to extend the timeout
          measurementState.timestamp = Date.now();
          logMeasurementState(userId, "First point set");
          
          bot.sendMessage(
            msg.chat.id,
            `📍 Titik pertama diterima:\n${address}\n(${latitude}, ${longitude})\n\nSilakan kirim titik kedua.`
          );
        } 
        // If first point is set but second is not, set second and calculate
        else if (!measurementState.secondPoint) {
          measurementState.secondPoint = {
            latitude,
            longitude,
            address
          };
          logMeasurementState(userId, "Second point set");
          
          if (!measurementState.firstPoint) {
            // This should never happen, but as a safeguard
            throw new Error("First point is unexpectedly missing");
          }
          
          const { firstPoint } = measurementState;
          const transportMode = measurementState.transportMode || 'car';
          
          // Show that calculation is in progress
          const calculatingMsg = await bot.sendMessage(
            msg.chat.id,
            `Menghitung rute ${transportMode === 'car' ? 'mobil' : 
                             transportMode === 'motorcycle' ? 'sepeda motor' : 
                             'pejalan kaki'} dari titik A ke titik B...`
          );
          
          // Map transport mode to OpenRouteService profile
          let orsProfile = 'driving-car';
          if (transportMode === 'motorcycle') {
            orsProfile = 'driving-car'; // Use car as approximation for motorcycle
          } else if (transportMode === 'foot') {
            orsProfile = 'foot-walking';
          }
          
          // Get route information
          const routeInfo = await getRoute(
            firstPoint.latitude,
            firstPoint.longitude,
            latitude,
            longitude,
            orsProfile
          );
          
          // Reset measurement state
          initUserMeasurementState(userId);
          
          // Send measurement results using the new function
          await sendMeasurementResults(
            msg.chat.id,
            userId,
            firstPoint,
            { latitude, longitude, address },
            routeInfo.distance,
            routeInfo.duration,
            transportMode
          );
        }
      } catch (error) {
        console.error(`[Measurement] Error processing location for user ${userId}:`, error);
        let errorMessage = 'Terjadi kesalahan saat memproses lokasi.';
        
        if (error instanceof Error) {
          errorMessage += ` Detail: ${error.message}`;
        }
        
        bot.sendMessage(msg.chat.id, `${errorMessage} Silakan coba lagi atau ketik /batal untuk membatalkan.`);
        
        // Don't reset the measurement state to allow the user to try again
      }
      return;
    }
    
    // Regular location processing (not in measurement mode)
    try {
      bot.sendMessage(msg.chat.id, `Mencari alamat untuk lokasi yang dikirim...`);
      
      // Using OpenStreetMap Nominatim API for reverse geocoding
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat: latitude,
          lon: longitude,
          format: 'json'
        },
        headers: {
          'User-Agent': 'TelegramBot/1.0'
        }
      });
      
      if (response.data && response.data.display_name) {
        const { display_name } = response.data;
        
        // Save to user's location cache
        const userDir = ensureUserDataDir(userId);
        const cacheDir = path.join(userDir, 'lokasi_cache');
        fs.ensureDirSync(cacheDir);
        
        const locationData = {
          query: `${latitude},${longitude}`,
          result: {
            latitude,
            longitude,
            display_name
          },
          timestamp: new Date().toISOString()
        };
        
        const filename = `${Date.now()}_location_${latitude}_${longitude}.json`;
        fs.writeJsonSync(path.join(cacheDir, filename), locationData, { spaces: 2 });
        
        bot.sendMessage(
          msg.chat.id,
          `📍 Informasi Lokasi:\n` +
          `Latitude: ${latitude}\n` +
          `Longitude: ${longitude}\n\n` +
          `Alamat: ${display_name}`
        );
      } else {
        bot.sendMessage(
          msg.chat.id,
          `📍 Koordinat Lokasi:\n` +
          `Latitude: ${latitude}\n` +
          `Longitude: ${longitude}\n\n` +
          `Tidak dapat menemukan alamat untuk koordinat tersebut.`
        );
      }
    } catch (error) {
      console.error('Error processing location message:', error);
      bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat memproses lokasi. Silakan coba lagi nanti.');
    }
  });

  // Handle direct coordinate input (e.g., "-7.6382862, 112.7372882")
  bot.onText(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/, async (msg, match) => {
    const userId = msg.from?.id;
    
    if (!userId || !isUserRegistered(userId)) {
      return; // Silently ignore for non-registered users
    }
    
    if (!hasLocationAccess(userId)) {
      return; // Silently ignore for users without location access
    }
    
    const currentMode = getUserMode(userId);
    if (currentMode !== 'location') {
      return; // Only process in location mode
    }
    
    const lat = parseFloat(match?.[1] || '0');
    const lon = parseFloat(match?.[2] || '0');
    
    // Check if in measurement mode
    const measurementState = getUserMeasurementState(userId);
    
    if (measurementState && measurementState.isActive) {
      // Check for expired measurement state
      if (checkAndCleanupMeasurementState(userId)) {
        bot.sendMessage(
          msg.chat.id,
          'Sesi pengukuran Anda telah kedaluwarsa. Silakan mulai pengukuran baru dengan perintah /ukur.'
        );
        return;
      }
      
      logMeasurementState(userId, `Processing coordinates (${lat}, ${lon})`);
      
      try {
        // Get address for the coordinates
        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: {
            lat,
            lon,
            format: 'json'
          },
          headers: {
            'User-Agent': 'TelegramBot/1.0'
          }
        });
        
        const address = response.data?.display_name || 'Lokasi tidak diketahui';
        
        // If first point is not set, set it
        if (!measurementState.firstPoint) {
          measurementState.firstPoint = {
            latitude: lat,
            longitude: lon,
            address
          };
          
          // Update timestamp to extend the timeout
          measurementState.timestamp = Date.now();
          logMeasurementState(userId, "First point set via coordinates");
          
          bot.sendMessage(
            msg.chat.id,
            `📍 Titik pertama diterima:\n${address}\n(${lat}, ${lon})\n\nSilakan kirim titik kedua.`
          );
          
          // Send location
          bot.sendLocation(msg.chat.id, lat, lon);
        } 
        // If first point is set but second is not, set second and calculate
        else if (!measurementState.secondPoint) {
          measurementState.secondPoint = {
            latitude: lat,
            longitude: lon,
            address
          };
          
          logMeasurementState(userId, "Second point set via coordinates");
          
          if (!measurementState.firstPoint) {
            // This should never happen, but as a safeguard
            throw new Error("First point is unexpectedly missing");
          }
          
          const { firstPoint } = measurementState;
          const transportMode = measurementState.transportMode || 'car';
          
          // Show that calculation is in progress
          const calculatingMsg = await bot.sendMessage(
            msg.chat.id,
            `Menghitung rute ${transportMode === 'car' ? 'mobil' : 
                             transportMode === 'motorcycle' ? 'sepeda motor' : 
                             'pejalan kaki'} dari titik A ke titik B...`
          );
          
          // Map transport mode to OpenRouteService profile
          let orsProfile = 'driving-car';
          if (transportMode === 'motorcycle') {
            orsProfile = 'driving-car'; // Use car as approximation for motorcycle
          } else if (transportMode === 'foot') {
            orsProfile = 'foot-walking';
          }
          
          // Get route information
          const routeInfo = await getRoute(
            firstPoint.latitude,
            firstPoint.longitude,
            lat,
            lon,
            orsProfile
          );
          
          // Reset measurement state
          initUserMeasurementState(userId);
          
          // Send measurement results using the new function
          await sendMeasurementResults(
            msg.chat.id,
            userId,
            firstPoint,
            { latitude: lat, longitude: lon, address },
            routeInfo.distance,
            routeInfo.duration,
            transportMode
          );
        }
        return;
      } catch (error) {
        console.error(`[Measurement] Error processing coordinates for user ${userId}:`, error);
        let errorMessage = 'Terjadi kesalahan saat memproses koordinat.';
        
        if (error instanceof Error) {
          errorMessage += ` Detail: ${error.message}`;
        }
        
        bot.sendMessage(msg.chat.id, `${errorMessage} Silakan coba lagi atau ketik /batal untuk membatalkan.`);
        return;
      }
    }
    
    // Regular coordinate processing (not in measurement mode)
    try {
      bot.sendMessage(msg.chat.id, `Memproses koordinat: ${lat}, ${lon}...`);
      
      // Using OpenStreetMap Nominatim API for reverse geocoding
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat,
          lon,
          format: 'json'
        },
        headers: {
          'User-Agent': 'TelegramBot/1.0'
        }
      });
      
      if (response.data && response.data.display_name) {
        const { display_name } = response.data;
        
        // Save to user's location cache
        const userDir = ensureUserDataDir(userId);
        const cacheDir = path.join(userDir, 'lokasi_cache');
        fs.ensureDirSync(cacheDir);
        
        const locationData = {
          query: `${lat},${lon}`,
          result: {
            latitude: lat,
            longitude: lon,
            display_name
          },
          timestamp: new Date().toISOString()
        };
        
        const filename = `${Date.now()}_direct_coords_${lat}_${lon}.json`;
        fs.writeJsonSync(path.join(cacheDir, filename), locationData, { spaces: 2 });
        
        // Send location
        bot.sendLocation(msg.chat.id, lat, lon);
        
        bot.sendMessage(
          msg.chat.id,
          `📍 Alamat untuk koordinat (${lat}, ${lon}):\n` +
          `${display_name}`
        );
      } else {
        bot.sendMessage(msg.chat.id, 'Tidak dapat menemukan alamat untuk koordinat tersebut.');
      }
    } catch (error) {
      console.error('Error processing coordinates:', error);
      bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat memproses koordinat. Silakan coba lagi nanti.');
    }
  });
};
