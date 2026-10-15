$ErrorActionPreference = 'Stop'
$outPath = Join-Path (Get-Location) 'Dokumentasi_dan_RAB_Smart_Finder.docx'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Add()
$sel = $word.Selection

function Set-Style([string]$style) { $sel.Style = $style }
function Add-Title([string]$text) { Set-Style 'Title'; $sel.TypeText($text); $sel.TypeParagraph() }
function Add-H1([string]$text) { Set-Style 'Heading 1'; $sel.TypeText($text); $sel.TypeParagraph() }
function Add-H2([string]$text) { Set-Style 'Heading 2'; $sel.TypeText($text); $sel.TypeParagraph() }
function Add-P([string]$text) { Set-Style 'Normal'; $sel.TypeText($text); $sel.TypeParagraph() }
function Add-Bullets([string[]]$items) {
  foreach ($item in $items) { $sel.Style = 'List Bullet'; $sel.TypeText($item); $sel.TypeParagraph() }
  Set-Style 'Normal'
}
function Add-Num([string[]]$items) {
  foreach ($item in $items) { $sel.Style = 'List Number'; $sel.TypeText($item); $sel.TypeParagraph() }
  Set-Style 'Normal'
}
function Add-Table([object[][]]$rows, [int[]]$widths = $null) {
  $table = $doc.Tables.Add($sel.Range, $rows.Count, $rows[0].Count)
  $table.Style = 'Table Grid'
  $table.Rows.Alignment = 1
  for ($r = 0; $r -lt $rows.Count; $r++) {
    for ($c = 0; $c -lt $rows[$r].Count; $c++) {
      $table.Cell($r + 1, $c + 1).Range.Text = [string]$rows[$r][$c]
    }
  }
  if ($widths) {
    for ($c = 0; $c -lt $widths.Count; $c++) { $table.Columns.Item($c + 1).Width = $widths[$c] }
  }
  $table.Rows.Item(1).Range.Bold = $true
  $sel.SetRange($table.Range.End, $table.Range.End)
  $sel.TypeParagraph()
}
function Add-PageBreak() { $sel.InsertBreak(7) }

$doc.BuiltInDocumentProperties('Title').Value = 'Dokumentasi dan RAB Smart Finder'
$doc.BuiltInDocumentProperties('Subject').Value = 'Dokumentasi fitur aplikasi dan rencana anggaran biaya'
$doc.BuiltInDocumentProperties('Author').Value = 'Smart Finder'

Add-Title 'SMART FINDER'
Add-P 'Dokumentasi Fitur, Arsitektur Data, Perhitungan SES, dan RAB Implementasi'
Add-P 'Tanggal dokumen: 20 September 2026'
Add-P 'Dokumen ini menjelaskan aplikasi Smart Finder untuk survey kelayakan pembukaan cabang Bimba & Preschool dengan target segmen menengah, termasuk kebutuhan layanan VPS, database, Google Maps Platform, dan ArcGIS.'
Add-PageBreak

Add-H1 '1. Ringkasan Eksekutif'
Add-P 'Smart Finder adalah dashboard geospasial untuk menilai kelayakan area cabang baru. Aplikasi menggabungkan data titik lokasi/POI, demografi Dukcapil, peta CGIS, nilai tanah, penggunaan tanah, status Hak Milik, kawasan kumuh, serta analisis SES dan Potensi Area dalam bentuk polygon dan hexagon.'
Add-P 'Output utama aplikasi adalah peta interaktif radius 3 km untuk analisis lokasi, profil demografi, hasil analisa studi kelayakan, indeks SES, indeks Potensi Area, dan grid hexagon radius 1,5 km yang dapat dipakai untuk membandingkan kandidat area.'
Add-Bullets @(
  'SES digunakan sebagai pembacaan relatif kondisi sosial-ekonomi area dan masih bersifat provisional, bukan klasifikasi SES resmi pemerintah.',
  'Potensi Area mengukur kecocokan pasar Bimba & Preschool, terutama anak usia dini, jumlah penduduk, pertumbuhan, kelahiran, tenure, perumahan, dan nilai tanah.',
  'Data spasial diprioritaskan dari JSON BIG untuk ZNT, penggunaan tanah, Hak Milik, dan kawasan kumuh; BHUMI menjadi fallback untuk data yang belum tersedia.',
  'Aplikasi berjalan sebagai Node.js server dengan frontend HTML/JavaScript dan peta MapLibre GL JS.'
)

Add-H1 '2. Daftar Fitur Aplikasi'
Add-H2 '2.1 Input Lokasi dan Parameter'
Add-Bullets @(
  'Input alamat, koordinat latitude/longitude, atau tautan Google Maps.',
  'Reverse geocoding untuk mengubah koordinat menjadi alamat/wilayah.',
  'Pencarian alamat dengan ArcGIS Geocoding jika API key tersedia, dengan fallback OpenStreetMap.',
  'Pengaturan radius analisis utama 3 km.',
  'Penanda titik lokasi utama dan lingkaran radius pada peta.',
  'Mode peta 2D dan satellite/base map.'
)

Add-H2 '2.2 POI dan Market Mapping'
Add-Bullets @(
  'Crawling atau pencarian POI di sekitar lokasi.',
  'Sumber POI: Google Maps crawler, OpenStreetMap/Overpass, Google Places/ArcGIS Places jika dikonfigurasi.',
  'Klasifikasi POI menjadi pendukung, risiko, kompetitor, pendidikan, hunian, fasilitas keluarga, dan kategori lain.',
  'Marker POI interaktif dengan nama, alamat, rating, jumlah ulasan, tautan peta, kategori, dan sumber data.',
  'Peta heatmap dan ringkasan jumlah POI.',
  'Export hasil POI ke XLS.',
  'Filter sumber POI dan status proses crawling.'
)

Add-H2 '2.3 Analisis Studi Kelayakan'
Add-Bullets @(
  'Ringkasan area dan kondisi pasar.',
  'Analisis TAM, SAM, SOM dan market share.',
  'Estimasi kapasitas siswa dan kapasitas cabang.',
  'Pembacaan kompetitor dan fasilitas pendukung.',
  'Analisis SWOT dan rekomendasi area.',
  'Skenario SPP/biaya dan estimasi kelayakan.',
  'Riset tambahan berbasis web, berita, media sosial, event, dan sinyal pasar melalui modul riset terstruktur/TinyFish jika aktif.'
)

Add-H2 '2.4 Menu Rekomendasi Area'
Add-Bullets @(
  'Dropdown provinsi.',
  'Dropdown multi-select kota/kabupaten dengan pencarian.',
  'Dropdown multi-select kecamatan dengan opsi pilih semua.',
  'Pengambilan polygon Dukcapil sesuai wilayah terpilih.',
  'Perhitungan SES wilayah pembanding.',
  'Pembuatan grid hexagon dengan ukuran 1,5 km.',
  'Hexagon langsung ditampilkan sebagai skor dasar, lalu diperbarui progresif setelah data BIG/BHUMI selesai.',
  'Progress loading per hexagon.',
  'Popup hexagon berisi skor SES, kelas, confidence, komponen, ketersediaan data, nilai tanah, guna tanah, Hak Milik, dan sumber data.'
)

Add-H2 '2.5 CGIS dan Demografi'
Add-Bullets @(
  'Layer polygon demografi Dukcapil per wilayah.',
  'Klasifikasi warna dari biru rendah sampai merah tinggi.',
  'Jumlah penduduk dan komposisi usia.',
  'Kelompok usia u0-u4, u5-u9, dan kelompok usia lainnya.',
  'Proporsi usia 0-14, usia produktif 15-64, dan usia 65+.',
  'Jumlah anak usia dini sebagai proxy target pasar.',
  'Jumlah kelahiran 2020-2024.',
  'Rata-rata pertumbuhan penduduk dalam persentase.',
  'Rata-rata lama sekolah jika tersedia pada sumber data.'
)

Add-H2 '2.6 Layer Nilai Tanah dan Pertanahan'
Add-Bullets @(
  'Toggle BHUMI WMS untuk Zona Nilai Tanah, Penggunaan Tanah, dan bidang tanah.',
  'Toggle JSON BIG untuk polygon ZNT berdasarkan extent peta.',
  'JSON BIG ZNT: range nilai, kelas nilai, nomor zona, kantor wilayah, dan kantor pertanahan.',
  'JSON BIG Penggunaan Tanah 10K: objek penggunaan tanah, kode, dan luas/atribut terkait.',
  'JSON BIG Hak Milik: bidang polygon, tipe hak, NIB, kecamatan, dan kelurahan pada provinsi yang tersedia.',
  'JSON BIG kawasan kumuh: polygon, provinsi, kota, kecamatan, kelurahan, kode RT/RW, SK, dan keterangan.',
  'Data JSON BIG diprioritaskan dalam enrichment SES; BHUMI/CSW dipakai sebagai fallback.',
  'Popup menampilkan jumlah polygon/bidang yang berhasil dibaca.'
)

Add-H2 '2.7 Fitur Pendukung'
Add-Bullets @(
  'BPS Data Explorer untuk pencarian indikator BPS dan tabel statistik.',
  'Instagram Locator untuk pencarian sinyal lokasi/media sosial jika cookie dan konfigurasi tersedia.',
  'Live CCTV Indonesia dengan filter wilayah dan daftar kamera.',
  'Shortlist referensi ruko/cabang.',
  'Draw dan tactical map tools.',
  'Hard reset/startup handling untuk instance Node.js dan port 3000.',
  'Spinner/loading overlay dan log progres.'
)

Add-PageBreak
Add-H1 '3. Arsitektur dan Alur Data'
Add-P 'Arsitektur aplikasi terdiri dari frontend browser, backend Node.js, modul SES, service integrasi eksternal, serta layer peta. Backend bertindak sebagai proxy agar API key dan proses enrichment tidak dibuka langsung di browser.'
Add-Table @(
  @('Komponen','Fungsi'),
  @('Frontend HTML/JavaScript','UI drawer, peta, form, popup, layer, progress, export XLS.'),
  @('Node.js server','Routing API, proxy data eksternal, crawling, cache, enrichment, dan startup port 3000.'),
  @('Modul SES','Ekstraksi indikator, normalisasi relatif p05-p95, bobot domain, confidence, kelas A/B/C.'),
  @('Dukcapil ArcGIS','Polygon wilayah dan atribut demografi.'),
  @('BIG ArcGIS REST JSON','ZNT, penggunaan tanah, Hak Milik, dan kawasan kumuh.'),
  @('BHUMI ATR/BPN','WMS dan fallback identify untuk atribut pertanahan.'),
  @('Google/ArcGIS location services','Geocode, route, places, enrichment bila key dan privilege tersedia.'),
  @('Database/cache','Disarankan menyimpan cache wilayah, POI, log, audit request, dan hasil enrichment.' )
)
Add-H2 '3.1 Urutan Perhitungan Rekomendasi Area'
Add-Num @(
  'Pengguna memilih provinsi, kota/kabupaten, dan kecamatan.',
  'Sistem mengambil polygon Dukcapil dan atribut demografi.',
  'Sistem menghitung SES dasar wilayah pembanding.',
  'Sistem membentuk grid hexagon radius 1,5 km.',
  'Grid awal segera ditampilkan agar pengguna tidak menunggu layar kosong.',
  'Sistem mengambil JSON BIG per hexagon: ZNT, penggunaan tanah, Hak Milik, dan kawasan kumuh.',
  'Jika BIG tidak mengembalikan data, sistem menggunakan fallback BHUMI/CSW.',
  'Sistem menggabungkan seluruh data dan menghitung ulang skor SES/Potensi Area.',
  'Peta, popup, warna, confidence, dan komponen diperbarui.'
)

Add-H1 '4. Metode Perhitungan SES dan Potensi Area'
Add-P 'Model aktif bersifat SES composite provisional. Normalisasi indikator menggunakan pembanding wilayah yang sedang diproses. Untuk mengurangi pengaruh outlier, implementasi menggunakan batas persentil p05 dan p95. Arah indikator dapat positif atau lower-is-higher.'
Add-H2 '4.1 Bobot Domain SES'
Add-Table @(
  @('Domain','Bobot'),
  @('Economic capacity','35%'),
  @('Education','20%'),
  @('Employment','15%'),
  @('Household & housing','15%'),
  @('Consumption','10%'),
  @('Demography','5%')
)
Add-H2 '4.2 Indikator Penting SES'
Add-Bullets @(
  'Pendidikan: SLTA+, diploma+, S1+, master/doctoral jika tersedia.',
  'Pekerjaan: profesional/terampil, usaha/perdagangan, belum/tidak bekerja.',
  'Hunian: ukuran rumah tangga, kepemilikan rumah jika tersedia, proporsi Hak Milik.',
  'Ekonomi/lokasi: nilai tanah ZNT sebagai proxy, bukan pengganti pendapatan.',
  'Demografi: anak 0-14, usia produktif 15-64, dan lansia 65+.',
  'Risiko: kawasan kumuh BIG menjadi faktor pengurang pada domain hunian.'
)
Add-H2 '4.3 Bobot Potensi Area'
Add-Table @(
  @('Domain','Bobot'),
  @('Target demand anak','27%'),
  @('Child share','18%'),
  @('Population','9%'),
  @('Tenure security','9%'),
  @('Residential density','14%'),
  @('Land market','10%'),
  @('Birth signal','8%'),
  @('Growth signal','5%'),
  @('Risk adjustment','5%')
)
Add-P 'Confidence menunjukkan cakupan indikator yang benar-benar tersedia. Nilai confidence rendah berarti skor tidak boleh diperlakukan sebagai kepastian ekonomi; perlu survei lapangan dan validasi komersial.'

Add-PageBreak
Add-H1 '5. RAB Pembuatan dan Implementasi'
Add-P 'RAB berikut adalah estimasi untuk penyempurnaan, hardening, deployment, dan dokumentasi aplikasi Smart Finder sesuai cakupan fitur saat ini. Nilai belum termasuk PPN, perjalanan survei lapangan, pembelian dataset berlisensi, dan biaya legal/kontrak penyedia data.'
Add-Table @(
  @('No','Pekerjaan','Estimasi'),
  @('1','Analisis kebutuhan, arsitektur, dan desain model data','Rp12.000.000'),
  @('2','UI/UX dashboard, drawer, peta, popup, responsive layout','Rp15.000.000'),
  @('3','Modul input lokasi, radius, POI, kategori, filter, export XLS','Rp18.000.000'),
  @('4','Integrasi Dukcapil ArcGIS dan layer demografi','Rp18.000.000'),
  @('5','Engine SES, normalisasi, confidence, kelas warna, dan hexagon','Rp25.000.000'),
  @('6','Integrasi BIG ZNT, penggunaan tanah, Hak Milik, kawasan kumuh','Rp25.000.000'),
  @('7','Integrasi BHUMI WMS/identify dan fallback/cache','Rp15.000.000'),
  @('8','Integrasi Google Maps Platform dan ArcGIS Location Services','Rp18.000.000'),
  @('9','Analisis studi kelayakan, TAM/SAM/SOM, SWOT, riset tambahan','Rp16.000.000'),
  @('10','BPS Explorer, Instagram Locator, CCTV, shortlist, utility tools','Rp12.000.000'),
  @('11','Keamanan API key, logging, quota, cache, testing, deployment VPS','Rp18.000.000'),
  @('12','Dokumentasi teknis, SOP operator, training, dan handover','Rp8.000.000'),
  @('','Subtotal','Rp200.000.000'),
  @('','Cadangan perubahan dan risiko 10%','Rp20.000.000'),
  @('','Total estimasi implementasi','Rp220.000.000')
)
Add-P 'Estimasi durasi implementasi: 10-14 minggu, bergantung pada akses API, stabilitas endpoint pemerintah, finalisasi bobot SES, dan jumlah iterasi UAT.'

Add-H1 '6. RAB Operasional Bulanan'
Add-H2 '6.1 Infrastruktur VPS dan Database'
Add-Table @(
  @('Komponen','Rekomendasi','Promo / bulan','Perpanjangan / bulan'),
  @('Hostinger VPS','KVM 2: 2 vCPU, 8 GB RAM, 100 GB NVMe, 8 TB bandwidth','Rp155.900','Rp232.900'),
  @('Database','MySQL/PostgreSQL di VPS yang sama, backup dan indexing','Termasuk VPS','Termasuk VPS'),
  @('Backup offsite','Object storage/backup tambahan','Rp100.000','Rp100.000'),
  @('Monitoring dan alert','Uptime, error log, disk, RAM, quota','Rp150.000','Rp150.000'),
  @('Domain/SSL','Domain tahunan dan SSL; SSL dapat memakai Let’s Encrypt','±Rp20.000 ekuivalen','±Rp20.000 ekuivalen')
)
Add-P 'Hostinger menampilkan KVM 2 sebesar Rp155.900/bulan pada periode promo dan Rp232.900/bulan untuk perpanjangan. Harga promo biasanya mensyaratkan pembayaran periode tertentu di muka; konfirmasi harga saat pembelian.'

Add-H2 '6.2 Google Maps Platform'
Add-P 'Komponen yang perlu disiapkan: Dynamic Maps atau Map Tiles, Geocoding, Places Text Search/Nearby Search, Place Details, Routes Compute Routes, Route Matrix, dan opsional Roads/Street View. Google menerapkan pay-as-you-go per SKU dan free usage cap per bulan.'
Add-Table @(
  @('SKU','Harga global setelah free cap','Free usage cap'),
  @('Dynamic Maps','US$7 / 1.000 load','10.000'),
  @('Geocoding','US$5 / 1.000 request','10.000'),
  @('Routes Compute Routes Essentials','US$5 / 1.000 request','10.000'),
  @('Route Matrix Essentials','US$5 / 1.000 request','10.000'),
  @('Places Text Search Pro','US$32 / 1.000 request','5.000'),
  @('Places Nearby Search Pro','US$32 / 1.000 request','5.000'),
  @('Place Details Pro','US$17 / 1.000 request','5.000'),
  @('Roads Nearest Road','US$10 / 1.000 request','5.000')
)
Add-P 'Untuk perencanaan moderat, sediakan plafon Google Maps Platform sekitar US$300-US$500/bulan atau sekitar Rp5.300.000-Rp8.900.000 dengan asumsi kurs kerja Rp17.745/USD. Gunakan quota limits, billing budget, API key restriction, dan cache untuk menghindari tagihan tidak terkendali.'

Add-H2 '6.3 ArcGIS Location Platform'
Add-Table @(
  @('Layanan','Tarif resmi yang relevan'),
  @('Geocoding','20.000 gratis, lalu US$0,50 / 1.000 geocodes'),
  @('Routing','20.000 gratis, lalu US$0,50 / 1.000 routes'),
  @('GeoEnrichment attributes','US$1 / 1.000 attribute values'),
  @('Places search','500 gratis, lalu US$8 / 1.000 searches'),
  @('Places place attributes','100 gratis, lalu US$0,05 / 1.000 places'),
  @('Places address attributes','100 gratis, lalu US$0,10 / 1.000 places'),
  @('Service areas','5.000 gratis, lalu US$50 / 1.000'),
  @('Location-allocation','US$10 / 1.000 demand points')
)
Add-P 'Untuk penggunaan moderat, siapkan plafon ArcGIS sekitar US$100-US$250/bulan atau sekitar Rp1.800.000-Rp4.400.000. Layer publik BIG/Dukcapil yang diakses melalui REST publik bukan otomatis sama dengan ArcGIS Location Platform berbayar; tetap periksa terms, batas akses, dan status layanan sumber.'

Add-H2 '6.4 Skenario Total Operasional'
Add-Table @(
  @('Skenario','Infrastruktur','Google Maps','ArcGIS','Total indikatif/bulan'),
  @('Hemat / pilot','Rp423.000','Rp0 dalam free cap','Rp0 dalam free cap','±Rp423.000'),
  @('Moderat / produksi kecil','Rp503.000','Rp5.300.000-Rp8.900.000','Rp1.800.000-Rp4.400.000','±Rp7.600.000-Rp13.800.000'),
  @('Tinggi / multi-cabang','Rp503.000+','Di atas Rp8.900.000','Di atas Rp4.400.000','Berdasarkan quota dan pemakaian aktual')
)
Add-P 'Kurs kerja RAB: Rp17.745/USD, mengacu JISDOR Bank Indonesia 18 September 2026. Kurs dan harga penyedia dapat berubah.'

Add-PageBreak
Add-H1 '7. Rekomendasi Deployment Produksi'
Add-Num @(
  'Gunakan VPS KVM 2 minimal untuk pilot; naik ke KVM 4 jika crawling dan enrichment berjalan paralel untuk banyak pengguna.',
  'Pasang Nginx reverse proxy, HTTPS, firewall, fail2ban, process manager PM2/systemd, dan log rotation.',
  'Pisahkan database/cache dari file aplikasi jika volume data meningkat.',
  'Simpan API key hanya di environment server; batasi referrer/IP dan quota per key.',
  'Tambahkan Redis atau cache persistent untuk hasil geocode, POI, BIG, BHUMI, dan Dukcapil.',
  'Tambahkan job queue untuk crawling POI dan enrichment agar request pengguna tidak menunggu seluruh proses.',
  'Aktifkan backup database harian dan backup offsite mingguan.',
  'Buat dashboard pemakaian dan budget alert Google Cloud serta ArcGIS.',
  'Lakukan UAT dengan area contoh: Banten, Jawa Barat, DKI/Jakarta, dan satu kota di luar Jabodetabek.',
  'Validasi skor dengan survei lapangan sebelum dipakai sebagai keputusan investasi final.'
)

Add-H1 '8. Batasan dan Risiko'
Add-Bullets @(
  'SES saat ini adalah indeks operasional/provisional, bukan pengganti survei pendapatan rumah tangga.',
  'Nilai tanah ZNT adalah proxy lokasi dan tidak selalu sama dengan harga transaksi pasar.',
  'Cakupan layer Hak Milik BIG berbeda per provinsi dan tidak mencakup seluruh jenis hak.',
  'Endpoint Dukcapil, BHUMI, dan BIG adalah layanan eksternal; perubahan schema, rate limit, sertifikat, atau downtime dapat memengaruhi hasil.',
  'Google Maps dan ArcGIS membatasi penyimpanan serta penggunaan data sesuai terms masing-masing.',
  'Crawling Google Maps memiliki risiko perubahan struktur halaman dan harus ditinjau secara legal/operasional.',
  'Kawasan kumuh yang dipakai sebagai faktor risiko perlu ditingkatkan menjadi persentase luas polygon agar lebih presisi.',
  'RAB operasional API bersifat estimasi; biaya aktual ditentukan jumlah request, field, fitur, dan paging.'
)

Add-H1 '9. Referensi Harga dan Dokumentasi Resmi'
Add-Bullets @(
  'Hostinger VPS: https://www.hostinger.com/id/hosting-vps',
  'Google Maps Platform pricing: https://developers.google.com/maps/billing-and-pricing/pricing',
  'Google cost management: https://developers.google.com/maps/billing-and-pricing/manage-costs',
  'ArcGIS Geocoding pricing: https://developers.arcgis.com/rest/geocode/',
  'ArcGIS Routing pricing: https://developers.arcgis.com/rest/routing/',
  'ArcGIS GeoEnrichment pricing: https://developers.arcgis.com/rest/geoenrichment/',
  'ArcGIS Places pricing: https://developers.arcgis.com/rest/places/',
  'JISDOR Bank Indonesia: https://www.bi.go.id/id/statistik/informasi-kurs/jisdor/Default.aspx'
)
Add-P 'Dokumen ini dibuat berdasarkan struktur source code aplikasi Smart Finder yang tersedia pada saat penyusunan dan harga publik yang diakses pada September 2026.'

$doc.SaveAs2($outPath, 16)
$doc.Close()
$word.Quit()
Write-Output $outPath
