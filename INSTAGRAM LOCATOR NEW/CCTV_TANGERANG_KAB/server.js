/*
 * Server web app Peta CCTV Kabupaten Tangerang (tanpa dependency).
 *
 * - Melayani file statis (index.html, style.css, app.js, cameras.json).
 * - Meneruskan /proxy/storage/* ke server CCTV asli sehingga stream HLS
 *   (.m3u8 + segmen .ts) bisa diputar tanpa masalah CORS.
 *
 * Jalankan:  node server.js   (default port 8080, bisa diubah dengan PORT=xxxx)
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const UPSTREAM = 'https://cctv-dishub.tangerangkab.go.id';
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/* ---------- Proxy HLS ke server asli ---------- */
function proxyStream(req, res, upstreamPath) {
  const target = UPSTREAM + upstreamPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');

  const preq = https.request(
    target,
    {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        Accept: req.headers['accept'] || '*/*',
        Referer: UPSTREAM + '/cctv-map',
      },
    },
    (pres) => {
      let contentType = pres.headers['content-type'] || 'application/octet-stream';
      if (upstreamPath.endsWith('.ts')) {
        contentType = 'video/mp2t';
      } else if (upstreamPath.endsWith('.m3u8')) {
        contentType = 'application/vnd.apple.mpegurl';
      }
      res.writeHead(pres.statusCode || 502, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      pres.pipe(res);
    }
  );

  preq.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Proxy error: tidak dapat menghubungi server CCTV asli.');
  });

  preq.setTimeout(15000, () => preq.destroy(new Error('timeout')));
  preq.end();
}

/* ---------- File statis ---------- */
function serveStatic(res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(ROOT, filePath));

  // cegah path traversal keluar dari folder proyek
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(resolved, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const type = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(resolved).pipe(res);
  });
}

/* ---------- Router ---------- */
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  if (pathname.startsWith('/proxy/storage/')) {
    return proxyStream(req, res, pathname.slice('/proxy'.length));
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(res, pathname);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`▶  Peta CCTV Kabupaten Tangerang`);
  console.log(`   Buka:  http://localhost:${PORT}`);
  console.log(`   Data:  ${ROOT}\\cameras.json (${fs.existsSync(path.join(ROOT, 'cameras.json')) ? 'ada' : 'BELUM ADA — jalankan node refresh-data.js'})`);
  console.log(`   Perbarui data:  node refresh-data.js`);
});