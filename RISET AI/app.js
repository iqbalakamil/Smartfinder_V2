const $ = id => document.getElementById(id);

const researchWorkflow = [
  ['01', 'Validasi titik koordinat', 'Memastikan lokasi awal dan konteks wilayah.'],
  ['02', 'Membangun catchment area', 'Membuat batas radius layanan 3 km.'],
  ['03', 'Memetakan kelurahan', 'Mengidentifikasi kelurahan dan area penyangga.'],
  ['04', 'Mengukur populasi siswa', 'Mengolah baseline Dukcapil untuk usia target.'],
  ['05', 'Menilai akses & visibilitas', 'Membaca jalan, transportasi, dan titik ramai.'],
  ['06', 'Memindai kompetitor', 'Mencari pesaing, positioning, dan kepadatan pasar.'],
  ['07', 'Mencari kanal promosi', 'Mendeteksi sekolah, komunitas, dan channel lokal.'],
  ['08', 'Menghitung peluang pasar', 'Merangkum skor kelayakan serta TAM, SAM, dan SOM.']
];

function showResearchWorkflow() {
  let box = document.getElementById('workflow-box');
  if (!box) {
    box = document.createElement('section');
    box.id = 'workflow-box'; box.className = 'workflow-box';
    document.querySelector('.result-header').insertAdjacentElement('afterend', box);
    const style = document.createElement('style');
    style.textContent = `.workflow-box{background:#fff;border:1px solid #e4eae7;border-radius:14px;padding:23px;margin-bottom:18px}.workflow-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.workflow-title h3{margin:5px 0 0;font:600 17px 'Space Grotesk'}.workflow-badge{font-size:10px;letter-spacing:1px;font-weight:700;color:#47866a;border:1px solid #cfe0d7;border-radius:30px;padding:8px 11px}.workflow-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.workflow-step{position:relative;border:1px solid #e4eae7;border-radius:9px;padding:13px;min-height:111px;background:#fbfcfb}.workflow-step b{display:block;color:#7b9087;font:600 11px 'Space Grotesk';letter-spacing:1px}.workflow-step strong{display:block;font-size:12px;margin:9px 0 5px}.workflow-step span{font-size:10px;line-height:1.35;color:#84918c}.workflow-step::after{content:'MENUNGGU';position:absolute;right:9px;top:9px;font-size:8px;letter-spacing:.7px;color:#9aa6a1}.workflow-step.active{border-color:#81c79e;background:#f3fbf6}.workflow-step.active::after{content:'MEMPROSES';color:#388461}.workflow-step.done{border-color:#d6ebde}.workflow-step.done::after{content:'SELESAI';color:#398260}.workflow-step.done b{color:#3c9268}@media(max-width:900px){.workflow-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:530px){.workflow-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  box.innerHTML = `<div class="workflow-title"><div><div class="eyebrow">RESEARCH WORKFLOW</div><h3>8 tahap analisis lokasi</h3></div><span id="workflow-count" class="workflow-badge">0 / 8 TAHAP</span></div><div class="workflow-grid">${researchWorkflow.map((s,i)=>`<div class="workflow-step" data-step="${i}"><b>${s[0]}</b><strong>${s[1]}</strong><span>${s[2]}</span></div>`).join('')}</div>`;
  box.classList.remove('hidden');
  return box;
}

function runWorkflow() {
  const box = showResearchWorkflow(); let current = 0;
  const timer = setInterval(() => {
    const items = box.querySelectorAll('.workflow-step');
    if (current > 0) items[current - 1].classList.remove('active'), items[current - 1].classList.add('done');
    if (current < items.length) { items[current].classList.add('active'); current++; box.querySelector('#workflow-count').textContent = `${current} / 8 TAHAP`; }
    else clearInterval(timer);
  }, 450);
  const done = setInterval(() => { if (!$('results').classList.contains('hidden')) { clearInterval(done); clearInterval(timer); box.querySelectorAll('.workflow-step').forEach(x => x.className = 'workflow-step done'); box.querySelector('#workflow-count').textContent = '8 / 8 SELESAI'; } }, 250);
}
document.addEventListener('submit', event => { if (event.target.id === 'research-form') runWorkflow(); }, true);
let map, circle, marker;
function initMap(lat=-6.2, lon=106.816666) { map = L.map('map', { zoomControl:false }).setView([lat,lon], 13); L.control.zoom({position:'bottomright'}).addTo(map); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map); drawMap(lat,lon); }
function drawMap(lat,lon) { if (marker) map.removeLayer(marker); if (circle) map.removeLayer(circle); marker=L.marker([lat,lon]).addTo(map).bindPopup('Lokasi cabang').openPopup(); circle=L.circle([lat,lon],{radius:3000,color:'#4b9f77',weight:1.5,fillColor:'#8bd7ac',fillOpacity:.14}).addTo(map); map.fitBounds(circle.getBounds(),{padding:[20,20]}); $('coord-display').textContent=`${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`; }
function fmt(n){return new Intl.NumberFormat('id-ID').format(Math.round(n))} function money(n){return n>=1000000?`Rp ${(n/1000000).toFixed(1).replace('.',',')} jt`:fmt(n)}
function setText(id,v){$(id).textContent=v}
function calc(input, sources){ const base=input.children || Math.max(100, Math.round((input.price||500000)/10000)); const tam=Math.round(base*1.8), sam=Math.round(tam*.42), som=Math.max(8,Math.round(sam*.08)); const hasComp=(sources.competitors?.results||[]).length; const dims=[['Aksesibilitas',hasComp?78:73],['Visibilitas',hasComp?74:68],['Demografi',base>100?84:66],['Kompetisi',hasComp?59:70]]; const score=Math.round(dims.reduce((a,x)=>a+x[1],0)/4); setText('score',score);setText('score-label',score>=75?'Sangat layak':score>=60?'Layak dengan catatan':'Perlu validasi');$('score-bar').style.width=score+'%';setText('tam',fmt(tam));setText('sam',fmt(sam));setText('som',fmt(som));setText('tam2',fmt(tam));setText('sam2',fmt(sam));setText('som2',fmt(som));$('dimensions').innerHTML=dims.map(([name,val])=>`<div><span>${name}</span><div class="dim-bar"><span style="width:${val}%"></span></div><b class="dim-score">${val}</b></div>`).join(''); $('insights').innerHTML=[['Market awal','Gunakan data calon siswa Anda sebagai baseline, lalu validasi rasio anak usia target dengan endpoint Dukcapil per kelurahan.'],['Strategi masuk',hasComp?'Kompetisi terdeteksi. Menang lewat diferensiasi program dan kemitraan sekolah.':'Sinyal kompetitor terbatas; lakukan kunjungan lapangan sebelum sewa lokasi.'],['Cara baca SOM',`Estimasi konservatif ${som} siswa = 8% dari SAM. Ubah asumsi ini setelah survei harga dan kapasitas kelas.`]].map(x=>`<div><b>${x[0]}</b>${x[1]}</div>`).join(''); return {tam,sam,som,dims,score}; }
function showSources(sources){ const items=Object.entries(sources).flatMap(([type,data])=>(data.results||[]).slice(0,3).map(r=>`<div class="source-item"><a href="${r.url}" target="_blank" rel="noreferrer">${r.title||r.site_name}</a><p>${r.snippet||'Sinyal lokal dari hasil pencarian TinyFish.'}</p></div>`)); $('source-list').innerHTML=items.length?items.join(''):'<p style="color:#899892;font-size:12px">Belum ada hasil. Pastikan API key TinyFish tersedia di file .env.</p>'; }
function renderTerritories(data){const names=[data.kelurahan]; const text=(data.sources?.demography?.results||[]).map(r=>r.title||'').join(' '); ['Kelurahan sekitar','Area penyangga','Zona 3 km'].forEach((x,i)=>{if(!names.includes(x)&&i<2)names.push(x)}); $('territories').innerHTML=names.map((n,i)=>`<div class="territory"><b>0${i+1}</b> &nbsp;${n}</div>`).join('');}
async function research(e){e.preventDefault(); const input={businessType:$('businessType').value,detail:$('detail').value,price:$('price').value,children:$('children').value,lat:$('lat').value,lon:$('lon').value}; $('loading').classList.remove('hidden'); $('results').classList.add('hidden'); drawMap(input.lat,input.lon); try{const res=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{throw new Error('Respons server bukan JSON. Jalankan dashboard dari http://localhost:3000, bukan dengan membuka index.html langsung.')}if(!res.ok)throw new Error(data.error||'Riset tidak dapat diproses.'); const place=data.location?.display_name||data.kelurahan;setText('selected-place',place);setText('result-subtitle',`${input.businessType} · radius 3 km · diperbarui ${new Date().toLocaleDateString('id-ID')}`); calc(data.input,data.sources);renderTerritories(data);showSources(data.sources);$('results').classList.remove('hidden');$('results').scrollIntoView({behavior:'smooth'});}catch(err){$('toast').textContent=err.message||'Riset gagal dijalankan';$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),5000)}finally{$('loading').classList.add('hidden')}}
initMap(); $('research-form').addEventListener('submit',research); $('new-research').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'})); $('locate').addEventListener('click',()=>navigator.geolocation?.getCurrentPosition(p=>{$('lat').value=p.coords.latitude.toFixed(6);$('lon').value=p.coords.longitude.toFixed(6);drawMap(p.coords.latitude,p.coords.longitude)}));
