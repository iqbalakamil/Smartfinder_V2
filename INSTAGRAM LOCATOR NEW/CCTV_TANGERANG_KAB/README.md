# Peta CCTV Kabupaten Tangerang (ATCS Dishub)

Web app yang menampilkan titik‑titik CCTV Kabupaten Tangerang **sesuai data asli**
dari situs [cctv-dishub.tangerangkab.go.id/cctv-map](https://cctv-dishub.tangerangkab.go.id/cctv-map),
lengkap dengan pemutar video live (stream HLS).

## Cara menjalankan

```bash
node server.js
```

Buka **http://localhost:8080** (ganti port dengan `PORT=3000 node server.js`).

Server kecil ini (tanpa dependency) melakukan 2 hal:

1. Melayani file statis: `index.html`, `style.css`, `app.js`, `cameras.json`.
2. **Proxy stream HLS** (`/proxy/storage/...` → server asli). Ini penting: server
   video asli **tidak mengirim header CORS**, jadi tanpa proxy browser memblokir
   pemutaran video jika aplikasi dihosting di domain lain.

## Struktur file

| File                | Fungsi                                                        |
| ------------------- | ------------------------------------------------------------- |
| `index.html`        | Halaman utama (Leaflet map + sidebar)                         |
| `style.css`         | Tampilan                                                      |
| `app.js`            | Logika map, marker, pemutar video (hls.js), daftar & pencarian |
| `cameras.json`      | Data 30 titik CCTV (id, nama, lat, lng, url stream)           |
| `server.js`         | Server statis + proxy HLS                                     |
| `refresh-data.js`   | Skrip ambil ulang data dari situs asli                        |
| `info penting.txt`  | Catatan sumber yang kamu berikan                              |

## Memperbarui data titik CCTV

Titik CCTV di situs asli bisa berubah (bertambah/berkurang). Sinkronkan ulang dengan:

```bash
node refresh-data.js
```

Skrip ini membuka halaman asli, mengekstrak snapshot Livewire yang berisi daftar
kamera, lalu menulis ulang `cameras.json`.

## Deploy ke hosting lain

- **Map & daftar titik** bekerja di mana saja (static hosting biasa), karena
  `cameras.json` dibaca sebagai file statis.
- **Video live** hanya bisa diputar jika request stream melewati proxy yang
  meneruskan `/proxy/storage/*` ke `https://cctv-dishub.tangerangkab.go.id/storage/*`
  (mis. serverless function, nginx reverse proxy, atau cukup jalankan `server.js`).
  Tanpa proxy, video akan gagal dimuat karena CORS.

## Catatan teknis

- Data diambil dari halaman asli: daftar kamera ada di dalam snapshot Livewire
  (`wire:snapshot`), bukan API publik. Tiap kamera berisi `id`, `name`,
  `latitude`, `longitude`, dan `url` (playlist HLS `.m3u8`).
- Map memakai **Leaflet + tile OpenStreetMap**, sama seperti situs aslinya.
- Pemutar video memakai **hls.js** (browser modern) dengan fallback native HLS
  (Safari).