# Bot Telegram TypeScript

Bot Telegram yang dibangun dengan TypeScript, menyediakan berbagai fitur seperti pencarian lokasi, pengukuran jarak, pengelolaan arsip (ZIP/RAR), workbook, OCR, dan KML.

## Daftar Isi
- [Fitur](#fitur)
- [Persyaratan](#persyaratan)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Penggunaan](#penggunaan)
- [Struktur Proyek](#struktur-proyek)
- [Pengembangan](#pengembangan)
- [Troubleshooting](#troubleshooting)

## Fitur

### Fitur Umum
- Autentikasi pengguna berdasarkan ID Telegram
- Isolasi data klien berdasarkan ID Telegram
- Manajemen mode (menu, lokasi, rar, workbook, ocr, kml)

### Mode Lokasi
- Mendapatkan koordinat dari alamat
- Mendapatkan alamat dari koordinat
- Menampilkan peta lokasi
- Pengukuran jarak dan rute antara dua titik (dalam pengembangan)

### Mode Arsip
- Pencarian file dalam arsip ZIP/RAR
- Statistik penggunaan
- Bantuan interaktif

### Mode Workbook
- Membuat sheet baru untuk gambar
- Menyimpan dan mengelola gambar dalam sheet
- Menghasilkan file Excel dengan gambar dari semua sheet
- Melihat daftar sheet yang telah dibuat

### Mode OCR

1. Ketik `/ocr` untuk masuk ke mode OCR
2. Kirim gambar yang berisi teks untuk mengekstrak teksnya
3. Perintah yang tersedia:
   - `/ocr_clear` - Menghapus semua file OCR yang disimpan

### Mode Geotags

1. Ketik `/geotags` untuk masuk ke mode Geotags
2. Perintah yang tersedia:
   - **Mode Standar (1 Foto, 1 Lokasi):**
     - Kirim foto terlebih dahulu
     - Kemudian kirim lokasi menggunakan fitur "Location" Telegram
     - Bot akan otomatis menambahkan geotag ke foto tersebut
   
   - **Mode AlwaysTag:**
     - Ketik `/alwaystag` untuk mengaktifkan mode
     - Kirim satu lokasi yang akan digunakan untuk semua foto selanjutnya
     - Ketik `/alwaystag` lagi untuk menonaktifkan mode
   
   - **Pengaturan Waktu Manual:**
     - Gunakan `/set_time YYYY-MM-DD HH:MM`
     - Contoh: `/set_time 2024-12-25 15:30`
     - Ketik `/set_time reset` untuk kembali ke waktu saat ini

3. Format Koordinat yang Didukung:
   - Decimal: -7.257056, 112.648000
   - DMS (Degrees, Minutes, Seconds): 7°15'25"S, 112°38'52"E

4. Fitur Tambahan:
   - Visualisasi lokasi dengan Mapbox
   - Informasi alamat lengkap
   - Format waktu dalam Bahasa Indonesia
   - Kualitas gambar yang dioptimalkan

### Mode KML

1. Ketik `/kml` untuk masuk ke mode KML
2. Perintah yang tersedia:
   - **Titik Individual:**
     - Kirim lokasi Telegram untuk menambahkan titik
     - `/add <latitude> <longitude> [nama_titik]` untuk menambahkan titik manual
     - `/addpoint <nama_titik>` untuk menetapkan nama untuk satu titik berikutnya
     - `/alwayspoint [nama_titik]` untuk menetapkan nama default tetap (kosongkan untuk menghapus)
   - **Garis/Jalur:**
     - `/startline [nama_garis]` untuk memulai pembuatan garis
     - `/endline` untuk menyimpan garis aktif
     - `/cancelline` untuk membatalkan garis aktif
   - **Data & KML:**
     - `/mydata` untuk melihat semua titik dan garis yang disimpan
     - `/createkml [nama_dokumen]` untuk membuat dan mengirimkan file KML
     - `/cleardata` untuk menghapus semua data KML Anda
   - `/help` untuk melihat daftar perintah yang tersedia

#### Cara Penggunaan KML:

1. **Menambahkan Titik:**
   - Kirim lokasi via attachment Telegram
   - Atau gunakan perintah `/add <latitude> <longitude> [nama_titik]`
   - Nama titik ditentukan berdasarkan prioritas: nama di perintah `/add` > nama dari `/addpoint` > nama dari `/alwayspoint` > nama default

2. **Membuat Garis/Jalur:**
   - Mulai dengan `/startline [nama_garis]`
   - Tambahkan titik-titik ke garis dengan mengirim lokasi atau menggunakan `/add`
   - Setelah selesai, simpan garis dengan `/endline` (minimal 2 titik)
   - Atau batalkan pembuatan garis dengan `/cancelline`

3. **Melihat dan Mengelola Data:**
   - Gunakan `/mydata` untuk melihat semua titik dan garis yang telah Anda simpan
   - Gunakan `/cleardata` untuk menghapus semua data KML Anda

4. **Membuat File KML:**
   - Gunakan `/createkml [nama_dokumen_opsional]` untuk membuat dan mengirimkan file KML
   - File KML dapat dibuka di aplikasi seperti Google Earth, QGIS, atau aplikasi GIS lainnya

## Persyaratan

- Node.js (v14 atau lebih baru)
- npm atau yarn
- Token Bot Telegram
- Akses ke Telegram Bot API
- Untuk fitur arsip: unzip dan unrar

## Instalasi

1. Clone repositori ini:
   ```bash
   git clone https://github.com/username/telegram-bot-ts.git
   cd telegram-bot-ts
   ```

2. Instal dependensi:
   ```bash
   npm install
   ```

3. Salin file konfigurasi:
   ```bash
   cp .env.example .env
   ```

4. Edit file `.env` dan isi dengan konfigurasi yang sesuai (lihat bagian [Konfigurasi](#konfigurasi))

5. Build proyek:
   ```bash
   npm run build
   ```

6. Jalankan bot:
   ```bash
   npm start
   ```

## Konfigurasi

Edit file `.env` dengan informasi berikut:

```
BOT_TOKEN=token_bot_telegram_anda
REGISTERED_USERS=123456789,987654321
BASE_DATA_PATH=/path/absolut/ke/direktori/data/
LOKASI_ACCESS_USERS=123456789
RAR_ACCESS_USERS=123456789,278262789
WORKBOOK_ACCESS_USERS=123456789,987654321
OCR_ACCESS_USERS=123456789,987654321
OCR_API_KEY=api_key_ocr_space_anda
KML_ACCESS_USERS=123456789,987654321
```

### Penjelasan Variabel

- `BOT_TOKEN`: Token untuk bot Telegram Anda (dapatkan dari BotFather)
- `REGISTERED_USERS`: Daftar ID Telegram pengguna yang diizinkan menggunakan bot (dipisahkan dengan koma)
- `BASE_DATA_PATH`: Path absolut ke direktori dasar tempat data pengguna akan disimpan
- `LOKASI_ACCESS_USERS`: Daftar ID pengguna yang memiliki akses ke fitur lokasi
- `RAR_ACCESS_USERS`: Daftar ID pengguna yang memiliki akses ke fitur arsip
- `WORKBOOK_ACCESS_USERS`: Daftar ID pengguna yang memiliki akses ke fitur workbook
- `OCR_ACCESS_USERS`: Daftar ID pengguna yang memiliki akses ke fitur OCR
- `OCR_API_KEY`: API key untuk layanan OCR.space (dapatkan dari https://ocr.space/)
- `KML_ACCESS_USERS`: Daftar ID pengguna yang memiliki akses ke fitur KML

## Penggunaan

### Mode Lokasi

1. Ketik `/lokasi` untuk masuk ke mode Lokasi
2. Perintah yang tersedia:
   - `/alamat [alamat]` - Mendapatkan koordinat dari alamat
   - `/koordinat [lat] [long]` - Mendapatkan alamat dari koordinat
   - `/show_map [lokasi]` - Menampilkan peta lokasi
   - `/ukur` - Mengukur jarak dan rute antara dua titik (dalam pengembangan)

#### Pengukuran Jarak dan Rute

1. Ketik `/ukur` untuk memulai pengukuran
2. Kirim titik pertama (lokasi Telegram atau koordinat langsung)
3. Kirim titik kedua (lokasi Telegram atau koordinat langsung)
4. Bot akan menghitung jarak dan menampilkan rute

### Mode Arsip

1. Ketik `/rar` untuk masuk ke mode Arsip
2. Perintah yang tersedia:
   - `/search` - Memulai pencarian dalam arsip
   - `/cari [pola]` - Mencari file dengan pola tertentu dalam arsip
   - `/stats` - Melihat statistik penggunaan
   - `/help` - Melihat bantuan dengan contoh penggunaan

### Mode Workbook

1. Ketik `/workbook` untuk masuk ke mode Workbook
2. Perintah yang tersedia:
   - Ketik nama sheet (contoh: "sheet1") untuk membuat sheet baru
   - Kirim foto untuk disimpan ke sheet yang aktif
   - Ketik "send" untuk menghasilkan file Excel dengan semua gambar
   - Ketik "cek" untuk melihat daftar sheet yang telah dibuat
   - Ketik "clear" untuk menghapus semua sheet

### Mode Geotags

1. Ketik `/geotags` untuk masuk ke mode Geotags
2. Perintah yang tersedia:
   - **Mode Standar (1 Foto, 1 Lokasi):**
     - Kirim foto terlebih dahulu
     - Kemudian kirim lokasi menggunakan fitur "Location" Telegram
     - Bot akan otomatis menambahkan geotag ke foto tersebut
   
   - **Mode AlwaysTag:**
     - Ketik `/alwaystag` untuk mengaktifkan mode
     - Kirim satu lokasi yang akan digunakan untuk semua foto selanjutnya
     - Ketik `/alwaystag` lagi untuk menonaktifkan mode
   
   - **Pengaturan Waktu Manual:**
     - Gunakan `/set_time YYYY-MM-DD HH:MM`
     - Contoh: `/set_time 2024-12-25 15:30`
     - Ketik `/set_time reset` untuk kembali ke waktu saat ini

3. Format Koordinat yang Didukung:
   - Decimal: -7.257056, 112.648000
   - DMS (Degrees, Minutes, Seconds): 7°15'25"S, 112°38'52"E

4. Fitur Tambahan:
   - Visualisasi lokasi dengan Mapbox
   - Informasi alamat lengkap
   - Format waktu dalam Bahasa Indonesia
   - Kualitas gambar yang dioptimalkan

## Struktur Proyek

```
telegram-bot-ts/
├── dist/               # Kode JavaScript yang dikompilasi
├── src/                # Kode sumber TypeScript
│   ├── commands/       # Implementasi perintah bot
│   ├── features/       # Fitur-fitur bot (lokasi, rar, dll)
│   │   ├── location/   # Fitur lokasi
│   │   └── rar/        # Fitur arsip
│   └── utils/          # Fungsi utilitas
├── .env                # File konfigurasi (tidak disertakan dalam repositori)
├── .env.example        # Contoh file konfigurasi
├── package.json        # Dependensi dan skrip npm
├── tsconfig.json       # Konfigurasi TypeScript
└── README.md           # Dokumentasi proyek
```

## Pengembangan

### Memulai Pengembangan

1. Instal dependensi pengembangan:
   ```bash
   npm install
   ```

2. Jalankan dalam mode pengembangan (dengan hot reload):
   ```bash
   npm run dev
   ```

### Menambahkan Fitur Baru

1. Buat modul baru di direktori `src/features/` atau tambahkan ke modul yang sudah ada
2. Daftarkan fitur baru di `src/index.ts`
3. Implementasikan logika fitur dan handler perintah
4. Uji fitur secara lokal
5. Build dan deploy

### Konvensi Kode

- Gunakan TypeScript untuk semua kode baru
- Ikuti format kode yang konsisten (gunakan Prettier)
- Dokumentasikan fungsi dan kelas dengan JSDoc
- Gunakan interface untuk tipe data kompleks
- Pisahkan logika bisnis dari handler perintah

## Troubleshooting

### Bot Tidak Merespons

1. Pastikan token bot valid
2. Periksa apakah ID pengguna terdaftar dalam `REGISTERED_USERS`
3. Periksa log untuk error
4. Restart bot

### Error Saat Menggunakan Fitur Arsip

1. Pastikan unzip dan unrar terinstal di sistem
2. Periksa apakah pengguna memiliki akses ke fitur arsip
3. Pastikan direktori data dapat diakses dan ditulis

### Error Saat Menggunakan Fitur Lokasi

1. Pastikan pengguna memiliki akses ke fitur lokasi
2. Periksa koneksi ke OpenStreetMap API
3. Pastikan format koordinat benar

### Pengukuran Jarak dan Rute (`/ukur`)

Fitur ini memungkinkan pengguna untuk mengukur jarak tempuh dan waktu perkiraan antara dua titik menggunakan rute jalan yang sebenarnya (bukan hanya jarak lurus).

#### Cara Penggunaan:

1. Masuk ke mode lokasi dengan `/lokasi`
2. Pilih mode transportasi dengan perintah:
   - `/ukur` - Untuk mode pejalan kaki (default)
   - `/ukur_motor` - Untuk mode sepeda motor
   - `/ukur_mobil` - Untuk mode mobil
   
   Anda juga dapat menggunakan format alternatif:
   - `/ukur jalan` - Untuk mode pejalan kaki
   - `/ukur motor` - Untuk mode sepeda motor
   - `/ukur mobil` - Untuk mode mobil

3. Kirim titik pertama dengan salah satu cara:
   - Mengirim lokasi Telegram
   - Menulis koordinat (contoh: `-7.257056, 112.648000`)

4. Kirim titik kedua dengan cara yang sama

5. Bot akan menampilkan hasil pengukuran yang berisi:
   - Jarak tempuh yang harus dilalui
   - Perkiraan waktu perjalanan
   - Link ke OpenStreetMap dan Google Maps untuk melihat rute secara visual

6. Setelah pengukuran selesai, Anda dapat dengan cepat membandingkan rute menggunakan mode transportasi lain dengan mengetik `/ukur_motor` atau `/ukur_mobil` (data koordinat disimpan selama 30 detik).

Untuk membatalkan pengukuran, ketik `/batal`.

#### Fitur Tambahan:

- Bot secara otomatis menghindari respons duplikat untuk perintah yang sama
- Pengukuran aktif akan otomatis berakhir setelah 10 menit jika tidak diselesaikan
- Koordinat disimpan sementara selama 30 detik untuk kemudahan perbandingan antar mode transportasi
- Semua perintah pengukuran dapat digunakan tanpa mendapatkan pesan error "Perintah tidak valid dalam mode Lokasi"

#### Konfigurasi OpenRouteService API

Untuk mendapatkan pengukuran rute yang akurat, bot ini menggunakan OpenRouteService API. Jika tidak dikonfigurasi, bot akan menggunakan perhitungan jarak langsung (garis lurus).

Untuk menggunakan API ini:
1. Daftar di [OpenRouteService](https://openrouteservice.org/)
2. Dapatkan API key gratis
3. Tambahkan ke file `.env` dengan format:
   ```
   ORS_API_KEY=your_openrouteservice_api_key
   ```

---

Untuk informasi lebih lanjut atau melaporkan masalah, silakan buat issue di repositori GitHub.
