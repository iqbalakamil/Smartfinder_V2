# Geo-Market Research Dashboard Audit

## 1. Audit Kelemahan Script Saat Ini

### Kritikal

1. `app.js` masih menempatkan AI sebagai sumber data utama, bukan layer analisis.
   - `buildStage1Prompt`, `buildStage2Prompt`, `buildStage3Prompt`, dan `buildResearchPrompt` meminta model untuk "mencari" kecamatan, demografi, digital footprint, hingga kompetitor.
   - Ini melanggar prinsip sistem yang mewajibkan `Real Data Fetch Layer` lebih dulu, lalu `AI Analysis Layer`.

2. Radius utama tidak konsisten.
   - `buildStage1Prompt` dan prompt besar menyebut radius 3 KM.
   - `recalculateMarketEstimation()` justru memakai `radiusDemography.radius_2km` sebagai basis TAM.
   - Ini bertentangan dengan aturan bisnis: semua analisis wajib berbasis radius 3 KM.

3. Market estimation masih heuristik dan berpotensi halusinatif.
   - `estimateRadiusPopulation()` memakai pembagian 18%, 45%, 72% dari total populasi kecamatan.
   - Ada fallback angka statis `8000`, `18000`, `30000`.
   - `buildRadiusDemography()` mengestimasi anak usia 2-7 dari rasio 8%-12% tanpa mewajibkan flag estimasi pada output final.

4. Competitor analysis belum berbasis backend POI nyata.
   - Tidak ada pemanggilan endpoint `GET /places?lat={lat}&lng={lng}&radius=3000`.
   - Insight kompetitor masih diinfers dari narasi AI lewat `inferCompetitionLevel()` dan `normalizeCompetitorInsight()`.
   - Sistem saat ini belum bisa membedakan hasil nyata vs asumsi.

5. Validasi schema belum mengamankan anti-halusinasi.
   - `validateResearchShape()` hanya memeriksa keberadaan field, bukan kualitas sumber data.
   - Tidak ada keharusan `estimated`, `reasoning`, `assumption_source`, `source_count`, atau `data_quality`.
   - Nilai kosong cenderung diisi `0` alih-alih `null`, padahal aturan Anda mengharuskan `null` jika data tidak ada.

### Tinggi

6. `server.js` masih berfungsi sebagai proxy generik LLM, belum sebagai backend riset deterministik.
   - Belum ada endpoint `GET /places`.
   - Belum ada retry, timeout, rate limit, logging request/error, atau trace id.
   - `baseUrl` dan model tetap dikirim dari frontend, sehingga kontrol arsitektur dan governance lemah.

7. Frontend menyimpan API key di browser.
   - `bootstrap()` dan `saveSettings()` menyimpan `apiKey` ke `localStorage`.
   - Ini bertentangan dengan aturan keamanan: API key hanya di backend/env.

8. Extension `hotspot map V.2` belum mengikuti kontrak backend service.
   - `popup.js` masih melakukan otomasi tab Google Maps dan scraping dari extension.
   - Belum ada lapisan normalisasi hasil ke schema `pois`.
   - Belum ada jaminan semua item benar-benar terfilter dalam radius 3 KM.

9. District analysis masih terlalu administratif, belum geospatial-first.
   - Script fokus pada kecamatan/kelurahan hasil dropdown wilayah.
   - Bisnis Anda membutuhkan radius lingkaran 3 KM dari titik, bukan batas administrasi sebagai sumber utama.
   - Kecamatan seharusnya hanya dipakai sebagai label konteks terdekat, bukan unit dasar semua kalkulasi.

10. Digital footprint belum deterministic.
   - Prompt meminta AI menyusun URL digital footprint.
   - Tanpa fetch layer nyata, URL berisiko palsu atau tidak tervalidasi.

### Menengah

11. Decision engine belum eksplisit dan belum deterministic.
   - Tidak ada object final `decision` dengan skor, rekomendasi, dan alasan yang dapat diaudit.
   - Rekomendasi masih tersebar di `strategic_recommendation`.

12. Unit economics belum ada dalam kontrak output utama.
   - Sistem belum punya `break_even_students`, `margin_estimate`, `payback_period_months`.

13. UX dashboard belum mengikuti kebutuhan bisnis akhir.
   - Belum ada heatmap radius 3 KM.
   - Belum ada badge `OPEN|CONSIDER|AVOID`.
   - Belum ada indikator competitor density dan break-even card yang bersumber dari kalkulasi deterministik.

## 2. Arsitektur Baru yang Disarankan

### Prinsip

- Semua data primer dihitung dari titik `lat,lng` + `radius=3000`.
- AI hanya membaca data terstruktur hasil backend, bukan mencari fakta sendiri.
- Semua angka harus punya basis: `source`, `estimated`, `reasoning`, `assumption_source`.
- Jika data tidak ada: `null`, bukan `0`.

### Arsitektur Target

1. `Frontend Dashboard`
   - Input koordinat
   - Peta + radius 3 KM
   - Visualisasi TAM/SAM/SOM
   - Decision badge

2. `Geo Research API`
   - `POST /analysis`
   - `GET /places?lat&lng&radius=3000`
   - `GET /reverse-geocode?lat&lng`
   - `GET /demography?lat&lng&radius=3000`
   - `GET /digital-footprint?lat&lng&radius=3000`

3. `Fetch Layer`
   - Reverse geocode
   - POI/competitor scraper adapter dari Hotspot Map V2
   - Demography resolver
   - Digital footprint collector

4. `Normalization Layer`
   - Hitung jarak haversine
   - Buang item di luar 3 KM
   - Mapping kategori
   - Dedup place
   - Source tagging

5. `Deterministic Calculation Layer`
   - Competitor map
   - TAM/SAM/SOM
   - Supply-based estimation
   - Market gap
   - Unit economics
   - Decision score

6. `AI Analysis Layer`
   - Menerjemahkan hasil deterministik ke insight bisnis
   - Menulis alasan rekomendasi
   - Tidak boleh mengubah angka final

### Alur Data

1. User input koordinat
2. Backend reverse geocode
3. Backend fetch semua data radius 3 KM
4. Backend normalisasi + validasi kualitas data
5. Backend hitung semua metrik deterministik
6. Backend kirim paket data ke LLM untuk narasi insight
7. Backend merge insight + metrik final
8. Frontend render dashboard

## 3. Perbaikan Prompt

### Masalah Prompt Lama

- Model diminta mencari data eksternal sendiri.
- Model diberi ruang untuk mengisi kecamatan, kompetitor, dan URL tanpa fetch layer nyata.
- Prompt belum memaksa `null` untuk data tidak tersedia.
- Prompt belum memisahkan `facts` vs `analysis`.

### Desain Prompt Baru

- Input prompt harus berupa JSON hasil backend.
- Model dilarang menambah angka baru di luar input.
- Field hasil AI hanya boleh:
  - ringkasan
  - interpretasi
  - risiko
  - peluang
  - alasan keputusan

### Guardrail Wajib

- "Gunakan hanya data dalam input JSON."
- "Jangan membuat nama tempat, angka, atau URL baru."
- "Jika data tidak tersedia, pertahankan null."
- "Jika field bertanda estimated=true, jelaskan sebagai estimasi, bukan fakta."
- "Jangan ubah angka hasil deterministic layer."

## 4. Rekomendasi Code

### Backend

1. Pecah `server.js` menjadi service modular:
   - `routes/analysis.js`
   - `routes/places.js`
   - `services/reverseGeocodeService.js`
   - `services/placesService.js`
   - `services/demographyService.js`
   - `services/digitalFootprintService.js`
   - `services/analysisService.js`
   - `services/llmNarrativeService.js`
   - `lib/geo.js`
   - `lib/validators.js`

2. Tambahkan adapter scraper:
   - `adapters/hotspotMapsAdapter.js`
   - Tugas adapter:
     - menerima hasil scraping mentah
     - map ke schema `pois`
     - hitung `distance_km`
     - filter `distance_km <= 3`

3. Semua kalkulasi bisnis pindah ke backend.
   - Frontend tidak boleh menghitung TAM/SAM/SOM final.
   - Frontend hanya render response backend.

4. Implementasikan guardrail nullability:
   - jangan default `0`
   - gunakan helper `nullableNumber()`
   - gunakan `estimated`, `reasoning`, `assumption_source`

5. Tambahkan observability:
   - request id
   - timeout per upstream
   - retry terbatas
   - log error
   - log source coverage

### Frontend

1. Hapus field input API key dari UI.
2. Ganti alur submit agar memanggil `POST /analysis`.
3. Render section:
   - radius map
   - competitor density
   - TAM/SAM/SOM
   - market gap
   - break-even
   - decision badge
4. Tampilkan badge kualitas data:
   - `population_data`
   - `competitor_data`
   - `digital_footprint_data`
   - `overall_confidence`

## 5. Roadmap Implementasi

### Phase 1 - Foundation

1. Bekukan schema final.
2. Pindahkan API key ke backend env.
3. Implement `GET /reverse-geocode`.
4. Implement `GET /places?lat&lng&radius=3000`.
5. Tambahkan util geo untuk filter radius 3 KM.

### Phase 2 - Deterministic Core

1. Bangun normalizer POI.
2. Bangun `competitor_map`.
3. Bangun demand-based TAM/SAM/SOM.
4. Bangun supply-based market estimation.
5. Bangun `market_gap` dan `decision`.

### Phase 3 - Data Quality and Safety

1. Tambahkan flags `estimated`, `reasoning`, `assumption_source`.
2. Tambahkan `data_quality`.
3. Tambahkan retry, timeout, rate limit, logging.
4. Tambahkan contract validation dengan JSON Schema.

### Phase 4 - AI Layer

1. Ubah prompt agar hanya membaca structured input backend.
2. Batasi AI hanya untuk insight naratif.
3. Tambahkan post-validation untuk memastikan AI tidak mengubah angka.

### Phase 5 - Dashboard UX

1. Heatmap radius 3 KM
2. Competitor density indicator
3. TAM/SAM/SOM chart
4. Break-even card
5. Decision badge `OPEN|CONSIDER|AVOID`

## 6. Prioritas Refactor Paling Mendesak

1. Hentikan penyimpanan API key di frontend.
2. Hentikan market estimation heuristik di `app.js`.
3. Tambahkan endpoint backend `GET /places`.
4. Jadikan radius 3 KM sebagai filter tunggal semua layer.
5. Kunci schema final dengan field `estimated/reasoning/assumption_source/data_quality/decision/unit_economics`.
