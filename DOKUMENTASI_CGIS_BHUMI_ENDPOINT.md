# Dokumentasi Integrasi CGIS dan BHUMI

Dokumen ini mencatat perubahan endpoint BHUMI yang ditemukan saat memeriksa tautan peta contoh, dampaknya pada CGIS, perubahan backend, dan langkah pemulihan akses.

## Ringkasan

Halaman BHUMI ATR/BPN yang diperiksa:

`https://bhumi.atrbpn.go.id/?bbox=106.80946722067631%2C-6.411034118127461%2C106.82205205352636%2C-6.401834344978397&height=473&width=643&x=450&y=290&latitude=-6.407474817533043&longitude=106.8182746464662`

Implementasi lama di aplikasi masih mengandalkan login `loginApi` dengan username/password tetap dan endpoint WMS lama. Situs BHUMI sekarang menggunakan tiket request, kunci ECDH, dan endpoint proxy WMS yang berbeda. Halaman peta publik dapat dipakai tanpa login; karena itu request identify sekarang dicoba tanpa bearer token.

## Endpoint yang teramati

| Fungsi | Endpoint | Metode | Catatan |
| --- | --- | --- | --- |
| Membuat tiket request | `/expapi/auth-ticket` | POST | Respons menyediakan `ticketId` dan `challengeSeed`. |
| Mengambil informasi persil | `/expapi/getPersil` | POST | Memerlukan tiket, public key klien, dan timestamp; request backend kini dicoba tanpa bearer token karena peta dapat diakses publik. |
| Memuat peta WMS | `/mprx/service` | GET | Pada halaman yang diperiksa, layer yang tampak digunakan adalah `bhumi_persil`. |
| Status sesi | `/expapi/access-token` | GET | Dipakai UI BHUMI untuk memeriksa keadaan login. |
| Daftar persil pengguna | `/expapi/get-parcels` | GET | Endpoint ini berbeda dari identify persil berdasarkan posisi. |

Request `getPersil` yang dibuat halaman menggunakan body sejenis:

```json
{
  "service_layer_name": "umum:Persil",
  "width": 643,
  "height": 473,
  "bbox": "106.80946722067631,-6.411034118127461,106.82205205352636,-6.401834344978397",
  "x": 450,
  "y": 290,
  "query_layers": "umum:Persil",
  "url": "/expapi/getPersil",
  "service": "/bhumigs/umum"
}
```

Request browser yang diamati mencakup `x-timestamp`, `x-client-pubkey`, dan `x-ticket-id`; implementasi backend sengaja menghilangkan `Authorization` untuk menguji akses publik. Public key dibuat sementara dengan kurva P-256. Jika respons terenkripsi, key tersebut dan `challengeSeed` digunakan untuk membuat kunci sesi dan mendekripsi payload.

## Hasil pemeriksaan langsung

- `POST /expapi/auth-ticket` merespons HTTP 200 dan menghasilkan tiket serta challenge seed.
- Pengujian awal `POST /expapi/getPersil` menghasilkan HTTP 401 tanpa token valid. Setelah backend diubah untuk mencoba tanpa token, pengujian langsung ulang belum berhasil karena koneksi dari lingkungan ini gagal sebelum menerima respons.
- `GET /mprx/service` untuk WMS merespons HTTP 403 dari lingkungan pemeriksaan browser. Karena itu, akses WMS belum dapat dinyatakan pulih hanya dari perubahan URL.
- Login lama `loginApi` dengan username/password tetap ditolak. Script halaman saat ini mengirim `recaptchaToken` pada jalur login; token tersebut tidak tersedia untuk backend lokal secara otomatis.

## Dampak pada aplikasi

CGIS melakukan identify melalui endpoint lokal `POST /api/bhumi-identify`. Untuk nilai tanah, handler mencoba BIG ZNT lebih dahulu dan menggunakan sampling sekitar atau cache lokal sebelum fallback BHUMI. Karena itu, rata-rata nilai tanah bergantung pada ketersediaan BIG dan cakupan datanya; token BHUMI terutama dibutuhkan untuk fallback dan detail persil yang memang berasal dari BHUMI.

Permintaan identify persil dengan `service_layer_name: "umum:Persil"` kini diterima backend. Nilai layer BHUMI yang lebih lama (`umum:ZNTRANGE`, `umum:PenggunaanTanah`, `umum:nbt3`) tetap dipertahankan untuk jalur CGIS yang telah ada.

## Perubahan kode

Perubahan integrasi berada di [server.js](server.js):

- `fetchBhumiPersil` mengambil auth ticket, membuat pasangan kunci P-256, menyertakan header yang digunakan situs BHUMI, lalu menangani payload terenkripsi.
- `getPersil` memakai tiket sekali pakai dan tidak mengirim header `Authorization`/token pengguna.
- Login dengan kredensial hardcode dan konfigurasi `BHUMI_TOKEN` dihapus; jika endpoint tetap menolak request publik, implementasi harus memakai sumber resmi alternatif atau meminta akses integrasi ke ATR/BPN.
- Proxy WMS diarahkan ke `/mprx/service`.
- Handler identify menerima layer `umum:Persil`.
- Request BIG ZNT dan BIG penggunaan tanah memiliki satu retry untuk kegagalan request.
- Pengambilan data ZNT per grid CGIS mengaktifkan mode sampel BIG (`sample: true`), sehingga permintaan area tidak langsung bergantung pada token BHUMI yang berumur singkat. Layer penggunaan tanah sudah mencoba BIG terlebih dahulu di backend.

Template konfigurasi di [.env.example](.env.example) tidak lagi meminta `BHUMI_TOKEN`; alur publik dicoba menggunakan tiket.

## Langkah pemulihan

1. Restart backend dan coba identify persil tanpa token. ZNT dan penggunaan tanah memakai BIG lebih dahulu.
2. Jika `getPersil` tetap HTTP 401/403, catat status dan body respons tanpa menyimpan tiket atau kunci privat; periksa request publik yang sama dari halaman BHUMI untuk membandingkan header wajib.
3. Jika browser BHUMI berhasil tetapi server aplikasi ditolak, minta ATR/BPN dokumentasi integrasi/API publik atau cek kebijakan origin/IP. Jangan memasukkan token sesi browser sebagai kredensial server permanen.
4. Jika WMS masih HTTP 403, uji `/mprx/service` terpisah; kegagalan WMS tidak membuktikan identify API memerlukan login.

Backend tidak mengelola token pengguna. Dokumentasi ini tidak menyimpan kredensial ataupun challenge aktif.

## Pemeriksaan kode

Pemeriksaan sebelumnya berhasil melihat alur endpoint dan status HTTP. Setelah perubahan request tanpa token, validasi langsung belum tuntas karena koneksi dari lingkungan ini gagal sebelum respons BHUMI diterima. WMS juga masih perlu dikonfirmasi pada jaringan/server tempat aplikasi dijalankan.
