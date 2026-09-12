// CCTV Kabupaten Bogor - Main Frontend Script

const CONFIG = {
    API_URL: 'https://itscctv-dishub.bogorkab.go.id/api/v3/pv/ldevice',
    CLIENT_ID: 'a194e6ae-d4dd-4b62-a0ac-388922f09303',
    CLIENT_SECRET: 'f430fde38a031fb657a2a7d6f84644a9aed767a4c22314d4b7c565648acc2396',
    LOCAL_DATA_URL: 'cctv_data.json',
    MAP_CENTER: [-6.535, 106.845],
    MAP_ZOOM: 11
};

let map = null;
let markersGroup = null;
let cctvData = [];
let activeLocation = null;
let activeCameraIndex = 0;

// DOM Elements
const elements = {
    statLocations: document.getElementById('statLocations'),
    statCameras: document.getElementById('statCameras'),
    btnRefresh: document.getElementById('btnRefresh'),
    iconRefresh: document.getElementById('iconRefresh'),
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    viewTabList: document.getElementById('viewTabList'),
    viewTabGrid: document.getElementById('viewTabGrid'),
    listContainer: document.getElementById('listContainer'),
    gridContainer: document.getElementById('gridContainer'),
    btnRecenterMap: document.getElementById('btnRecenterMap'),
    btnToggleAllStream: document.getElementById('btnToggleAllStream'),
    cctvModal: document.getElementById('cctvModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalCoord: document.getElementById('modalCoord'),
    modalCameraTabs: document.getElementById('modalCameraTabs'),
    cctvIframe: document.getElementById('cctvIframe'),
    playerLoading: document.getElementById('playerLoading'),
    modalCameraDesc: document.getElementById('modalCameraDesc'),
    modalDirectLink: document.getElementById('modalDirectLink'),
    btnModalClose: document.getElementById('btnModalClose'),
    btnModalFullscreen: document.getElementById('btnModalFullscreen'),
    btnMobileToggle: document.getElementById('btnMobileToggle'),
    sidebarDrawer: document.getElementById('sidebarDrawer')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    loadCCTVData();
});

// Initialize Leaflet Map
function initMap() {
    map = L.map('map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.MAP_ZOOM,
        zoomControl: false
    });

    // Add Zoom Control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dark Tile Layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);
}

// Fetch CCTV Data from API or Backup Json
async function loadCCTVData() {
    setRefreshLoading(true);
    let loadedData = null;

    // Try fetching from direct API first
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-client-id': CONFIG.CLIENT_ID,
                'x-client-secret': CONFIG.CLIENT_SECRET
            }
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                loadedData = transformAPIData(result.data);
                console.log('Successfully fetched CCTV data from API!');
            }
        }
    } catch (err) {
        console.warn('API direct fetch CORS/Network restriction, switching to fallback JSON data:', err.message);
    }

    // Fallback to local cctv_data.json if API failed or blocked by browser CORS
    if (!loadedData) {
        try {
            const response = await fetch(CONFIG.LOCAL_DATA_URL);
            if (response.ok) {
                loadedData = await response.json();
                console.log('Loaded CCTV data from local backup dataset.');
            }
        } catch (err) {
            console.error('Failed to load fallback dataset:', err);
        }
    }

    setRefreshLoading(false);

    if (loadedData && loadedData.length > 0) {
        cctvData = loadedData;
        renderAll();
    } else {
        elements.listContainer.innerHTML = `
            <div class="text-center py-10 text-red-400 space-y-2">
                <i class="fa-solid fa-triangle-exclamation text-3xl"></i>
                <p class="text-xs font-semibold">Gagal memuat data CCTV.</p>
                <button onclick="loadCCTVData()" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs">Coba Lagi</button>
            </div>
        `;
    }
}

// Transform Raw API Response into App Format
function transformAPIData(rawLocations) {
    return rawLocations.map(loc => {
        const devices = loc.tb_device_lokasi || [];
        const cameras = devices.map(d => {
            const hlsUrl = (d.url_proxy_hls || '').trim();
            const posterFile = (d.poster || '').trim();
            return {
                id: d.id_lokasi,
                nama: d.nama,
                nama_alias: d.nama_alias || d.nama || 'CCTV',
                deskripsi: d.deskripsi || '',
                type_cam: d.type_cam,
                url_proxy_hls: hlsUrl,
                stream_iframe_url: hlsUrl ? `${hlsUrl}?controls=1&autoplay=1&muted=1` : null,
                poster_url: posterFile ? `https://itscctv-dishub.bogorkab.go.id/poster/${posterFile}` : null
            };
        });

        return {
            id_lokasi: loc.id_lokasi,
            nama_lokasi: loc.nama_lokasi,
            ket_lokasi: loc.ket_lokasi || loc.nama_lokasi,
            lat: parseFloat(loc.lat_lokasi),
            lng: parseFloat(loc.lon_lokasi),
            tahun: loc.tahun,
            is_active: loc.is_active,
            cameras: cameras
        };
    });
}

// Render Header Stats, Map Markers, and Sidebar List
function renderAll(filteredData = null) {
    const dataToRender = filteredData || cctvData;

    // Stats
    const totalLocations = cctvData.length;
    const totalCameras = cctvData.reduce((acc, curr) => acc + (curr.cameras ? curr.cameras.length : 0), 0);
    elements.statLocations.textContent = totalLocations;
    elements.statCameras.textContent = totalCameras;

    // Render Markers on Map
    renderMapMarkers(dataToRender);

    // Render Location Cards List
    renderLocationList(dataToRender);

    // Render Stream Grid
    renderStreamGrid(dataToRender);
}

// Render Map Markers
function renderMapMarkers(locations) {
    markersGroup.clearLayers();

    locations.forEach(loc => {
        if (!loc.lat || !loc.lng) return;

        // Custom Glowing Icon
        const customIcon = L.divIcon({
            className: 'custom-cctv-icon',
            html: `
                <div class="cctv-marker-pin">
                    <i class="fa-solid fa-video"></i>
                </div>
                <div class="cctv-marker-pulse"></div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -36]
        });

        const cameraCount = loc.cameras ? loc.cameras.length : 0;

        const popupContent = `
            <div class="p-3 w-64 space-y-2 text-slate-100">
                <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                    <span class="text-xs font-bold uppercase tracking-wider text-indigo-400">${escapeHtml(loc.nama_lokasi)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300">
                        ${cameraCount} Camera${cameraCount > 1 ? 's' : ''}
                    </span>
                </div>
                <p class="text-xs text-slate-300">${escapeHtml(loc.ket_lokasi)}</p>
                <div class="pt-1 flex gap-2">
                    <button onclick="openCCTVModalById(${loc.id_lokasi})" 
                            class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all">
                        <i class="fa-solid fa-play text-[10px]"></i> Putar CCTV
                    </button>
                </div>
            </div>
        `;

        const marker = L.marker([loc.lat, loc.lng], { icon: customIcon })
            .bindPopup(popupContent);

        markersGroup.addLayer(marker);
    });
}

// Render Location Cards in Sidebar List
function renderLocationList(locations) {
    if (locations.length === 0) {
        elements.listContainer.innerHTML = `
            <div class="text-center py-10 text-slate-500 space-y-2">
                <i class="fa-solid fa-magnifying-glass text-2xl"></i>
                <p class="text-xs">Tidak ada lokasi CCTV yang cocok.</p>
            </div>
        `;
        return;
    }

    elements.listContainer.innerHTML = locations.map(loc => {
        const cams = loc.cameras || [];
        return `
            <div class="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-3.5 transition-all space-y-3 group">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-semibold text-sm text-slate-100 group-hover:text-indigo-400 transition-colors">${escapeHtml(loc.nama_lokasi)}</h4>
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                ${cams.length} Kamera
                            </span>
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(loc.ket_lokasi)}</p>
                    </div>

                    <!-- Focus Map Button -->
                    <button onclick="focusLocationOnMap(${loc.lat}, ${loc.lng})" 
                            title="Fokus di Peta" 
                            class="p-2 rounded-lg bg-slate-800 hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-400 border border-slate-700 transition-all">
                        <i class="fa-solid fa-location-dot text-xs"></i>
                    </button>
                </div>

                <!-- Camera List Buttons -->
                <div class="space-y-1.5 pt-1 border-t border-slate-800/80">
                    ${cams.map((cam, idx) => `
                        <button onclick="openCCTVModalById(${loc.id_lokasi}, ${idx})" 
                                class="w-full flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-indigo-600/20 border border-slate-800/60 hover:border-indigo-500/40 text-xs text-slate-300 hover:text-white transition-all text-left group/btn">
                            <div class="flex items-center gap-2 truncate">
                                <i class="fa-solid fa-circle-play text-indigo-400 group-hover/btn:scale-110 transition-transform"></i>
                                <span class="truncate font-medium">${escapeHtml(cam.nama_alias)}</span>
                            </div>
                            <span class="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono shrink-0">LIVE</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// Render Grid Stream Cards
function renderStreamGrid(locations) {
    const allCameras = [];
    locations.forEach(loc => {
        (loc.cameras || []).forEach((cam, idx) => {
            allCameras.push({
                location: loc,
                camera: cam,
                camIndex: idx
            });
        });
    });

    elements.gridContainer.innerHTML = allCameras.map(item => {
        const { location: loc, camera: cam, camIndex } = item;
        const iframeUrl = cam.stream_iframe_url || cam.url_proxy_hls;
        
        return `
            <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col group">
                <div class="relative aspect-video bg-black">
                    <iframe src="${iframeUrl}" class="w-full h-full border-0" allow="autoplay; fullscreen" allowfullscreen></iframe>
                </div>
                <div class="p-2.5 bg-slate-900 flex items-center justify-between gap-2 border-t border-slate-800">
                    <div class="truncate">
                        <h5 class="text-xs font-bold text-slate-200 truncate">${escapeHtml(cam.nama_alias)}</h5>
                        <p class="text-[10px] text-slate-400 truncate">${escapeHtml(loc.nama_lokasi)}</p>
                    </div>
                    <button onclick="openCCTVModalById(${loc.id_lokasi}, ${camIndex})" 
                            title="Layar Penuh"
                            class="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white text-xs shrink-0 transition-all">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Focus Map to Location Coordinates
function focusLocationOnMap(lat, lng) {
    if (!map) return;
    map.flyTo([lat, lng], 15, {
        animate: true,
        duration: 1.2
    });

    // Close mobile sidebar if open
    if (window.innerWidth < 1024) {
        elements.sidebarDrawer.classList.add('hidden');
    }
}

// Open Stream Modal
function openCCTVModalById(id_lokasi, cameraIndex = 0) {
    const loc = cctvData.find(l => l.id_lokasi === id_lokasi);
    if (!loc || !loc.cameras || loc.cameras.length === 0) return;

    activeLocation = loc;
    activeCameraIndex = cameraIndex;

    elements.modalTitle.textContent = loc.nama_lokasi;
    elements.modalCoord.textContent = `Lat: ${loc.lat.toFixed(6)}, Lng: ${loc.lng.toFixed(6)}`;

    // Render Camera Tabs if multi-camera
    if (loc.cameras.length > 1) {
        elements.modalCameraTabs.classList.remove('hidden');
        elements.modalCameraTabs.innerHTML = loc.cameras.map((cam, idx) => `
            <button onclick="switchModalCamera(${idx})" 
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${idx === cameraIndex ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}">
                <i class="fa-solid fa-camera text-[10px] mr-1.5"></i> ${escapeHtml(cam.nama_alias)}
            </button>
        `).join('');
    } else {
        elements.modalCameraTabs.classList.add('hidden');
    }

    loadActiveCameraStream();
    elements.cctvModal.classList.remove('hidden');
}

// Switch Camera inside Modal
function switchModalCamera(index) {
    if (!activeLocation || !activeLocation.cameras[index]) return;
    activeCameraIndex = index;
    
    // Update active tab styling
    const tabs = elements.modalCameraTabs.querySelectorAll('button');
    tabs.forEach((tab, i) => {
        if (i === index) {
            tab.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all bg-indigo-600 text-white shadow-md';
        } else {
            tab.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all bg-slate-800 text-slate-400 hover:text-slate-200';
        }
    });

    loadActiveCameraStream();
}

// Load Camera Stream into Modal Iframe
function loadActiveCameraStream() {
    const cam = activeLocation.cameras[activeCameraIndex];
    if (!cam) return;

    elements.playerLoading.classList.remove('hidden');
    elements.modalCameraDesc.textContent = cam.deskripsi || cam.nama_alias || 'Kamera Pemantau Lalu Lintas';
    elements.modalDirectLink.href = cam.url_proxy_hls;

    const streamUrl = cam.stream_iframe_url || cam.url_proxy_hls;
    elements.cctvIframe.src = streamUrl;

    // Hide loading screen after iframe loads or timeout
    elements.cctvIframe.onload = () => {
        elements.playerLoading.classList.add('hidden');
    };

    setTimeout(() => {
        elements.playerLoading.classList.add('hidden');
    }, 2500);
}

// Close CCTV Modal
function closeCCTVModal() {
    elements.cctvModal.classList.add('hidden');
    elements.cctvIframe.src = 'about:blank';
    activeLocation = null;
}

// Setup Event Listeners
function setupEventListeners() {
    // Refresh / Sync Data Button
    elements.btnRefresh.addEventListener('click', () => {
        loadCCTVData();
    });

    // Search Input Filter
    elements.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (query) {
            elements.btnClearSearch.classList.remove('hidden');
        } else {
            elements.btnClearSearch.classList.add('hidden');
        }

        const filtered = cctvData.filter(loc => {
            const matchLoc = loc.nama_lokasi.toLowerCase().includes(query) || (loc.ket_lokasi && loc.ket_lokasi.toLowerCase().includes(query));
            const matchCam = loc.cameras.some(c => c.nama_alias.toLowerCase().includes(query) || c.nama.toLowerCase().includes(query));
            return matchLoc || matchCam;
        });

        renderAll(filtered);
    });

    // Clear Search Button
    elements.btnClearSearch.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.btnClearSearch.classList.add('hidden');
        renderAll();
    });

    // Tab Switchers (List vs Grid)
    elements.viewTabList.addEventListener('click', () => {
        elements.viewTabList.className = 'flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white shadow-sm transition-all';
        elements.viewTabGrid.className = 'flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-all';
        elements.listContainer.classList.remove('hidden');
        elements.gridContainer.classList.add('hidden');
    });

    elements.viewTabGrid.addEventListener('click', () => {
        elements.viewTabGrid.className = 'flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white shadow-sm transition-all';
        elements.viewTabList.className = 'flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 transition-all';
        elements.gridContainer.classList.remove('hidden');
        elements.listContainer.classList.add('hidden');
    });

    elements.btnToggleAllStream.addEventListener('click', () => {
        elements.viewTabGrid.click();
        if (window.innerWidth < 1024) {
            elements.sidebarDrawer.classList.remove('hidden');
        }
    });

    // Recenter Map
    elements.btnRecenterMap.addEventListener('click', () => {
        if (!map) return;
        map.flyTo(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { animate: true, duration: 1 });
    });

    // Close Modal
    elements.btnModalClose.addEventListener('click', closeCCTVModal);
    elements.cctvModal.addEventListener('click', (e) => {
        if (e.target === elements.cctvModal) closeCCTVModal();
    });

    // Modal Fullscreen
    elements.btnModalFullscreen.addEventListener('click', () => {
        const playerContainer = elements.cctvIframe.parentElement;
        if (!document.fullscreenElement) {
            playerContainer.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    });

    // Mobile Sidebar Toggle
    elements.btnMobileToggle.addEventListener('click', () => {
        elements.sidebarDrawer.classList.toggle('hidden');
    });
}

// UI Helper: Refresh Spin Animation
function setRefreshLoading(isLoading) {
    if (isLoading) {
        elements.iconRefresh.classList.add('fa-spin');
    } else {
        elements.iconRefresh.classList.remove('fa-spin');
    }
}

// Utility: Escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
