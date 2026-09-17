/**
 * BPS indicator catalog.
 *
 * IDs are deliberately marked as candidates until BPS metadata confirms the
 * title, definition, unit, period, and geographic level.
 */
module.exports = [
  {
    indicator_code: "pengeluaran_per_kapita",
    name: "Pengeluaran per kapita",
    category: "economic",
    keywords: ["pengeluaran per kapita", "pengeluaran konsumsi", "pengeluaran rumah tangga"],
    candidate_variable_id: 94,
    expected_units: ["Rupiah", "Rupiah/Kapita", "rupiah"],
    direction: "positive",
  },
  {
    indicator_code: "rata_rata_lama_sekolah",
    name: "Rata-rata lama sekolah",
    category: "education",
    keywords: ["rata-rata lama sekolah", "rata rata lama sekolah", "lama sekolah"],
    candidate_variable_id: 95,
    expected_units: ["Tahun", "tahun"],
    direction: "positive",
  },
  {
    indicator_code: "tpak",
    name: "Tingkat Partisipasi Angkatan Kerja",
    category: "employment",
    keywords: ["tingkat partisipasi angkatan kerja", "tpak"],
    candidate_variable_id: 36,
    expected_units: ["Persen", "%", "persen"],
    direction: "positive",
  },
  {
    indicator_code: "kemiskinan",
    name: "Kemiskinan",
    category: "poverty",
    keywords: ["persentase penduduk miskin", "penduduk miskin", "kemiskinan", "garis kemiskinan"],
    candidate_variable_id: 53,
    expected_units: ["Persen", "%", "persen", "Rupiah/Kapita/Bulan"],
    direction: "negative",
  },
  {
    indicator_code: "population_age",
    name: "Penduduk menurut kelompok umur",
    category: "demographic",
    keywords: ["penduduk menurut kelompok umur", "kelompok umur", "jumlah penduduk"],
    candidate_variable_id: 208,
    expected_units: ["Orang", "orang", "Jiwa", "jiwa"],
    direction: "positive",
  },
  {
    indicator_code: "home_ownership",
    name: "Kepemilikan rumah",
    category: "housing",
    keywords: ["status kepemilikan rumah", "kepemilikan rumah"],
    expected_units: ["Persen", "%", "persen"],
    direction: "positive",
    candidate_variable_id: null,
  },
  {
    indicator_code: "internet_access",
    name: "Akses internet",
    category: "digital",
    keywords: ["akses internet", "mengakses internet", "penggunaan internet"],
    expected_units: ["Persen", "%", "persen"],
    direction: "positive",
    candidate_variable_id: null,
  },
  {
    indicator_code: "vehicle_ownership",
    name: "Kepemilikan kendaraan",
    category: "asset",
    keywords: ["kepemilikan kendaraan", "sepeda motor", "mobil"],
    expected_units: ["Persen", "%", "persen", "Rumah Tangga"],
    direction: "positive",
    candidate_variable_id: null,
  },
];
