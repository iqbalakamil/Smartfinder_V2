# SMARTFINDER V2 — SES (SOCIOECONOMIC STATUS) IMPLEMENTATION SPECIFICATION

**Dokumen untuk Codex / AI Coding Agent**  
**Repository:** `https://github.com/iqbalakamil/smartfinder_v2`  
**Branch acuan:** `main`  
**Tanggal:** 18 September 2026

---

## 1. TUJUAN

Kembangkan Smartfinder V2 agar memiliki modul **Socioeconomic Status (SES) / Socioeconomic Profile** berbasis geospasial.

Modul SES harus:

1. Memanfaatkan data Dukcapil yang sudah ada.
2. Menambahkan data ekonomi dan household dari ArcGIS GeoEnrichment apabila tersedia untuk Indonesia.
3. Mengintegrasikan BPS Web API untuk indikator ekonomi/sosial yang relevan.
4. Menghasilkan data mentah, indikator turunan, normalized score, composite SES index, class A/B/C, dan confidence score.
5. Memvisualisasikan SES sebagai polygon pada peta.
6. Tidak mencampur SES dengan Market Potential. SES dan Market Potential harus menjadi dua skor berbeda.
7. Menyimpan metadata sumber, tahun, geographic level, coverage, dan confidence setiap data.
8. Tidak membuat klaim bahwa A/B/C adalah klasifikasi resmi pemerintah. A/B/C adalah klasifikasi internal Smartfinder yang harus dapat dikonfigurasi.

---

# 2. KONTEKS REPOSITORY SAAT INI

Repository Smartfinder V2 sudah memiliki:

- `app.js`
- `server.js`
- `demography-map.html`
- `services/bps`
- endpoint Dukcapil ArcGIS
- WorldPop fallback
- Google Maps/POI
- berbagai modul research dan geospatial.

Repository saat ini memiliki modul BPS di `services/bps` dan konfigurasi Dukcapil di `server.js`.

Temuan penting pada `server.js`:

```js
const DUKCAPIL_ARCGIS_BASE_URL =
  normalizeOptionalUrl(process.env.DUKCAPIL_ARCGIS_BASE_URL) ||
  "https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services";

const DUKCAPIL_DEMOGRAPHY_SERVICE =
  process.env.DUKCAPIL_DEMOGRAPHY_SERVICE || "AGR_VISUAL_KEC_FIX";

const DUKCAPIL_DEMOGRAPHY_LAYER_ID =
  Number(process.env.DUKCAPIL_DEMOGRAPHY_LAYER_ID || 2);

const DUKCAPIL_KELURAHAN_SERVICE =
  process.env.DUKCAPIL_KELURAHAN_SERVICE || "AGR_VISUAL_KEL_FIX";

const DUKCAPIL_KELURAHAN_LAYER_ID =
  Number(process.env.DUKCAPIL_KELURAHAN_LAYER_ID || 0);
```

Jangan membuat ulang integrasi Dukcapil jika fungsi yang ada dapat digunakan kembali.

---

# 3. PRINSIP UTAMA IMPLEMENTASI

## 3.1 Jangan membuat SES hanya dari satu sumber

Arsitektur target:

```text
DUKCAPIL
  ├─ Demography
  ├─ Education
  ├─ Employment
  └─ Household structure

ARC GIS GEOENRICHMENT
  ├─ Income
  ├─ Purchasing Power
  ├─ Housing
  ├─ Household economics
  ├─ Spending
  └─ Other Indonesia-available socioeconomic variables

BPS WEB API
  ├─ Poverty
  ├─ Expenditure
  ├─ Wage / labor
  ├─ Education
  └─ Economic validation

             ↓

      SES FEATURE ENGINE

             ↓

      NORMALIZED INDICATORS

             ↓

      SES INDEX 0–100

             ↓

      SES CLASS A / B / C

             ↓

      CONFIDENCE SCORE

             ↓

      POLYGON VISUALIZATION
```

## 3.2 Jangan mengarang data

Jika sebuah variabel tidak tersedia untuk Indonesia:

- jangan menggunakan data negara lain;
- jangan mengganti dengan data Amerika;
- jangan membuat angka estimasi tanpa label;
- jangan menganggap kecamatan = kelurahan;
- simpan status `unavailable`.

## 3.3 Geographic level wajib disimpan

Setiap observation wajib mempunyai metadata:

```json
{
  "geographic_level": "kelurahan",
  "source": "dukcapil",
  "reference_period": "2025",
  "is_estimated": false,
  "coverage_confidence": 1
}
```

Jika BPS hanya tersedia pada level kecamatan:

```json
{
  "geographic_level": "kecamatan",
  "source": "bps",
  "is_estimated": false
}
```

Jangan melakukan join kelurahan-ke-kecamatan tanpa menyimpan fakta bahwa data ekonominya berasal dari level kecamatan.

---

# 4. KOMPONEN SES TARGET

Gunakan lima domain utama.

| Domain | Bobot awal | Sumber utama |
|---|---:|---|
| Economic Capacity | 30% | ArcGIS + BPS |
| Education | 20% | Dukcapil + BPS |
| Employment | 15% | Dukcapil + BPS |
| Household & Housing | 20% | ArcGIS + BPS + Dukcapil |
| Consumption / Purchasing Power | 15% | ArcGIS + BPS |

**Catatan:** bobot adalah konfigurasi awal Smartfinder, bukan standar SES resmi. Semua bobot harus configurable.

---

# 5. DOMAIN 1 — ECONOMIC CAPACITY

Prioritaskan:

```text
household income
median household income
average household income
per capita income
disposable income
poverty rate
economic capacity
```

Jika hanya sebagian tersedia, gunakan yang tersedia dan hitung coverage.

Contoh schema:

```json
{
  "income_household_median": null,
  "income_household_average": null,
  "income_per_capita": null,
  "poverty_rate": null,
  "economic_capacity_score": null,
  "economic_capacity_coverage": 0
}
```

Jangan mengisi nilai `0` untuk data yang tidak tersedia. Gunakan `null`.

---

# 6. DOMAIN 2 — EDUCATION

Gunakan data Dukcapil yang sudah ada jika field tersedia.

Target feature:

```text
pct_high_school_plus
pct_diploma_plus
pct_bachelor_plus
pct_master_plus
pct_doctoral
```

Contoh:

```text
Bachelor+ =
(S1 + S2 + S3) / education_population_base
```

Perhatikan denominator.

Jangan otomatis menggunakan total penduduk jika denominator yang lebih tepat dapat ditentukan dari struktur data pendidikan.

Output:

```json
{
  "pct_high_school_plus": null,
  "pct_diploma_plus": null,
  "pct_bachelor_plus": null,
  "education_score": null
}
```

---

# 7. DOMAIN 3 — EMPLOYMENT

Gunakan data pekerjaan Dukcapil yang sudah tersedia.

Kelompokkan menjadi feature yang dapat dikonfigurasi.

Contoh:

```text
professional/skilled
business/entrepreneur
employee
informal
unemployed/not working
student
household work
retired
```

PENTING:

Jangan menganggap satu jenis pekerjaan otomatis berarti SES tinggi/rendah.

Gunakan distribusi pekerjaan wilayah sebagai socioeconomic signal.

Contoh output:

```json
{
  "pct_professional_skilled": null,
  "pct_business": null,
  "pct_employee": null,
  "pct_informal": null,
  "pct_unemployed": null,
  "employment_score": null
}
```

---

# 8. DOMAIN 4 — HOUSEHOLD & HOUSING

Prioritaskan:

```text
household size
home ownership
housing type
housing quality
floor area
electricity
water source
sanitation
vehicle ownership
housing value
```

Data Dukcapil yang sudah tersedia:

```text
population
households
age structure
```

Turunan:

```text
average_household_size =
population / households
```

ArcGIS harus dicek untuk variabel:

```text
home ownership
housing characteristics
housing value
vehicle ownership
household characteristics
```

Jangan mengasumsikan semua variabel tersedia di Indonesia sebelum melakukan discovery.

---

# 9. DOMAIN 5 — CONSUMPTION / PURCHASING POWER

Prioritaskan:

```text
purchasing power
disposable income
retail spending
education spending
healthcare spending
recreation spending
non-food spending
other discretionary spending
```

Untuk Smartkidz, education-related spending dan discretionary spending adalah market signals yang berguna.

Namun jangan menyamakan:

```text
high spending = high SES
```

tanpa melihat definisi variabel dan denominator.

---

# 10. DUKCAPIL — GUNAKAN KEMBALI

Endpoint yang sudah ada:

```text
https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services/AGR_VISUAL_KEC_FIX/FeatureServer/2/query

https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services/AGR_VISUAL_KEL_FIX/FeatureServer/0/query
```

Konfigurasi harus tetap menggunakan environment variables.

Target data:

```text
population
households
age bands
gender
education
employment
births
population growth
```

Data seperti agama dan golongan darah tidak perlu digunakan untuk SES.

---

# 11. ARC GIS GEOENRICHMENT

ArcGIS GeoEnrichment REST API:

```text
https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/GeoEnrichment/Enrich
```

Dokumentasi resmi:

```text
https://developers.arcgis.com/rest/geoenrichment/enrich/
```

API mendukung `studyAreas`, `dataCollections`, `analysisVariables`, `useData`, dan opsi geometry.

## WAJIB: lakukan discovery sebelum implementasi

Codex harus mencari analysis variables yang benar-benar tersedia untuk:

```text
Indonesia / ID
```

Jangan hard-code variable ID berdasarkan contoh negara lain.

Cari variabel berdasarkan domain:

```text
income
household
housing
education
employment
purchasing power
spending
vehicle
```

Simpan hasil discovery dalam konfigurasi, misalnya:

```text
config/geoenrichment-indonesia.json
```

Contoh:

```json
{
  "country": "ID",
  "last_verified_at": "YYYY-MM-DD",
  "variables": {
    "income_household_median": {
      "analysisVariable": null,
      "available": false,
      "notes": ""
    }
  }
}
```

Jika variable tersedia:

```json
{
  "analysisVariable": "ACTUAL_VARIABLE_ID",
  "available": true
}
```

Jangan mengisi placeholder dengan ID palsu.

---

# 12. ARC GIS ENRICH ENDPOINT

Implementasi backend sebaiknya memiliki wrapper terpisah:

```text
services/arcgis/
  geoenrichment-client.js
  geoenrichment-variables.js
```

Contoh interface:

```js
async function enrichStudyArea({
  studyAreas,
  analysisVariables,
  dataCollections,
  country = "ID"
}) {
  // ...
}
```

Endpoint internal Smartfinder:

```text
GET /api/ses/arcgis-variables
POST /api/ses/arcgis-enrich
```

Jangan expose ArcGIS credential/token ke frontend.

---

# 13. BPS WEB API

BPS menyediakan Web API untuk mengakses data statistik secara programmatic.

Portal:

```text
https://webapi.bps.go.id/
```

Developer/API:

```text
https://webapi.bps.go.id/developer
```

Web API BPS membutuhkan registrasi/token.

Smartfinder sudah memiliki:

```text
services/bps
```

Jangan membuat BPS client kedua jika `services/bps` dapat dikembangkan.

Prioritaskan discovery untuk:

```text
pengeluaran per kapita
pengeluaran rumah tangga
kemiskinan
upah
ketenagakerjaan
pendidikan
perumahan
indikator ekonomi
```

PENTING:

BPS sering memiliki geographic level yang berbeda. Setiap hasil wajib menyimpan:

```text
province
regency
district
village (jika tersedia)
reference period
table ID
variable ID
```

---

# 14. BPS DISCOVERY LAYER

Tambahkan mekanisme:

```text
BPS
 ↓
discover dataset/table
 ↓
discover variable
 ↓
select relevant indicator
 ↓
fetch data
 ↓
normalize
 ↓
cache
```

Jangan hard-code table ID sebelum diverifikasi.

Buat registry:

```text
config/bps-ses-indicators.json
```

Contoh:

```json
{
  "poverty_rate": {
    "table_id": null,
    "variable_id": null,
    "geographic_level": null,
    "available": false
  }
}
```

Setelah audit API berhasil, isi dengan ID nyata.

---

# 15. DATA MODEL

Buat model canonical agar semua provider memiliki format yang sama.

Contoh:

```json
{
  "area_id": "ID_AREA",
  "area_name": "Nama Area",
  "geographic_level": "kelurahan",

  "geometry": {},

  "sources": {
    "dukcapil": {
      "available": true,
      "reference_period": "2025"
    },
    "arcgis": {
      "available": true,
      "reference_period": "2025"
    },
    "bps": {
      "available": true,
      "reference_period": "2025"
    }
  },

  "raw": {},
  "derived": {},
  "normalized": {},

  "scores": {
    "economic": null,
    "education": null,
    "employment": null,
    "household_housing": null,
    "consumption": null,
    "ses_index": null,
    "confidence": null
  },

  "classification": {
    "class": null
  }
}
```

---

# 16. NORMALIZATION

Semua feature harus dinormalisasi sebelum digabung.

Default:

```text
0 = lowest relative socioeconomic signal
100 = highest relative socioeconomic signal
```

Metode default dapat menggunakan percentile/min-max pada comparison universe.

Contoh min-max:

```text
normalized =
(value - min) / (max - min) * 100
```

Tetapi implementasi harus menangani:

```text
max == min
null
outlier
negative indicator
```

Untuk indikator negatif:

```text
poverty_rate
unemployment
```

arah score harus dibalik.

Contoh:

```text
negative_normalized = 100 - positive_normalized
```

Jangan mengubah data mentah.

---

# 17. COMPOSITE SES INDEX

Default:

```text
SES =
Economic Capacity * 0.30
+ Education * 0.20
+ Employment * 0.15
+ Household Housing * 0.20
+ Consumption Purchasing Power * 0.15
```

Semua bobot configurable.

Contoh konfigurasi:

```json
{
  "economic": 0.30,
  "education": 0.20,
  "employment": 0.15,
  "household_housing": 0.20,
  "consumption": 0.15
}
```

Jika satu domain tidak tersedia, jangan otomatis memberi score 0.

Gunakan weighted available score:

```text
adjusted_score =
sum(available_component_score * component_weight)
/
sum(available_component_weight)
```

Simpan:

```text
component_coverage
```

---

# 18. SES CLASS A / B / C

A/B/C adalah klasifikasi internal Smartfinder.

Default awal:

```text
A = SES Index >= 66.67
B = SES Index >= 33.33 and < 66.67
C = SES Index < 33.33
```

Namun threshold harus configurable.

Lebih baik support dua mode:

```text
absolute_threshold
percentile
```

Contoh percentile:

```text
A = top 33%
B = middle 34%
C = bottom 33%
```

Jangan menyebut hasil sebagai:

```text
"SES resmi A"
```

Gunakan:

```text
"Smartfinder SES Class: A"
```

---

# 19. CONFIDENCE SCORE

Buat confidence terpisah dari SES.

Confidence mempertimbangkan:

```text
data coverage
source reliability
recency
geographic match
cross-source agreement
```

Contoh:

```text
coverage = 0.80
source_quality = 0.90
geo_match = 1.00
recency = 0.85
agreement = 0.80
```

Hasil:

```text
confidence_score = weighted calculation
```

Tampilkan:

```text
SES Index: 73
Class: A
Confidence: 82%
```

---

# 20. DATA FRESHNESS

Setiap data wajib memiliki:

```text
source
reference_period
retrieved_at
```

Jika source memiliki tahun berbeda:

```text
Dukcapil: 2025
BPS: 2024
ArcGIS: 2025
```

jangan menyembunyikan perbedaan tersebut.

UI harus dapat menunjukkan:

```text
Data coverage: Mixed years
```

---

# 21. GEOGRAPHIC LEVEL

Smartfinder memiliki polygon kelurahan dari Dukcapil.

Target:

```text
Kelurahan polygon
      ↓
join SES features
      ↓
SES polygon
```

Tetapi jika sebuah feature hanya tersedia di kecamatan:

```text
Kelurahan
   ↓
Kecamatan parent
   ↓
use district-level value
```

dan metadata harus mengatakan:

```text
indicator_geographic_level = kecamatan
```

Jangan mengklaim nilai tersebut sebagai observasi kelurahan.

---

# 22. VISUALISASI

Pada peta, tambahkan layer:

```text
SES Layer
```

Property polygon:

```json
{
  "ses_index": 72.4,
  "ses_class": "A",
  "ses_confidence": 84,
  "economic_score": 76,
  "education_score": 81,
  "employment_score": 69,
  "household_housing_score": 70,
  "consumption_score": 74
}
```

UI popup:

```text
Nama Kelurahan
────────────────────
SES: A
SES Index: 72.4
Confidence: 84%

Economic       76
Education      81
Employment     69
Housing        70
Consumption    74

Data:
Dukcapil 2025
BPS 2024
ArcGIS 2025
```

Legend:

```text
A — High socioeconomic signal
B — Medium socioeconomic signal
C — Lower socioeconomic signal
```

Hindari wording yang menghakimi penduduk.

---

# 23. SES ≠ MARKET POTENTIAL

Jangan menggabungkan SES dan market potential menjadi satu score.

Buat:

```text
SES INDEX
```

dan:

```text
MARKET POTENTIAL INDEX
```

terpisah.

Market Potential nantinya dapat menggunakan:

```text
children 2–7
population
households
population growth
competitors
residential density
accessibility
POI
foot traffic
catchment
```

Contoh:

```text
LOCATION PROFILE

SES Index             78
Market Potential      86
Children 2–7          12,430
Competitor Density    Medium
Accessibility         High
```

Untuk keputusan lokasi Smartkidz, keduanya baru dapat digunakan bersama dalam modul site selection.

---

# 24. API ENDPOINT YANG DIREKOMENDASIKAN

Tambahkan endpoint internal:

```text
GET  /api/ses/status
GET  /api/ses/variables
GET  /api/ses/arcgis-variables
POST /api/ses/arcgis-enrich
GET  /api/ses/bps-indicators
POST /api/ses/bps-fetch
GET  /api/ses/dukcapil
POST /api/ses/calculate
POST /api/ses/area
GET  /api/ses/legend
```

Nama endpoint boleh disesuaikan dengan routing architecture yang sudah ada.

Jangan membuat endpoint duplikat jika fungsi yang sama sudah tersedia.

---

# 25. CACHING

SES API dapat mahal/lambat jika setiap polygon selalu melakukan enrichment ulang.

Implementasikan cache:

```text
provider
area_id
analysis_variables
reference_period
```

Cache key contoh:

```text
arcgis:ID:kelurahan:AREA_ID:VARIABLE_SET_HASH
```

Cache harus memiliki TTL/configurable refresh.

---

# 26. SECURITY — WAJIB DIAUDIT

Saat melakukan audit repository, Codex harus mencari:

```text
API keys
tokens
password
secret
credentials
```

Jangan menaruh secret di frontend.

Jangan commit secret baru.

Jika menemukan credential/API key yang sudah pernah ter-commit, tandai sebagai **security issue** dan rekomendasikan rotasi/revocation. Jangan menyalin secret ke file dokumentasi atau source baru.

Gunakan:

```text
.env
```

dan:

```text
.env.example
```

untuk nama variable saja.

---

# 27. FASE IMPLEMENTASI

## PHASE 0 — AUDIT ONLY

**Tidak boleh mengubah behavior aplikasi.**

Codex harus:

1. Membaca `server.js`.
2. Membaca `app.js` bagian demography/map.
3. Membaca `demography-map.html`.
4. Membaca seluruh `services/bps`.
5. Mencari seluruh endpoint Dukcapil.
6. Mencari seluruh penggunaan geometry/polygon.
7. Mencari existing caching.
8. Mencari existing API routing.
9. Mencari existing data model.
10. Mencari existing SES/demography code.
11. Audit secret exposure.
12. Memetakan dependencies.

Output audit:

```text
docs/SES_AUDIT.md
```

Tidak ada perubahan fungsional.

---

## PHASE 1 — DATA DISCOVERY

Codex harus melakukan discovery:

### Dukcapil

Verifikasi field aktual dari:

```text
AGR_VISUAL_KEC_FIX
AGR_VISUAL_KEL_FIX
```

### ArcGIS

Verifikasi:

```text
Indonesia
analysis variables
data collections
geographic support
reference year
```

### BPS

Verifikasi:

```text
table
variable
geographic level
reference year
API availability
```

Output:

```text
config/geoenrichment-indonesia.json
config/bps-ses-indicators.json
docs/SES_DATA_DICTIONARY.md
```

Tidak boleh mengarang variable ID/table ID.

---

## PHASE 2 — BACKEND DATA CLIENT

Implement:

```text
services/arcgis/geoenrichment-client.js
services/arcgis/geoenrichment-variables.js
```

Perluas:

```text
services/bps
```

jika memungkinkan.

Buat canonical data model.

---

## PHASE 3 — SES ENGINE

Implement:

```text
services/ses/
  ses-engine.js
  normalization.js
  scoring.js
  classification.js
  confidence.js
```

Fungsi minimal:

```js
normalizeIndicator()
calculateDomainScore()
calculateSesIndex()
classifySes()
calculateConfidence()
```

Semua harus pure/testable sebisa mungkin.

---

## PHASE 4 — API

Expose backend endpoint SES.

Pastikan:

```text
frontend -> Smartfinder backend -> provider API
```

bukan:

```text
frontend -> provider API with secret
```

---

## PHASE 5 — MAP

Tambahkan SES polygon layer ke existing map.

Jangan membuat map engine baru jika engine existing dapat digunakan.

---

## PHASE 6 — UI

Tambahkan:

```text
SES toggle
SES legend
SES popup
domain scores
confidence
data source/year
```

---

## PHASE 7 — TEST

Minimal test:

1. Kelurahan dengan seluruh data tersedia.
2. Kelurahan tanpa ArcGIS data.
3. BPS hanya tersedia kecamatan.
4. Missing values.
5. Zero values.
6. Max = min.
7. Outlier.
8. Mixed reference years.
9. Polygon invalid.
10. API timeout.
11. API 401/403.
12. API 429.
13. Empty result.
14. Partial provider failure.

---

# 28. ACCEPTANCE CRITERIA

Implementasi dianggap selesai jika:

### Data

- [ ] Dukcapil existing tetap bekerja.
- [ ] ArcGIS variables Indonesia sudah diverifikasi.
- [ ] BPS indicators sudah diverifikasi.
- [ ] Tidak ada fake variable ID.
- [ ] Geographic level tersimpan.
- [ ] Reference period tersimpan.
- [ ] Source tersimpan.

### Engine

- [ ] Semua domain menghasilkan score 0–100.
- [ ] Missing value tidak dianggap 0.
- [ ] Negative indicators dibalik dengan benar.
- [ ] Weight configurable.
- [ ] Partial coverage ditangani.
- [ ] SES index 0–100.
- [ ] Class A/B/C configurable.
- [ ] Confidence 0–100.

### Map

- [ ] Polygon SES dapat ditampilkan.
- [ ] Popup menampilkan index/class/confidence.
- [ ] Legend tersedia.
- [ ] Data source dan tahun dapat dilihat.

### Security

- [ ] Tidak ada API secret baru di frontend.
- [ ] Tidak ada credential di committed config.
- [ ] `.env.example` hanya berisi nama variable.

### Regression

- [ ] Fitur demography existing tidak rusak.
- [ ] BPS existing tidak rusak.
- [ ] POI/map existing tidak rusak.

---

# 29. REKOMENDASI FILE STRUCTURE

Jika cocok dengan architecture existing:

```text
services/
├── bps/
├── arcgis/
│   ├── geoenrichment-client.js
│   └── geoenrichment-variables.js
└── ses/
    ├── ses-engine.js
    ├── normalization.js
    ├── scoring.js
    ├── classification.js
    ├── confidence.js
    └── data-model.js

config/
├── bps-ses-indicators.json
└── geoenrichment-indonesia.json

docs/
├── SES_AUDIT.md
├── SES_DATA_DICTIONARY.md
└── SES_IMPLEMENTATION.md
```

Jangan memindahkan file existing secara besar-besaran hanya demi struktur ini. Prioritaskan perubahan minimal dan backward compatible.

---

# 30. PROMPT UNTUK CODEX

Gunakan instruksi berikut:

> Pelajari repository Smartfinder V2 secara menyeluruh sebelum mengubah kode.
>
> Fokus task: membangun modul SES geospasial dengan mempertahankan architecture dan fitur existing.
>
> Jangan langsung coding.
>
> Mulai dengan PHASE 0 AUDIT ONLY:
> - audit server.js
> - audit app.js
> - audit demography-map.html
> - audit services/bps
> - audit Dukcapil endpoints
> - audit existing polygon/geometry handling
> - audit existing API routing
> - audit caching
> - audit security/API secrets
>
> Setelah itu lakukan PHASE 1 DATA DISCOVERY.
>
> Verifikasi secara aktual:
> 1. field Dukcapil AGR_VISUAL_KEC_FIX;
> 2. field Dukcapil AGR_VISUAL_KEL_FIX;
> 3. ArcGIS GeoEnrichment analysis variables yang tersedia untuk Indonesia;
> 4. BPS Web API tables/variables untuk income, expenditure, poverty, wage, employment, education, housing;
> 5. geographic level masing-masing data;
> 6. reference period/year masing-masing data.
>
> Jangan mengarang API endpoint, analysisVariable, table ID, atau variable ID.
>
> Setelah discovery selesai, buat `docs/SES_AUDIT.md` dan `docs/SES_DATA_DICTIONARY.md`.
>
> Jangan implementasikan SES sebelum discovery menghasilkan data dictionary yang valid.
>
> Setelah audit disetujui, implementasikan secara bertahap:
> - ArcGIS client
> - BPS extension
> - canonical SES data model
> - normalization
> - domain scoring
> - SES index
> - A/B/C classification
> - confidence
> - SES API endpoints
> - polygon visualization
> - UI
>
> Gunakan lima domain:
> - Economic Capacity 30%
> - Education 20%
> - Employment 15%
> - Household & Housing 20%
> - Consumption/Purchasing Power 15%
>
> Bobot harus configurable.
>
> Jangan membuat SES sebagai standar resmi pemerintah. A/B/C adalah klasifikasi internal Smartfinder.
>
> Jangan menyamakan SES dengan Market Potential. Buat kedua score secara terpisah.
>
> Pertahankan compatibility dengan fitur Smartfinder existing.
>
> Setelah implementasi, jalankan regression tests dan laporkan file yang berubah, endpoint yang ditambah, environment variables baru, sumber data yang berhasil digunakan, data yang tidak tersedia, dan keterbatasan geographic level.

---

# 31. SUMBER DOKUMENTASI

Repository:

https://github.com/iqbalakamil/smartfinder_v2

ArcGIS GeoEnrichment:

https://developers.arcgis.com/rest/geoenrichment/enrich/

BPS Web API:

https://webapi.bps.go.id/

BPS developer:

https://webapi.bps.go.id/developer

---

# 32. CATATAN PENTING UNTUK IMPLEMENTASI

Prioritas Smartfinder bukan membuat model statistik yang terlihat kompleks, tetapi membuat **data pipeline yang transparan dan dapat diaudit**.

Untuk setiap nilai SES, pengguna harus dapat menjawab:

```text
Nilai ini berasal dari mana?
Tahun berapa?
Level geografis apa?
Data mentahnya apa?
Formula turunannya apa?
Bobotnya berapa?
Coverage-nya berapa?
Confidence-nya berapa?
```

Jika Smartfinder dapat menjawab tujuh pertanyaan tersebut, modul SES akan jauh lebih mudah dikembangkan, divalidasi, dan digunakan untuk site selection.

---

## STATUS DOKUMEN

```text
Status: Implementation Specification
Mode: Audit → Discovery → Implementation
Primary sources:
- Dukcapil
- ArcGIS GeoEnrichment
- BPS Web API

Target:
SES polygon + SES Index + A/B/C + Confidence
```
