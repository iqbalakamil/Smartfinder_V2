import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '100kb' }));
app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Data input tidak valid. Periksa kembali angka koordinat.' });
  }
  next(error);
});
app.use(express.static(__dirname));

async function tinyfish(query, purpose) {
  if (!process.env.TINYFISH_API_KEY) return { query, results: [], error: 'TINYFISH_API_KEY belum dikonfigurasi' };
  const params = new URLSearchParams({ query, purpose, location: 'ID', language: 'id' });
  const res = await fetch(`https://api.search.tinyfish.ai?${params}`, { headers: { 'X-API-Key': process.env.TINYFISH_API_KEY } });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('TinyFish mengirim respons yang tidak dapat dibaca. Silakan coba lagi.'); }
  if (!res.ok) throw new Error(data?.message || data?.error || `TinyFish ${res.status}`);
  return data;
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=id`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RisetAI/1.0' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

app.post('/api/research', async (req, res) => {
  const { businessType, detail, price, lat, lon, children } = req.body;
  if (!businessType || !lat || !lon) return res.status(400).json({ error: 'Jenis usaha dan koordinat wajib diisi.' });
  const location = `${lat}, ${lon}`;
  const base = `${businessType} ${detail || ''} di sekitar ${location} radius 3 km Indonesia`;
  const queries = [
    { key: 'competitors', q: `${base} daftar kompetitor lokasi alamat rating harga`, p: 'Identifikasi kompetitor nyata untuk analisis kelayakan cabang baru.' },
    { key: 'access', q: `${base} akses jalan transportasi sekolah mall pusat keramaian`, p: 'Nilai aksesibilitas dan visibilitas lokasi cabang.' },
    { key: 'demography', q: `${base} demografi jumlah penduduk anak usia sekolah kelurahan`, p: 'Temukan data demografi yang relevan untuk estimasi calon siswa.' },
    { key: 'promotion', q: `${base} komunitas sekolah perumahan tempat promosi lokal`, p: 'Temukan kanal dan titik promosi potensial di radius lokasi.' }
  ];
  try {
    const [geo, ...found] = await Promise.all([reverseGeocode(lat, lon), ...queries.map(x => tinyfish(x.q, x.p))]);
    const sources = Object.fromEntries(queries.map((x, i) => [x.key, { ...found[i], query: x.q }]));
    res.json({ location: geo, kelurahan: geo?.address?.village || geo?.address?.suburb || geo?.address?.town || 'Belum teridentifikasi', radiusKm: 3, sources, input: { businessType, detail, price: Number(price) || 0, lat, lon, children: Number(children) || 0 } });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Riset AI berjalan di http://localhost:${PORT}`));
