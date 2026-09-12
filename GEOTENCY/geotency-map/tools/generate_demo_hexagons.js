#!/usr/bin/env node
// Menghasilkan data hexagon DEMO untuk verifikasi tampilan peta.
// Ganti dengan export GeoJSON asli dari Geotency/ArcGIS untuk data sungguhan.
const fs = require('fs');
const path = require('path');

// Extent dari json 2.json (Recommended Area Hexagon)
const extent = {
  xmin: 106.32310061500004,
  ymin: -6.804777933999958,
  xmax: 107.31315355200007,
  ymax: -5.899403219999954,
};

// Ukuran hexagon (jari-jari, dalam derajat)
const SIZE = 0.045;

// Sudut titik hexagon pointy-top
function hexCorner(centerX, centerY, size, i) {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return [centerX + size * Math.cos(angle), centerY + size * Math.sin(angle)];
}

function hexCenter(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * (3 / 2) * r;
  return [x, y];
}

const features = [];
let id = 0;

// Hitung rentang axial yang menutupi extent
const cols = Math.ceil((extent.xmax - extent.xmin) / (SIZE * Math.sqrt(3))) + 2;
const rows = Math.ceil((extent.ymax - extent.ymin) / (SIZE * 1.5)) + 2;

for (let r = -rows; r <= rows; r++) {
  for (let q = -cols; q <= cols; q++) {
    const [cx, cy] = hexCenter(q, r, SIZE);
    const lon = extent.xmin + (extent.xmax - extent.xmin) / 2 + cx;
    const lat = extent.ymin + (extent.ymax - extent.ymin) / 2 + cy;
    if (lon < extent.xmin || lon > extent.xmax || lat < extent.ymin || lat > extent.ymax) continue;

    const ring = [];
    for (let i = 0; i < 6; i++) ring.push(hexCorner(lon, lat, SIZE, i));
    ring.push(ring[0]);

    const manualScore = Math.round((1 + Math.random() * 4) * 1000000) / 1000000;
    features.push({
      type: 'Feature',
      properties: {
        grid_id: 'H' + String(id).padStart(4, '0'),
        name: 'Hex Demo ' + id,
        manual_score: manualScore,
        population: Math.round(Math.random() * 5000),
        purchasing_power_total: Math.round(Math.random() * 500000000),
        edu_formal: Math.round(Math.random() * 20),
        residential: Math.round(Math.random() * 30),
        hospital: Math.round(Math.random() * 5),
        recommendation_arin_ndbi: manualScore > 3.5 ? 'YES' : 'NO',
        ses_abc: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
    id++;
  }
}

const fc = {
  type: 'FeatureCollection',
  name: 'demo-hexagon',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
  features,
};

const out = path.join(__dirname, '..', 'data', 'demo-hexagon.geojson');
fs.writeFileSync(out, JSON.stringify(fc));
console.log('Tersimpan:', out, '|', features.length, 'hexagon');