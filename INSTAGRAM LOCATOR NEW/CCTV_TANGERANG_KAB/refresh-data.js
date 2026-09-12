/*
 * Perbarui data titik CCTV dari situs asli.
 *
 * Cara kerja:
 *  1. Ambil halaman https://cctv-dishub.tangerangkab.go.id/cctv-map
 *  2. Ekstrak snapshot Livewire (wire:snapshot="...")
 *  3. Parse JSON di dalamnya -> data.cameras[0] berisi daftar kamera
 *  4. Tulis ulang cameras.json
 *
 * Jalankan:  node refresh-data.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PAGE_URL = 'https://cctv-dishub.tangerangkab.go.id/cctv-map';
const OUT = path.join(__dirname, 'cameras.json');

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function main() {
  console.log(`Mengambil ${PAGE_URL} …`);
  const res = await fetch(PAGE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} saat mengambil halaman`);
  const html = await res.text();

  const m = html.match(/wire:snapshot="([^"]+)"/);
  if (!m) throw new Error('Snapshot Livewire tidak ditemukan di halaman.');

  const snapshot = JSON.parse(decodeEntities(m[1]));
  const entries = snapshot.data.cameras[0]; // [data, metadata] -> data
  const cams = entries.map((e) => e[0]);

  // normalisasi + urutkan
  const clean = cams
    .map((c) => ({
      id: String(c.id || ''),
      name: String(c.name || '').trim(),
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      url: String(c.url || ''),
    }))
    .filter((c) => c.id && c.name && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && c.url)
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));

  fs.writeFileSync(OUT, JSON.stringify(clean, null, 2) + '\n', 'utf-8');
  console.log(`✓ Tersimpan ${clean.length} titik CCTV ke ${OUT}`);
  clean.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${c.name}  (${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)})`));
}

main().catch((err) => {
  console.error('✗ Gagal memperbarui data:', err.message);
  process.exit(1);
});