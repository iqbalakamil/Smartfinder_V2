# CCTV Locator Kota Bekasi - Web Application

Aplikasi Web Monitoring Live CCTV interaktif untuk Kota Bekasi, Jawa Barat. Aplikasi ini menampilkan titik-titik CCTV di atas peta interaktif (Leaflet JS) yang dapat diklik untuk memutar langsung tayangan *live streaming* HLS (`.m3u8`).

---

## 🌟 Fitur Utama

1. **Peta Interaktif (Leaflet JS & OpenStreetMap / CartoDB)**
   - Menampilkan 24+ lokasi CCTV resmi Kota Bekasi di atas peta.
   - Marker kamera kustom dengan efek pulsa animasi untuk status *live*.
   - Pilihan layer peta: **Dark Mode (Default)**, **Standard OpenStreetMap**, dan **Satelit Esri**.

2. **Pemutar Stream HLS (.m3u8)**
   - Didukung oleh `Hls.js` & HTML5 Video Player universal.
   - Menampilkan status stream (*Connecting*, *Live*, *Offline*).
   - Fitur reload stream & kontrol video penuh.
   - Gambar cuplikan (*snapshot fallback*) untuk pratinjau thumbnail.

3. **Sidebar Filter & Pencarian Lokasi**
   - Pencarian cepat lokasi CCTV berdasarkan nama jalan/kelurahan.
   - Mengklik item di daftar otomatis memindahkan fokus peta (*flyTo*) ke titik CCTV tersebut dan membuka player video.

4. **Multi-Camera Monitoring Grid**
   - Mode Grid untuk memantau beberapa kamera sekaligus secara langsung dalam satu layar dashboard.

---

## 🚀 Cara Menjalankan Aplikasi

### Opsi 1: Menggunakan Python Web Server (Rekomendasi)
Jalankan perintah berikut di terminal / command prompt pada folder proyek:

```bash
python server.py
```
Aplikasi akan secara otomatis membuka browser di alamat: `http://localhost:8000`

### Opsi 2: Langsung Buka File HTML
Cukup klik ganda (double click) file `index.html` untuk mengembangkannya langsung di peramban web (*browser*) favorit Anda.

---

## 📁 Struktur Berkas

- `index.html` - Tampilan antarmuka utama aplikasi web (Dashboard GIS, Leaflet Map, Sidebar, & Player HLS).
- `cctv_data.json` - Dataset lokasi geografis (lat, lng), nama titik CCTV, dan URL stream `.m3u8`.
- `server.py` - Server HTTP sederhana Python dengan dukungan CORS dan pembukaan otomatis peramban.
- `script cctv.txt` - Script acuan asli dari situs `bekasikota.go.id/cctv`.

---

## 🌐 Endpoint Stream CCTV Kota Bekasi

Aplikasi ini menggunakan API & stream server resmi Pemkot Bekasi:
- Daftar CCTV: `https://eofficev2.bekasikota.go.id/backupcctv/m3/list.json`
- Stream HLS: `https://eofficev2.bekasikota.go.id/backupcctv/m3/{path_cctv}`
