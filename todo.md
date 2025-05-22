# Todo List untuk Pengembangan Bot Telegram

## Fitur yang Sudah Diimplementasikan
- [x] Konfigurasi lingkungan (.env) dengan variabel yang diperlukan
- [x] Autentikasi pengguna berdasarkan ID Telegram
- [x] Isolasi data klien berdasarkan ID Telegram
- [x] Mode Lokasi (/lokasi)
  - [x] Mendapatkan koordinat dari alamat (/alamat)
  - [x] Mendapatkan alamat dari koordinat (/koordinat)
  - [x] Menampilkan peta lokasi (/show_map)
  - [x] Pengukuran jarak dan rute (/ukur)
- [x] Mode Arsip (/rar)
  - [x] Pencarian file dalam arsip (/search, /cari)
  - [x] Statistik penggunaan (/stats)
  - [x] Bantuan interaktif (/help)
- [x] Mode Workbook (/workbook)
  - [x] Membuat sheet baru
  - [x] Menyimpan gambar ke sheet
  - [x] Membuat file Excel dengan gambar dari semua sheet
  - [x] Melihat daftar sheet yang telah dibuat
- [x] Mode OCR (/ocr)
  - [x] Mengekstrak teks dari gambar
  - [x] Menggunakan OCR dalam Bahasa Inggris
  - [x] Penanganan file gambar dan dokumen gambar
- [x] Mode Geotags (/geotags)
  - [x] Menambahkan geotag ke foto dengan lokasi
  - [x] Mode AlwaysTag untuk lokasi menempel
  - [x] Pengaturan waktu manual
  - [x] Visualisasi lokasi dengan Mapbox
  - [x] Format koordinat Decimal dan DMS
  - [x] Optimasi kualitas gambar
- [x] Mode KML (/kml)
  - [x] Menambahkan titik koordinat (melalui lokasi Telegram atau input manual)
  - [x] Menetapkan nama untuk titik (satu kali atau tetap)
  - [x] Membuat garis/jalur dari titik-titik
  - [x] Melihat daftar titik dan garis yang telah ditambahkan
  - [x] Membuat file KML dari titik-titik dan garis yang ditambahkan
  - [x] Mengirim file KML ke pengguna

## Fitur yang Perlu Diperbaiki
- [x] Fitur pengukuran jarak dan rute (/ukur)
  - [x] Perbaiki pengelolaan state untuk memastikan titik kedua diproses dengan benar
  - [x] Tambahkan logging untuk membantu debugging
  - [x] Implementasikan penanganan error yang lebih baik
  - [x] Tambahkan timeout untuk state pengukuran yang tidak selesai
  - [x] Perbaiki pesan error perintah tidak valid saat menggunakan /ukur, /ukur_motor dan /ukur_mobil di mode lokasi
- [x] Fitur KML
  - [x] Perbaiki format tag XML untuk memastikan kompatibilitas dengan aplikasi KML
  - [x] Pastikan pengguna memiliki akses ke fitur KML melalui KML_ACCESS_USERS
  - [x] Perbaiki penanganan perintah sub-KML dalam mode KML
  - [x] Pastikan regex /start tidak bentrok dengan perintah /startline dari mode KML
- [x] Fitur Geotags
  - [x] Perbaiki konflik antara mode AlwaysTag dan AlwaysPoint
  - [x] Optimalkan penggunaan memori saat memproses gambar
  - [x] Tambahkan validasi format waktu manual
  - [x] Perbaiki penanganan error saat Mapbox API tidak tersedia

## Fitur yang Perlu Ditambahkan
- [ ] Fitur pencadangan data pengguna
  - [ ] Implementasikan perintah untuk mencadangkan data pengguna
  - [ ] Implementasikan perintah untuk memulihkan data pengguna
- [ ] Fitur administrasi
  - [ ] Tambahkan perintah untuk mengelola pengguna terdaftar
  - [ ] Tambahkan perintah untuk melihat statistik penggunaan bot
- [ ] Fitur notifikasi
  - [ ] Implementasikan sistem notifikasi untuk admin
  - [ ] Implementasikan sistem notifikasi untuk pengguna
- [ ] Peningkatan Fitur Geotags
  - [ ] Tambahkan dukungan untuk watermark kustom
  - [ ] Implementasikan batch processing untuk multiple foto
  - [ ] Tambahkan opsi untuk mengatur ukuran geotag
  - [ ] Implementasikan sistem cache untuk Mapbox API

## Perbaikan Teknis
- [x] Gunakan environment variable untuk OCR API key
- [ ] Refaktor kode untuk meningkatkan modularitas
- [ ] Tambahkan unit test untuk semua fitur
- [ ] Implementasikan logging yang lebih komprehensif
- [ ] Optimalkan penggunaan memori dan performa
- [ ] Tambahkan dokumentasi kode yang lebih lengkap

## Deployment dan Infrastruktur
- [ ] Siapkan script deployment otomatis
- [ ] Implementasikan sistem monitoring
- [ ] Siapkan sistem backup otomatis
- [ ] Dokumentasikan proses deployment dan pemeliharaan
