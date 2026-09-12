# 🗺️ Peta Rekomendasi Area (Geotency)

Web app peta untuk melihat hasil analisis **hexagon area rekomendasi pembukaan cabang baru** dari akun Geotency — dibuat berdasarkan file hasil inspect element:
`json 1.json` (legenda), `json 2.json` (metadata layer & klasifikasi warna), dan `info penting.txt` (key MapTiler).

## Fitur
- **Basemap MapTiler** (streets-v2) — key diambil dari `info penting.txt`
- **Warna hexagon sesuai skor** (`manual_score` 1–5): biru → hijau → kuning → oranye → merah, mengikuti class breaks asli dari `json 2.json`
- **Panel legenda** layer lengkap dari `json 1.json` (ikon PNG asli)
- **Toggle layer** (centang untuk tampil/sembunyi)
- **Popup atribut** saat hexagon diklik (populasi, daya beli, fasilitas, dsb. — label alias dari metadata)
- **Muat GeoJSON** otomatis dari folder `data/`, tombol pilih file, atau drag & drop
- Dukungan beberapa dataset sekaligus

## Cara menjalankan
Jalankan server lokal (wajib, supaya `fetch()` bisa membaca file):

```bash
cd geotency-map
python -m http.server 8000
# atau: npx serve .
```

Buka **http://localhost:8000**

## Cara pakai data asli dari Geotency
1. Di Geotency, export layer **hexagon** (mis. *Recommended Area Hexagon*) sebagai **GeoJSON**.
   - Umumnya: klik kanan layer → Export Data → GeoJSON, atau lewat ArcGIS REST: `.../MapServer/5/query?where=1=1&outFields=*&f=geojson`
   - Pastikan koordinat **WGS84 / EPSG:4326** (format standar GeoJSON).
2. Taruh file-nya di folder `data/` dengan nama apa pun, mis. `hexagon.geojson`:
   ```
   data/
   ├── hexagon.geojson     ← data asli kamu
   └── demo-hexagon.geojson  ← contoh (boleh dihapus)
   ```
3. Muat ulang halaman. Dataset yang terbaca otomatis muncul di panel.

Tanpa server (jalan via `file://`), tetap bisa pakai tombol **"Pilih file GeoJSON"** atau drag & drop.

### Manifest (opsional)
Buat `data/manifest.json` untuk memetakan layer → file secara eksplisit:
```json
{
  "Recommended Area Hexagon": "hexagon.geojson",
  "Existing Sites All": "sites.geojson"
}
```

### Klasifikasi warna otomatis
Jika file GeoJSON punya kolom `manual_score` (atau kolom renderer dari `json 2.json`), hexagon otomatis diwarnai sesuai class breaks asli. Data non-hexagon (titik/kategori) diberi warna generik + ikon legenda asli tetap tampil di panel.

## Catatan
- **Key MapTiler** (`6mDvVmws6MAP2ihtR5FS`) tertanam di `index.html` — ini normal untuk penggunaan di browser, tapi di dashboard MapTiler batasi key ke domain kamu saja, dan ganti kalau key lama sudah terpublikasi.
- `demo-hexagon.geojson` adalah **data contoh acak** (bukan data asli) untuk verifikasi tampilan — hapus saja setelah punya data sungguhan.
- Regenerasi demo: `node tools/generate_demo_hexagons.js`

## Struktur
```
geotency-map/
├── index.html                 ← aplikasi peta
├── README.md
├── assets/
│   ├── json 1.json            ← legenda layer (dari inspect element)
│   └── json 2.json            ← metadata layer hexagon & warna
├── data/
│   └── demo-hexagon.geojson   ← taruh export GeoJSON asli di sini
└── tools/
    └── generate_demo_hexagons.js
```