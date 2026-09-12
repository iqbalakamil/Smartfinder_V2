/* Peta CCTV Kabupaten Tangerang — data diambil dari
   https://cctv-dishub.tangerangkab.go.id/cctv-map (Livewire snapshot) */

'use strict';

const UPSTREAM_HOST = 'cctv-dishub.tangerangkab.go.id';

/* ---------- Data ---------- */
let cameras = [];
const markers = new Map(); // id -> L.marker

/* ---------- Video URL: pakai proxy lokal agar stream HLS bisa diputar (CORS) ---------- */
function toPlayableUrl(url) {
  if (location.protocol.startsWith('http')) {
    try {
      const u = new URL(url);
      if (u.hostname === UPSTREAM_HOST) return '/proxy' + u.pathname + u.search;
    } catch (_) { /* fall through */ }
  }
  return url; // dibuka via file:// -> URL asli (video kemungkinan diblokir CORS)
}

/* ---------- Map ---------- */
const map = L.map('map', { zoomControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

L.control.scale({ imperial: false }).addTo(map);

/* ---------- Marker icon (kamera) ---------- */
const camIcon = L.divIcon({
  className: 'cam-marker',
  html: '<span>📹</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
});

/* ---------- Video player di popup ---------- */
function buildPopupContent(cam) {
  const wrap = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.innerHTML = `<span>📹</span> ${escapeHtml(cam.name)} <span class="live-tag">LIVE</span>`;
  wrap.appendChild(title);

  const video = document.createElement('video');
  video.className = 'popup-video';
  video.controls = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('autoplay', '');
  wrap.appendChild(video);

  const actions = document.createElement('div');
  actions.className = 'popup-actions';
  actions.innerHTML = `
    <span style="font-size:11px;color:#64748b;">Sumber: Dishub Tangerang</span>
    <a href="${escapeHtml(cam.url)}" target="_blank" rel="noopener">Situs asli ↗</a>`;
  wrap.appendChild(actions);

  const errBox = document.createElement('div');
  errBox.className = 'popup-err';
  errBox.style.display = 'none';
  errBox.innerHTML =
    'Stream tidak dapat dimuat. Pastikan aplikasi dijalankan lewat <code>node server.js</code> ' +
    '(proxy dibutuhkan karena server video asli tidak mengizinkan CORS), lalu coba lagi.';
  wrap.appendChild(errBox);

  let hls = null;
  let destroyed = false;

  function showError() {
    errBox.style.display = 'block';
  }

  function start() {
    if (destroyed) return;
    const src = toPlayableUrl(cam.url);
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) showError();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch(() => {});
    } else {
      showError();
    }
  }

  function stop() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  return { el: wrap, start, stop };
}

/* ---------- Markers ---------- */
function addMarkers(cams) {
  cams.forEach((cam) => {
    const { el, start, stop } = buildPopupContent(cam);
    const marker = L.marker([cam.latitude, cam.longitude], { icon: camIcon })
      .addTo(map)
      .bindPopup(el, { maxWidth: 380 });

    marker.on('popupopen', start);
    marker.on('popupclose', stop);

    markers.set(cam.id, marker);
  });
}

/* ---------- Sidebar ---------- */
function renderList(filter) {
  const list = document.getElementById('cam-list');
  const q = (filter || '').trim().toLowerCase();
  const shown = cameras.filter((c) => !q || c.name.toLowerCase().includes(q));
  list.innerHTML = '';

  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = 'Tidak ada titik CCTV yang cocok.';
    list.appendChild(empty);
    return;
  }

  shown.forEach((cam) => {
    const btn = document.createElement('button');
    btn.className = 'cam-item';
    btn.innerHTML = `
      <span class="cam-pin">📹</span>
      <span class="cam-name">${escapeHtml(cam.name)}</span>
      <span class="cam-play">▶</span>`;
    btn.addEventListener('click', () => {
      const m = markers.get(cam.id);
      map.flyTo([cam.latitude, cam.longitude], Math.max(map.getZoom(), 15), { duration: 0.6 });
      setTimeout(() => m.openPopup(), 650);
    });
    list.appendChild(btn);
  });

  document.getElementById('cam-count').textContent = `${shown.length} / ${cameras.length} kamera`;
}

/* ---------- Init ---------- */
async function init() {
  let res;
  try {
    res = await fetch('cameras.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    cameras = await res.json();
  } catch (err) {
    document.getElementById('cam-list').innerHTML =
      '<div class="list-empty">Gagal memuat cameras.json: ' + escapeHtml(String(err)) + '</div>';
    return;
  }

  addMarkers(cameras);

  const bounds = L.latLngBounds(cameras.map((c) => [c.latitude, c.longitude]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });

  document.getElementById('search').addEventListener('input', (e) => renderList(e.target.value));
  renderList('');
}

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

init();