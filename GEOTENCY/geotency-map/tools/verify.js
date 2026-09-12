// Verifikasi aplikasi peta via Chrome DevTools Protocol (butuh Chrome terpasang).
// Jalankan: node tools/verify.js [url]
const { spawn } = require('child_process');
const http = require('http');

const URL = process.argv[2] || 'http://localhost:8123/';
const PORT = 9333;
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chromePath = CHROME_CANDIDATES.find(p => {
  try { require('fs').accessSync(p); return true; } catch { return false; }
});
if (!chromePath) { console.error('Chrome tidak ditemukan.'); process.exit(1); }

const chrome = spawn(chromePath, [
  '--headless=new', '--use-angle=swiftshader',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + require('os').tmpdir() + '/verify-chrome-' + Date.now(),
  '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // tunggu chrome siap
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await getJson('/json/version'); break; } catch { await sleep(250); }
  }
  if (!version) { console.error('Chrome remote debugging tidak merespons.'); process.exit(1); }

  // pakai tab yang sudah ada (about:blank) lalu navigasikan
  const list = await getJson('/json/list');
  const tab = list.find(t => t.type === 'page') || list[0];
  if (!tab) { console.error('Tidak ada target tab.'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  const send = (method, params) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('[exception] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('[console] ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  };
  await new Promise(r => ws.onopen = r);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL });

  // tunggu waktu nyata agar fetch & render selesai
  await sleep(8000);

  const expr = `JSON.stringify({
    legendLayers: typeof legendLayers !== 'undefined' ? legendLayers.length : -1,
    datasets: typeof datasets !== 'undefined' ? datasets.map(d => ({ name: d.name, assigned: d.assigned, features: (d.geojson.features||[]).length, isHex: d.isHex })) : null,
    mapLayers: typeof map !== 'undefined' ? map.getStyle().layers.map(l => l.id) : null,
    mapLoaded: typeof map !== 'undefined' ? map.loaded() : false,
    statusText: document.getElementById('status').textContent,
    dataListHTML: document.getElementById('dataList').innerHTML.slice(0, 300),
    layerGroups: document.querySelectorAll('.layer-group').length,
  })`;
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const state = JSON.parse(res.result.value);

  console.log(JSON.stringify(state, null, 2));
  console.log('--- error JS:', errors.length ? errors : 'tidak ada');

  ws.close();
  chrome.kill();
  process.exit(errors.length || !state.datasets?.length ? 1 : 0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });