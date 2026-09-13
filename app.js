const DEFAULT_CENTER = { lat: -6.171296275285527, lon: 106.68302278968127 };
const API_BASE = window.__POI_API_BASE__ || (
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:3000"
    : window.location.origin
);

const form = document.getElementById("search-form");
const statusBox = document.getElementById("status-box");
const streetNameEl = document.getElementById("street-name");
const districtNameEl = document.getElementById("district-name");
const cityNameEl = document.getElementById("city-name");
const poiTotalEl = document.getElementById("poi-total");
const positiveScoreEl = document.getElementById("positive-score");
const riskScoreEl = document.getElementById("risk-score");
const residentialBreakdownBody = document.getElementById("residential-breakdown-body");
const educationBreakdownBody = document.getElementById("education-breakdown-body");
const affiliateBreakdownBody = document.getElementById("affiliate-breakdown-body");
const summaryBox = document.getElementById("summary-box");
const deepResearchBox = document.getElementById("deep-research-box");
const poiSourceBox = document.getElementById("poi-source-box");
const researchSourceBox = document.getElementById("research-source-box");
const supportingPoiEl = document.getElementById("supporting-poi");
const riskPoiEl = document.getElementById("risk-poi");
const poiEvidencePanelEl = document.getElementById("poi-evidence-panel");
const supportingPoiVisibleEl = document.getElementById("supporting-poi-visible");
const riskPoiVisibleEl = document.getElementById("risk-poi-visible");
const analysisStatusBanner = document.getElementById("analysis-status-banner");
const unifiedAnalysisBtn = document.getElementById("unified-analysis-button");
const unifiedLoadingEl = document.getElementById("unified-loading");
const unifiedLoadingText = document.getElementById("unified-loading-text");
const structuredResultsEl = document.getElementById("structured-results");
const deepResearchResultsEl = document.getElementById("deep-research-results");
const socialNewsResultsEl = document.getElementById("social-news-results");
const tinyfishStatusEl = document.getElementById("tinyfish-status");
const litellmStatusEl = document.getElementById("litellm-status");
const manualStatusEl = document.getElementById("manual-status");
const aiAnalysisResultsEl = document.getElementById("ai-analysis-results");
const resultsPaginationEl = document.getElementById("results-pagination");
const resultsPaginationInfoEl = document.getElementById("results-pagination-info");
const resultsPrevBtn = document.getElementById("results-prev");
const resultsNextBtn = document.getElementById("results-next");
const aiAreaLoadingEl = document.getElementById("ai-area-loading");
const aiAreaResultsEl = document.getElementById("ai-area-results");
const aiAreaStatusEl = document.getElementById("ai-area-status");
const topDistrictsEl = document.getElementById("top-districts");
const opportunitySnapshotEl = document.getElementById("opportunity-snapshot");
const summaryCardEls = Array.from(document.querySelectorAll("#summary-cards .summary-card strong"));
const resultsBody = document.getElementById("results-body");
const useMyLocationBtn = document.getElementById("use-my-location");
const downloadPdfBtn = document.getElementById("download-pdf");
const downloadPoiXlsBtn = document.getElementById("download-poi-xls");
const cancelProcessBtn = document.getElementById("cancel-process");
const coordinatesInput = document.getElementById("coordinates");
const activityLogEl = document.getElementById("activity-log");
const mapLoadingEl = document.getElementById("map-loading");
const analysisLoadingEl = document.getElementById("analysis-loading");
const tableLoadingEl = document.getElementById("table-loading");
const loadingPillEl = document.getElementById("loading-pill");

let loadingHeartbeat = null;
let loadingStartedAt = 0;
let activeController = null;
let isProcessing = false;
let currentMapContext = null;
let latestBasePois = [];
let latestHotmapPois = [];
let hotmapPollTimer = null;
let latestPoiMeta = {};
let latestAiSummary = {
  suitabilityLabel: "",
  analysis: "",
  recommendation: "",
};
let latestDeepResearchSummary = {
  headline: "",
  accessibility: "",
  demography: "",
  marketNeed: "",
  facilitiesEnvironment: "",
  promotionPartnership: "",
  digitalFootprint: "",
  digitalFootprintExamples: [],
  digitalFootprintReferences: [],
  sourceDetails: [],
  marketSizeShare: "",
  implication: "",
  sourcesUsed: [],
};
let latestShortlist = [];
let currentResultsPage = 1;
const RESULTS_PER_PAGE = 8;
let latestStructuredAnalysis = null;
let latestAnalysisContext = null;
let latestAnalysisFallbackContext = null;
let shortlistReady = false;

// === MAPLIBRE GL JS MAP INSTANCE ===
// Map instance diinisialisasi di index.html (window.maplibreMap)
// Kita referensi dari window untuk konsistensi dengan index.html
let map = null; // akan diset saat DOM ready
let poiGeoJsonSource = null;
let centerMarkerLayer = null;
let radiusLayerAdded = false;
let mapLayersAdded = false;
let poiMapEventsBound = false;

// Default radius circle configuration
const DEFAULT_RADIUS_KM = 3;
const RADIUS_COLOR = '#f59e0b'; // emas
let poiLayerEnabled = false;
let instagramLayerEnabled = false;

function isDrawerOpen(drawerId) {
  return Boolean(document.getElementById(drawerId)?.classList.contains("open"));
}

function setSidebarToggleState(selector, enabled, onLabel, offLabel, onTitle, offTitle) {
  const buttons = document.querySelectorAll(selector);
  buttons.forEach((button) => {
    button.classList.toggle("active", enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.textContent = enabled ? onLabel : offLabel;
    button.title = enabled ? onTitle : offTitle;
  });
}

function updateNotificationBadge(badgeId, show) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  badge.classList.toggle("hidden", !show);
}

function syncPoiToggleUi() {
  setSidebarToggleState(
    '.layer-poi',
    poiLayerEnabled,
    "ON",
    "OFF",
    "Nonaktifkan POI",
    "Aktifkan POI",
  );
}

function syncInstagramToggleUi() {
  setSidebarToggleState(
    '.layer-instagram',
    instagramLayerEnabled,
    "ON",
    "OFF",
    "Nonaktifkan Instagram Locator",
    "Aktifkan Instagram Locator",
  );

  const statusBadge = document.getElementById("ig-layer-status");
  if (statusBadge) {
    if (instagramLayerEnabled) {
      statusBadge.textContent = "AKTIF";
      statusBadge.style.background = "rgba(214, 36, 159, 0.25)";
      statusBadge.style.color = "#f472b6";
      statusBadge.style.borderColor = "#d6249f";
    } else {
      statusBadge.textContent = "NONAKTIF";
      statusBadge.style.background = "rgba(148, 163, 184, 0.2)";
      statusBadge.style.color = "#94a3b8";
      statusBadge.style.borderColor = "rgba(255,255,255,0.2)";
    }
  }
}

function setLayerVisibility(layerId, enabled) {
  const mbMap = getMaplibreMap();
  if (!mbMap || !mbMap.getLayer(layerId)) return;
  try {
    mbMap.setLayoutProperty(layerId, "visibility", enabled ? "visible" : "none");
  } catch (error) {
    console.warn(`Failed to set visibility for ${layerId}:`, error);
  }
}

function syncPoiLayerVisibility() {
  setLayerVisibility("poi-markers-layer", poiLayerEnabled);
  syncPoiToggleUi();
}

function syncInstagramLayerVisibility() {
  setLayerVisibility("ig-locations-layer", instagramLayerEnabled);
  syncInstagramToggleUi();
}

function syncShortlistNotification() {
  updateNotificationBadge("shortlist-notification-badge", shortlistReady && !isDrawerOpen("drawer-shortlist"));
}

function setPoiLayerVisible(enabled) {
  poiLayerEnabled = Boolean(enabled);
  syncPoiLayerVisibility();
}

function setInstagramLayerVisible(enabled) {
  instagramLayerEnabled = Boolean(enabled);
  syncInstagramLayerVisibility();
}

window.setPoiLayerVisible = setPoiLayerVisible;
window.setInstagramLayerVisible = setInstagramLayerVisible;
window.togglePoiLayer = function togglePoiLayer() {
  setPoiLayerVisible(!poiLayerEnabled);
};
window.toggleInstagramLayer = function toggleInstagramLayer() {
  setInstagramLayerVisible(!instagramLayerEnabled);
};
window.refreshLayerNotifications = function refreshLayerNotifications() {
  syncPoiToggleUi();
  syncInstagramToggleUi();
  syncShortlistNotification();
};

function getMaplibreMap() {
  // Dapatkan instance maplibre dari window (diinisialisasi di index.html)
  if (window.maplibreMap) {
    return window.maplibreMap;
  }
  // Fallback: tunggu sebentar
  return null;
}

function waitForMap(callback, maxWaitMs = 10000, intervalMs = 100) {
  const startTime = Date.now();
  const check = setInterval(() => {
    if (window.maplibreMap && (!window.maplibreMap.isStyleLoaded || window.maplibreMap.isStyleLoaded())) {
      clearInterval(check);
      callback(window.maplibreMap);
    } else if (Date.now() - startTime > maxWaitMs) {
      clearInterval(check);
      console.warn('MapLibre map not ready after timeout');
    }
  }, intervalMs);
}

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.style.background = isError ? "rgba(159, 45, 45, 0.12)" : "rgba(15, 118, 110, 0.08)";
  statusBox.style.color = isError ? "#9f2d2d" : "#0b5c55";
}

function getTimestampLabel() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function appendActivityLog(message, emphasis = "") {
  const item = document.createElement("li");
  item.innerHTML = `<strong>${escapeHtml(getTimestampLabel())}</strong> ${escapeHtml(message)}`;
  if (emphasis === "error") {
    item.style.color = "#9f2d2d";
  }
  if (emphasis === "success") {
    item.style.color = "#1d6b3a";
  }
  activityLogEl.prepend(item);

  while (activityLogEl.children.length > 18) {
    activityLogEl.removeChild(activityLogEl.lastChild);
  }
}

async function loadLauncherLog() {
  if (!activityLogEl) return;
  try {
    const response = await fetch(`${API_BASE}/api/launcher-log`, { cache: "no-store" });
    if (!response.ok) return;
    const logText = await response.text();
    const lines = logText.split(/\r?\n/).filter(Boolean).slice(-20);
    if (!lines.length) return;
    lines.forEach((line) => {
      const emphasis = /ERROR|WARNING/i.test(line) ? "error" : "";
      appendActivityLog(`Launcher: ${line}`, emphasis);
    });
  } catch {
    // Server log is optional; the main app remains usable if it is unavailable.
  }
}

function setLoadingState(active, panels = { map: true, analysis: true, table: true }) {
  if (active) {
    loadingStartedAt = Date.now();
    mapLoadingEl.classList.toggle("hidden", !panels.map);
    analysisLoadingEl.classList.toggle("hidden", !panels.analysis);
    tableLoadingEl.classList.toggle("hidden", !panels.table);
    loadingPillEl.classList.remove("hidden");

    if (loadingHeartbeat) {
      clearInterval(loadingHeartbeat);
    }

    loadingHeartbeat = setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - loadingStartedAt) / 1000));
      appendActivityLog(`Proses masih berjalan (${elapsedSeconds} detik). Sistem sedang menunggu crawl atau analisa backend selesai.`);
    }, 10000);
    return;
  }

  mapLoadingEl.classList.add("hidden");
  analysisLoadingEl.classList.add("hidden");
  tableLoadingEl.classList.add("hidden");
  loadingPillEl.classList.add("hidden");
  if (loadingHeartbeat) {
    clearInterval(loadingHeartbeat);
    loadingHeartbeat = null;
  }
}

function syncActionButtons() {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = isProcessing;
  useMyLocationBtn.disabled = isProcessing;
  downloadPdfBtn.disabled = isProcessing || !currentMapContext || !latestBasePois.length || !latestStructuredAnalysis;
  if (downloadPoiXlsBtn) {
    downloadPoiXlsBtn.disabled = isProcessing || !latestBasePois.length;
  }
  cancelProcessBtn.disabled = !isProcessing;
  if (unifiedAnalysisBtn) {
    unifiedAnalysisBtn.disabled = isProcessing || !latestAnalysisContext;
  }
}

function downloadPoiXls() {
  if (!latestBasePois.length) {
    setStatus("Belum ada hasil crawl POI yang bisa diunduh.", true);
    return;
  }
  if (!window.XLSX) {
    setStatus("Library XLS belum siap. Muat ulang halaman lalu coba lagi.", true);
    return;
  }

  const categoryGroups = new Map();
  latestBasePois.forEach((poi) => {
    const category = poi.categoryLabel || poi.category || "Lainnya";
    if (!categoryGroups.has(category)) categoryGroups.set(category, []);
    categoryGroups.get(category).push(poi);
  });

  const getReviewCount = (poi) => getPoiReviewCount(poi);
  const toExportRow = (poi, index) => ({
    No: index + 1,
    "Nama POI": poi.name || "",
    Kategori: poi.categoryLabel || poi.category || "Lainnya",
    Rating: poi.tags?.rating || "",
    "Jumlah Review": getReviewCount(poi),
    Alamat: poi.tags?.address || "",
    Kecamatan: poi.tags?.search_area_subdistrict || "",
    Kota: poi.tags?.search_area_city || "",
    Telepon: poi.tags?.phone || "",
    Website: poi.tags?.website || "",
    "Link Google Maps": poi.tags?.maps_link || poi.tags?.header_link_raw || "",
    Latitude: poi.lat ?? "",
    Longitude: poi.lon ?? "",
    Keyword: poi.tags?.keyword || poi.tags?.query || "",
    "Area Crawl": poi.tags?.search_area_label || "",
    Sumber: getPoiSourceLabel(poi.source),
  });

  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();
  Array.from(categoryGroups.entries())
    .sort(([left], [right]) => left.localeCompare(right, "id"))
    .forEach(([category, categoryPois]) => {
      const sortedPois = [...categoryPois].sort((left, right) => {
        const reviewDiff = getReviewCount(right) - getReviewCount(left);
        return reviewDiff || String(left.name || "").localeCompare(String(right.name || ""), "id");
      });
      const rows = sortedPois.map(toExportRow);
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 6 }, { wch: 32 }, { wch: 24 }, { wch: 10 }, { wch: 15 },
        { wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 32 },
        { wch: 48 }, { wch: 13 }, { wch: 13 }, { wch: 28 }, { wch: 30 }, { wch: 20 },
      ];
      const baseSheetName = String(category).replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Lainnya";
      let sheetName = baseSheetName;
      let suffix = 2;
      while (usedSheetNames.has(sheetName)) {
        sheetName = `${baseSheetName.slice(0, 28)} (${suffix++})`;
      }
      usedSheetNames.add(sheetName);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

  const datePart = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `POI_Smart_Finder_${datePart}.xls`, { bookType: "biff8" });
  setStatus(`File XLS berhasil dibuat: ${latestBasePois.length} POI dalam ${categoryGroups.size} kategori.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(text = "") {
  return escapeHtml(text).replaceAll("`", "&#096;");
}

function renderAnalysisDropdown(title, bodyHtml) {
  if (!aiAnalysisResultsEl) {
    return;
  }

  aiAnalysisResultsEl.innerHTML = `
    <summary>${escapeHtml(title || "Hasil analisis")}</summary>
    <div class="analysis-dropdown-body">${bodyHtml}</div>
  `;
}

function getPoiSourceLabel(source) {
  if (source === "google-maps-crawl") {
    return "Google Maps Crawl";
  }
  if (source === "google-maps-crawl-fallback") {
    return "Google Maps Crawl (Fallback)";
  }
  if (source === "hotmap-v2-extension") {
    return "Hotspot Map V2";
  }
  if (source === "google-places") {
    return "Google Places";
  }
  if (source === "overpass") {
    return "OpenStreetMap / Overpass";
  }
  return "POI";
}

function getMarkerColor(poi) {
  if (poi.category === "residential") {
    return "#16a34a";
  }
  if (poi.category === "education") {
    return "#2563eb";
  }
  if (poi.category === "family-services") {
    return "#eab308";
  }
  if (poi.signal === "risk") {
    return "#9f2d2d";
  }
  return "#0f766e";
}

function getPoiReviewCount(poi) {
  const raw = poi?.tags?.review_count ?? poi?.review_count ?? poi?.reviewCount ?? 0;
  const normalized = String(raw).replace(/[^0-9]/g, "");
  return normalized ? Number(normalized) : 0;
}

function parseCoordinatesFromPoiLinks(poi) {
  const candidates = [
    poi?.tags?.header_link_raw,
    poi?.tags?.maps_link,
    poi?.href,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate);
    const headerLatMatch = value.match(/8m2!3d(-?\d+(?:\.\d+)?)/i);
    const headerLonMatch = value.match(/!4d(-?\d+(?:\.\d+)?)(?:!|$)/i);
    if (headerLatMatch && headerLonMatch) {
      return {
        lat: Number(headerLatMatch[1]),
        lon: Number(headerLonMatch[1]),
        coordSource: "frontend-header-link",
      };
    }

    const fallbackMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
    if (fallbackMatch) {
      return {
        lat: Number(fallbackMatch[1]),
        lon: Number(fallbackMatch[2]),
        coordSource: "frontend-fallback-link",
      };
    }
  }

  return { lat: null, lon: null, coordSource: "" };
}

function normalizePoiForMap(poi) {
  const lat = Number(poi?.lat ?? poi?.latitude);
  const lon = Number(poi?.lon ?? poi?.lng ?? poi?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    return { ...poi, lat, lon };
  }

  const parsed = parseCoordinatesFromPoiLinks(poi);
  if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) {
    return poi;
  }

  return {
    ...poi,
    lat: parsed.lat,
    lon: parsed.lon,
    tags: {
      ...(poi.tags || {}),
      coord_source: poi?.tags?.coord_source || parsed.coordSource,
    },
  };
}

function dedupeMapPois(items) {
  const map = new Map();
  items.map(normalizePoiForMap).forEach((poi) => {
    const key = `${String(poi.name || "").toLowerCase()}|${Number(poi.lat || 0).toFixed(6)}|${Number(poi.lon || 0).toFixed(6)}|${poi.category || ""}|${poi.source || ""}`;
    if (!map.has(key)) {
      map.set(key, poi);
    }
  });
  return Array.from(map.values());
}

function buildPoiPopup(poi) {
  try {
    const name = poi.name || "-";
    const category = poi.categoryLabel || "";
    const source = getPoiSourceLabel(poi.source);
    const address = poi.tags?.address || "";
    const rating = poi.tags?.rating || "";
    const reviewCount = getPoiReviewCount(poi);
    const mapsLink = poi.tags?.maps_link || poi.tags?.header_link_raw || poi.href
      || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${poi.lat},${poi.lon}`)}`;
    const ftScore = poi.tags?.foot_traffic_score;
    const ftLevel = poi.tags?.foot_traffic_level;
    const ftPeak = poi.tags?.foot_traffic_peak_hour;
    const popularTimes = poi.tags?.popular_times;

    let html = '<div style="font-family:system-ui,sans-serif;min-width:220px;max-width:300px;background:#0f172a;color:#e2e8f0;padding:4px;">';
    html += '<div style="font-weight:700;font-size:14px;margin-bottom:4px;color:#ffffff;">' + escapeHtml(name) + '</div>';
    html += '<div style="font-size:12px;color:#6b7280;margin-bottom:2px;">' + escapeHtml(category) + '</div>';
    html += '<div style="font-size:11px;color:#9ca3af;">' + escapeHtml(source) + '</div>';
    
    if (address) {
      html += '<div style="font-size:11px;color:#6b7280;margin-top:4px;">' + escapeHtml(address) + '</div>';
    }
    
    if (rating) {
      html += '<div style="font-size:11px;color:#eab308;margin-top:2px;">⭐ ' + escapeHtml(rating);
      if (reviewCount) html += ' (' + escapeHtml(String(reviewCount)) + ')';
      html += '</div>';
    }

    html += '<a href="' + escapeAttribute(mapsLink) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;color:#38bdf8;font-size:11px;font-weight:700;text-decoration:none;">Buka di Google Maps ↗</a>';

    // Foot Traffic Score
    if (ftScore != null) {
      var ftColors = { very_high: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6' };
      var ftLabels = { very_high: 'Sangat Ramai', high: 'Ramai', medium: 'Sedang', low: 'Sepi' };
      var ftColor = ftColors[ftLevel] || '#6b7280';
      var ftLabel = ftLabels[ftLevel] || ftLevel;
      html += '<div style="margin-top:8px;padding:6px 8px;background:' + ftColor + '15;border:1px solid ' + ftColor + '40;border-radius:8px;">';
      html += '<div style="font-weight:700;color:' + ftColor + ';font-size:13px;">📊 Foot Traffic: ' + ftScore + '%</div>';
      html += '<div style="font-size:11px;color:#6b7280;">' + ftLabel;
      if (ftPeak) html += ' • Peak: ' + escapeHtml(ftPeak);
      html += '</div></div>';
    }

    // Popular Times Chart
    if (popularTimes && popularTimes.weeklyData && Object.keys(popularTimes.weeklyData).length > 0) {
      var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      var dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      var todayIdx = new Date().getDay();
      todayIdx = todayIdx === 0 ? 6 : todayIdx - 1;

      html += '<div style="margin-top:8px;padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">';
      html += '<div style="font-weight:700;font-size:11px;color:#475569;margin-bottom:4px;">⏰ Popular Times</div>';

      days.forEach(function(day, idx) {
        var hours = popularTimes.weeklyData[day];
        if (!hours || hours.length === 0) return;
        var isToday = idx === todayIdx;
        var fw = isToday ? '700' : '400';
        var fc = isToday ? '#2563eb' : '#9ca3af';
        var bg = isToday ? 'background:#eff6ff;' : '';

        html += '<div style="display:flex;align-items:end;gap:2px;padding:1px 0;' + bg + '">';
        html += '<span style="width:22px;font-size:8px;color:' + fc + ';font-weight:' + fw + ';flex-shrink:0;">' + dayLabels[idx] + '</span>';
        html += '<div style="display:flex;align-items:end;gap:1px;">';

        for (var h = 6; h <= 22; h++) {
          var val = hours[h];
          var barH = val != null ? Math.max(2, Math.round(val * 0.35)) : 2;
          var barC = val != null ? getBarColor(val) : '#e5e7eb';
          html += '<div style="width:3px;height:' + barH + 'px;background:' + barC + ';border-radius:1px;"></div>';
        }

        html += '</div></div>';
      });

      html += '<div style="display:flex;justify-content:space-between;font-size:7px;color:#9ca3af;margin-top:2px;padding-left:22px;">';
      html += '<span>6am</span><span>10</span><span>2pm</span><span>6</span><span>10pm</span>';
      html += '</div>';
      html += '</div>';
    }

    html += '<div style="font-size:9px;color:#d1d5db;margin-top:6px;">' + escapeHtml(String(poi.lat)) + ', ' + escapeHtml(String(poi.lon)) + '</div>';
    html += '</div>';
    return html;
  } catch (e) {
    console.error('BUILD_POPUP_ERROR:', e);
    return '<div>' + escapeHtml(poi.name || 'POI') + '</div>';
  }
}

function getBarColor(value) {
  if (value >= 65) return "#ef4444";      // Merah = sangat ramai
  if (value >= 45) return "#f97316";      // Orange = ramai
  if (value >= 25) return "#eab308";      // Kuning = sedang
  return "#3b82f6";                       // Biru = sepi
}

function ensureMapLayers() {
  if (!window.maplibreMap) return false;
  
  const mbMap = window.maplibreMap;
  if (mbMap.isStyleLoaded && !mbMap.isStyleLoaded()) return false;
  
  // Set up poi GeoJSON source jika belum ada
  if (!poiGeoJsonSource) {
    poiGeoJsonSource = {
      sourceId: 'poi-markers',
      layerId: 'poi-markers-layer',
      popupLayerId: 'poi-markers-popup',
    };
    
    // Tambah source GeoJSON untuk POI markers
  }

  if (!mbMap.getSource('poi-markers')) {
    mbMap.addSource('poi-markers', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  // Tambah ulang source/layer bila style 2D/3D/satelit baru saja diganti.
  if (!mbMap.getLayer('poi-markers-layer')) {
      mbMap.addLayer({
        id: 'poi-markers-layer',
        type: 'circle',
        source: 'poi-markers',
        paint: {
          'circle-radius': ['case', 
            ['==', ['get', 'source'], 'google-maps-crawl'], 6,
            5
          ],
          'circle-color': ['case',
            ['==', ['get', 'category'], 'residential'], '#16a34a',
            ['==', ['get', 'category'], 'education'], '#2563eb',
            ['==', ['get', 'category'], 'family-services'], '#eab308',
            ['==', ['get', 'signal'], 'risk'], '#9f2d2d',
            '#0f766e'
          ],
          // Review < 20: transparan 50%; review >= 20: warna penuh.
          'circle-opacity': ['case',
            ['<', ['coalesce', ['get', 'reviewCount'], 0], 20], 0.5,
            1
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      });
      
  }

  // Click handler untuk POI markers hanya didaftarkan sekali per instance map.
  if (!poiMapEventsBound) {
      mbMap.on('click', 'poi-markers-layer', (e) => {
        if (!e.features || !e.features.length) return;
        const feature = e.features[0];
        const poi = feature.properties;
        
        if (poi && poi.name) {
          const maplibreglObj = window.maplibregl || (typeof maplibregl !== 'undefined' ? maplibregl : null);
          if (maplibreglObj) {
            new maplibreglObj.Popup({ maxWidth: 320, minWidth: 280, closeOnClick: true, autoClose: true })
              .setLngLat([poi.lon, poi.lat])
              .setHTML(poi._popupContent || `<div>${poi.name}</div>`)
              .addTo(mbMap);
          }
        }
      });
      
      // Cursor change saat hover
      mbMap.on('mouseenter', 'poi-markers-layer', () => {
        if (mbMap) mbMap.getCanvas().style.cursor = 'pointer';
      });
      
      mbMap.on('mouseleave', 'poi-markers-layer', () => {
        if (mbMap) mbMap.getCanvas().style.cursor = '';
      });
      poiMapEventsBound = true;
  }
  
  mapLayersAdded = true;
  return true;
}

function renderMapPois(lat, lon, radius, pois) {
  console.log('RENDER_MAP_POIS: called with', pois.length, 'POIs');
  
  const mbMap = getMaplibreMap();
  if (!mbMap) {
    // Tunggu Maplibre map siap
    waitForMap((m) => renderMapPois(lat, lon, radius, pois));
    return;
  }
  
  if (!ensureMapLayers()) {
    waitForMap(() => renderMapPois(lat, lon, radius, pois));
    return;
  }
  
  // Update center & radius
  mbMap.setCenter([lon, lat]);
  mbMap.setZoom(15);
  
  // Update radius circle (gunakan fungsi dari index.html jika tersedia)
  if (window.updateRadiusCircle) {
    window.updateRadiusCircle(lat, lon, radius / 1000); // radius dalam meter -> km
  } else {
    // Fallback: buat sendiri
    addRadiusCircleLocal(lat, lon, radius / 1000);
  }
  
  // Siapkan GeoJSON features untuk POI markers
  const withCoordinates = pois.filter((poi) => Number.isFinite(Number(poi.lat)) && Number.isFinite(Number(poi.lon)));
  const preferredHotmap = withCoordinates.filter((poi) => ["hotmap-v2-extension", "google-maps-crawl"].includes(poi.source));
  const markerCandidates = preferredHotmap.length
    ? preferredHotmap
    : withCoordinates;
  
  console.log('RENDER_MAP_POIS: markerCandidates with coords:', markerCandidates.length);
  
  const categoryCounts = {
    residential: 0,
    education: 0,
    "family-services": 0,
  };
  
  const features = [];
  
  appendActivityLog(`Render peta menerima ${markerCandidates.length} kandidat marker berkordinat.`);
  
  markerCandidates.forEach((poi) => {
    if (!Number.isFinite(Number(poi.lat)) || !Number.isFinite(Number(poi.lon))) return;
    
    // Batasi jumlah marker per kategori
    if (poi.category === "residential" && categoryCounts.residential >= 100) return;
    if (poi.category === "education" && categoryCounts.education >= 100) return;
    if (poi.category === "family-services" && categoryCounts["family-services"] >= 100) return;
    
    if (poi.category === "residential") categoryCounts.residential += 1;
    else if (poi.category === "education") categoryCounts.education += 1;
    else if (poi.category === "family-services") categoryCounts["family-services"] += 1;
    
    // Build popup content
    let popupContent = '';
    try {
      popupContent = buildPoiPopup(poi);
      console.log('MARKER_CREATED:', poi.name, '| popup length:', popupContent.length);
    } catch (e) {
      console.error('MARKER_ERROR:', poi.name, e);
      popupContent = `<div>${poi.name || 'POI'}</div>`;
    }
    
    // Dapatkan warna marker
    const color = getMarkerColor(poi);
    
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(poi.lon), Number(poi.lat)],
      },
      properties: {
        name: poi.name || 'POI',
        lat: poi.lat,
        lon: poi.lon,
        category: poi.category || '',
        source: poi.source || '',
        signal: poi.signal || '',
        reviewCount: getPoiReviewCount(poi),
        _popupContent: popupContent,
        _markerColor: color,
      },
    });
  });
  
  // Update GeoJSON source
  const source = mbMap.getSource('poi-markers');
  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features: features,
    });
  }

  setLayerVisibility("poi-markers-layer", poiLayerEnabled);
  syncPoiToggleUi();
}

function updateMap(lat, lon, radius, pois) {
  currentMapContext = { lat, lon, radius };
  // Normalisasi dahulu karena beberapa sumber backend memakai latitude/longitude
  // atau lng. Pengecekan koordinat mentah sebelumnya membuat layer tetap OFF
  // walaupun daftar POI sudah tampil di CMD.
  latestBasePois = Array.isArray(pois) ? dedupeMapPois(pois) : [];
  const mapPois = dedupeMapPois([...latestBasePois, ...latestHotmapPois]);
  // POI hasil analisa harus langsung terlihat setelah input lokasi diproses.
  if (mapPois.some((poi) => Number.isFinite(Number(poi.lat)) && Number.isFinite(Number(poi.lon)))) {
    setPoiLayerVisible(true);
  }
  renderMapPois(lat, lon, radius, mapPois);
}

// setStyle() menghapus seluruh source/layer custom MapLibre. Bangun kembali
// layer POI dan isi ulang datanya setelah pengguna mengganti mode peta.
window.addEventListener("map-style-loaded", () => {
  if (!currentMapContext) return;
  const { lat, lon, radius } = currentMapContext;
  renderMapPois(lat, lon, radius, dedupeMapPois([...latestBasePois, ...latestHotmapPois]));
});

// Fungsi helper untuk menambah radius circle secara lokal (fallback jika window.updateRadiusCircle tidak tersedia)
function addRadiusCircleLocal(lat, lon, radiusKm) {
  const mbMap = getMaplibreMap();
  if (!mbMap) return;
  
  // Import turf jika belum ada
  if (typeof turf === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js';
    script.onload = () => addRadiusCircleLocal(lat, lon, radiusKm);
    document.head.appendChild(script);
    return;
  }
  
  try {
    mbMap.removeLayer('radius-fill');
    mbMap.removeSource('radius-source');
    mbMap.removeLayer('radius-outline');
  } catch (e) {}
  
  const circle = turf.circle([lon, lat], radiusKm, {
    steps: 64,
    units: 'kilometers',
  });
  
  mbMap.addSource('radius-source', {
    type: 'geojson',
    data: circle,
  });
  
  mbMap.addLayer({
    id: 'radius-fill',
    type: 'fill',
    source: 'radius-source',
    paint: {
      'fill-color': RADIUS_COLOR,
      'fill-opacity': 0,
    },
  });
  
  mbMap.addLayer({
    id: 'radius-outline',
    type: 'line',
    source: 'radius-source',
    paint: {
      'line-color': RADIUS_COLOR,
      'line-width': 2.5,
      'line-dasharray': [6, 4],
    },
  });
}

async function fetchHotmapPois(lat, lon, radius, signal) {
  const url = new URL(`${API_BASE}/api/hotmap-v2/pois`, window.location.origin);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("radius", radius);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Gagal mengambil POI Hotmap V2.");
  }
  return response.json();
}

function startHotmapPolling() {
  if (hotmapPollTimer) {
    clearInterval(hotmapPollTimer);
    hotmapPollTimer = null;
  }

  hotmapPollTimer = setInterval(async () => {
    if (!currentMapContext) {
      return;
    }

    try {
      const payload = await fetchHotmapPois(currentMapContext.lat, currentMapContext.lon, currentMapContext.radius);
      const nextHotmapPois = Array.isArray(payload.items) ? payload.items : [];
      const changed = JSON.stringify(nextHotmapPois.map((poi) => [poi.name, poi.lat, poi.lon, poi.source])) !== JSON.stringify(latestHotmapPois.map((poi) => [poi.name, poi.lat, poi.lon, poi.source]));
      latestHotmapPois = nextHotmapPois;
      if (changed) {
        renderMapPois(currentMapContext.lat, currentMapContext.lon, currentMapContext.radius, dedupeMapPois([...latestBasePois, ...latestHotmapPois]));
        appendActivityLog(`Sinkronisasi Hotmap V2: ${latestHotmapPois.length} titik siap ditampilkan di peta.`, latestHotmapPois.length ? "success" : "");
      }
    } catch {
      // ignore polling errors to avoid noisy UI
    }
  }, 5000);
}

async function reverseGeocode(lat, lon, signal) {
  const response = await fetch(`${API_BASE}/api/reverse-geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ lat, lon }),
    signal,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.error || payload.detail || "";
    } catch {
      detail = "";
    }
    throw new Error(detail ? `Gagal mengambil nama jalan: ${detail}` : "Gagal mengambil nama jalan.");
  }
  return response.json();
}

async function fetchPois(lat, lon, radius, location = {}, signal) {
  try {
    const response = await fetch(`${API_BASE}/api/pois`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, radius, location }),
      signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload.error || payload.detail || "";
      } catch {
        detail = "";
      }
      return {
        items: [],
        meta: {
          effectiveRadius: radius,
          areaCoverage: [],
          crawlPlan: [],
          externalResearch: { summary: "", sources: [], metricHighlights: [] },
          degradedSources: {
            googleHousingTimedOut: false,
            externalResearchTimedOut: false,
          },
          backendError: detail || `HTTP ${response.status}`,
        },
      };
    }

    const data = await response.json();
    return {
      items: Array.isArray(data.items) ? data.items : [],
      meta: data.meta || {},
    };
  } catch (error) {
    return {
      items: [],
      meta: {
        effectiveRadius: radius,
        areaCoverage: [],
        crawlPlan: [],
        externalResearch: { summary: "", sources: [], metricHighlights: [] },
        degradedSources: {
          googleHousingTimedOut: false,
          externalResearchTimedOut: false,
        },
        backendError: error.message || "Network error",
      },
    };
  }
}

function formatCategoryCountLine(label, value) {
  return `<tr><td style="padding:8px 10px;border:1px solid #d6d0c7;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #d6d0c7;text-align:right;">${escapeHtml(String(value))}</td></tr>`;
}

function getPdfDemographyReport(result) {
  const objectCandidate = result?.demography_report
    || result?.district_analysis?.[0]?.demography?.report
    || tryParseJsonObject(result?.demography_report)
    || tryParseJsonObject(result?.district_analysis?.[0]?.demography?.report)
    || findDemographyReportDeep(result);

  return objectCandidate && typeof objectCandidate === "object" && !Array.isArray(objectCandidate)
    ? objectCandidate
    : null;
}

function getPdfDemographyText(result) {
  return result?.demography_text
    || result?.district_analysis?.[0]?.demography?.formatted_text
    || findDemographyTextDeep(result)
    || "";
}

function buildPdfDataTable(title, headers = [], rows = []) {
  return `
    <div class="pdf-subsection">
      <h3>${escapeHtml(title)}</h3>
      <table>
        ${headers.length ? `
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
        ` : ""}
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              ${row.map((cell, index) => `<td class="${index > 0 ? "number-cell" : ""}">${escapeHtml(cell)}</td>`).join("")}
            </tr>
          `).join("") : `
            <tr>
              <td colspan="${Math.max(headers.length, 1)}">Data belum tersedia.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function buildPdfBarChart(items = [], { valueFormatter = formatNumber } = {}) {
  const cleanItems = items
    .map((item) => ({
      label: item?.label || "-",
      value: Number(item?.value) || 0,
      color: item?.color || "#2563eb",
    }))
    .filter((item) => item.value > 0);

  if (!cleanItems.length) {
    return `<p class="muted">Grafik belum tersedia karena data numerik belum lengkap.</p>`;
  }

  const maxValue = cleanItems.reduce((max, item) => Math.max(max, item.value), 0) || 1;
  return `
    <div class="chart-grid">
      ${cleanItems.map((item) => {
        const width = Math.max(8, Math.round((item.value / maxValue) * 100));
        return `
          <div class="chart-row">
            <div class="chart-meta">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(valueFormatter(item.value))}</strong>
            </div>
            <div class="chart-track">
              <div class="chart-fill" style="width:${width}%;background:${escapeAttribute(item.color)};"></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function buildPdfNestedObjectTables(title, data, level = 0) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "";
  }

  const primitiveRows = [];
  const nestedSections = [];

  Object.entries(data).forEach(([key, value]) => {
    if (key === "raw_attributes") {
      return;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      nestedSections.push(buildPdfNestedObjectTables(formatJsonKeyLabel(key), value, level + 1));
      return;
    }

    primitiveRows.push([formatJsonKeyLabel(key), formatJsonValue(value)]);
  });

  return `
    <div class="pdf-subsection ${level > 0 ? "nested-subsection" : ""}">
      <h3>${escapeHtml(title)}</h3>
      ${primitiveRows.length ? `
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${primitiveRows.map(([label, value]) => `
              <tr>
                <td>${escapeHtml(label)}</td>
                <td class="number-cell">${escapeHtml(value)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
      ${nestedSections.join("")}
    </div>
  `;
}

function buildPdfDemographyChartSection(report, topDistrict = {}) {
  if (!report) {
    const earlyChildhood = topDistrict?.demography?.early_childhood_population;
    if (earlyChildhood == null) {
      return `<p class="muted">Grafik demografi belum tersedia karena laporan Dukcapil tidak ditemukan.</p>`;
    }

    return buildPdfBarChart([
      { label: "Estimasi anak usia 2-7", value: earlyChildhood, color: "#0f766e" },
      { label: "Total populasi", value: topDistrict?.demography?.population || 0, color: "#2563eb" },
    ]);
  }

  const ageChartItems = [
    { label: "Usia 0-4", value: report?.kelompok_usia?.usia_0_4_tahun, color: "#0f766e" },
    { label: "Usia 5-9", value: report?.kelompok_usia?.usia_5_9_tahun, color: "#1d4ed8" },
    { label: "Usia 10-14", value: report?.kelompok_usia?.usia_10_14_tahun, color: "#3b82f6" },
    { label: "Estimasi usia 2-7", value: report?.derived_metrics?.estimasi_anak_usia_2_7, color: "#f59e0b" },
  ];

  const genderChartItems = [
    { label: "Laki-laki", value: report?.penduduk?.laki_laki, color: "#7c3aed" },
    { label: "Perempuan", value: report?.penduduk?.perempuan, color: "#db2777" },
  ];

  const religionEntries = Object.entries(report?.agama || {})
    .map(([key, value], index) => ({
      label: formatJsonKeyLabel(key),
      value: Number(value) || 0,
      color: ["#2563eb", "#0f766e", "#f59e0b", "#7c3aed", "#db2777", "#0891b2", "#65a30d"][index % 7],
    }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);

  return `
    <div class="pdf-chart-stack">
      <div class="card">
        <h3>Grafik Kelompok Usia Kunci</h3>
        ${buildPdfBarChart(ageChartItems)}
      </div>
      <div class="card">
        <h3>Grafik Gender</h3>
        ${buildPdfBarChart(genderChartItems)}
      </div>
      <div class="card">
        <h3>Grafik Agama Dominan</h3>
        ${buildPdfBarChart(religionEntries)}
      </div>
    </div>
  `;
}

function buildPdfReportHtml() {
  const allPois = dedupeMapPois([...latestBasePois, ...latestHotmapPois]);
  const groupedPois = Array.from(allPois.reduce((acc, poi) => {
    const label = poi.categoryLabel || poi.category || "Lainnya";
    acc.set(label, (acc.get(label) || 0) + 1);
    return acc;
  }, new Map()).entries()).sort((left, right) => right[1] - left[1]);
  const areaName = [districtNameEl.textContent || "", cityNameEl.textContent || ""].filter(Boolean).join(", ") || streetNameEl.textContent || "Area analisa";
  const coordinates = currentMapContext ? `${currentMapContext.lat}, ${currentMapContext.lon}` : "-";
  const mbMap = getMaplibreMap();
  const mapHtml = mbMap ? mbMap.getContainer().outerHTML : "";
  const market = latestStructuredAnalysis?.market_estimation || {};
  const formula = market?.market_size_formula || {};
  const competitorMap = latestStructuredAnalysis?.competitor_map || {};
  const poiSummary = latestStructuredAnalysis?.poi_summary || {};
  const decision = latestStructuredAnalysis?.decision || {};
  const quality = latestStructuredAnalysis?.data_quality || {};
  const topDistrict = latestStructuredAnalysis?.district_analysis?.[0] || {};
  const scenarios = market?.market_size_scenarios || {};
  const demographyReport = getPdfDemographyReport(latestStructuredAnalysis);
  const demographyText = getPdfDemographyText(latestStructuredAnalysis);
  const analysisBars = [
    { label: "Market Size", value: Number(market.market_size) || 0, display: formatCurrency(market.market_size), color: "#0f766e" },
    { label: "TAM", value: Number(market.tam) || 0, display: formatNumber(market.tam), color: "#1d4ed8" },
    { label: "SAM", value: Number(market.sam) || 0, display: formatNumber(market.sam), color: "#2563eb" },
    { label: "SOM", value: Number(market.som) || 0, display: formatNumber(market.som), color: "#3b82f6" },
    { label: "Kompetitor", value: Number(competitorMap.count_estimate) || 0, display: formatNumber(competitorMap.count_estimate), color: "#f59e0b" },
    { label: "Fasilitas keluarga", value: Number(latestStructuredAnalysis?.district_analysis?.[0]?.facilities?.total_family_facilities) || 0, display: formatNumber(latestStructuredAnalysis?.district_analysis?.[0]?.facilities?.total_family_facilities), color: "#7c3aed" },
  ];
  const maxBarValue = analysisBars.reduce((max, item) => Math.max(max, item.value), 0) || 1;
  const barHtml = analysisBars.map((item) => {
    const width = Math.max(6, Math.round((item.value / maxBarValue) * 100));
    return `
      <div class="chart-row">
        <div class="chart-meta">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.display)}</strong>
        </div>
        <div class="chart-track">
          <div class="chart-fill" style="width:${width}%;background:${escapeAttribute(item.color)};"></div>
        </div>
      </div>
    `;
  }).join("");
  const poiRows = groupedPois.length
    ? groupedPois.map(([label, count]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="number-cell">${escapeHtml(formatNumber(count))}</td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="2">Belum ada data POI.</td>
      </tr>
    `;

  const marketShareRows = [
    ["Low", "1%", formatNumber(scenarios?.low?.students), formatCurrency(scenarios?.low?.annual_revenue), "Simulasi konservatif"],
    ["Mid", "2%", formatNumber(scenarios?.mid?.students), formatCurrency(scenarios?.mid?.annual_revenue), "Target realistis cabang baru"],
    ["High", "5%", formatNumber(scenarios?.high?.students), formatCurrency(scenarios?.high?.annual_revenue), "Skenario agresif"],
  ];
  const marketShareChartHtml = buildPdfBarChart([
    { label: "Low 1%", value: scenarios?.low?.students, color: "#94a3b8" },
    { label: "Mid 2%", value: scenarios?.mid?.students, color: "#2563eb" },
    { label: "High 5%", value: scenarios?.high?.students, color: "#0f766e" },
  ]);
  const demographyTablesHtml = demographyReport
    ? Object.entries(demographyReport)
      .filter(([key]) => key !== "raw_attributes")
      .map(([key, value]) => buildPdfNestedObjectTables(formatJsonKeyLabel(key), value))
      .join("")
    : demographyText
    ? `
      <div class="pdf-subsection">
        <h3>Demografi Dukcapil</h3>
        <pre class="pdf-pre">${escapeHtml(demographyText)}</pre>
      </div>
    `
    : `
      <div class="pdf-subsection">
        <h3>Demografi Dukcapil</h3>
        <p class="muted">Data demografi lengkap belum tersedia pada hasil analisa.</p>
      </div>
    `;

  return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title></title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
      <style>
        @page { margin: 12mm; }
        body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #172033; background: #fffdfa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h1 { margin: 0; font-size: 28px; }
        h2 { margin: 0 0 12px; font-size: 18px; color: #0f172a; }
        p { line-height: 1.6; margin: 6px 0; }
        .muted { color: #5b6472; }
        .section { margin-top: 20px; page-break-inside: avoid; }
        .hero { border: 1px solid #d9d0c3; border-radius: 16px; padding: 20px; background: linear-gradient(135deg, #fff7ed, #eff6ff); }
        .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
        .meta-card, .card { border: 1px solid #d9d0c3; border-radius: 14px; padding: 16px; background: #ffffff; }
        #map { width: 100%; height: 460px; border: 1px solid #d9d0c3; border-radius: 16px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 12px; border: 1px solid #d9d0c3; text-align: left; }
        th { background: #f8fafc; }
        .number-cell { text-align: right; }
        .chart-grid { display: grid; gap: 12px; }
        .chart-row { display: grid; gap: 8px; }
        .chart-meta { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
        .chart-track { width: 100%; height: 14px; border-radius: 999px; background: #e5e7eb; overflow: hidden; border: 1px solid #cbd5e1; }
        .chart-fill { height: 100%; border-radius: 999px; min-width: 10px; box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12); }
        .analysis-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; }
        .pdf-subsection { margin-top: 16px; }
        .pdf-subsection h3 { margin: 0 0 10px; font-size: 16px; color: #0f172a; }
        .nested-subsection { padding-left: 8px; border-left: 3px solid #e2e8f0; }
        .pdf-chart-stack { display: grid; gap: 16px; }
        .pdf-pre { margin: 0; padding: 14px; border: 1px solid #d9d0c3; border-radius: 12px; background: #fff; white-space: pre-wrap; word-break: break-word; font-family: Consolas, monospace; font-size: 12px; line-height: 1.5; }
        .insight-list { margin: 0; padding-left: 18px; }
        .insight-list li { margin-bottom: 8px; line-height: 1.5; }
        @media print {
          body { margin: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .analysis-grid, .meta-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <section class="hero">
        <h1>${escapeHtml(areaName)}</h1>
        <p class="muted">Koordinat: ${escapeHtml(coordinates)}</p>
        <div class="meta-grid">
          <div class="meta-card">
            <strong>Alamat acuan</strong>
            <p>${escapeHtml(streetNameEl.textContent || "-")}</p>
          </div>
          <div class="meta-card">
            <strong>Ringkasan keputusan</strong>
            <p>${escapeHtml(decision.recommendation || "-")} | Confidence ${escapeHtml(quality.overall_confidence || "-")}</p>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Peta Visual</h2>
        ${mapHtml}
      </section>

      <section class="section">
        <h2>Jumlah Masing-Masing POI</h2>
        <table>
          <thead>
            <tr>
              <th>Kategori POI</th>
              <th class="number-cell">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            ${poiRows}
            <tr>
              <td><strong>Total POI</strong></td>
              <td class="number-cell"><strong>${escapeHtml(formatNumber(allPois.length))}</strong></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Grafik Hasil Analisa Area</h2>
        <div class="analysis-grid">
          <div class="card">
            <div class="chart-grid">
              ${barHtml}
            </div>
          </div>
          <div class="card">
            <table>
              <tbody>
                <tr><th>Benchmark wilayah</th><td>${escapeHtml(formula.region_benchmark || "-")}</td></tr>
                <tr><th>Jumlah kompetitor</th><td>${escapeHtml(formatNumber(formula.competitor_poi_count))}</td></tr>
                <tr><th>Rata-rata SPP</th><td>${escapeHtml(formatCurrency(formula.average_spp_benchmark ?? formula.spp_monthly))}</td></tr>
                <tr><th>Sumber SPP</th><td>${escapeHtml(formula.spp_reference_status === "local_web_research" ? `Web Research (${formula.researched_spp?.count || 0} data)` : "Benchmark regional / asumsi")}</td></tr>
                <tr><th>Status referensi</th><td>${escapeHtml(formula.spp_reference_note || "-")}</td></tr>
                <tr><th>Link referensi SPP</th><td>${escapeHtml(Array.isArray(formula.spp_reference_links) && formula.spp_reference_links.length ? formula.spp_reference_links.map((item) => item.title || item.url).join(" | ") : "Tidak ada link referensi lokal yang tersimpan")}</td></tr>
                <tr><th>Rata-rata kapasitas</th><td>${escapeHtml(formula.average_capacity_benchmark != null ? `${formatNumber(formula.average_capacity_benchmark)} murid` : "-")}</td></tr>
                <tr><th>Market Size</th><td>${escapeHtml(formatCurrency(market.market_size))}</td></tr>
                <tr><th>TAM / SAM / SOM</th><td>${escapeHtml(`${formatNumber(market.tam)} / ${formatNumber(market.sam)} / ${formatNumber(market.som)}`)}</td></tr>
                <tr><th>Density kompetitor</th><td>${escapeHtml(competitorMap.density_level || "-")}</td></tr>
                <tr><th>Total kategori fasilitas keluarga</th><td>${escapeHtml(formatNumber(poiSummary?.categories?.fasilitas_keluarga))}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Simulasi Market Share</h2>
        <div class="analysis-grid">
          <div class="card">
            ${buildPdfDataTable("Tabel Simulasi Market Share", ["Skenario", "Penetrasi", "Target Siswa", "Revenue Tahunan", "Catatan"], marketShareRows)}
          </div>
          <div class="card">
            <h3>Grafik Target Siswa per Skenario</h3>
            ${marketShareChartHtml}
            <table style="margin-top:12px;">
              <tbody>
                <tr><th>Market Share Backend</th><td>${escapeHtml(market.market_share != null ? `${market.market_share}%` : "-")}</td></tr>
                <tr><th>Potential Revenue</th><td>${escapeHtml(formatCurrency(market.potential_revenue))}</td></tr>
                <tr><th>Market Gap</th><td>${escapeHtml(formatNumber(market.market_gap))}</td></tr>
                <tr><th>Reasoning</th><td>${escapeHtml(market.reasoning || "-")}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Demografi Dukcapil</h2>
        <div class="card">
          <table>
            <tbody>
              <tr><th>Kecamatan</th><td>${escapeHtml(demographyReport?.wilayah?.kecamatan || topDistrict?.district_name || "-")}</td></tr>
              <tr><th>Kabupaten/Kota</th><td>${escapeHtml(demographyReport?.wilayah?.kabupaten_kota || "-")}</td></tr>
              <tr><th>Jumlah penduduk</th><td>${escapeHtml(formatNumber(demographyReport?.ringkasan?.jumlah_penduduk || topDistrict?.demography?.population))}</td></tr>
              <tr><th>Estimasi anak usia 2-7</th><td>${escapeHtml(formatNumber(demographyReport?.derived_metrics?.estimasi_anak_usia_2_7 || topDistrict?.demography?.early_childhood_population))}</td></tr>
              <tr><th>Sumber</th><td>${escapeHtml(topDistrict?.demography?.source || demographyReport?.source?.system || "dukcapil_arcgis_kecamatan")}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="analysis-grid" style="margin-top:16px;">
          <div class="card">
            <h3>Grafik Demografi</h3>
            ${buildPdfDemographyChartSection(demographyReport, topDistrict)}
          </div>
          <div class="card">
            <h3>Catatan Demografi</h3>
            <p>${escapeHtml(topDistrict?.demography?.reasoning || "Demografi Dukcapil dipakai sebagai basis pembacaan populasi dan struktur usia area.")}</p>
            <p>${escapeHtml(demographyReport?.derived_metrics?.metode_estimasi_anak_usia_2_7 || topDistrict?.demography?.assumption_source || "")}</p>
          </div>
        </div>
        <div style="margin-top:16px;">
          ${demographyTablesHtml}
        </div>
      </section>
    </body>
    </html>
  `;
}

function downloadPdfReport() {
  if (!currentMapContext || !latestBasePois.length || !latestStructuredAnalysis) {
    setStatus("Belum ada hasil analisa area lengkap untuk diunduh.", true);
    return;
  }

  const reportWindow = window.open("", "_blank", "width=1200,height=900");
  if (!reportWindow) {
    setStatus("Popup diblokir browser. Izinkan popup untuk membuat PDF.", true);
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(buildPdfReportHtml());
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => {
    reportWindow.print();
  }, 1200);
}

async function getStructuredAiAnalysis(context, signal) {
  const response = await fetch(`${API_BASE}/api/structured-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.detail || payload.error || "";
    } catch {
      detail = "";
    }
    throw new Error(detail ? `Structured analysis error ${response.status}: ${detail}` : `Structured analysis error ${response.status}`);
  }

  return response.json();
}

async function getAiAnalysis(context, signal) {
  const response = await fetch(`${API_BASE}/api/ai-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.detail || payload.error || "";
    } catch {
      detail = "";
    }
    throw new Error(detail ? `AI backend error ${response.status}: ${detail}` : `AI backend error ${response.status}`);
  }

  const parsed = await response.json();
  return {
    suitabilityLabel: parsed.suitabilityLabel || "Perlu validasi lapangan",
    analysis: parsed.analysis || "Analisa area tidak tersedia.",
    recommendation: parsed.recommendation || "Rekomendasi area tidak tersedia.",
  };
}

async function getDeepResearchAnalysis(context, signal) {
  const response = await fetch(`${API_BASE}/api/deep-research-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
    signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.detail || payload.error || "";
    } catch {
      detail = "";
    }
    throw new Error(detail ? `Deep research backend error ${response.status}: ${detail}` : `Deep research backend error ${response.status}`);
  }

  const parsed = await response.json();
  return {
    headline: parsed.headline || "Riset mendalam belum tersedia.",
    accessibility: parsed.accessibility || "Uraian aksesibilitas belum tersedia.",
    demography: parsed.demography || "Uraian demografi belum tersedia.",
    marketNeed: parsed.marketNeed || "Uraian kebutuhan pasar belum tersedia.",
    facilitiesEnvironment: parsed.facilitiesEnvironment || "Uraian fasilitas dan lingkungan belum tersedia.",
    promotionPartnership: parsed.promotionPartnership || "Uraian potensi promosi dan kerjasama belum tersedia.",
    digitalFootprint: parsed.digitalFootprint || "Uraian digital footprint belum tersedia.",
    digitalFootprintExamples: Array.isArray(parsed.digitalFootprintExamples) ? parsed.digitalFootprintExamples : [],
    digitalFootprintReferences: Array.isArray(parsed.digitalFootprintReferences) ? parsed.digitalFootprintReferences : [],
    sourceDetails: Array.isArray(parsed.sourceDetails) ? parsed.sourceDetails : [],
    marketSizeShare: parsed.marketSizeShare || "Estimasi market size dan market share belum tersedia.",
    implication: parsed.implication || "Implikasi bisnis belum tersedia.",
    sourcesUsed: Array.isArray(parsed.sourcesUsed) ? parsed.sourcesUsed : [],
  };
}

function summarizePois(pois) {
  const counts = { total: 0, positive: 0, risk: 0, neutral: 0 };
  const categoryCounts = {};

  pois.forEach((poi) => {
    counts.total += 1;
    if (typeof counts[poi.signal] === "number") {
      counts[poi.signal] += 1;
    } else {
      counts.neutral += 1;
    }
    categoryCounts[poi.category] = (categoryCounts[poi.category] || 0) + 1;
  });

  return {
    counts,
    categoryCounts,
    categories: {
      ...categoryCounts,
      familyServices: categoryCounts["family-services"] || 0,
    },
  };
}

function getTopPois(pois, signal, limit = 10) {
  return pois
    .filter((poi) => poi.signal === signal)
    .slice(0, limit)
    .map((poi) => `${poi.name} (${poi.categoryLabel} - ${getPoiSourceLabel(poi.source)})`);
}

function getTopPoiEntries(pois, signal, limit = 10) {
  return pois
    .filter((poi) => poi.signal === signal)
    .slice(0, limit)
    .map((poi) => ({
      name: poi.name,
      categoryLabel: poi.categoryLabel,
      source: poi.source,
    }));
}

function renderPoiLists(supporting, risks, poiItems = []) {
  supportingPoiEl.innerHTML = supporting.length
    ? supporting.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Belum ada POI pendukung yang menonjol.</li>";

  riskPoiEl.innerHTML = risks.length
    ? risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Tidak ada POI risiko yang dominan dalam hasil saat ini.</li>";

  renderPoiEvidencePanel(
    getTopPoiEntries(poiItems, "positive"),
    getTopPoiEntries(poiItems, "risk"),
    latestPoiMeta,
  );
}

function renderPoiEvidencePanel(supporting = [], risks = [], meta = {}) {
  if (!poiEvidencePanelEl) {
    return;
  }

  const buildList = (items, emptyLabel) => items.length
    ? items.slice(0, 8).map((item) => {
      const name = typeof item === "string" ? item : item?.name || "-";
      const metaLabel = typeof item === "object" && item
        ? [item.categoryLabel, getPoiSourceLabel(item.source)].filter(Boolean).join(" - ")
        : "";
      return `
        <li>
          <strong>${escapeHtml(name)}</strong>
          ${metaLabel ? `<span>${escapeHtml(metaLabel)}</span>` : ""}
        </li>
      `;
    }).join("")
    : `<li class="poi-empty-item">${escapeHtml(emptyLabel)}</li>`;

  if (supportingPoiVisibleEl) {
    supportingPoiVisibleEl.innerHTML = buildList(supporting, "Belum ada POI pendukung yang menonjol.");
  }
  if (riskPoiVisibleEl) {
    riskPoiVisibleEl.innerHTML = buildList(risks, "Belum ada POI risiko yang dominan.");
  }

  const sourceLabel = ["google-maps-crawl", "google-maps-crawl-only"].includes(meta?.sourceMode)
    ? "Google Maps asli"
    : meta?.sourceMode === "google-maps-crawl-fallback"
      ? "Crawl sementara"
      : "Sumber POI aktif";
  const sourceCount = Array.isArray(meta?.crawlPlan) ? meta.crawlPlan.length : 0;
  const sourcePill = poiEvidencePanelEl.querySelector(".pill-muted");
  if (sourcePill) {
    sourcePill.textContent = sourceLabel;
  }
  poiEvidencePanelEl.setAttribute("data-mode", meta?.sourceMode || "");
  poiEvidencePanelEl.setAttribute("data-source-label", sourceLabel);
  poiEvidencePanelEl.setAttribute("data-source-count", String(sourceCount));
}

function renderPoiSources(meta = {}, pois = []) {
  const sourceSet = new Set(pois.map((poi) => poi.source).filter(Boolean));
  const chips = [];

  if (sourceSet.has("google-maps-crawl")) {
    chips.push('<span class="source-chip-inline">Google Maps Crawl</span>');
  }
  if (sourceSet.has("hotmap-v2-extension")) {
    chips.push('<span class="source-chip-inline">Hotmap V2 Extension</span>');
  }
  if (sourceSet.has("google-places")) {
    chips.push('<span class="source-chip-inline">Google Places</span>');
  }
  if (sourceSet.has("overpass")) {
    chips.push('<span class="source-chip-inline">OpenStreetMap / Overpass</span>');
  }

  const notes = [];
  if (meta.usedGoogleMapsCrawler) {
    notes.push("Marker peta diprioritaskan dari Google Maps Crawl untuk hunian, kids education, dan affiliate.");
  }
  if (meta.hotmapV2InRadius) {
    notes.push(`Hotmap V2 menyumbang ${meta.hotmapV2InRadius} titik dalam radius aktif.`);
  }
  if (meta.backendHotmapInRadius) {
    notes.push(`Backend crawl berbasis Hotspot V2 menambahkan ${meta.backendHotmapInRadius} titik ke peta.`);
  }
  if (meta.usedGooglePlaces) {
    notes.push("Google Places API aktif.");
  }

  poiSourceBox.innerHTML = chips.length
    ? `<div>${chips.join("")}</div><div>${escapeHtml(notes.join(" ") || "POI digabung dari beberapa sumber.")}</div>`
    : "Sumber POI tidak tersedia.";
}

function renderResearchSources(research = {}) {
  const sources = Array.isArray(research.sources) ? research.sources : [];
  const summary = research.summary || "";

  if (!sources.length && !summary) {
    researchSourceBox.textContent = "Sumber riset eksternal tidak tersedia.";
    return;
  }

  researchSourceBox.innerHTML = `
    <div><strong>Riset eksternal:</strong> ${escapeHtml(summary || "Tersedia.")}</div>
    <div class="research-links">
      ${sources.map((source) => `<a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`).join("")}
    </div>
  `;
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatTextList(items = []) {
  const filtered = (items || []).filter(Boolean);
  return filtered.length ? filtered.join(", ") : "-";
}

function buildTableSection(title, rows = []) {
  return `
    <div class="narrative-block">
      <h4>${escapeHtml(title)}</h4>
      <table class="narrative-table">
        <tbody>
          ${rows.map((row) => `
            <tr>
              <th>${escapeHtml(row.label)}</th>
              <td>${escapeHtml(row.value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatJsonKeyLabel(key = "") {
  return String(key)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatJsonValue(value) {
  if (value == null) {
    return "-";
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? formatNumber(value)
      : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value);
  }
  if (typeof value === "boolean") {
    return value ? "Ya" : "Tidak";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => {
      if (item && typeof item === "object") {
        return JSON.stringify(item);
      }
      return String(item);
    }).join(", ") : "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function buildNestedJsonTables(title, data, level = 0) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "";
  }

  const primitiveRows = [];
  const nestedSections = [];

  Object.entries(data).forEach(([key, value]) => {
    if (key === "raw_attributes") {
      return;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      nestedSections.push(buildNestedJsonTables(formatJsonKeyLabel(key), value, level + 1));
      return;
    }

    primitiveRows.push({
      label: formatJsonKeyLabel(key),
      value: formatJsonValue(value),
    });
  });

  const tableHtml = primitiveRows.length
    ? `
      <table class="narrative-table narrative-table-compact">
        <tbody>
          ${primitiveRows.map((row) => `
            <tr>
              <th>${escapeHtml(row.label)}</th>
              <td>${escapeHtml(row.value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "";

  return `
    <div class="demography-json-group level-${level}">
      <h5>${escapeHtml(title)}</h5>
      ${tableHtml}
      ${nestedSections.join("")}
    </div>
  `;
}

function tryParseJsonObject(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildDemographyTablesFromText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return "";
  }

  const lines = text.split(/\r?\n/);
  const sections = [];
  let currentSection = {
    title: "Wilayah dan Ringkasan",
    rows: [],
  };

  const pushCurrentSection = () => {
    if (currentSection.rows.length) {
      sections.push(currentSection);
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (!trimmed.includes("\t")) {
      pushCurrentSection();
      currentSection = {
        title: trimmed,
        rows: [],
      };
      return;
    }

    const [label, ...valueParts] = trimmed.split("\t");
    currentSection.rows.push({
      label: label.trim(),
      value: valueParts.join(" ").trim() || "-",
    });
  });

  pushCurrentSection();

  return sections.map((section) => `
    <div class="demography-json-group">
      <h5>${escapeHtml(section.title)}</h5>
      <table class="narrative-table narrative-table-compact">
        <tbody>
          ${section.rows.map((row) => `
            <tr>
              <th>${escapeHtml(row.label)}</th>
              <td>${escapeHtml(row.value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("");
}

function looksLikeDemographyReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return ["wilayah", "ringkasan", "agama", "penduduk", "status_perkawinan", "kelompok_usia"].some((key) => keys.includes(key));
}

function findDemographyReportDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (looksLikeDemographyReport(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDemographyReportDeep(item, seen);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const nestedValue of Object.values(value)) {
    const found = findDemographyReportDeep(nestedValue, seen);
    if (found) {
      return found;
    }
  }

  return null;
}

function findDemographyTextDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (seen.has(value)) {
    return "";
  }
  seen.add(value);

  if (typeof value.demography_text === "string" && value.demography_text.trim()) {
    return value.demography_text;
  }
  if (typeof value.formatted_text === "string" && value.formatted_text.trim()) {
    return value.formatted_text;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDemographyTextDeep(item, seen);
      if (found) {
        return found;
      }
    }
    return "";
  }

  for (const nestedValue of Object.values(value)) {
    const found = findDemographyTextDeep(nestedValue, seen);
    if (found) {
      return found;
    }
  }

  return "";
}

function buildDemographyJsonSection(result) {
  const objectCandidate = result?.demography_report
    || result?.district_analysis?.[0]?.demography?.report
    || tryParseJsonObject(result?.demography_report)
    || tryParseJsonObject(result?.district_analysis?.[0]?.demography?.report)
    || findDemographyReportDeep(result);
  const demographyReport = objectCandidate && typeof objectCandidate === "object" && !Array.isArray(objectCandidate)
    ? objectCandidate
    : null;
  const demographyText = result?.demography_text
    || result?.district_analysis?.[0]?.demography?.formatted_text
    || findDemographyTextDeep(result)
    || "";
  const rawArcgisJson = demographyReport?.raw_attributes && typeof demographyReport.raw_attributes === "object"
    ? buildNestedJsonTables("Raw ArcGIS JSON", demographyReport.raw_attributes)
    : "";

  if (!demographyReport && !demographyText) {
    return `
      <div class="narrative-block">
        <h4>Demografi Dukcapil</h4>
        <p>Data demografi lengkap belum tersedia pada hasil analisa.</p>
      </div>
    `;
  }

  return `
    <div class="narrative-block">
      <h4>Demografi Dukcapil</h4>
      <p>Seluruh data demografi Dukcapil ditampilkan dalam bentuk tabel per kategori.</p>
      <div class="demography-json-layout">
        ${demographyReport
          ? Object.entries(demographyReport)
            .filter(([key]) => key !== "raw_attributes")
            .map(([key, value]) => buildNestedJsonTables(formatJsonKeyLabel(key), value))
            .join("")
          : buildDemographyTablesFromText(demographyText)}
      </div>
      ${rawArcgisJson ? `
        <details class="demography-raw-json">
          <summary>Lihat raw ArcGIS JSON</summary>
          ${rawArcgisJson}
        </details>
      ` : ""}
    </div>
  `;
}

function resetAiAnalysisPanel(message) {
  latestStructuredAnalysis = null;
  latestAiSummary = {
    suitabilityLabel: "",
    analysis: "",
    recommendation: "",
  };
  analysisStatusBanner.textContent = message;
  renderAnalysisDropdown("Hasil analisis akan muncul di sini", `<p>${escapeHtml(message)}</p>`);
  summaryCardEls.forEach((item) => {
    item.textContent = "-";
  });
  if (topDistrictsEl) {
    topDistrictsEl.innerHTML = "<li>Belum ada hasil.</li>";
  }
  if (opportunitySnapshotEl) {
    opportunitySnapshotEl.textContent = "";
  }
  renderPoiBreakdowns([]);
  renderPoiEvidencePanel([], [], latestPoiMeta);
}

function renderLocalAreaAnalysis({ streetName, districtName, cityName, areaCoverage = [], pois = [], research = {} }) {
  const summary = summarizePois(pois);
  const positivePois = getTopPois(pois, "positive", 5);
  const riskPois = getTopPois(pois, "risk", 5);
  const areaNames = (Array.isArray(areaCoverage) ? areaCoverage : [])
    .map((area) => area.subdistrict || area.district || area.city)
    .filter(Boolean);
  const areaLabel = areaNames.length ? areaNames.join(", ") : districtName || "-";
  const recommendation = summary.counts.positive >= summary.counts.risk
    ? "Area masih layak diprioritaskan untuk survei lapangan."
    : "Area perlu diverifikasi lebih hati-hati karena sinyal risiko lebih dominan.";

  latestStructuredAnalysis = null;
  latestAiSummary = {
    suitabilityLabel: summary.counts.positive >= summary.counts.risk ? "Ringkasan Lokal" : "Perlu Cek Lapangan",
    analysis: `Ringkasan area disusun dari ${formatNumber(summary.counts.total || pois.length)} POI dalam radius 3 KM tanpa analisa AI.`,
    recommendation,
  };
  latestDeepResearchSummary = {
    headline: "",
    accessibility: "",
    demography: "",
    marketNeed: "",
    facilitiesEnvironment: "",
    promotionPartnership: "",
    digitalFootprint: "",
    digitalFootprintExamples: [],
    digitalFootprintReferences: [],
    sourceDetails: [],
    marketSizeShare: "",
    implication: "",
    sourcesUsed: [],
  };

  analysisStatusBanner.textContent = `Ringkasan lokal siap untuk ${areaLabel}.`;
  if (topDistrictsEl) {
    topDistrictsEl.innerHTML = areaNames.length
      ? areaNames.slice(0, 5).map((name) => `<li>${escapeHtml(name)}</li>`).join("")
      : `<li>${escapeHtml(districtName || "Wilayah target")}</li>`;
  }
  if (summaryBox) {
    summaryBox.innerHTML = `
      <span class="tag-neutral">${escapeHtml(latestAiSummary.suitabilityLabel)}</span>
      <div>${escapeHtml(latestAiSummary.analysis)}</div>
      <p><strong>Kesimpulan:</strong> ${escapeHtml(latestAiSummary.recommendation)}</p>
    `;
  }
  if (opportunitySnapshotEl) {
    opportunitySnapshotEl.innerHTML = `
      <div class="narrative-block">
        <h4>Ringkasan Lokasi</h4>
        <p>${escapeHtml(`Lokasi berada di ${[streetName, districtName, cityName].filter(Boolean).join(", ") || "wilayah target"} dengan ringkasan radius 3 KM berbasis crawl Google Maps POI.`)}</p>
        <p>${escapeHtml(recommendation)}</p>
      </div>
    `;
  }
  renderAnalysisDropdown(
    `${latestAiSummary.suitabilityLabel || "Ringkasan lokal"} - klik untuk detail`,
    [
      buildTableSection("Ringkasan Area", [
        { label: "Alamat", value: streetName || "-" },
        { label: "Cakupan area", value: areaLabel || "-" },
        { label: "Total POI", value: formatNumber(summary.counts.total) },
        { label: "Sinyal positif", value: formatNumber(summary.counts.positive) },
        { label: "Sinyal risiko", value: formatNumber(summary.counts.risk) },
      ]),
      buildTableSection("Komposisi POI", [
        { label: "Hunian", value: formatNumber(summary.categories.residential) },
        { label: "Kompetitor", value: formatNumber(summary.categories.education) },
        { label: "Affiliate", value: formatNumber(summary.categories.familyServices) },
      ]),
      buildTableSection("Sinyal Lapangan", [
        { label: "POI pendukung", value: formatTextList(positivePois) },
        { label: "POI risiko", value: formatTextList(riskPois) },
        { label: "Riset eksternal", value: research?.summary || "Belum ada ringkasan riset tambahan." },
      ]),
    ].join(""),
  );
  renderPoiEvidencePanel(
    getTopPoiEntries(pois, "positive", 5),
    getTopPoiEntries(pois, "risk", 5),
    latestPoiMeta,
  );
}

function renderAiAnalysisTables(result, fallbackContext = {}) {
  if (!aiAnalysisResultsEl) {
    return;
  }

  const reverseGeocode = result?.location?.reverse_geocode || {};
  const topDistrict = result?.district_analysis?.[0] || {};
  const market = result?.market_estimation || {};
  const unitEconomics = result?.unit_economics || {};
  const competitorMap = result?.competitor_map || {};
  const dataQuality = result?.data_quality || {};
  const marketFormula = market?.market_size_formula || {};
  const decision = result?.decision || {};
  const topDistrictName = topDistrict?.district_name || reverseGeocode.district || fallbackContext.districtName || "-";
  const scenarios = market?.market_size_scenarios || {};

  renderAnalysisDropdown(
    `${decision.recommendation || "Analisa"} - klik untuk detail`,
    [
      buildTableSection("Ringkasan Keputusan", [
        { label: "Decision", value: decision.recommendation || "-" },
        { label: "Confidence", value: dataQuality.overall_confidence || "-" },
        { label: "Market Area", value: topDistrictName },
        { label: "Ringkasan", value: result?.recommendation_summary || decision.reason || "-" },
      ]),
      buildTableSection("Lokasi dan Kompetitor", [
        { label: "Alamat", value: reverseGeocode.display_name || fallbackContext.streetName || "-" },
        { label: "Kecamatan", value: reverseGeocode.district || fallbackContext.districtName || "-" },
        { label: "Kota", value: reverseGeocode.city || fallbackContext.cityName || "-" },
        { label: "Jumlah POI Kompetitor", value: formatNumber(competitorMap.count_estimate) },
        { label: "Density", value: competitorMap.density_level || "-" },
        { label: "Kompetitor Terdekat", value: competitorMap.nearest_distance_km != null ? `${competitorMap.nearest_distance_km} km` : "-" },
        { label: "Distribusi", value: `Bimba ${formatNumber(competitorMap?.type_distribution?.bimba)}, PAUD ${formatNumber(competitorMap?.type_distribution?.paud)}, TK ${formatNumber(competitorMap?.type_distribution?.tk)}, Les ${formatNumber(competitorMap?.type_distribution?.les)}, Daycare ${formatNumber(competitorMap?.type_distribution?.daycare)}` },
      ]),
      buildTableSection("Nama POI Utama", [
        { label: "Total POI", value: formatNumber(fallbackContext.poiCount != null ? fallbackContext.poiCount : latestBasePois.length) },
        { label: "POI pendukung", value: formatTextList(Array.isArray(fallbackContext.supportingPois) ? fallbackContext.supportingPois : []) },
        { label: "POI risiko", value: formatTextList(Array.isArray(fallbackContext.riskPois) ? fallbackContext.riskPois : []) },
      ]),
      buildTableSection("Market Size", [
        { label: "Market Size", value: formatCurrency(market.market_size) },
        { label: "Benchmark wilayah", value: marketFormula.region_benchmark || "-" },
        { label: "Jumlah kompetitor", value: formatNumber(marketFormula.competitor_poi_count) },
        { label: "Rata-rata SPP", value: formatCurrency(marketFormula.average_spp_benchmark ?? marketFormula.spp_monthly) },
        { label: "Sumber SPP", value: marketFormula.spp_source === "tinyfish_research" ? `📊 Web Research (${marketFormula.researched_spp?.count || 0} data)` : "📊 Benchmark regional" },
        { label: "Rata-rata kapasitas", value: marketFormula.average_capacity_benchmark != null ? `${formatNumber(marketFormula.average_capacity_benchmark)} murid` : "-" },
        { label: "Periode", value: formatNumber(marketFormula.annual_multiplier) },
      ]),
      buildTableSection("Simulasi Market Share", [
        { label: "TAM", value: formatNumber(market.tam) },
        { label: "SAM", value: formatNumber(market.sam) },
        { label: "SOM", value: formatNumber(market.som) },
        { label: "Low 1%", value: `Siswa ${formatNumber(scenarios?.low?.students)} | Revenue ${formatCurrency(scenarios?.low?.annual_revenue)}` },
        { label: "Mid 2%", value: `Siswa ${formatNumber(scenarios?.mid?.students)} | Revenue ${formatCurrency(scenarios?.mid?.annual_revenue)}` },
        { label: "High 5%", value: `Siswa ${formatNumber(scenarios?.high?.students)} | Revenue ${formatCurrency(scenarios?.high?.annual_revenue)}` },
      ]),
      buildTableSection("Basis Perhitungan", [
        { label: "Anak usia dini", value: topDistrict?.demography?.early_childhood_population != null ? formatNumber(topDistrict.demography.early_childhood_population) : "-" },
        { label: "Population", value: topDistrict?.demography?.population != null ? formatNumber(topDistrict.demography.population) : "-" },
        { label: "POI kompetitor", value: formatNumber(marketFormula.competitor_poi_count) },
        { label: "Kapasitas per POI", value: formatNumber(marketFormula.max_capacity_per_poi) },
        { label: "SPP bulanan", value: formatCurrency(marketFormula.spp_monthly) },
        { label: "Sumber SPP", value: marketFormula.spp_source === "tinyfish_research" ? `📊 Web Research (${marketFormula.researched_spp?.count || 0} data)` : "📊 Benchmark regional" },
        { label: "Benchmark wilayah", value: marketFormula.region_benchmark || "-" },
        { label: "Range SPP", value: marketFormula.spp_range_min != null && marketFormula.spp_range_max != null ? `${formatCurrency(marketFormula.spp_range_min)} - ${formatCurrency(marketFormula.spp_range_max)}` : "-" },
        { label: "Range kapasitas", value: marketFormula.capacity_range_min != null && marketFormula.capacity_range_max != null ? `${formatNumber(marketFormula.capacity_range_min)} - ${formatNumber(marketFormula.capacity_range_max)} murid` : "-" },
        { label: "Periode", value: formatNumber(marketFormula.annual_multiplier) },
      ]),
      buildTableSection("Sinyal Area", [
        { label: "Opportunity Signals", value: formatTextList(result?.opportunity_signals) },
        { label: "Risk Signals", value: formatTextList(result?.risk_signals) },
        { label: "Aksesibilitas", value: topDistrict?.accessibility?.reasoning || "-" },
        { label: "Demografi", value: topDistrict?.demography?.reasoning || "-" },
        { label: "Market Need", value: topDistrict?.market_needs?.reasoning || "-" },
        { label: "Fasilitas", value: topDistrict?.facilities?.reasoning || "-" },
        { label: "Ekonomi", value: topDistrict?.economy?.reasoning || "-" },
      ]),
      buildDemographyJsonSection(result),
    ].join(""),
  );
  renderPoiEvidencePanel(
    getTopPoiEntries(latestBasePois, "positive"),
    getTopPoiEntries(latestBasePois, "risk"),
    latestPoiMeta,
  );
}

function buildStructuredNarrativeHtml(result, fallbackContext = {}) {
  const decision = result?.decision || {};
  const market = result?.market_estimation || {};
  const unitEconomics = result?.unit_economics || {};
  const competitorMap = result?.competitor_map || {};
  const dataQuality = result?.data_quality || {};
  const topDistrict = result?.district_analysis?.[0] || {};
  const reverseGeocode = result?.location?.reverse_geocode || {};
  const locationText = [
    reverseGeocode.district || fallbackContext.districtName,
    reverseGeocode.city || fallbackContext.cityName,
    reverseGeocode.province || fallbackContext.province,
  ].filter(Boolean).join(", ");
  const demographicText = topDistrict?.demography?.early_childhood_population != null
    ? `${formatNumber(topDistrict.demography.early_childhood_population)} anak usia dini`
    : "data anak usia dini belum lengkap";
  const districtLabel = topDistrict?.district_name || fallbackContext.districtName || "area prioritas";

  return `
    <div class="narrative-block">
      <h4>Ringkasan Lokasi</h4>
      <p>${escapeHtml(`Lokasi berada di ${locationText || "wilayah target"} dengan anchor radius 3 KM. Backend analisa membaca area utama pada ${districtLabel} dan memberi keputusan ${decision.recommendation || "CONSIDER"}.`)}</p>
      <p>${escapeHtml(result?.recommendation_summary || decision.reason || "Ringkasan rekomendasi backend belum tersedia.")}</p>
    </div>
    <div class="narrative-block">
      <h4>Snapshot Inti</h4>
      <table class="narrative-table">
        <tbody>
          <tr><th>District utama</th><td>${escapeHtml(districtLabel)}</td></tr>
          <tr><th>Confidence</th><td>${escapeHtml(dataQuality.overall_confidence || "-")}</td></tr>
          <tr><th>Competitor count</th><td>${escapeHtml(formatNumber(competitorMap.count_estimate))}</td></tr>
          <tr><th>Competitor density</th><td>${escapeHtml(competitorMap.density_level || "-")}</td></tr>
          <tr><th>Nearest competitor</th><td>${escapeHtml(competitorMap.nearest_distance_km != null ? `${competitorMap.nearest_distance_km} km` : "-")}</td></tr>
          <tr><th>Early childhood</th><td>${escapeHtml(demographicText)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="narrative-block">
      <h4>Market Sizing</h4>
      <table class="narrative-table">
        <tbody>
          <tr><th>TAM</th><td>${escapeHtml(formatNumber(market.tam))}</td></tr>
          <tr><th>SAM</th><td>${escapeHtml(formatNumber(market.sam))}</td></tr>
          <tr><th>SOM</th><td>${escapeHtml(formatNumber(market.som))}</td></tr>
          <tr><th>Market size</th><td>${escapeHtml(formatCurrency(market.market_size))}</td></tr>
          <tr><th>Market share</th><td>${escapeHtml(market.market_share != null ? `${market.market_share}%` : "-")}</td></tr>
          <tr><th>Potential revenue</th><td>${escapeHtml(formatCurrency(market.potential_revenue))}</td></tr>
          <tr><th>Break even</th><td>${escapeHtml(unitEconomics.break_even_students != null ? `${formatNumber(unitEconomics.break_even_students)} siswa` : "-")}</td></tr>
        </tbody>
      </table>
      <p>${escapeHtml(market.reasoning || "Reasoning market estimation belum tersedia.")}</p>
    </div>
  `;
}

function renderStructuredAnalysis(result, fallbackContext = {}) {
  latestStructuredAnalysis = result || null;

  const aiEnrichment = result?.ai_enrichment || {};
  const decision = result?.decision?.recommendation || "-";
  const confidence = result?.data_quality?.overall_confidence || "-";
  const revenue = formatCurrency(result?.market_estimation?.potential_revenue);
  const breakEven = result?.unit_economics?.break_even_students != null
    ? `${formatNumber(result.unit_economics.break_even_students)} siswa`
    : "-";

  if (summaryCardEls[0]) summaryCardEls[0].textContent = decision;
  if (summaryCardEls[1]) summaryCardEls[1].textContent = confidence;
  if (summaryCardEls[2]) summaryCardEls[2].textContent = revenue;
  if (summaryCardEls[3]) summaryCardEls[3].textContent = breakEven;

  analysisStatusBanner.textContent = result?.recommendation_summary || result?.decision?.reason || "Analisa area berhasil dimuat.";

  const districts = Array.isArray(result?.district_analysis) ? result.district_analysis : [];
  topDistrictsEl.innerHTML = "";
  if (!districts.length) {
    const item = document.createElement("li");
    item.textContent = fallbackContext.districtName || "District analysis belum tersedia.";
    topDistrictsEl.appendChild(item);
  } else {
    districts.slice(0, 3).forEach((entry) => {
      const item = document.createElement("li");
      const score = entry?.score != null ? String(entry.score) : "-";
      const competitorDensity = entry?.market_needs?.competitor_density || entry?.market_needs?.competition_density || "-";
      item.textContent = `${entry?.district_name || "Area sekitar"} (score: ${score}, competitor: ${competitorDensity})`;
      topDistrictsEl.appendChild(item);
    });
  }

  opportunitySnapshotEl.innerHTML = buildStructuredNarrativeHtml(result, fallbackContext);
  renderAiAnalysisTables(result, fallbackContext);

  latestAiSummary = {
    suitabilityLabel: decision,
    analysis: [
      result?.recommendation_summary || result?.decision?.reason || "Analisa area terstruktur berhasil dimuat.",
      aiEnrichment?.buying_power_intel?.segment ? `Segment daya beli: ${aiEnrichment.buying_power_intel.segment}.` : "",
      aiEnrichment?.family_activity_intel?.signal_level ? `Family activity: ${aiEnrichment.family_activity_intel.signal_level}.` : "",
    ].filter(Boolean).join(" "),
    recommendation: result?.decision?.reason || result?.recommendation_summary || "Lanjutkan validasi lapangan sebelum eksekusi.",
  };

  latestDeepResearchSummary = {
    headline: result?.recommendation_summary || "",
    accessibility: topDistrictsEl.textContent || "",
    demography: result?.district_analysis?.[0]?.demography?.reasoning || "",
    marketNeed: result?.market_estimation?.reasoning || "",
    facilitiesEnvironment: result?.district_analysis?.[0]?.facilities?.reasoning || "",
    promotionPartnership: Array.isArray(result?.district_analysis?.[0]?.promotion?.community_links) ? result.district_analysis[0].promotion.community_links.join(" | ") : "",
    digitalFootprint: Array.isArray(result?.district_analysis?.[0]?.digital_footprint?.instagram) ? result.district_analysis[0].digital_footprint.instagram.join(" | ") : "",
    digitalFootprintExamples: Array.isArray(result?.district_analysis?.[0]?.promotion?.child_events) ? result.district_analysis[0].promotion.child_events : [],
    digitalFootprintReferences: Array.isArray(result?.ai_enrichment?.family_activity_intel?.source_links) ? result.ai_enrichment.family_activity_intel.source_links.map((url) => ({ title: url, url })) : [],
    sourceDetails: Array.isArray(result?.competitor_research?.sources) ? result.competitor_research.sources : [],
    marketSizeShare: result?.market_estimation?.reasoning || "",
    implication: result?.decision?.reason || "",
    sourcesUsed: [
      ...(Array.isArray(result?.ai_enrichment?.buying_power_intel?.source_links) ? result.ai_enrichment.buying_power_intel.source_links : []),
      ...(Array.isArray(result?.ai_enrichment?.family_activity_intel?.source_links) ? result.ai_enrichment.family_activity_intel.source_links : []),
    ].slice(0, 8),
  };

  summaryBox.innerHTML = `
    <span class="${getSuitabilityClass(decision)}">${escapeHtml(decision)}</span>
    <div>${escapeHtml(latestAiSummary.analysis)}</div>
    <p><strong>Rekomendasi:</strong> ${escapeHtml(latestAiSummary.recommendation)}</p>
  `;
}

function getSuitabilityClass(label) {
  if (["Sangat cocok", "GO", "STRONG GO"].includes(label)) {
    return "tag-positive";
  }
  if (["Kurang cocok", "NO GO", "WEAK GO"].includes(label)) {
    return "tag-risk";
  }
  return "tag-neutral";
}

function renderSummary(aiResult) {
  latestAiSummary = {
    suitabilityLabel: aiResult.suitabilityLabel || "",
    analysis: aiResult.analysis || "",
    recommendation: aiResult.recommendation || "",
  };
  if (summaryCardEls[0]) summaryCardEls[0].textContent = aiResult.suitabilityLabel || "-";
  if (summaryCardEls[1]) summaryCardEls[1].textContent = "Fallback";
  if (summaryCardEls[2]) summaryCardEls[2].textContent = "-";
  if (summaryCardEls[3]) summaryCardEls[3].textContent = "-";
  analysisStatusBanner.textContent = aiResult.analysis || "Analisa area fallback berhasil dimuat.";
  topDistrictsEl.innerHTML = "<li>Mode fallback aktif. District ranking terstruktur tidak tersedia.</li>";
  opportunitySnapshotEl.innerHTML = `
    <div class="narrative-block">
      <h4>Ringkasan Fallback</h4>
      <p>${escapeHtml(aiResult.analysis || "Analisa area fallback tidak tersedia.")}</p>
      <p>${escapeHtml(aiResult.recommendation || "Rekomendasi fallback tidak tersedia.")}</p>
    </div>
  `;
  summaryBox.innerHTML = `
    <span class="${getSuitabilityClass(aiResult.suitabilityLabel)}">${escapeHtml(aiResult.suitabilityLabel)}</span>
    <div>${escapeHtml(aiResult.analysis)}</div>
    <p><strong>Rekomendasi:</strong> ${escapeHtml(aiResult.recommendation)}</p>
  `;
  renderPoiEvidencePanel(
    getTopPoiEntries(latestBasePois, "positive"),
    getTopPoiEntries(latestBasePois, "risk"),
    latestPoiMeta,
  );
}

function renderDeepResearchLegacy(result) {
  latestDeepResearchSummary = {
    headline: result.headline || "",
    accessibility: result.accessibility || "",
    demography: result.demography || "",
    marketNeed: result.marketNeed || "",
    facilitiesEnvironment: result.facilitiesEnvironment || "",
    promotionPartnership: result.promotionPartnership || "",
    digitalFootprint: result.digitalFootprint || "",
    digitalFootprintExamples: Array.isArray(result.digitalFootprintExamples) ? result.digitalFootprintExamples : [],
    digitalFootprintReferences: Array.isArray(result.digitalFootprintReferences) ? result.digitalFootprintReferences : [],
    marketSizeShare: result.marketSizeShare || "",
    implication: result.implication || "",
    sourcesUsed: Array.isArray(result.sourcesUsed) ? result.sourcesUsed : [],
  };
  const exampleList = (result.digitalFootprintExamples || []).length
    ? `<ul class="poi-list">${result.digitalFootprintExamples.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>Contoh kegiatan digital belum tersedia.</p>";
  const referenceLinks = (result.digitalFootprintReferences || []).length
    ? `<div class="research-links">${result.digitalFootprintReferences.map((item) => `
      <div class="research-link-card">
        <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.url)}</a>
        <div class="research-link-meta">${escapeHtml([item.areaLabel, item.source].filter(Boolean).join(" • ") || "Referensi kegiatan")}</div>
        <div class="research-link-meta">${escapeHtml(item.query || "")}</div>
      </div>
    `).join("")}</div>`
    : "<p>Link referensi kegiatan belum tersedia.</p>";
  deepResearchBox.innerHTML = `
    <span class="tag-neutral">Deep research independen</span>
    <p><strong>${escapeHtml(result.headline)}</strong></p>
    <p><strong>Aksesibilitas:</strong> ${escapeHtml(result.accessibility)}</p>
    <p><strong>Demografi:</strong> ${escapeHtml(result.demography)}</p>
    <p><strong>Kebutuhan pasar:</strong> ${escapeHtml(result.marketNeed)}</p>
    <p><strong>Fasilitas & lingkungan:</strong> ${escapeHtml(result.facilitiesEnvironment)}</p>
    <p><strong>Promosi & kerjasama:</strong> ${escapeHtml(result.promotionPartnership)}</p>
    <p><strong>Digital footprint:</strong> ${escapeHtml(result.digitalFootprint)}</p>
    <p><strong>Contoh referensi kegiatan:</strong></p>
    ${exampleList}
    <p><strong>Link referensi kegiatan:</strong></p>
    ${referenceLinks}
    <p><strong>Market size & share:</strong> ${escapeHtml(result.marketSizeShare || "Belum tersedia")}</p>
    <p><strong>Implikasi:</strong> ${escapeHtml(result.implication)}</p>
    <p><strong>Sumber inti:</strong> ${escapeHtml((result.sourcesUsed || []).join(" | ") || "Mengacu pada sumber resmi yang ditemukan backend.")}</p>
  `;
}

function extractLocationContext(address = {}) {
  return {
    road: address.road || address.pedestrian || "",
    village: address.village || address.hamlet || address.neighbourhood || "",
    subdistrict: address.suburb || address.quarter || address.city_district || "",
    district: address.county || address.state_district || "",
    city: address.city || address.town || address.municipality || address.county || "",
    province: address.state || "",
  };
}

function renderDeepResearch(result) {
  latestDeepResearchSummary = {
    headline: result.headline || "",
    accessibility: result.accessibility || "",
    demography: result.demography || "",
    marketNeed: result.marketNeed || "",
    facilitiesEnvironment: result.facilitiesEnvironment || "",
    promotionPartnership: result.promotionPartnership || "",
    digitalFootprint: result.digitalFootprint || "",
    digitalFootprintExamples: Array.isArray(result.digitalFootprintExamples) ? result.digitalFootprintExamples : [],
    digitalFootprintReferences: Array.isArray(result.digitalFootprintReferences) ? result.digitalFootprintReferences : [],
    sourceDetails: Array.isArray(result.sourceDetails) ? result.sourceDetails : [],
    marketSizeShare: result.marketSizeShare || "",
    implication: result.implication || "",
    sourcesUsed: Array.isArray(result.sourcesUsed) ? result.sourcesUsed : [],
  };

  const exampleList = latestDeepResearchSummary.digitalFootprintExamples.length
    ? `<ul class="poi-list">${latestDeepResearchSummary.digitalFootprintExamples.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>Contoh kegiatan digital belum tersedia.</p>";

  const referenceLinks = latestDeepResearchSummary.digitalFootprintReferences.length
    ? `<div class="research-links">${latestDeepResearchSummary.digitalFootprintReferences.map((item) => `
      <div class="research-link-card">
        <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.label || item.url)}</a>
        <div class="research-link-meta">${escapeHtml([item.areaLabel, item.source].filter(Boolean).join(" | ") || "Referensi kegiatan")}</div>
        <div class="research-link-meta">${escapeHtml(item.query || "")}</div>
      </div>
    `).join("")}</div>`
    : "<p>Link referensi kegiatan belum tersedia.</p>";

  const allReferenceLinks = latestDeepResearchSummary.sourceDetails.length
    ? `<div class="research-links">${latestDeepResearchSummary.sourceDetails.map((item) => `
      <div class="research-link-card">
        <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.url)}</a>
        <div class="research-link-meta">${escapeHtml([item.category, item.source].filter(Boolean).join(" | ") || "Referensi riset")}</div>
        <div class="research-link-meta">${escapeHtml(item.areaLabel || item.poiName || "")}</div>
        <div class="research-link-meta">${escapeHtml(item.query || item.snippet || "")}</div>
      </div>
    `).join("")}</div>`
    : "<p>Link referensi riset lengkap belum tersedia.</p>";

  deepResearchBox.innerHTML = `
    <span class="tag-neutral">Deep research independen</span>
    <p><strong>${escapeHtml(latestDeepResearchSummary.headline)}</strong></p>
    <p><strong>Aksesibilitas:</strong> ${escapeHtml(latestDeepResearchSummary.accessibility)}</p>
    <p><strong>Demografi:</strong> ${escapeHtml(latestDeepResearchSummary.demography)}</p>
    <p><strong>Kebutuhan pasar:</strong> ${escapeHtml(latestDeepResearchSummary.marketNeed)}</p>
    <p><strong>Fasilitas & lingkungan:</strong> ${escapeHtml(latestDeepResearchSummary.facilitiesEnvironment)}</p>
    <p><strong>Promosi & kerjasama:</strong> ${escapeHtml(latestDeepResearchSummary.promotionPartnership)}</p>
    <p><strong>Digital footprint:</strong> ${escapeHtml(latestDeepResearchSummary.digitalFootprint)}</p>
    <p><strong>Contoh referensi kegiatan:</strong></p>
    ${exampleList}
    <p><strong>Link referensi kegiatan:</strong></p>
    ${referenceLinks}
    <p><strong>Semua link referensi riset:</strong></p>
    ${allReferenceLinks}
    <p><strong>Market size & share:</strong> ${escapeHtml(latestDeepResearchSummary.marketSizeShare || "Belum tersedia")}</p>
    <p><strong>Implikasi:</strong> ${escapeHtml(latestDeepResearchSummary.implication)}</p>
    <p><strong>Sumber inti:</strong> ${escapeHtml((latestDeepResearchSummary.sourcesUsed || []).join(" | ") || "Mengacu pada sumber resmi yang ditemukan backend.")}</p>
  `;

  if (latestStructuredAnalysis && opportunitySnapshotEl) {
    opportunitySnapshotEl.innerHTML += `
      <div class="narrative-block">
        <h4>Deep Research Layer</h4>
        <p>${escapeHtml(latestDeepResearchSummary.headline || "Deep research aktif.")}</p>
        <p><strong>Market size & share:</strong> ${escapeHtml(latestDeepResearchSummary.marketSizeShare || "Belum tersedia.")}</p>
        <p><strong>Implikasi:</strong> ${escapeHtml(latestDeepResearchSummary.implication || "Belum tersedia.")}</p>
      </div>
    `;
  }
}

function parseCoordinates(rawValue) {
  const normalized = String(rawValue || "").trim();
  const match = normalized.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    throw new Error("Format koordinat harus seperti Google Maps: latitude, longitude");
  }

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Nilai koordinat tidak valid.");
  }

  return { lat, lon };
}

function slugifyArea(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildWebsiteShortlist(locationContext = {}, areaCoverage = []) {
  const areas = Array.isArray(areaCoverage) && areaCoverage.length
    ? areaCoverage
    : [locationContext];
  const rows = [];
  const seen = new Set();

  areas.forEach((area) => {
    const province = slugifyArea(area.province || locationContext.province || "");
    const city = slugifyArea(area.city || locationContext.city || "");
    const districtName = area.subdistrict || area.district || locationContext.subdistrict || locationContext.district || "-";
    const district = slugifyArea(districtName);
    const cityTitle = area.city || locationContext.city || "-";

    [
      { site: "Pinhome", url: `https://www.pinhome.id/sewa/${province}/${city}/${district}` },
      { site: "Mitula", url: `https://rumah.mitula.co.id/rumah/disewakan-ruko-${city}-${district}` },
      { site: "99.co", url: `https://www.99.co/id/sewa/ruko/${city}/${district}` },
      { site: "Brighton", url: `https://www.brighton.co.id/disewa/ruko/${city}/${district}` },
      { site: "Facebook Marketplace", url: `https://web.facebook.com/marketplace/${city}/search/?query=sewa%20ruko%20${district}&exact=true` },
      { site: "Rumah123", url: `https://www.rumah123.com/sewa/${city}/${district}/ruko/` },
    ].forEach((item) => {
      const key = `${item.site}|${districtName}|${cityTitle}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({
          site: item.site,
          url: item.url,
          area: districtName,
          city: cityTitle,
        });
      }
    });
  });

  return rows;
}

function renderResults(shortlist) {
  latestShortlist = Array.isArray(shortlist) ? shortlist : [];
  currentResultsPage = 1;
  shortlistReady = latestShortlist.length > 0;
  syncShortlistNotification();
  renderResultsPage();
}

function renderResultsPage(page = currentResultsPage) {
  if (!resultsBody) {
    return;
  }

  if (!latestShortlist.length) {
    resultsBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty-row">Belum ada rekomendasi ruko yang bisa ditampilkan untuk area ini.</td>
      </tr>
    `;
    if (resultsPaginationEl) {
      resultsPaginationEl.classList.add("hidden");
    }
    if (resultsPaginationInfoEl) {
      resultsPaginationInfoEl.textContent = "0 dari 0";
    }
    return;
  }

  const totalPages = Math.max(1, Math.ceil(latestShortlist.length / RESULTS_PER_PAGE));
  currentResultsPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentResultsPage - 1) * RESULTS_PER_PAGE;
  const pageItems = latestShortlist.slice(startIndex, startIndex + RESULTS_PER_PAGE);

  resultsBody.innerHTML = pageItems.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.area)}</strong></td>
      <td>${escapeHtml(item.city)}</td>
      <td><a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.site)}</a></td>
    </tr>
  `).join("");

  if (resultsPaginationEl) {
    resultsPaginationEl.classList.toggle("hidden", totalPages <= 1);
  }
  if (resultsPaginationInfoEl) {
    const rangeStart = startIndex + 1;
    const rangeEnd = Math.min(startIndex + RESULTS_PER_PAGE, latestShortlist.length);
    resultsPaginationInfoEl.textContent = `Halaman ${currentResultsPage} dari ${totalPages} | ${rangeStart}-${rangeEnd} dari ${latestShortlist.length}`;
  }
  if (resultsPrevBtn) {
    resultsPrevBtn.disabled = currentResultsPage <= 1;
  }
  if (resultsNextBtn) {
    resultsNextBtn.disabled = currentResultsPage >= totalPages;
  }
}

function renderPoiBreakdownTable(targetBody, pois = [], category) {
  if (!targetBody) {
    return;
  }

  const rows = pois.filter((poi) => poi.category === category);
  if (!rows.length) {
    targetBody.innerHTML = '<tr><td colspan="2" class="empty-row">Belum ada data.</td></tr>';
    return;
  }

  const grouped = new Map();
  rows.forEach((poi) => {
    const area = poi.tags?.search_area_subdistrict || poi.tags?.search_area_city || "tanpa area";
    grouped.set(area, (grouped.get(area) || 0) + 1);
  });

  const entries = Array.from(grouped.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([area, count]) => `
      <tr>
        <td>${escapeHtml(area)}</td>
        <td>${escapeHtml(String(count))}</td>
      </tr>
    `);

  const total = rows.length;
  targetBody.innerHTML = [
    `<tr><td><strong>Total</strong></td><td><strong>${escapeHtml(String(total))}</strong></td></tr>`,
    ...entries,
  ].join("");
}

function renderPoiBreakdowns(pois = []) {
  renderPoiBreakdownTable(residentialBreakdownBody, pois, "residential");
  renderPoiBreakdownTable(educationBreakdownBody, pois, "education");
  renderPoiBreakdownTable(affiliateBreakdownBody, pois, "family-services");
}

function buildAnalysisContext({ lat, lon, effectiveRadius, streetName, locationContext, areaCoverage, pois, externalResearch, reverseGeocodeResult = null, demographyPayload = null }) {
  const districtName = locationContext.subdistrict || locationContext.district || "Kecamatan tidak ditemukan";
  const cityName = locationContext.city || "Kota tidak ditemukan";
  const blueCompetitorPois = pois.filter((poi) => poi.category === "education");
  const competitorCountFromTable = blueCompetitorPois.length;

  return {
    lat,
    lon,
    radius: effectiveRadius,
    streetName,
    locationContext,
    areaCoverage,
    reverseGeocodeResult,
    demographyPayload,
    poiSources: [...new Set(pois.map((poi) => getPoiSourceLabel(poi.source)))],
    externalResearchSummary: externalResearch?.summary || "",
    externalResearchHighlights: externalResearch?.metricHighlights || [],
    externalResearch: externalResearch || {},
    competitorBlueCount: competitorCountFromTable,
    competitorCountFromTable,
    crawledPois: pois.map((poi) => ({
      name: poi.name,
      lat: poi.lat,
      lon: poi.lon,
      category: poi.category,
      categoryLabel: poi.categoryLabel,
      source: poi.source,
      tags: poi.tags || {},
    })),
    poiEvidence: pois
      .sort((left, right) => {
        if (left.source === right.source) {
          return 0;
        }
        return left.source === "google-maps-crawl" ? -1 : 1;
      })
      .slice(0, 60)
      .map((poi) => ({
        name: poi.name,
        categoryLabel: poi.categoryLabel,
        source: poi.source,
        tags: poi.tags || {},
      })),
    businessType: "Bimba Smartkidz - pendidikan anak usia dini",
    targetCustomer: "Orang tua anak usia 2-7 tahun kelas menengah di area urban/suburban Indonesia",
    analysisMode: "balanced",
    extraNotes: [
      `Fokuskan analisa pada kecocokan pembukaan cabang pendidikan anak usia dini di ${districtName}, ${cityName}.`,
      "Koordinat utama wajib memakai input awal dari Smartkidz Ruko Finder.",
      "Jumlah POI kompetitor wajib memakai hasil crawling Smartkidz Ruko Finder sebagai sumber utama perhitungan.",
      "Jika data lain kurang lengkap, jujur pada confidence dan gunakan reasoning yang konservatif.",
    ].join(" "),
  };
}

async function runAiAnalysis() {
  if (!latestAnalysisContext || !latestAnalysisFallbackContext) {
    setStatus("Jalankan analisa lokasi terlebih dulu sebelum analisa area.", true);
    return;
  }

  const controller = new AbortController();
  activeController = controller;
  isProcessing = true;
  syncActionButtons();
  setLoadingState(true, { map: false, analysis: true, table: false });
  renderLocalAreaAnalysis({
    streetName: latestAnalysisFallbackContext?.streetName || "",
    districtName: latestAnalysisFallbackContext?.districtName || "",
    cityName: latestAnalysisFallbackContext?.cityName || "",
    areaCoverage: latestAnalysisContext?.areaCoverage || [],
    pois: latestBasePois,
    research: latestAnalysisContext?.externalResearch || {},
  });
  analysisStatusBanner.textContent = "Analisa area sedang berjalan dengan data hasil crawl Google Maps dan JSON Dukcapil ArcGIS.";
  setStatus("Mengirim data crawl Google Maps dan Dukcapil ke backend analisa area...");
  appendActivityLog("Analisa area terstruktur sedang dijalankan dari hasil crawl Google Maps dan layer Dukcapil.");

  try {
    const result = await getStructuredAiAnalysis(latestAnalysisContext, controller.signal);
    renderStructuredAnalysis(result, latestAnalysisFallbackContext);
    setStatus("Analisa area selesai. Hasil tabel sudah ditampilkan.");
    appendActivityLog("Analisa area terstruktur selesai diproses dan tabel hasil berhasil ditampilkan.", "success");
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("Analisa area dibatalkan oleh pengguna.", true);
      appendActivityLog("Analisa area dibatalkan oleh pengguna.", "error");
      return;
    }
    renderLocalAreaAnalysis({
      streetName: latestAnalysisFallbackContext?.streetName || "",
      districtName: latestAnalysisFallbackContext?.districtName || "",
      cityName: latestAnalysisFallbackContext?.cityName || "",
      areaCoverage: latestAnalysisContext?.areaCoverage || [],
      pois: latestBasePois,
      research: latestAnalysisContext?.externalResearch || {},
    });    setStatus("Analisa area gagal dipanggil.", true);
    appendActivityLog(error.message || "Analisa area gagal diproses.", "error");
  } finally {
    activeController = null;
    isProcessing = false;
    syncActionButtons();
    setLoadingState(false);
  }
}

function buildDetailedTtamSamSomEstimate(structuredResult, aiResult) {
  // Build detailed TAM/SAM/SOM from structured analysis + Dukcapil data
  const structured = structuredResult || latestStructuredAnalysis || {};
  const market = structured.market_estimation || {};
  const formula = market.market_size_formula || {};
  const scenarios = market.market_size_scenarios || {};
  const topDistrict = structured?.district_analysis?.[0] || {};
  const demography = topDistrict?.demography || {};
  const competitorMap = structured?.competitor_map || {};
  const supplyBased = market.supply_based || {};
  const unitEconomics = structured.unit_economics || {};

  // Core numbers
  const population = demography.population || 0;
  const age014 = demography.age_0_14 || 0;
  const earlyChildhood = demography.early_childhood_population || 0;
  const competitorCount = formula.competitor_poi_count || 0;
  const sppMonthly = formula.spp_monthly || 0;
  const capacityPerPoi = formula.average_capacity_benchmark || 40;
  const tam = market.tam || 0;
  const sam = market.sam || 0;
  const som = market.som || 0;
  const marketSize = market.market_size || 0;
  const marketGap = market.market_gap || 0;
  const reasoning = market.reasoning || '';

  const samFactor = formula.sam_factor || 0.35;
  const priceSegment = formula.pricing_segment || 'kelas menengah';
  const regionBenchmark = formula.region_benchmark || '-';

  let html = '';

  // TAM/SAM/SOM Cards
  html += `<div class="pp-section" style="border-left:4px solid #1d4ed8;">`;
  html += `<h4>📊 Estimasi Market (TAM / SAM / SOM) — Detail</h4>`;
  html += `<div class="pp-metrics-grid" style="grid-template-columns:repeat(4,1fr);">`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #1d4ed8;"><div class="metric-label">TAM</div><div class="metric-value" style="color:#1d4ed8;font-size:1.1rem;">${formatNumber(tam)}</div><div class="metric-sublabel">Total target usia 2-7 th</div></div>`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #2563eb;"><div class="metric-label">SAM</div><div class="metric-value" style="color:#2563eb;font-size:1.1rem;">${formatNumber(sam)}</div><div class="metric-sublabel">Target ${priceSegment}</div></div>`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #3b82f6;"><div class="metric-label">SOM</div><div class="metric-value" style="color:#3b82f6;font-size:1.1rem;">${formatNumber(som)}</div><div class="metric-sublabel">3 tahun pertama</div></div>`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #0f766e;"><div class="metric-label">Market Size</div><div class="metric-value" style="color:#0f766e;font-size:1.1rem;">${formatCurrency(marketSize)}</div><div class="metric-sublabel">Revenue existing market</div></div>`;
  html += `</div>`;

  // Detailed calculation breakdown
  html += `<div style="margin-top:14px;padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">`;
  html += `<h5 style="margin:0 0 10px;font-size:13px;color:#334155;">📐 Rincian Perhitungan TAM/SAM/SOM</h5>`;
  html += `<table class="narrative-table narrative-table-compact" style="margin:0;">`;
  html += `<tr><th colspan="2" style="background:#eff6ff;color:#1d4ed8;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Basis Data Dukcapil</th></tr>`;
  html += `<tr><th>Populasi area</th><td>${formatNumber(population)} jiwa</td></tr>`;
  html += `<tr><th>Usia 0-14 tahun</th><td>${formatNumber(age014)} (${population > 0 ? ((age014 / population) * 100).toFixed(1) : 0}%)</td></tr>`;
  html += `<tr><th>Estimasi usia 2-7 tahun (= TAM)</th><td><strong>${formatNumber(tam)} siswa</strong></td></tr>`;
  if (demography.reasoning) {
    html += `<tr><th>Metodologi TAM</th><td style="font-size:11px;color:#64748b;">${escapeHtml(demography.reasoning)}</td></tr>`;
  }
  html += `<tr><th colspan="2" style="background:#f0fdf4;color:#166534;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">SAM (Serviceable Addressable Market)</th></tr>`;
  html += `<tr><th>SAM factor</th><td>${(samFactor * 100).toFixed(0)}% dari TAM</td></tr>`;
  html += `<tr><th>Segment pricing</th><td>${escapeHtml(priceSegment)}</td></tr>`;
  html += `<tr><th>SAM (= TAM × factor)</th><td><strong>${formatNumber(sam)} siswa</strong></td></tr>`;
  html += `<tr><th colspan="2" style="background:#eff6ff;color:#1d4ed8;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">SOM (Serviceable Obtainable Market)</th></tr>`;
  html += `<tr><th>SOM target 3 tahun</th><td><strong>${formatNumber(som)} siswa</strong></td></tr>`;
  if (market.share_capture_rate != null) {
    html += `<tr><th>Share capture rate</th><td>${(market.share_capture_rate * 100).toFixed(1)}%</td></tr>`;
  }
  html += `<tr><th colspan="2" style="background:#fef2f2;color:#991b1b;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Market Size (Revenue)</th></tr>`;
  html += `<tr><th>SPP bulanan</th><td>${formatCurrency(sppMonthly)}</td></tr>`;
  html += `<tr><th>Kapasitas per POI</th><td>${formatNumber(capacityPerPoi)} murid</td></tr>`;
  html += `<tr><th>Kompetitor aktif</th><td>${formatNumber(competitorCount)} (${competitorMap?.density_level || '-'})</td></tr>`;
  html += `<tr><th>Market Size formula</th><td>Kompetitor × SPP × Kapasitas × 12 bulan = <strong>${formatCurrency(marketSize)}</strong></td></tr>`;
  if (marketGap !== 0) {
    html += `<tr><th>Market Gap</th><td><strong style="color:${marketGap > 0 ? '#16a34a' : '#dc2626'};">${marketGap > 0 ? '+' + formatNumber(marketGap) + ' siswa (peluang)' : formatNumber(marketGap) + ' siswa (over supply)'}</strong></td></tr>`;
  }
  html += `</table></div>`;

  // Simulasi Revenue per Skenario
  html += `<div style="margin-top:14px;padding:14px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;">`;
  html += `<h5 style="margin:0 0 10px;font-size:13px;color:#334155;">💰 Simulasi Revenue per Skenario Market Share</h5>`;
  html += `<div class="pp-metrics-grid" style="grid-template-columns:repeat(3,1fr);">`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #94a3b8;"><div class="metric-label">Low (1% penetrasi)</div><div class="metric-value">${formatNumber(scenarios?.low?.students || 0)} siswa</div><div class="metric-sublabel">${formatCurrency(scenarios?.low?.annual_revenue || 0)}/thn</div></div>`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #2563eb;"><div class="metric-label">Mid (2% penetrasi)</div><div class="metric-value">${formatNumber(scenarios?.mid?.students || 0)} siswa</div><div class="metric-sublabel">${formatCurrency(scenarios?.mid?.annual_revenue || 0)}/thn</div></div>`;
  html += `<div class="pp-metric-card" style="border-left:4px solid #0f766e;"><div class="metric-label">High (5% penetrasi)</div><div class="metric-value">${formatNumber(scenarios?.high?.students || 0)} siswa</div><div class="metric-sublabel">${formatCurrency(scenarios?.high?.annual_revenue || 0)}/thn</div></div>`;
  html += `</div>`;

  html += `<table class="narrative-table narrative-table-compact" style="margin-top:12px;">`;
  html += `<tr><th>Revenue target (Mid)</th><td>${formatCurrency(scenarios?.mid?.annual_revenue || 0)}/tahun</td></tr>`;
  html += `<tr><th>Break-even siswa</th><td>${unitEconomics.break_even_students ? formatNumber(unitEconomics.break_even_students) + ' siswa' : '-'}</td></tr>`;
  if (unitEconomics.estimated_cost_monthly) {
    html += `<tr><th>Biaya operasional/bulan</th><td>${formatCurrency(unitEconomics.estimated_cost_monthly)}</td></tr>`;
  }
  if (unitEconomics.margin_estimate != null) {
    html += `<tr><th>Estimasi margin</th><td>${unitEconomics.margin_estimate}%</td></tr>`;
  }
  html += `</table></div>`;

  // Methodology reasoning
  if (reasoning) {
    html += `<div style="margin-top:12px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#475569;">`;
    html += `<strong style="color:#334155;">📝 Catatan Metodologi:</strong> ${escapeHtml(reasoning)}`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function renderAiAreaAnalysis(result) {
  if (!aiAreaResultsEl) return;

  // Merge with structured data for fallback enrichment
  const structured = latestStructuredAnalysis || {};
  const structMarket = structured.market_estimation || {};
  const structFormula = structMarket.market_size_formula || {};
  const structTopDistrict = structured?.district_analysis?.[0] || {};
  const structDemo = structTopDistrict?.demography || {};
  const structComp = structured?.competitor_map || {};
  const structFacilities = structTopDistrict?.facilities || {};
  const structAccessibility = structTopDistrict?.accessibility || {};
  const structEconomy = structTopDistrict?.economy || {};
  const structMarketNeeds = structTopDistrict?.market_needs || {};
  const structDecision = structured?.decision || {};
  const structEnrichment = structured?.ai_enrichment || {};

  const headline = result.headline || structDecision.reason || "Analisa AI Area Intelligence";
  const executiveSummary = result.executive_summary || structDecision.recommendation || structDecision.reason || "-";
  const demo = result.demographic_insight || {};
  const comp = result.competition_landscape || {};
  const market = result.market_opportunity || {};
  const locationQuality = result.location_quality || {};
  const risk = result.risk_assessment || {};
  const rec = result.recommendation || {};
  const keyMetrics = result.key_metrics || {};
  const deepResearch = result.deep_research || null;
  const meta = result.meta || {};

  // Merge AI result with structured fallback data
  const mergedDemo = {
    population_summary: demo.population_summary || (structDemo.population ? `${formatNumber(structDemo.population)} jiwa di ${structTopDistrict.district_name || 'area'}` : ''),
    target_market_size: demo.target_market_size || (structDemo.early_childhood_population ? `${formatNumber(structDemo.early_childhood_population)} anak usia 2-7 tahun` : ''),
    growth_signal: demo.growth_signal || (structDemo.reasoning || ''),
  };

  const mergedComp = {
    competitor_count: comp.competitor_count || (structComp.count_estimate ? `${formatNumber(structComp.count_estimate)} kompetitor` : ''),
    density_assessment: comp.density_assessment || (structComp.density_level || ''),
    competitive_advantage: comp.competitive_advantage || structMarketNeeds.reasoning || '',
  };

  const mergedMarket = {
    tam_sam_som_analysis: market.tam_sam_som_analysis || (structMarket.tam ? `TAM ${formatNumber(structMarket.tam)} | SAM ${formatNumber(structMarket.sam)} | SOM ${formatNumber(structMarket.som)} siswa` : ''),
    revenue_potential: market.revenue_potential || (structMarket.potential_revenue ? `Revenue potensial: ${formatCurrency(structMarket.potential_revenue)}/tahun` : ''),
    market_gap: market.market_gap || (structMarket.market_gap > 0 ? `Market gap: ${formatNumber(structMarket.market_gap)} siswa (peluang)` : structMarket.market_gap < 0 ? `Over supply: ${Math.abs(structMarket.market_gap)} siswa` : ''),
  };

  const mergedLocationQuality = {
    accessibility_score: locationQuality.accessibility_score || (structAccessibility.reasoning || structAccessibility.accessibility_score || ''),
    family_facilities: locationQuality.family_facilities || (structFacilities.total_family_facilities ? `${formatNumber(structFacilities.total_family_facilities)} fasilitas keluarga` : ''),
    visibility_potential: locationQuality.visibility_potential || structFacilities.reasoning || '',
  };

  const mergedRisk = {
    main_risks: risk.main_risks || structured?.risk_signals || [],
    mitigation: risk.mitigation || [],
  };

  const mergedRec = {
    verdict: rec.verdict || structDecision.recommendation || 'CONSIDER',
    confidence: rec.confidence || structDecision.confidence || structDecision.data_quality_confidence || 'medium',
    action_items: rec.action_items || [],
    timeline: rec.timeline || '',
  };

  const mergedKeyMetrics = {
    market_size: keyMetrics.market_size || (structMarket.market_size ? formatCurrency(structMarket.market_size) : ''),
    break_even_students: keyMetrics.break_even_students || (structured?.unit_economics?.break_even_students ? `${formatNumber(structured.unit_economics.break_even_students)} siswa` : ''),
    monthly_revenue_target: keyMetrics.monthly_revenue_target || (scenarios?.mid?.annual_revenue ? formatCurrency(scenarios?.mid?.annual_revenue / 12) + '/bulan' : ''),
    roi_estimate: keyMetrics.roi_estimate || '',
  };
  const scenarios = structMarket.market_size_scenarios || {};

  const verdictClass = mergedRec.verdict === "GO" || mergedRec.verdict === "STRONG GO" ? "verdict-go" : mergedRec.verdict === "NO GO" ? "verdict-nogo" : "verdict-consider";
  const confidenceBadge = mergedRec.confidence === "high" ? "pill-accent" : mergedRec.confidence === "medium" ? "pill-muted" : "pill-muted";

  const modelBadge = meta.has_deep_research
    ? `<span class="pill pill-accent">AI Deep Research</span>`
    : `<span class="pill pill-muted">Local Analysis</span>`;

  let html = `
    <div class="ai-area-section">
      <h4>Headline ${modelBadge}</h4>
      <p style="font-size:1.05rem;font-weight:600;color:#0b5c55;margin:0;">${escapeHtml(headline)}</p>
    </div>
    <div class="ai-area-section">
      <h4>Executive Summary</h4>
      <p style="margin:0;">${escapeHtml(executiveSummary)}</p>
    </div>
  `;

  // Demographic Insight - enriched from structured data
  html += `
    <div class="ai-area-section">
      <h4>👶 Demographic Insight</h4>
      ${mergedDemo.population_summary ? `<p><strong>Populasi:</strong> ${escapeHtml(mergedDemo.population_summary)}</p>` : '<p style="color:#94a3b8;font-style:italic;">Data demografi belum tersedia.</p>'}
      ${mergedDemo.target_market_size ? `<p><strong>Target Market (usia 2-7):</strong> ${escapeHtml(mergedDemo.target_market_size)}</p>` : ''}
      ${mergedDemo.growth_signal ? `<p><strong>Analisa Demografi:</strong> ${escapeHtml(mergedDemo.growth_signal)}</p>` : ''}
    </div>
  `;

  // Competition Landscape - enriched
  html += `
    <div class="ai-area-section">
      <h4>🏢 Competition Landscape</h4>
      ${mergedComp.competitor_count ? `<p><strong>Jumlah Kompetitor:</strong> ${escapeHtml(mergedComp.competitor_count)}</p>` : '<p style="color:#94a3b8;font-style:italic;">Data kompetitor belum tersedia.</p>'}
      ${mergedComp.density_assessment ? `<p><strong>Penilaian Kepadatan:</strong> ${escapeHtml(mergedComp.density_assessment)}</p>` : ''}
      ${mergedComp.competitive_advantage ? `<p><strong>Kebutuhan Pasar:</strong> ${escapeHtml(mergedComp.competitive_advantage)}</p>` : ''}
      ${structComp?.type_distribution ? `<p><strong>Distribusi:</strong> Bimba ${formatNumber(structComp.type_distribution.bimba)}, PAUD ${formatNumber(structComp.type_distribution.paud)}, TK ${formatNumber(structComp.type_distribution.tk)}, Les ${formatNumber(structComp.type_distribution.les)}, Daycare ${formatNumber(structComp.type_distribution.daycare)}</p>` : ''}
    </div>
  `;

  // Market Opportunity with detailed TAM/SAM/SOM
  html += buildDetailedTtamSamSomEstimate(structured, result);

  // Location Quality - enriched
  html += `
    <div class="ai-area-section">
      <h4>📍 Location Quality</h4>
      ${mergedLocationQuality.accessibility_score ? `<p><strong>Aksesibilitas:</strong> ${escapeHtml(mergedLocationQuality.accessibility_score)}</p>` : '<p style="color:#94a3b8;font-style:italic;">Penilaian kualitas lokasi belum tersedia.</p>'}
      ${mergedLocationQuality.family_facilities ? `<p><strong>Fasilitas Keluarga:</strong> ${escapeHtml(mergedLocationQuality.family_facilities)}</p>` : ''}
      ${mergedLocationQuality.visibility_potential ? `<p><strong>Visibilitas Ruko:</strong> ${escapeHtml(mergedLocationQuality.visibility_potential)}</p>` : ''}
      ${structEconomy.reasoning ? `<p><strong>Ekonomi:</strong> ${escapeHtml(structEconomy.reasoning)}</p>` : ''}
    </div>
  `;

  // Risk Assessment - enriched
  html += `
    <div class="ai-area-section">
      <h4>⚠️ Risk Assessment</h4>
      ${mergedRisk.main_risks?.length ? `<p><strong>Risiko Utama:</strong></p><ul>${mergedRisk.main_risks.map(r => `<li>${escapeHtml(typeof r === 'string' ? r : r.text || r.reason || JSON.stringify(r))}</li>`).join("")}</ul>` : (structured?.risk_signals?.length ? `<p><strong>Risiko Utama:</strong></p><ul>${structured.risk_signals.map(r => `<li>${escapeHtml(typeof r === 'string' ? r : String(r))}</li>`).join("")}</ul>` : '<p style="color:#94a3b8;font-style:italic;">Penilaian risiko belum tersedia.</p>')}      ${mergedRisk.mitigation?.length ? `<p><strong>Mitigasi:</strong></p><ul>${mergedRisk.mitigation.map(m => `<li>${escapeHtml(typeof m === 'string' ? m : m.text || '')}</li>`).join("")}</ul>` : ''}
    </div>
  `;

  html += `
    <div class="ai-area-section ai-area-verdict-card">
      <h4>✅ Rekomendasi</h4>
      <div class="ai-area-verdict-row">
        <span class="pill ${verdictClass}">${escapeHtml(mergedRec.verdict || "-")}</span>
        <span class="pill ${confidenceBadge}">Confidence: ${escapeHtml(mergedRec.confidence || "-")}</span>
      </div>
      ${mergedRec.action_items?.length ? `<p style="margin-top:10px;"><strong>Langkah Aksi:</strong></p><ol>${mergedRec.action_items.map(a => `<li>${escapeHtml(typeof a === 'string' ? a : a.text || '')}</li>`).join("")}</ol>` : ''}
      ${mergedRec.timeline ? `<p><strong>Timeline:</strong> ${escapeHtml(mergedRec.timeline)}</p>` : ''}
    </div>
  `;

  html += `
    <div class="ai-area-section">
      <h4>📊 Key Metrics</h4>
      ${mergedKeyMetrics.market_size ? `<p><strong>Market Size:</strong> ${escapeHtml(mergedKeyMetrics.market_size)}</p>` : '<p style="color:#94a3b8;font-style:italic;">Metrik kunci belum tersedia.</p>'}
      ${mergedKeyMetrics.break_even_students ? `<p><strong>Break-even Siswa:</strong> ${escapeHtml(mergedKeyMetrics.break_even_students)}</p>` : ''}
      ${mergedKeyMetrics.monthly_revenue_target ? `<p><strong>Target Revenue/Bulan:</strong> ${escapeHtml(mergedKeyMetrics.monthly_revenue_target)}</p>` : ''}
      ${mergedKeyMetrics.roi_estimate ? `<p><strong>Estimasi ROI:</strong> ${escapeHtml(mergedKeyMetrics.roi_estimate)}</p>` : ''}
    </div>
  `;

  // === DEEP RESEARCH SECTION ===
  if (deepResearch) {
    html += `
      <div class="ai-area-section" style="border-top:3px solid #0b5c55;margin-top:16px;padding-top:16px;">
        <h4 style="color:#0b5c55;">\u{1f50d} Deep Research - AI Analysis</h4>
        <p style="font-size:0.85rem;color:#666;margin:0 0 12px 0;">Analisa mendalam berdasarkan riset internet dan AI reasoning</p>
      </div>
    `;

    if (deepResearch.headline) {
      html += `
        <div class="ai-area-section">
          <h4>Headline Riset</h4>
          <p style="font-weight:600;margin:0;">${escapeHtml(deepResearch.headline)}</p>
        </div>
      `;
    }

    if (deepResearch.accessibility) {
      html += `
        <div class="ai-area-section">
          <h4>Aksesibilitas</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.accessibility)}</p>
        </div>
      `;
    }

    if (deepResearch.demography) {
      html += `
        <div class="ai-area-section">
          <h4>Demografi</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.demography)}</p>
        </div>
      `;
    }

    if (deepResearch.marketNeed) {
      html += `
        <div class="ai-area-section">
          <h4>Kebutuhan Pasar</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.marketNeed)}</p>
        </div>
      `;
    }

    if (deepResearch.facilitiesEnvironment) {
      html += `
        <div class="ai-area-section">
          <h4>Fasilitas & Lingkungan</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.facilitiesEnvironment)}</p>
        </div>
      `;
    }

    if (deepResearch.promotionPartnership) {
      html += `
        <div class="ai-area-section">
          <h4>Promosi & Kerjasama</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.promotionPartnership)}</p>
        </div>
      `;
    }

    if (deepResearch.digitalFootprint) {
      html += `
        <div class="ai-area-section">
          <h4>Digital Footprint</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.digitalFootprint)}</p>
        </div>
      `;
    }

    if (deepResearch.digitalFootprintExamples?.length) {
      html += `
        <div class="ai-area-section">
          <h4>Contoh Kegiatan Digital</h4>
          <ul style="margin:0;">
            ${deepResearch.digitalFootprintExamples.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    if (deepResearch.marketSizeShare) {
      html += `
        <div class="ai-area-section">
          <h4>Market Size & Share</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.marketSizeShare)}</p>
        </div>
      `;
    }

    if (deepResearch.implication) {
      html += `
        <div class="ai-area-section">
          <h4>Implikasi Bisnis</h4>
          <p style="margin:0;">${escapeHtml(deepResearch.implication)}</p>
        </div>
      `;
    }

    // Collect all sources into a unified list
    const allSourceItems = [
      ...(deepResearch.sourceDetails || []).map(s => ({ ...s, sourceType: 'deep_research' })),
      ...(deepResearch.sourcesUsed || []).map(s => typeof s === 'string' ? { title: s, url: '', sourceType: 'used_source' } : { ...s, sourceType: 'used_source' }),
      ...(deepResearch.digitalFootprintReferences || []).map(s => ({ ...s, sourceType: 'reference' })),
    ];
    const seenSourceUrls = new Set();
    const uniqueSources = allSourceItems.filter(s => {
      const url = (s.url || '').toLowerCase();
      if (!url) return true;
      if (seenSourceUrls.has(url)) return false;
      seenSourceUrls.add(url);
      return true;
    }).slice(0, 20);

    if (uniqueSources.length) {
      html += `
        <div class="ai-area-section">
          <h4>🔗 Semua Sumber & Referensi (${uniqueSources.length})</h4>
          <div class="research-links">
            ${uniqueSources.map(item => {
              const url = item.url || '';
              const title = item.title || item.label || url || '-';
              const category = item.category || item.source || item.sourceType || '';
              if (url) {
                return `<div class="research-link-card"><a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.88rem;">${escapeHtml(title)}</a>${category ? `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;">${escapeHtml(category)}</div>` : ''}<div class="research-link-meta" style="font-size:9px;color:#cbd5e1;word-break:break-all;">${escapeHtml(url.slice(0, 120))}</div></div>`;
              }
              return `<div class="research-link-card"><span style="font-weight:600;font-size:0.88rem;color:#6b7280;">${escapeHtml(title)}</span>${category ? `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;">${escapeHtml(category)}</div>` : ''}</div>`;
            }).join("")}
          </div>
        </div>
      `;
    }
  }

  if (result.deep_research_error) {
    html += `
      <div class="ai-area-section" style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px;">
        <h4 style="color:#dc2626;margin:0 0 4px 0;">Deep Research Error</h4>
        <p style="margin:0;color:#991b1b;font-size:0.9rem;">${escapeHtml(result.deep_research_error)}</p>
      </div>
    `;
  }

  aiAreaResultsEl.innerHTML = html;
}

function setAiAreaLoading(isLoading) {
  if (aiAreaLoadingEl) {
    aiAreaLoadingEl.classList.toggle("hidden", !isLoading);
    aiAreaLoadingEl.setAttribute("aria-hidden", String(!isLoading));
  }
  if (aiAreaResultsEl) {
    aiAreaResultsEl.classList.toggle("hidden", isLoading);
  }
  if (aiAreaStatusEl) {
    aiAreaStatusEl.textContent = isLoading ? "AI sedang crawling & menganalisa..." : "Analisa selesai";
  }
}

// ================================================================
// Purchasing Power Renderer
// ================================================================
function renderTinyfishPurchasingPower(data) {
  const el = document.getElementById("purchasing-power-results");
  if (!el) return;
  if (!data || data.error) {
    el.innerHTML = '<p class="muted">Data daya beli belum tersedia. Klik tombol Analisa Area untuk menjalankan riset daya beli.</p>';
    return;
  }
  let html = '';
  if (data.summary) {
    html += `<div class="pp-summary-text" style="padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:12px;">`;
    html += `<p style="margin:0;font-size:0.92rem;">${escapeHtml(data.summary)}</p>`;
    html += `</div>`;
  }
  const metrics = data.metrics || [];
  if (metrics.length) {
    html += '<div class="pp-section"><h4>📊 Metrik Daya Beli</h4><div class="pp-metrics-grid">';
    metrics.forEach((m) => {
      const parts = m.text.split(':');
      const label = (parts[0] || '').trim();
      const value = (parts.slice(1).join(':') || '').trim();
      html += `<div class="pp-metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div></div>`;
    });
    html += '</div></div>';
  } else {
    html += '<div class="pp-section"><p style="color:#94a3b8;font-style:italic;">Metrik daya beli belum tersedia dari riset web.</p></div>';
  }
  const sources = data.sources || [];
  if (sources.length) {
    html += '<div class="pp-section"><h4>🔗 Sumber Referensi (' + Math.min(sources.length, 8) + ')</h4><div class="research-links">';
    sources.slice(0, 8).forEach((s) => {
      const url = s.url || '';
      const title = s.title || url;
      html += `<div class="research-link-card">`;
      if (url) {
        html += `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.9rem;">${escapeHtml(title)}</a>`;
      } else {
        html += `<span style="font-weight:600;font-size:0.9rem;">${escapeHtml(title)}</span>`;
      }
      if (url) html += `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;word-break:break-all;">${escapeHtml(url)}</div>`;
      html += `</div>`;
    });
    html += '</div></div>';
  }
  el.innerHTML = html || '<p class="muted">Data daya beli belum tersedia. Jalankan analisa area untuk menjalankan riset daya beli.</p>';
}

// ================================================================
// UNIFIED ANALYSIS: 3 Layer (Web Research → LiteLLM → Manual)
// ================================================================
let latestUnifiedResult = null;

function calculateAnalysisScore(structured, deepResearch, tinyfishSpp) {
  let score = 0;
  let maxScore = 0;
  const details = [];

  // 1. Data Dukcapil tersedia (20 pts)
  maxScore += 20;
  const demo = structured?.district_analysis?.[0]?.demography || {};
  if (demo.population && demo.population > 0) {
    score += 20;
    details.push({ label: 'Data Dukcapil', pts: 20, max: 20, status: 'full' });
  } else if (demo.early_childhood_population) {
    score += 10;
    details.push({ label: 'Data Dukcapil', pts: 10, max: 20, status: 'partial' });
  } else {
    details.push({ label: 'Data Dukcapil', pts: 0, max: 20, status: 'none' });
  }

  // 2. Kompetitor terdeteksi (15 pts)
  maxScore += 15;
  const compCount = structured?.competitor_map?.count_estimate || 0;
  if (compCount >= 5) {
    score += 15;
    details.push({ label: 'Kompetitor', pts: 15, max: 15, status: 'full' });
  } else if (compCount > 0) {
    score += 8;
    details.push({ label: 'Kompetitor', pts: 8, max: 15, status: 'partial' });
  } else {
    details.push({ label: 'Kompetitor', pts: 0, max: 15, status: 'none' });
  }

  // 3. SPP dari web research (15 pts)
  maxScore += 15;
  if (tinyfishSpp?.avg && tinyfishSpp?.count > 0) {
    score += 15;
    details.push({ label: 'Data SPP', pts: 15, max: 15, status: 'full' });
  } else if (structured?.market_estimation?.market_size_formula?.spp_monthly) {
    score += 8;
    details.push({ label: 'Data SPP', pts: 8, max: 15, status: 'partial' });
  } else {
    details.push({ label: 'Data SPP', pts: 0, max: 15, status: 'none' });
  }

  // 4. Market size terhitung (15 pts)
  maxScore += 15;
  if (structured?.market_estimation?.market_size && structured.market_estimation.market_size > 0) {
    score += 15;
    details.push({ label: 'Market Size', pts: 15, max: 15, status: 'full' });
  } else if (structured?.market_estimation?.tam) {
    score += 8;
    details.push({ label: 'Market Size', pts: 8, max: 15, status: 'partial' });
  } else {
    details.push({ label: 'Market Size', pts: 0, max: 15, status: 'none' });
  }

  // 5. AI Deep Research (20 pts)
  maxScore += 20;
  if (deepResearch?.headline && deepResearch?.demography && deepResearch?.marketNeed) {
    score += 20;
    details.push({ label: 'AI Research', pts: 20, max: 20, status: 'full' });
  } else if (deepResearch?.headline) {
    score += 10;
    details.push({ label: 'AI Research', pts: 10, max: 20, status: 'partial' });
  } else {
    details.push({ label: 'AI Research', pts: 0, max: 20, status: 'none' });
  }

  // 6. POI crawl data (15 pts)
  maxScore += 15;
  const totalPois = (structured?.poi_summary?.total || 0);
  if (totalPois >= 10) {
    score += 15;
    details.push({ label: 'POI Crawl', pts: 15, max: 15, status: 'full' });
  } else if (totalPois > 0) {
    score += 8;
    details.push({ label: 'POI Crawl', pts: 8, max: 15, status: 'partial' });
  } else {
    details.push({ label: 'POI Crawl', pts: 0, max: 15, status: 'none' });
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const grade = percentage >= 80 ? 'A' : percentage >= 60 ? 'B' : percentage >= 40 ? 'C' : 'D';
  const gradeLabel = grade === 'A' ? 'Sangat Baik' : grade === 'B' ? 'Baik' : grade === 'C' ? 'Cukup' : 'Perlu Data Lebih';

  return { score, maxScore, percentage, grade, gradeLabel, details };
}

function renderAnalysisScoreBadge(scoreResult) {
  const { percentage, grade, gradeLabel, details } = scoreResult;
  const barColor = percentage >= 80 ? '#16a34a' : percentage >= 60 ? '#2563eb' : percentage >= 40 ? '#f59e0b' : '#dc2626';

  let html = `<div class="pp-section" style="border-left:4px solid ${barColor};">`;
  html += `<h4>🎯 Skor Kualitas Analisa: ${grade} — ${gradeLabel} (${percentage}%)</h4>`;
  html += `<div style="width:100%;height:12px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:8px 0;">`;
  html += `<div style="width:${percentage}%;height:100%;background:${barColor};border-radius:999px;transition:width 0.5s ease;"></div>`;
  html += `</div>`;
  html += `<table class="narrative-table narrative-table-compact" style="margin:8px 0 0;">`;
  details.forEach((d) => {
    const icon = d.status === 'full' ? '✅' : d.status === 'partial' ? '⚠️' : '❌';
    html += `<tr><th>${icon} ${d.label}</th><td>${d.pts}/${d.max} poin</td></tr>`;
  });
  html += `<tr style="font-weight:700;"><th>Total Skor</th><td>${scoreResult.score}/${scoreResult.maxScore} (${percentage}%)</td></tr>`;
  html += `</table></div>`;
  return html;
}

function renderUnifiedStructured(result) {
  if (!structuredResultsEl) return;
  const structured = result?.structured;
  const tinyfish = result?.tinyfish || {};
  const spp = tinyfish.spp || {};
  const manual = result?.manual;
  const deepResearch = result?.deep_research || null;

  // Calculate and render scoring
  const scoreResult = calculateAnalysisScore(structured, deepResearch, spp);
  let html = renderAnalysisScoreBadge(scoreResult);

  // SPP Source Badge
  if (spp.avg) {
    html += `<div class="spp-source-badge">📊 SPP dari Web Research: Rp${formatCurrency(spp.avg)}/bulan (${spp.count} data ditemukan)</div>`;
  }

  // Market Estimation dari structured
  if (structured?.market_estimation) {
    const mkt = structured.market_estimation;
    const formula = mkt.market_size_formula || {};
    const scenarios = mkt.market_size_scenarios || {};
    const supplyBased = mkt.supply_based || {};
    const topDistrict = structured?.district_analysis?.[0] || {};
    const demography = topDistrict?.demography || {};
    const competitorMap = structured?.competitor_map || {};

    // ── TAM SAM SOM Panel ──
    html += `<div class="pp-section"><h4>📊 Estimasi Market (TAM / SAM / SOM)</h4>`;
    html += `<div class="pp-metrics-grid">`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #1d4ed8;"><div class="metric-label">TAM (Total Addressable Market)</div><div class="metric-value" style="color:#1d4ed8;">${formatNumber(mkt.tam)} siswa</div><div class="metric-sublabel">Anak usia 2-7 tahun di area ini</div></div>`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #2563eb;"><div class="metric-label">SAM (Serviceable Addressable Market)</div><div class="metric-value" style="color:#2563eb;">${formatNumber(mkt.sam)} siswa</div><div class="metric-sublabel">Target kelas menengah urban</div></div>`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #3b82f6;"><div class="metric-label">SOM (Serviceable Obtainable Market)</div><div class="metric-value" style="color:#3b82f6;">${formatNumber(mkt.som)} siswa</div><div class="metric-sublabel">Target 3 tahun pertama</div></div>`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #0f766e;"><div class="metric-label">Market Size</div><div class="metric-value" style="color:#0f766e;">${formatCurrency(mkt.market_size)}</div><div class="metric-sublabel">Kompetitor × SPP × Kapasitas × 12</div></div>`;
    html += `</div>`;

    // TAM SAM SOM breakdown
    html += `<div class="tam-sam-som-breakdown" style="margin-top:14px;padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">`;
    html += `<h5 style="margin:0 0 8px;font-size:13px;color:#334155;">📐 Breakdown Perhitungan</h5>`;
    html += `<table class="narrative-table narrative-table-compact" style="margin:0;">`;
    html += `<tr><th>Populasi area</th><td>${formatNumber(demography.population)} jiwa</td></tr>`;
    html += `<tr><th>Anak usia 0-14</th><td>${formatNumber(demography.age_0_14)} (${demography.population > 0 ? ((demography.age_0_14 / demography.population) * 100).toFixed(1) : 0}% dari total)</td></tr>`;
    html += `<tr><th>Target (usia 2-7) = TAM</th><td><strong>${formatNumber(mkt.tam)} siswa</strong> ${demography.reasoning ? `<span style="font-size:11px;color:#64748b;">(${escapeHtml(demography.reasoning.slice(0, 100))})</span>` : ''}</td></tr>`;
    html += `<tr><th>SAM factor</th><td>${formula.sam_factor != null ? `${(formula.sam_factor * 100).toFixed(0)}% dari TAM` : 'N/A'} ${formula.pricing_segment ? `<span style="font-size:11px;color:#64748b;">(${escapeHtml(formula.pricing_segment)})</span>` : ''}</td></tr>`;
    html += `<tr><th>SAM (target)</th><td><strong>${formatNumber(mkt.sam)} siswa</strong></td></tr>`;
    html += `<tr><th>SOM (realistis)</th><td><strong>${formatNumber(mkt.som)} siswa</strong> dalam 3 tahun</td></tr>`;
    html += `<tr><th>SPP bulanan</th><td>${formatCurrency(formula.spp_monthly)}</td></tr>`;
    html += `<tr><th>Sumber SPP</th><td>${formula.spp_source === "tinyfish_research" ? `📊 Web Research (${formula.researched_spp?.count || 0} data)` : "📊 Benchmark regional"}</td></tr>`;
    html += `<tr><th>Range SPP</th><td>${formatCurrency(formula.spp_range_min)} - ${formatCurrency(formula.spp_range_max)}</td></tr>`;
    html += `<tr><th>Kompetitor aktif</th><td>${formatNumber(formula.competitor_poi_count)} (${competitorMap?.density_level || '-'})</td></tr>`;
    html += `<tr><th>Kapasitas per POI</th><td>${formatNumber(formula.average_capacity_benchmark)} murid (range ${formatNumber(formula.capacity_range_min)}-${formatNumber(formula.capacity_range_max)})</td></tr>`;
    if (supplyBased.total_capacity != null) {
      html += `<tr><th>Total kapasitas kompetitor</th><td>${formatNumber(supplyBased.total_capacity)} (${supplyBased.utilization_rate ? (supplyBased.utilization_rate * 100).toFixed(0) + '% util' : '-'})</td></tr>`;
      html += `<tr><th>Active market (isi)</th><td>${formatNumber(supplyBased.active_market)} siswa terisi</td></tr>`;
    }
    html += `<tr><th>Market Gap</th><td><strong>${mkt.market_gap > 0 ? formatNumber(mkt.market_gap) + ' siswa (peluang)' : mkt.market_gap < 0 ? Math.abs(mkt.market_gap) + ' siswa (over supply)' : '-'}</strong></td></tr>`;
    if (mkt.market_share != null) {
      html += `<tr><th>Market Share target</th><td><strong>${mkt.market_share}%</strong></td></tr>`;
    }
    html += `</table></div>`;

    // Simulasi Revenue
    html += `<div style="margin-top:14px;padding:12px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;">`;
    html += `<h5 style="margin:0 0 8px;font-size:13px;color:#334155;">💰 Simulasi Revenue</h5>`;
    html += `<div class="pp-metrics-grid" style="grid-template-columns:repeat(3, 1fr);">`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #94a3b8;"><div class="metric-label">Low (1% penetrasi)</div><div class="metric-value">${formatNumber(scenarios?.low?.students)} siswa</div><div class="metric-sublabel">${formatCurrency(scenarios?.low?.annual_revenue)}/thn</div></div>`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #2563eb;"><div class="metric-label">Mid (2% penetrasi)</div><div class="metric-value">${formatNumber(scenarios?.mid?.students)} siswa</div><div class="metric-sublabel">${formatCurrency(scenarios?.mid?.annual_revenue)}/thn</div></div>`;
    html += `<div class="pp-metric-card" style="border-left:4px solid #0f766e;"><div class="metric-label">High (5% penetrasi)</div><div class="metric-value">${formatNumber(scenarios?.high?.students)} siswa</div><div class="metric-sublabel">${formatCurrency(scenarios?.high?.annual_revenue)}/thn</div></div>`;
    html += `</div>`;
    html += `<table class="narrative-table narrative-table-compact" style="margin-top:10px;">`;
    html += `<tr><th>Revenue (Mid)</th><td>${formatCurrency(scenarios?.mid?.annual_revenue)}/tahun</td></tr>`;
    html += `<tr><th>Break Even</th><td>${structured?.unit_economics?.break_even_students ? formatNumber(structured.unit_economics.break_even_students) + ' siswa' : '-'}</td></tr>`;
    if (structured?.unit_economics?.estimated_cost_monthly) {
      html += `<tr><th>Biaya operasional/bulan</th><td>${formatCurrency(structured.unit_economics.estimated_cost_monthly)}</td></tr>`;
    }
    if (structured?.unit_economics?.margin_estimate != null) {
      html += `<tr><th>Estimasi margin</th><td>${structured.unit_economics.margin_estimate}%</td></tr>`;
    }
    html += `</table></div>`;

    // Reasoning
    if (mkt.reasoning) {
      html += `<div style="margin-top:10px;padding:10px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#475569;">
        <strong style="color:#334155;">📝 Catatan Metodologi:</strong> ${escapeHtml(mkt.reasoning)}
      </div>`;
    }
    html += `</div>`;
  }

  // Manual fallback
  if (manual && !structured) {
    html += `<div class="pp-section"><h4>📊 Perhitungan Manual (Fallback)</h4>`;
    html += `<p>${escapeHtml(manual.executive_summary)}</p>`;
    html += `<div class="pp-metrics-grid">`;
    html += `<div class="pp-metric-card"><div class="metric-label">Kompetitor</div><div class="metric-value">${manual.key_metrics?.competitor_count || 0}</div></div>`;
    html += `<div class="pp-metric-card"><div class="metric-label">SPP Rata-rata</div><div class="metric-value">${formatCurrency(manual.key_metrics?.avg_spp)}</div></div>`;
    html += `<div class="pp-metric-card"><div class="metric-label">Market Size Est.</div><div class="metric-value">${formatCurrency(manual.key_metrics?.estimated_market_size)}</div></div>`;
    html += `</div></div>`;
  }

  // ── Sumber & Referensi Market (clickable) ──
  const sppSources = spp?.sources || tinyfish?.spp?.sources || [];
  const researchSources = structured?.competitor_research?.sources || [];
  const enrichSources = [
    ...(structured?.ai_enrichment?.buying_power_intel?.source_links || []),
    ...(structured?.ai_enrichment?.family_activity_intel?.source_links || []),
  ];
  const allMarketSources = [
    ...sppSources.map(s => ({ title: s.title || s.url || '-', url: s.url || '', category: 'SPP Research' })),
    ...researchSources.map(s => ({ title: s.title || s.url || '-', url: s.url || '', category: s.category || 'Competitor Research' })),
    ...enrichSources.map(url => ({ title: typeof url === 'string' ? url : url.title || '-', url: typeof url === 'string' ? url : url.url || '', category: 'AI Enrichment' })),
  ];
  const seenUrls = new Set();
  const uniqueMarketSources = allMarketSources.filter(s => {
    const u = (s.url || '').toLowerCase();
    if (!u) return true;
    if (seenUrls.has(u)) return false;
    seenUrls.add(u);
    return true;
  }).slice(0, 15);

  if (uniqueMarketSources.length) {
    html += `<div class="pp-section"><h4>🔗 Sumber & Referensi (${uniqueMarketSources.length})</h4><div class="research-links">`;
    uniqueMarketSources.forEach(s => {
      html += `<div class="research-link-card">`;
      if (s.url) {
        html += `<a href="${escapeAttribute(s.url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.88rem;">${escapeHtml(s.title)}</a>`;
      } else {
        html += `<span style="font-weight:600;font-size:0.88rem;color:#6b7280;">${escapeHtml(s.title)}</span>`;
      }
      if (s.category) html += `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;">${escapeHtml(s.category)}</div>`;
      if (s.url) html += `<div class="research-link-meta" style="font-size:9px;color:#cbd5e1;word-break:break-all;">${escapeHtml(s.url.slice(0, 120))}</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  structuredResultsEl.innerHTML = html || '<p class="muted">Data market size belum tersedia. Jalankan analisa area untuk melihat perhitungan TAM/SAM/SOM.</p>';
}

function renderUnifiedDeepResearch(result) {
  if (!deepResearchResultsEl) return;
  let dr = result?.deep_research;

  // ── Fallback: build from structured analysis if deep_research is null ──
  if (!dr) {
    const structured = result?.structured || latestStructuredAnalysis || {};
    const topDistrict = structured?.district_analysis?.[0] || {};
    const demo = topDistrict?.demography || {};
    const market = structured?.market_estimation || {};
    const comp = structured?.competitor_map || {};
    const facilities = topDistrict?.facilities || {};
    const accessibility = topDistrict?.accessibility || {};
    const economy = topDistrict?.economy || {};
    const marketNeeds = topDistrict?.market_needs || {};
    const decision = structured?.decision || {};
    const enrichment = structured?.ai_enrichment || {};
    const scenarios = market.market_size_scenarios || {};
    const formula = market.market_size_formula || {};

    dr = {
      headline: decision.reason || `Analisa area ${topDistrict.district_name || 'target'} - ${decision.recommendation || 'CONSIDER'}`,
      accessibility: accessibility.reasoning || (accessibility.accessibility_score ? `Aksesibilitas: ${accessibility.accessibility_score}` : ''),
      demography: demo.reasoning || (demo.population ? `${formatNumber(demo.population)} jiwa, ${formatNumber(demo.early_childhood_population || 0)} anak usia dini. Sumber: ${demo.source || 'Dukcapil'}.` : ''),
      marketNeed: marketNeeds.reasoning || (comp.count_estimate ? `${formatNumber(comp.count_estimate)} kompetitor, density: ${comp.density_level || '-'}.` : ''),
      facilitiesEnvironment: facilities.reasoning || (facilities.total_family_facilities ? `${formatNumber(facilities.total_family_facilities)} fasilitas keluarga terdeteksi.` : ''),
      promotionPartnership: Array.isArray(topDistrict?.promotion?.community_links) ? topDistrict.promotion.community_links.join(' | ') : (enrichment?.family_activity_intel?.signal_level ? `Family activity signal: ${enrichment.family_activity_intel.signal_level}` : ''),
      digitalFootprint: Array.isArray(topDistrict?.digital_footprint?.instagram) ? topDistrict.digital_footprint.instagram.join(' | ') : '',
      digitalFootprintExamples: Array.isArray(topDistrict?.promotion?.child_events) ? topDistrict.promotion.child_events : (enrichment?.family_activity_intel?.examples || []),
      digitalFootprintReferences: [],
      sourceDetails: Array.isArray(structured?.competitor_research?.sources) ? structured.competitor_research.sources : [],
      marketSizeShare: market.reasoning || (market.tam ? `TAM: ${formatNumber(market.tam)} | SAM: ${formatNumber(market.sam)} | SOM: ${formatNumber(market.som)} | Market Size: ${formatCurrency(market.market_size)}` : ''),
      implication: decision.reason || (market.market_gap > 0 ? `Market gap ${formatNumber(market.market_gap)} siswa - peluang masih terbuka.` : ''),
      sourcesUsed: [
        ...(Array.isArray(enrichment?.buying_power_intel?.source_links) ? enrichment.buying_power_intel.source_links : []),
        ...(Array.isArray(enrichment?.family_activity_intel?.source_links) ? enrichment.family_activity_intel.source_links : []),
      ].slice(0, 8),
    };
  }

  let html = '';
  // Always show all sections, even with fallback text
  const sections = [
    { key: 'headline', icon: '🧠', title: 'Ringkasan Utama', value: dr.headline },
    { key: 'accessibility', icon: '🚗', title: 'Aksesibilitas & Transportasi', value: dr.accessibility },
    { key: 'demography', icon: '👶', title: 'Analisa Demografi', value: dr.demography },
    { key: 'marketNeed', icon: '📈', title: 'Kebutuhan Pasar', value: dr.marketNeed },
    { key: 'facilitiesEnvironment', icon: '🏫', title: 'Fasilitas & Lingkungan Sekitar', value: dr.facilitiesEnvironment },
    { key: 'promotionPartnership', icon: '🤝', title: 'Strategi Promosi & Kerjasama', value: dr.promotionPartnership },
    { key: 'digitalFootprint', icon: '🌐', title: 'Digital Footprint & Online Presence', value: dr.digitalFootprint },
    { key: 'marketSizeShare', icon: '📊', title: 'Estimasi Market Size & Share', value: dr.marketSizeShare },
    { key: 'implication', icon: '💡', title: 'Implikasi & Rekomendasi Bisnis', value: dr.implication },
  ];

  sections.forEach((sec) => {
    const content = sec.value || 'Data untuk bagian ini belum tersedia dari riset AI.';
    html += `<div class="pp-section" style="border-left:3px solid ${sec.value ? '#0b5c55' : '#cbd5e1'}; padding-left:12px; margin-bottom:12px;">`;
    html += `<h4 style="margin:0 0 4px;">${sec.icon} ${sec.title}</h4>`;
    html += `<p style="margin:0;font-size:0.92rem;line-height:1.5;">${escapeHtml(content)}</p>`;
    html += `</div>`;
  });

  // Digital Footprint Examples
  if (dr.digitalFootprintExamples?.length) {
    html += `<div class="pp-section"><h4>🎯 Contoh Kegiatan Digital</h4><ul style="margin:0;padding-left:18px;">`;
    dr.digitalFootprintExamples.forEach((item) => {
      html += `<li style="margin-bottom:4px;font-size:0.9rem;">${escapeHtml(item)}</li>`;
    });
    html += `</ul></div>`;
  }

  // All Sources with clickable links
  const allSources = [...(dr.sourceDetails || []), ...(dr.digitalFootprintReferences || [])];
  const seenUrls = new Set();
  const uniqueSources = allSources.filter((s) => {
    const url = (s.url || '').toLowerCase();
    if (!url || seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  }).slice(0, 15);

  if (uniqueSources.length) {
    html += `<div class="pp-section"><h4>🔗 Semua Sumber & Referensi (${uniqueSources.length})</h4>`;
    html += `<div class="research-links">`;
    uniqueSources.forEach((s) => {
      const url = s.url || '';
      const title = s.title || s.label || url;
      const category = s.category || s.source || '';
      html += `<div class="research-link-card">`;
      if (url) {
        html += `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.92rem;">${escapeHtml(title)}</a>`;
      } else {
        html += `<span style="font-weight:600;font-size:0.92rem;">${escapeHtml(title)}</span>`;
      }
      if (category) html += `<div class="research-link-meta" style="font-size:11px;color:#64748b;">${escapeHtml(category)}</div>`;
      if (url) html += `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;word-break:break-all;">${escapeHtml(url)}</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  // Sources used summary
  const sourcesUsed = dr.sourcesUsed || [];
  if (sourcesUsed.length) {
    html += `<div class="pp-section"><h4>📚 Sumber yang Digunakan</h4><ul style="margin:0;padding-left:18px;">`;
    sourcesUsed.forEach((s) => {
      const label = typeof s === 'string' ? s : (s.title || s.label || s.url || '-');
      const url = typeof s === 'object' ? s.url : '';
      if (url) {
        html += `<li style="margin-bottom:3px;font-size:0.9rem;"><a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;">${escapeHtml(label)}</a></li>`;
      } else {
        html += `<li style="margin-bottom:3px;font-size:0.9rem;">${escapeHtml(label)}</li>`;
      }
    });
    html += `</ul></div>`;
  }

  deepResearchResultsEl.innerHTML = html || '<p class="muted">Detail AI research belum tersedia.</p>';
}

function renderUnifiedSocialNews(result) {
  if (!socialNewsResultsEl) return;
  const sm = result?.tinyfish?.social_media;
  const nw = result?.tinyfish?.news;

  let html = '';

  // Social Media
  if (sm) {
    html += `<div class="pp-section"><h4>📱 Sosial Media (${sm.platformStats?.length || 0} platform)</h4>`;
    if (sm.summary) html += `<p>${escapeHtml(sm.summary)}</p>`;
    if (sm.platformStats?.length) {
      html += `<div class="pp-platform-grid">`;
      sm.platformStats.forEach((p) => {
        html += `<div class="pp-platform-stat"><div class="stat-count">${p.count}</div><div class="stat-label">${escapeHtml(p.platform)}</div></div>`;
      });
      html += `</div>`;
    }
    if (sm.events?.length) {
      html += `<h4 style="margin-top:10px;">🎯 Kegiatan Ditemukan</h4>`;
      sm.events.slice(0, 5).forEach((e) => {
        html += `<div class="pp-event-card"><span class="event-label">${escapeHtml(e.label)}</span><div class="event-text">${escapeHtml(e.text)}</div>`;
        if (e.url) html += `<a href="${escapeAttribute(e.url)}" target="_blank" rel="noreferrer" style="font-size:11px;color:#0b5c55;">Lihat sumber →</a>`;
        html += `</div>`;
      });
    }
    if (sm.sources?.length) {
      html += `<div style="margin-top:10px;"><h4>🔗 Sumber Sosial Media</h4><div class="research-links">`;
      sm.sources.slice(0, 5).forEach((s) => {
        const url = s.url || '';
        const title = s.title || url;
        html += `<div class="research-link-card">`;
        if (url) {
          html += `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.85rem;">${escapeHtml(title)}</a>`;
        } else {
          html += `<span style="font-weight:600;font-size:0.85rem;">${escapeHtml(title)}</span>`;
        }
        if (url) html += `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;word-break:break-all;">${escapeHtml(url)}</div>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
  }

  // News
  if (nw) {
    html += `<div class="pp-section"><h4>📰 Berita (${nw.portalStats?.length || 0} portal)</h4>`;
    if (nw.summary) html += `<p>${escapeHtml(nw.summary)}</p>`;
    if (nw.portalStats?.length) {
      html += `<div class="pp-platform-grid">`;
      nw.portalStats.forEach((p) => {
        html += `<div class="pp-platform-stat"><div class="stat-count">${p.count}</div><div class="stat-label">${escapeHtml(p.portal)}</div></div>`;
      });
      html += `</div>`;
    }
    if (nw.events?.length) {
      html += `<h4 style="margin-top:10px;">🎯 Kegiatan Ditemukan</h4>`;
      nw.events.slice(0, 5).forEach((e) => {
        html += `<div class="pp-event-card"><span class="event-label">${escapeHtml(e.label)}</span><div class="event-text">${escapeHtml(e.text)}</div>`;
        if (e.url) html += `<a href="${escapeAttribute(e.url)}" target="_blank" rel="noreferrer" style="font-size:11px;color:#0b5c55;">Lihat sumber →</a>`;
        html += `</div>`;
      });
    }
    if (nw.sources?.length) {
      html += `<div style="margin-top:10px;"><h4>🔗 Sumber Berita</h4><div class="research-links">`;
      nw.sources.slice(0, 5).forEach((s) => {
        const url = s.url || '';
        const title = s.title || url;
        html += `<div class="research-link-card">`;
        if (url) {
          html += `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.85rem;">${escapeHtml(title)}</a>`;
        } else {
          html += `<span style="font-weight:600;font-size:0.85rem;">${escapeHtml(title)}</span>`;
        }
        if (url) html += `<div class="research-link-meta" style="font-size:10px;color:#94a3b8;word-break:break-all;">${escapeHtml(url)}</div>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
  }

  // If no data at all
  if (!sm && !nw) {
    html = '<p class="muted">Data sosial media dan berita belum tersedia. Klik tombol Analisa Area untuk menjalankan riset.</p>';
  }

  socialNewsResultsEl.innerHTML = html;
}

async function runUnifiedAnalysis() {
  if (!latestAnalysisContext || !latestAnalysisFallbackContext) {
    setStatus("Jalankan pencarian lokasi terlebih dulu.", true);
    return;
  }

  const mbMap = getMaplibreMap();
  const center = mbMap ? mbMap.getCenter() : { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lon };
  const locationContext = {
    subdistrict: districtNameEl.textContent || "",
    city: cityNameEl.textContent || "",
    village: streetNameEl.textContent || "",
    ...(latestAnalysisContext?.locationContext || {}),
  };

  unifiedLoadingEl.classList.remove("hidden");
  unifiedLoadingText.textContent = "Layer 1: AI sedang meriset SPP kompetitor & daya beli...";
  tinyfishStatusEl.textContent = "Meriset...";
  litellmStatusEl.textContent = "Menunggu...";
  manualStatusEl.textContent = "Menunggu...";
  unifiedAnalysisBtn.disabled = true;
  appendActivityLog("Memulai analisa area gabungan (AI Research → LiteLLM → Manual)...");

  try {
    const response = await fetch(`${API_BASE}/api/unified-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: center.lat,
        lon: center.lng,
        locationContext,
        areaCoverage: latestAnalysisContext?.areaCoverage || [],
        crawledPois: latestAnalysisContext?.crawledPois || latestBasePois,
        existingStructured: latestStructuredAnalysis,
        reverseGeocodeResult: latestAnalysisContext?.reverseGeocodeResult || null,
        demographyPayload: latestAnalysisContext?.demographyPayload || null,
      }),
    });

    const data = await response.json();
    if (data.error) {
      setStatus(`Error: ${data.error}`, true);
      appendActivityLog(`Error: ${data.error}`, "error");
      return;
    }

    latestUnifiedResult = data;

    // Update status badges
    const activeLayer = data.meta?.active_layer || "none";
    const layerFailed = data.meta?.layer_failed || {};
    tinyfishStatusEl.textContent = activeLayer === "tinyfish" ? "✅ Aktif" : (layerFailed.tinyfish ? "❌ Gagal" : "⏭ Skip");
    litellmStatusEl.textContent = activeLayer === "litellm" ? "✅ Aktif" : (layerFailed.litellm_structured || layerFailed.litellm_deep ? "❌ Gagal" : "⏭ Skip");
    manualStatusEl.textContent = activeLayer === "manual" ? "✅ Aktif" : "⏭ Skip";

    // Render results
    renderUnifiedStructured(data);
    renderUnifiedDeepResearch(data);
    renderUnifiedSocialNews(data);
    renderTinyfishPurchasingPower(data?.tinyfish?.purchasing_power);

    // Update existing analysis displays
    if (data.structured) {
      latestStructuredAnalysis = data.structured;
      renderStructuredAnalysis(data.structured, latestAnalysisFallbackContext);
    }

    const elapsed = data.meta?.elapsed_ms || 0;
    setStatus(`Analisa area selesai dalam ${(elapsed / 1000).toFixed(1)} detik.`);
    appendActivityLog(`Analisa area gabungan selesai: layer ${activeLayer}.`, "success");
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
    appendActivityLog(`Error: ${error.message}`, "error");
  } finally {
    unifiedLoadingEl.classList.add("hidden");
    unifiedAnalysisBtn.disabled = false;
  }
}

async function runAiAreaAnalysis() {
  if (!latestAnalysisContext || !latestAnalysisFallbackContext) {
    setStatus("Jalankan analisa lokasi terlebih dulu sebelum analisa AI area.", true);
    return;
  }

  const controller = new AbortController();
  activeController = controller;
  isProcessing = true;
  syncActionButtons();
  setAiAreaLoading(true);
  setStatus("AI Deep Research sedang berjalan - crawling data dari internet...");
  appendActivityLog("AI Deep Research sedang dijalankan - crawl data dari internet dan analisa AI.");

  try {
    const payload = {
      lat: latestAnalysisContext.lat,
      lon: latestAnalysisContext.lon,
      radius: latestAnalysisContext.radius,
      streetName: document.getElementById("street-name")?.textContent || "-",
      locationContext: latestAnalysisContext.locationContext || {},
      areaCoverage: latestAnalysisContext.areaCoverage || [],
      crawledPois: latestAnalysisContext.crawledPois || [],
      structuredResult: latestStructuredAnalysis || {},
    };

    appendActivityLog("Step 1/3: Membangun research queries dan crawling data dari Google, DuckDuckGo...");

    const response = await fetch(`${API_BASE}/api/ai-area-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    renderAiAreaAnalysis(result);

    if (result.meta?.has_deep_research) {
      setStatus("AI Deep Research selesai - analisa lengkap dengan data riset internet.");
      appendActivityLog("AI Deep Research berhasil - deep research + analisa AI selesai.", "success");
    } else {
      setStatus("Analisa AI Area selesai (mode lokal).");
      appendActivityLog("Analisa AI Area selesai (deep research tidak tersedia, menggunakan analisa lokal).", "success");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("Analisa AI Area dibatalkan.", true);
      appendActivityLog("Analisa AI Area dibatalkan.", "error");
      return;
    }
    if (aiAreaResultsEl) {
      aiAreaResultsEl.innerHTML = `<p style="color:#dc2626;">Gagal menjalankan analisa AI: ${escapeHtml(error.message)}</p>`;
    }
    setStatus("Analisa AI Area gagal.", true);
    appendActivityLog(error.message || "Analisa AI Area gagal.", "error");
  } finally {
    activeController = null;
    isProcessing = false;
    syncActionButtons();
    setAiAreaLoading(false);
  }
}


async function analyzeLocation(lat, lon, radius) {
  const controller = new AbortController();
  activeController = controller;
  isProcessing = true;
  latestAnalysisContext = null;
  latestAnalysisFallbackContext = null;
  resetAiAnalysisPanel("Selesaikan crawl Google Maps dulu, lalu klik Analisa area untuk menjalankan perhitungan Dukcapil.");
  syncActionButtons();
  setLoadingState(true, { map: true, analysis: false, table: true });
  setStatus("Mengambil nama jalan, crawl Google Maps, dan menyiapkan data Dukcapil...");
  appendActivityLog(`Analisa dimulai untuk koordinat ${lat}, ${lon} dengan radius ${radius} meter.`);

  try {
    appendActivityLog("Memanggil reverse geocode untuk menentukan kelurahan, kecamatan, dan kota.");
    let geoData = null;
    let address = {};
    try {
      geoData = await reverseGeocode(lat, lon, controller.signal);
      address = geoData.address || {};
    } catch (geoError) {
      appendActivityLog(`Reverse geocode gagal: ${geoError.message}. Sistem melanjutkan crawl lokasi menggunakan koordinat mentah.`, "error");
    }
    const locationContext = extractLocationContext(address);
    const districtName = locationContext.subdistrict || locationContext.district || "Kecamatan tidak ditemukan";
    const cityName = locationContext.city || "Kota tidak ditemukan";
    const streetName =
      address.road ||
      address.pedestrian ||
      address.neighbourhood ||
      address.suburb ||
      geoData?.display_name ||
      "Nama jalan tidak ditemukan";

    streetNameEl.textContent = streetName;
    districtNameEl.textContent = districtName;
    cityNameEl.textContent = cityName;
    appendActivityLog(`Wilayah terdeteksi: ${districtName}, ${cityName}.`, "success");
    setStatus(`Titik koordinat berada di Kecamatan ${districtName}, ${cityName}.`);
    await sleep(1200);
    setStatus("Menjalankan Google Maps crawler dari backend...");

    const poiPayload = await fetchPois(lat, lon, radius, locationContext, controller.signal);
    const pois = poiPayload.items;
    latestPoiMeta = poiPayload.meta || {};
    const effectiveRadius = Number(poiPayload.meta.effectiveRadius || 3000);
    const areaCoverage = Array.isArray(poiPayload.meta.areaCoverage) ? poiPayload.meta.areaCoverage : [];
    const crawlPlan = Array.isArray(poiPayload.meta.crawlPlan) ? poiPayload.meta.crawlPlan : [];
    const summary = summarizePois(pois);
    const supporting = getTopPois(pois, "positive");
    const risks = getTopPois(pois, "risk");
    const googleMapsTotal = Number(poiPayload.meta.googleMapsTotal || 0);
    const googleMapsWithCoords = Number(poiPayload.meta.googleMapsWithCoords || 0);
    const googleMapsWithoutCoords = Math.max(0, googleMapsTotal - googleMapsWithCoords);
    const coordSources = poiPayload.meta.googleMapsCoordSources || {};
    const backendHotmapInRadius = Number(poiPayload.meta.backendHotmapInRadius || 0);
    const fallbackUsed = Boolean(poiPayload.meta.fallbackUsed);
    const coordSourceLabel = Object.entries(coordSources)
      .map(([key, value]) => `${key}:${value}`)
      .join(", ");

    appendActivityLog(`POI berhasil dimuat: ${pois.length} item dalam radius ${effectiveRadius} meter. Sumber aktif: ${[...new Set(pois.map((poi) => getPoiSourceLabel(poi.source)))].join(", ") || "-"}.`, "success");
    if (areaCoverage.length) {
      appendActivityLog(`Cakupan radius 3 km meliputi ${areaCoverage.length} kelurahan: ${areaCoverage.map((area) => area.village || area.subdistrict || area.district || area.city).filter(Boolean).join(", ")}. Crawl POI dijalankan per kelurahan untuk tiap kategori.`, "success");
      districtNameEl.textContent = areaCoverage.map((area) => area.village || area.subdistrict || area.district || area.city).filter(Boolean).slice(0, 3).join(", ");
    }
    if (crawlPlan.length) {
      appendActivityLog(`Rencana crawl backend: ${crawlPlan.length} query kategori-area.`, "success");
      crawlPlan.slice(0, 12).forEach((item) => {
        appendActivityLog(`Crawl: ${item.category} | keyword "${item.keyword}" | area ${item.area}.`);
      });
      if (crawlPlan.length > 12) {
        appendActivityLog(`Masih ada ${crawlPlan.length - 12} query crawl tambahan dengan pola yang sama.`);
      }
    }
    if (googleMapsTotal > 0) {
      appendActivityLog(`Google Maps Crawl mengumpulkan ${googleMapsTotal} POI, ${googleMapsWithCoords} punya koordinat marker, ${googleMapsWithoutCoords} sisanya belum berhasil digeocode.`, googleMapsWithCoords > 0 ? "success" : "error");
      if (coordSourceLabel) {
        appendActivityLog(`Sumber koordinat Google crawl: ${coordSourceLabel}.`, "success");
      }
    }
    if (backendHotmapInRadius > 0) {
      appendActivityLog(`Backend Hotspot V2 menyiapkan ${backendHotmapInRadius} titik berkordinat untuk dashboard.`, "success");
    }
    if (fallbackUsed) {
      appendActivityLog("Backend POI memakai fallback karena crawl Google Maps tidak berhasil mengembalikan data POI nyata.", "error");
    }
    poiTotalEl.textContent = String(pois.length);
    positiveScoreEl.textContent = String(summary.counts.positive);
    riskScoreEl.textContent = String(summary.counts.risk);
    renderPoiLists(supporting, risks, pois);
    renderPoiSources(poiPayload.meta, pois);
    renderResearchSources(poiPayload.meta.externalResearch || {});
    renderPoiBreakdowns(pois);
    updateMap(lat, lon, effectiveRadius, pois);

    // Heatmap foot traffic now only shown on foot-traffic-dashboard.html
    // Main map keeps POIs clickable without heatmap overlay
    console.log("HEATMAP: Skipped on main map — use Dashboard Foot Traffic for heatmap.");
    if (heatmapStatusEl) heatmapStatusEl.textContent = "Nonaktif (lihat Dashboard)";
    if (heatmapLayer) {
      try {
        const mbMap = getMaplibreMap();
        if (mbMap) {
          mbMap.setLayoutProperty('fallback-heatmap-glow', 'visibility', 'none');
          mbMap.setLayoutProperty('fallback-heatmap-marker', 'visibility', 'none');
        }
      } catch (e) {}
      heatmapLayer = null;
    }

    syncActionButtons();
    if (poiPayload.meta?.backendError) {
      appendActivityLog(`Backend POI mengembalikan fallback kosong: ${poiPayload.meta.backendError}.`, "error");
    }
    if (poiPayload.meta?.degradedSources?.googleHousingTimedOut) {
      appendActivityLog("Google housing crawl melewati batas waktu. Dashboard melanjutkan dengan data parsial yang sudah tersedia.", "error");
    }
    if (poiPayload.meta?.degradedSources?.externalResearchTimedOut) {
      appendActivityLog("Riset eksternal melewati batas waktu. Crawl lokasi tetap dilanjutkan tanpa ringkasan riset lengkap.", "error");
    }

    latestAnalysisContext = buildAnalysisContext({
      lat,
      lon,
      effectiveRadius,
      streetName,
      locationContext,
      areaCoverage,
      pois,
      externalResearch: poiPayload.meta.externalResearch || {},
      reverseGeocodeResult: geoData || null,
      demographyPayload: null,
    });
    latestAnalysisFallbackContext = {
      streetName,
      districtName,
      cityName,
      province: locationContext.province || "",
      poiCount: pois.length,
      supportingPois: supporting,
      riskPois: risks,
    };
    renderResults(buildWebsiteShortlist(locationContext, areaCoverage));
    if (!isDrawerOpen("drawer-shortlist")) {
      toggleDrawer("drawer-shortlist");
    } else {
      syncShortlistNotification();
    }
    appendActivityLog("Shortlist website ruko per kecamatan/kota berhasil dibuat.", "success");
    analysisStatusBanner.textContent = "Data crawl Google Maps sudah siap. Analisa area Dukcapil sedang dijalankan otomatis.";
    renderAnalysisDropdown(
      "Hasil crawl siap",
      "<p>Hasil crawl Google Maps siap dipakai. Analisa area Dukcapil akan segera menampilkan tabel perhitungan.</p>",
    );
    appendActivityLog("Data crawl Google Maps selesai disiapkan. Tombol analisa area sekarang aktif.", "success");
    setStatus("Crawl lokasi selesai. Analisa area Dukcapil sedang diproses.");
    syncActionButtons();
  } catch (error) {
    console.error(error);
    if (error.name === "AbortError") {
      setStatus("Proses dibatalkan oleh pengguna.", true);
      appendActivityLog("Proses dibatalkan oleh pengguna.", "error");
      return;
    }
    resetAiAnalysisPanel("Data untuk analisa area belum siap karena proses crawl Google Maps gagal.");
    setStatus(error.message || "Crawl lokasi gagal. Hasil analisa area belum bisa dijalankan.", true);
    appendActivityLog(error.message || "Terjadi kegagalan saat analisa lokasi.", "error");
  } finally {
    activeController = null;
    isProcessing = false;
    syncActionButtons();
    setLoadingState(false);
  }
}

// ==================== HAVERSINE DISTANCE ====================
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==================== HEATMAP FOOT TRAFFIC ====================

let heatmapLayer = null;
let heatmapLegend = null;
let latestHeatmapData = null;

const heatFootTrafficCheckbox = document.getElementById("heat-foot-traffic");
const heatmapStatusEl = document.getElementById("heatmap-status");
const ftAvgScoreEl = document.getElementById("ft-avg-score");
const ftPoiCountEl = document.getElementById("ft-poi-count");
const ftTotalPoisEl = document.getElementById("ft-total-pois");
const ftSourceEl = document.getElementById("ft-source");

const FOOT_TRAFFIC_GRADIENT = {
  0.0: "#3b82f6",   // Biru = sepi
  0.25: "#22c55e",  // Hijau = rendah
  0.5: "#eab308",   // Kuning = sedang
  0.75: "#f97316",  // Orange = ramai
  1.0: "#ef4444",   // Merah = sangat ramai
};

// Note: Maplibre GL JS tidak memerlukan custom pane seperti Leaflet.
// Heatmap layers kini langsung dirender di canvas utama dengan z-index layer.
function ensureHeatmapPane() {
  // Tidak perlu lagi untuk Maplibre
  return null;
}

/**
 * Map foot traffic intensity (0-1) to a color.
 * Thresholds aligned with level system: very_high >= 0.65, high >= 0.45, medium >= 0.25.
 */
function getHeatColor(intensity = 0) {
  const value = Math.max(0, Math.min(1, Number(intensity) || 0));
  if (value >= 0.65) return "#ef4444";  // Sangat Ramai
  if (value >= 0.45) return "#f97316";  // Ramai
  if (value >= 0.25) return "#eab308";  // Sedang
  return "#3b82f6";                     // Sepi
}

function getHeatmapSourceLabel(poi) {
  const source = poi.source || "";
  const tags = poi.tags || {};
  if (source === "google-maps-crawl" || source === "google-maps-crawl-fallback") return "Google Maps";
  if (source === "hotmap-v2-extension") return "Hotspot Map V2";
  if (source === "overpass") return "OpenStreetMap";
  if (source === "google-places") return "Google Places";
  if (tags.coord_source === "nominatim" || tags.coord_source === "photon") return "Geocoding OSM";
  return "POI Data";
}

function computeHeatmapIntensity(poi) {
  const explicitScore = Number(poi.tags?.foot_traffic_score);
  if (Number.isFinite(explicitScore)) {
    return Math.max(0.12, Math.min(1, explicitScore / 100));
  }

  // Use POI rating as a secondary signal
  const rating = Number(poi.tags?.rating);
  const reviewCount = Number(poi.tags?.review_count) || 0;
  if (Number.isFinite(rating) && rating > 0) {
    // Higher rating + more reviews = higher foot traffic signal
    const ratingIntensity = (rating / 5) * 0.6;
    const reviewBoost = Math.min(0.4, reviewCount / 200);
    return Math.max(0.12, Math.min(1, ratingIntensity + reviewBoost));
  }

  // Category-based with realistic ranges (not fake high values)
  const categoryIntensity = {
    "education": 0.55,
    "family-services": 0.50,
    "residential": 0.40,
    "daily-needs": 0.60,
    "child-friendly": 0.50,
    "traffic-support": 0.55,
    "community": 0.45,
    "other": 0.35,
    "risk": 0.25,
  };
  return categoryIntensity[poi.category] || 0.35;
}

function buildClientHeatmapPoints(lat, lon, radius) {
  const sourcePois = dedupeMapPois([...latestBasePois, ...latestHotmapPois]).filter((poi) => {
    if (!poi.lat || !poi.lon) return false;
    const distanceKm = haversineDistance(lat, lon, poi.lat, poi.lon);
    return distanceKm <= radius / 1000;
  });

  // Build points directly from real POIs — each point = one real place
  const points = sourcePois.map((poi) => {
    const intensity = computeHeatmapIntensity(poi);
    return {
      lat: Number(poi.lat),
      lon: Number(poi.lon),
      intensity,
      score: Math.round(intensity * 100),
      level: intensity >= 0.65 ? "high" : intensity >= 0.40 ? "medium" : "low",
      name: poi.name || "POI",
      category: poi.categoryLabel || poi.category || "",
      source: getHeatmapSourceLabel(poi),
      address: poi.tags?.address || "",
      rating: poi.tags?.rating || "",
      reviewCount: poi.tags?.review_count || 0,
      mapsLink: poi.tags?.maps_link || poi.tags?.header_link_raw || "",
    };
  });

  if (points.length > 0) {
    const avgScore = Math.round(points.reduce((acc, item) => acc + item.score, 0) / points.length);
    const sourceBreakdown = {};
    points.forEach((p) => { sourceBreakdown[p.source] = (sourceBreakdown[p.source] || 0) + 1; });
    const primarySource = Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || "POI Data";
    return {
      footTraffic: points,
      stats: {
        totalPois: sourcePois.length,
        withFootTraffic: points.length,
        averageFootTraffic: avgScore,
        source: primarySource,
        sourceBreakdown,
      },
    };
  }

  return {
    footTraffic: [],
    stats: {
      totalPois: 0,
      withFootTraffic: 0,
      averageFootTraffic: 0,
      source: "no-data",
    },
  };
}

function buildHeatmapPointPopup(point) {
  const levelLabels = { very_high: "Sangat Ramai", high: "Ramai", medium: "Sedang", low: "Sepi" };
  const levelColors = { very_high: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6" };
  const level = point.level || "low";
  const color = levelColors[level] || "#6b7280";
  const label = levelLabels[level] || level;

  let html = '<div style="font-family:system-ui,sans-serif;min-width:180px;max-width:260px;">';
  html += '<div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:3px;">' + escapeHtml(point.name || "POI") + '</div>';

  if (point.category) {
    html += '<div style="font-size:11px;color:#6b7280;margin-bottom:2px;">' + escapeHtml(point.category) + '</div>';
  }

  html += '<div style="display:inline-block;padding:2px 8px;background:' + color + '18;border:1px solid ' + color + '40;border-radius:6px;font-size:11px;color:' + color + ';font-weight:600;margin:4px 0;">';
  html += '📊 Skor: ' + (point.score || 0) + '% — ' + escapeHtml(label);
  html += '</div>';

  if (point.address) {
    html += '<div style="font-size:11px;color:#6b7280;margin-top:3px;">📍 ' + escapeHtml(point.address) + '</div>';
  }

  if (point.rating) {
    html += '<div style="font-size:11px;color:#eab308;margin-top:2px;">⭐ ' + escapeHtml(String(point.rating));
    if (point.reviewCount) html += ' (' + escapeHtml(String(point.reviewCount)) + ' ulasan)';
    html += '</div>';
  }

  html += '<div style="font-size:10px;color:#9ca3af;margin-top:4px;">Sumber: ' + escapeHtml(point.source || "POI Data") + '</div>';

  if (point.mapsLink) {
    html += '<div style="margin-top:6px;"><a href="' + escapeAttribute(String(point.mapsLink)) + '" target="_blank" rel="noreferrer" style="font-size:11px;color:#2563eb;text-decoration:none;">📍 Buka di Google Maps →</a></div>';
  }

  html += '<div style="font-size:9px;color:#d1d5db;margin-top:4px;">' + escapeHtml(String(point.lat?.toFixed(6) || "")) + ', ' + escapeHtml(String(point.lon?.toFixed(6) || "")) + '</div>';
  html += '</div>';
  return html;
}

function renderFallbackHeatmapLayer(footTrafficData) {
  // Convert to GeoJSON features untuk Maplibre GL JS
  const features = [];
  
  footTrafficData.forEach((point) => {
    const intensity = Math.max(0.12, Math.min(1, Number(point.intensity) || Number(point.score) / 100 || 0.5));
    const color = getHeatColor(intensity);

    // Glow circle properties
    const glowRadius = 90 + Math.round(intensity * 120);
    const markerRadius = 8 + Math.round(intensity * 10);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.lon || point.lng, point.lat],
      },
      properties: {
        name: point.name && point.name !== "POI" ? point.name : "POI",
        lat: point.lat,
        lon: point.lon || point.lng,
        intensity: intensity,
        color: color,
        glowRadius: glowRadius,
        markerRadius: markerRadius,
        fillOpacity: 0.4 + (intensity * 0.4),
        _popupContent: buildHeatmapPointPopup(point),
      },
    });
  });

  return {
    type: 'FeatureCollection',
    features: features,
  };
}

async function fetchHeatmapData(lat, lon, radius, signal) {
  const url = new URL(`${API_BASE}/api/heatmap-data`, window.location.origin);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("radius", radius);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Gagal mengambil data heatmap.");
  }
  return response.json();
}

function renderFootTrafficHeatmap(footTrafficData) {
  if (heatmapLayer) {
    try {
      const mbMap = getMaplibreMap();
      if (mbMap) {
        mbMap.setLayoutProperty('fallback-heatmap-glow', 'visibility', 'none');
        mbMap.setLayoutProperty('fallback-heatmap-marker', 'visibility', 'none');
      }
    } catch (e) {}
    heatmapLayer = null;
  }

  if (!footTrafficData || footTrafficData.length === 0) {
    console.log("HEATMAP: No foot traffic data to render");
    return false;
  }

  const mbMap = getMaplibreMap();
  if (!mbMap) {
    waitForMap(() => {
      if (heatFootTrafficCheckbox) heatFootTrafficCheckbox.click();
    });
    return false;
  }

  const geojson = renderFallbackHeatmapLayer(footTrafficData);
  
  // Remove existing heatmap layer if any
  try {
    mbMap.removeLayer('fallback-heatmap-glow');
    mbMap.removeLayer('fallback-heatmap-marker');
    mbMap.removeSource('fallback-heatmap-source');
  } catch (e) {}

  // Add source
  mbMap.addSource('fallback-heatmap-source', {
    type: 'geojson',
    data: geojson,
  });

  // Glow layer (background circles)
  mbMap.addLayer({
    id: 'fallback-heatmap-glow',
    type: 'circle',
    source: 'fallback-heatmap-source',
    paint: {
      'circle-radius': ['*', ['get', 'intensity'], 120],
      'circle-color': ['get', 'color'],
      'circle-opacity': ['*', ['get', 'intensity'], 0.22],
      'circle-stroke-width': 1,
      'circle-stroke-color': ['get', 'color'],
    },
  });

  // Marker layer (foreground)
  mbMap.addLayer({
    id: 'fallback-heatmap-marker',
    type: 'circle',
    source: 'fallback-heatmap-source',
    paint: {
      'circle-radius': ['+', 8, ['*', ['get', 'intensity'], 10]],
      'circle-color': ['get', 'color'],
      'circle-opacity': ['get', 'fillOpacity'],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ['get', 'color'],
    },
  });

  // Click handler untuk heatmap marker
  mbMap.on('click', 'fallback-heatmap-marker', (e) => {
    if (!e.features || !e.features.length) return;
    const props = e.features[0].properties;
    if (props._popupContent) {
      new maplibregl.Popup({ maxWidth: 280, closeOnClick: true, autoClose: true })
        .setLngLat([props.lon, props.lat])
        .setHTML(props._popupContent)
        .addTo(mbMap);
    }
  });

  // Hover
  mbMap.on('mouseenter', 'fallback-heatmap-marker', () => {
    if (mbMap) mbMap.getCanvas().style.cursor = 'pointer';
  });
  mbMap.on('mouseleave', 'fallback-heatmap-marker', () => {
    if (mbMap) mbMap.getCanvas().style.cursor = '';
  });

  // Bring to front
  try {
    mbMap.moveLayer('fallback-heatmap-glow');
    mbMap.moveLayer('fallback-heatmap-marker');
  } catch (e) {}

  heatmapLayer = geojson;
  console.log("HEATMAP: Fallback layer added with", footTrafficData.length, "points");
  return true;
}

function updateHeatmapVisibility() {
  const visible = heatFootTrafficCheckbox?.checked;
  const mbMap = getMaplibreMap();

  if (!mbMap) return;

  if (visible) {
    try {
      mbMap.setLayoutProperty('fallback-heatmap-glow', 'visibility', 'visible');
      mbMap.setLayoutProperty('fallback-heatmap-marker', 'visibility', 'visible');
    } catch (e) {}
  } else {
    try {
      mbMap.setLayoutProperty('fallback-heatmap-glow', 'visibility', 'none');
      mbMap.setLayoutProperty('fallback-heatmap-marker', 'visibility', 'none');
    } catch (e) {}
  }

  if (heatmapStatusEl) {
    heatmapStatusEl.textContent = visible ? "Aktif" : "Nonaktif";
  }
}

function updateFootTrafficSummary(data) {
  if (!data?.stats) return;

  const stats = data.stats;
  if (ftAvgScoreEl) ftAvgScoreEl.textContent = stats.averageFootTraffic != null ? `${stats.averageFootTraffic}%` : "-";
  if (ftPoiCountEl) ftPoiCountEl.textContent = String(stats.withFootTraffic || 0);
  if (ftTotalPoisEl) ftTotalPoisEl.textContent = String(stats.totalPois || 0);

  if (ftSourceEl) {
    const sourceMap = {
      "popular-times": "Google Popular Times",
      "density-proxy": "Estimasi Kepadatan POI",
      "fallback-center": "Fallback",
      "no-data": "Belum ada data",
      "Google Maps": "Google Maps",
      "OpenStreetMap": "OpenStreetMap",
      "Hotspot Map V2": "Hotspot Map V2",
      "Google Places": "Google Places",
    };
    ftSourceEl.textContent = sourceMap[stats.source] || stats.source || "POI Data";
  }

  if (heatmapStatusEl) {
    const visible = heatFootTrafficCheckbox?.checked;
    heatmapStatusEl.textContent = visible ? "Aktif" : "Nonaktif";
  }
}

function addHeatmapLegend() {
  const mbMap = getMaplibreMap();
  if (!mbMap) return;

  // Hapus legend lama jika ada
  const existingLegend = document.querySelector('.heatmap-legend');
  if (existingLegend) existingLegend.remove();

  // Buat legend element manual (tanpa L.control Leaflet)
  const legendDiv = document.createElement('div');
  legendDiv.className = 'heatmap-legend';
  legendDiv.innerHTML = `
    <div class="heatmap-legend-title">Foot Traffic Intensity</div>
    <div class="heatmap-legend-bar"></div>
    <div class="heatmap-legend-labels">
      <span>Rendah</span>
      <span>Sedang</span>
      <span>Tinggi</span>
    </div>
  `;

  // Tambah ke map canvas container
  const mapContainer = mbMap.getContainer();
  if (mapContainer) {
    mapContainer.appendChild(legendDiv);
    // Position via CSS (bottom-right sudah diatur di styles.css)
  }

  heatmapLegend = legendDiv;
}

async function loadAndRenderHeatmap(lat, lon, radius, signal) {
  console.log("HEATMAP: loadAndRenderHeatmap called with", lat, lon, radius);
  try {
    if (heatmapStatusEl) heatmapStatusEl.textContent = "Memuat...";

    let data = null;
    try {
      data = await fetchHeatmapData(lat, lon, radius, signal);
    } catch (fetchError) {
      console.warn("Heatmap API failed:", fetchError.message);
    }

    const fallbackData = buildClientHeatmapPoints(lat, lon, radius);
    const hasApiData = data && Array.isArray(data.footTraffic) && data.footTraffic.length > 0;
    const effectiveData = hasApiData ? data : fallbackData;

    latestHeatmapData = effectiveData;
    renderFootTrafficHeatmap(effectiveData.footTraffic);
    updateFootTrafficSummary({
      stats: {
        ...(effectiveData.stats || {}),
        source: effectiveData.stats?.source || (hasApiData ? "popular-times" : "density-proxy"),
      },
    });

    if (hasApiData) {
      const sourceInfo = data.stats?.source || "API";
      appendActivityLog(`Heatmap dimuat: ${data.footTraffic.length} titik POI dari ${sourceInfo}.`, "success");
    } else {
      if (fallbackData.footTraffic.length > 0) {
        appendActivityLog(`Heatmap dimuat dari data POI lokal: ${fallbackData.footTraffic.length} titik.`, "success");
      } else {
        appendActivityLog("Heatmap tidak memiliki data POI. Jalankan crawl lokasi terlebih dahulu.", "error");
      }
    }

    updateHeatmapVisibility();
    addHeatmapLegend();

  } catch (error) {
    console.error("HEATMAP: Error:", error);
    if (heatmapStatusEl) heatmapStatusEl.textContent = "Gagal memuat";
    appendActivityLog(`Heatmap gagal dimuat: ${error.message}`, "error");
  }
}



// Heatmap toggle
if (heatFootTrafficCheckbox) {
  heatFootTrafficCheckbox.addEventListener("change", () => {
    updateHeatmapVisibility();
  });
}

// ================================================================
// FEASIBILITY STUDY
// ================================================================
const feasibilityLoadingEl = document.getElementById("feasibility-loading");
const feasibilityResultsEl = document.getElementById("feasibility-results");
const feasibilityStatusEl = document.getElementById("feasibility-status");
const feasibilityInputSummaryEl = document.getElementById("feasibility-input-summary");
const feasibilityInputTable = document.getElementById("feasibility-input-table");
const feasibilityLoadingText = document.getElementById("feasibility-loading-text");

function notifyAnalysisComplete() {
  const badge = document.getElementById("analysis-notification-badge");
  if (badge) badge.classList.remove("hidden");
  appendActivityLog("Analisa selesai! Silakan buka menu Hasil Analisa 📊 untuk melihat laporan lengkap.", "success");
}

function getScoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#2563eb";
  if (score >= 40) return "#f59e0b";
  return "#dc2626";
}

function getScoreLabel(score) {
  if (score >= 80) return "Sangat Baik";
  if (score >= 60) return "Baik";
  if (score >= 40) return "Cukup";
  return "Perlu Perhatian";
}

function getScoreGrade(score) {
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C+";
  if (score >= 40) return "C";
  return "D";
}

function renderFeasibilityInputSummary(input) {
  if (!feasibilityInputSummaryEl || !feasibilityInputTable) return;
  feasibilityInputSummaryEl.classList.remove("hidden");
  let html = "";
  html += `<tr><th>Koordinat</th><td>${input.latitude?.toFixed(6) || "-"}, ${input.longitude?.toFixed(6) || "-"}</td></tr>`;
  html += `<tr><th>Jenis Usaha</th><td>${escapeHtml(input.businessType || "-")}</td></tr>`;
  html += `<tr><th>Detail Usaha</th><td>${escapeHtml(input.businessDetail || "-")}</td></tr>`;
  html += `<tr><th>Harga Jual</th><td>${escapeHtml(input.sellingPrice || "-")}</td></tr>`;
  feasibilityInputTable.innerHTML = html;
}

function renderFeasibilityResults(result) {
  if (!feasibilityResultsEl) return;
  if (!result || !result.feasibility) {
    feasibilityResultsEl.innerHTML = '<p class="muted">Data studi kelayakan belum tersedia. Jalankan analisa dengan input bisnis yang lengkap.</p>';
    return;
  }

  // Show fallback warning if TinyFish timed out
  if (result.feasibility._fallback) {
    feasibilityResultsEl.innerHTML = `<div style="padding:16px;background:#fffbeb;border:1px solid #fbbf24;border-radius:10px;margin-bottom:16px;">
      <div style="font-weight:700;color:#92400e;margin-bottom:4px;">⚠️ TinyFish AI Timeout</div>
      <p style="margin:0;font-size:0.9rem;color:#78350f;">Riset web via TinyFish gagal atau timeout. Hasil di bawah menggunakan <strong>data Dukcapil demografi</strong> sebagai fallback. Untuk hasil riset lengkap, coba lagi nanti atau periksa koneksi API.</p>
    </div>`;
    // Still render what we have
    const f = result.feasibility;
    const mkt = result.marketEstimation || {};
    const demo = result.demography || {};
    let html = result.feasibility._fallback ? result.feasibility._error ? '' : '' : '';
    html += `<div class="feasibility-overall-score" style="border-left:5px solid #f59e0b;background:#fffbeb;padding:16px 20px;border-radius:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="font-size:48px;font-weight:800;color:#f59e0b;line-height:1;">C</div>
        <div><div style="font-size:22px;font-weight:700;color:#f59e0b;">Skor Kelayakan: ${f.overallScore}/100</div>
        <div style="font-size:14px;color:#92400e;margin-top:2px;">Data terbatas (fallback) — Berdasarkan Dukcapil demografi</div></div>
      </div></div>`;
    // Show parameter scores from fallback
    html += `<div class="pp-section"><h4>🎯 Skor Per Parameter (Fallback)</h4>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:8px;">`;
    const paramIcons = {"Aksesibilitas":"🚗","Visibilitas":"👁️","Demografi":"👶","Kompetitor":"🏢","Fasilitas & Lingkungan":"🏫","Potensi Promosi":"📣","History Kegiatan":"📱"};
    for (const param of f.parameters || []) {
      const score = f.parameterScores?.[param] || 0;
      const color = getScoreColor(score);
      const icon = paramIcons[param] || "📊";
      html += `<div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;border-left:4px solid ${color};background:white;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;">${icon} ${escapeHtml(param)}</span>
          <span style="font-weight:700;color:${color};">${score}</span></div>
        <div style="width:100%;height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:6px;">
          <div style="width:${score}%;height:100%;background:${color};border-radius:999px;"></div></div>
        <div style="font-size:12px;color:#92400e;margin-top:4px;">Data Dukcapil only</div></div>`;
    }
    html += `</div></div>`;
    // Show market estimation
    if (mkt.tam || mkt.sam || mkt.som) {
      html += `<div class="pp-section"><h4>📊 Estimasi Market (Dukcapil)</h4><div class="pp-metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">`;
      [{l:"TAM",v:formatNumber(mkt.tam),c:"#1d4ed8"},{l:"SAM",v:formatNumber(mkt.sam),c:"#2563eb"},{l:"SOM",v:formatNumber(mkt.som),c:"#3b82f6"},{l:"Market Size",v:formatCurrency(mkt.marketSize),c:"#0f766e"}].forEach(c=>{if(c.v&&c.v!="Rp -"&&c.v!="-"){html+=`<div class="pp-metric-card" style="border-left:4px solid ${c.c};"><div class="metric-label">${escapeHtml(c.l)}</div><div class="metric-value" style="color:${c.c};">${escapeHtml(c.v)}</div></div>`;}});
      html += `</div></div>`;
    }
    // Show demography
    if (demo.population) {
      html += `<div class="pp-section"><h4>👶 Data Demografi (Dukcapil)</h4><table class="narrative-table narrative-table-compact"><tbody>`;
      html += `<tr><th>Jumlah Penduduk</th><td>${formatNumber(demo.population)} jiwa</td></tr>`;
      html += `<tr><th>Anak Usia 0-14</th><td>${formatNumber(demo.age_0_14)}</td></tr>`;
      html += `<tr><th>Estimasi Usia 2-7</th><td>${formatNumber(demo.earlyChildhood)} anak</td></tr>`;
      html += `</tbody></table></div>`;
    }
    feasibilityResultsEl.innerHTML = html;
    return;
  }

  const f = result.feasibility;
  const loc = result.location || {};
  const demo = result.demography || {};
  const mkt = result.marketEstimation || {};

  let html = "";

  // ── Overall Score Badge ──
  const overallColor = getScoreColor(f.overallScore);
  const overallGrade = getScoreGrade(f.overallScore);
  const overallLabel = getScoreLabel(f.overallScore);
  html += `<div class="feasibility-overall-score" style="border-left:5px solid ${overallColor};background:${overallColor}08;padding:16px 20px;border-radius:10px;margin-bottom:16px;">`;
  html += `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">`;
  html += `<div style="font-size:48px;font-weight:800;color:${overallColor};line-height:1;">${overallGrade}</div>`;
  html += `<div><div style="font-size:22px;font-weight:700;color:${overallColor};">Skor Kelayakan: ${f.overallScore}/100</div>`;
  html += `<div style="font-size:14px;color:#64748b;margin-top:2px;">Penilaian: ${overallLabel} — Berdasarkan ${f.totalSources || 0} sumber riset dari ${f.parameters?.length || 0} parameter</div>`;
  html += `</div></div></div>`;

  // ── Kelurahan List ──
  if (loc.kelurahanList?.length) {
    html += `<div class="pp-section"><h4>🗺️ Kelurahan dalam Radius 3 KM</h4>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">`;
    loc.kelurahanList.forEach(k => {
      html += `<span style="display:inline-block;padding:4px 10px;background:#f1f5f9;border-radius:6px;font-size:0.85rem;border:1px solid #e2e8f0;">${escapeHtml(k.name)}<span style="color:#94a3b8;font-size:0.75rem;">, ${escapeHtml(k.city)}</span></span>`;
    });
    html += `</div></div>`;
  }

  // ── Market Estimation ──
  html += `<div class="pp-section"><h4>📊 Estimasi Market</h4>`;
  html += `<div class="pp-metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">`;
  const mktCards = [
    { label: "TAM (Anak Usia Dini)", value: formatNumber(mkt.tam), color: "#1d4ed8" },
    { label: "SAM (Target 15%)", value: formatNumber(mkt.sam), color: "#2563eb" },
    { label: "SOM (Target 5%)", value: formatNumber(mkt.som), color: "#3b82f6" },
    { label: "Market Size", value: formatCurrency(mkt.marketSize), color: "#0f766e" },
    { label: "Harga Jual", value: formatCurrency(mkt.avgPrice) + "/bln", color: "#7c3aed" },
    { label: "Proyeksi Revenue/Tahun", value: formatCurrency(mkt.projectedRevenue), color: "#16a34a" },
  ];
  mktCards.forEach(c => {
    if (c.value && c.value !== "Rp -" && c.value !== "-") {
      html += `<div class="pp-metric-card" style="border-left:4px solid ${c.color};"><div class="metric-label">${escapeHtml(c.label)}</div><div class="metric-value" style="color:${c.color};">${escapeHtml(c.value)}</div></div>`;
    }
  });
  html += `</div>`;
  html += `</div>`;

  // ── Parameter Scores (7 parameters) ──
  html += `<div class="pp-section"><h4>🎯 Skor Per Parameter Riset</h4>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-top:8px;">`;

  const paramIcons = {
    "Aksesibilitas": "🚗",
    "Visibilitas": "👁️",
    "Demografi": "👶",
    "Kompetitor": "🏢",
    "Fasilitas & Lingkungan": "🏫",
    "Potensi Promosi": "📣",
    "History Kegiatan": "📱",
  };

  for (const param of f.parameters || []) {
    const score = f.parameterScores?.[param] || 0;
    const color = getScoreColor(score);
    const grade = getScoreGrade(score);
    const label = getScoreLabel(score);
    const paramData = f.byParameter?.[param] || {};
    const sourceCount = paramData.sourceCount || 0;
    const icon = paramIcons[param] || "📊";

    html += `<div style="padding:12px;border:1px solid #e2e8f0;border-radius:10px;border-left:4px solid ${color};background:white;">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`;
    html += `<span style="font-weight:600;font-size:0.95rem;">${icon} ${escapeHtml(param)}</span>`;
    html += `<span style="font-weight:700;font-size:1.1rem;color:${color};">${grade} ${score}</span>`;
    html += `</div>`;
    html += `<div style="width:100%;height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-bottom:6px;">`;
    html += `<div style="width:${score}%;height:100%;background:${color};border-radius:999px;"></div>`;
    html += `</div>`;
    html += `<div style="font-size:12px;color:#64748b;">${sourceCount} sumber riset ditemukan</div>`;

    // Top sources for this parameter
    const topSources = (paramData.sources || []).slice(0, 3);
    if (topSources.length) {
      html += `<div style="margin-top:8px;">`;
      topSources.forEach(s => {
        if (s.url) {
          html += `<a href="${escapeAttribute(s.url)}" target="_blank" rel="noreferrer" style="display:block;font-size:11px;color:#0b5c55;text-decoration:none;padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;" title="${escapeHtml(s.title)}">${escapeHtml(s.title?.slice(0, 50) || s.url?.slice(0, 50))} →</a>`;
        }
      });
      html += `</div>`;
    }

    html += `</div>`;
  }
  html += `</div></div>`;

  // ── Demografi dari Dukcapil ──
  if (demo.population) {
    html += `<div class="pp-section"><h4>👶 Data Demografi (Dukcapil)</h4>`;
    html += `<table class="narrative-table narrative-table-compact"><tbody>`;
    html += `<tr><th>Jumlah Penduduk</th><td>${formatNumber(demo.population)} jiwa</td></tr>`;
    html += `<tr><th>Anak Usia 0-14</th><td>${formatNumber(demo.age_0_14)} (${demo.population > 0 ? ((demo.age_0_14 / demo.population) * 100).toFixed(1) : 0}%)</td></tr>`;
    html += `<tr><th>Estimasi Usia 2-7</th><td>${formatNumber(demo.earlyChildhood)} anak</td></tr>`;
    html += `<tr><th>Sumber</th><td>${escapeHtml(demo.source || "estimate")}</td></tr>`;
    html += `</tbody></table></div>`;
  }

  // ── Detailed Source References per Parameter ──
  html += `<div class="pp-section"><h4>🔗 Daftar Sumber Referensi</h4>`;
  for (const param of f.parameters || []) {
    const paramData = f.byParameter?.[param] || {};
    const sources = (paramData.sources || []).slice(0, 5);
    if (sources.length) {
      html += `<div style="margin-bottom:12px;">`;
      html += `<div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">${paramIcons[param] || "📊"} ${escapeHtml(param)}</div>`;
      html += `<div class="research-links">`;
      sources.forEach(s => {
        html += `<div class="research-link-card" style="padding:6px 8px;">`;
        if (s.url) {
          html += `<a href="${escapeAttribute(s.url)}" target="_blank" rel="noreferrer" style="color:#0b5c55;text-decoration:none;font-weight:600;font-size:0.85rem;">${escapeHtml(s.title || "Sumber riset")}</a>`;
        } else {
          html += `<span style="font-weight:600;font-size:0.85rem;">${escapeHtml(s.title || "Sumber riset")}</span>`;
        }
        if (s.metrics?.length) {
          html += `<div style="font-size:10px;color:#64748b;margin-top:2px;">${s.metrics.join(" | ")}</div>`;
        }
        html += `</div>`;
      });
      html += `</div></div>`;
    }
  }
  html += `</div>`;

  // ── Metrik Tambahan ──
  if (f.metrics?.length) {
    html += `<div class="pp-section"><h4>📋 Metrik Tambahan</h4>`;
    html += `<div class="pp-metrics-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">`;
    f.metrics.slice(0, 12).forEach(m => {
      const parts = m.text.split(":");
      const label = (parts[0] || "").trim();
      const value = (parts.slice(1).join(":") || "").trim();
      html += `<div class="pp-metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value" style="font-size:0.9rem;">${escapeHtml(value)}</div></div>`;
    });
    html += `</div></div>`;
  }

  feasibilityResultsEl.innerHTML = html;
  notifyAnalysisComplete();
}

async function runFeasibilityStudy(lat, lon, businessInput) {
  const locationContext = {
    subdistrict: districtNameEl.textContent || "",
    city: cityNameEl.textContent || "",
    village: streetNameEl.textContent || "",
    ...(latestAnalysisContext?.locationContext || {}),
  };

  feasibilityLoadingEl.classList.remove("hidden");
  feasibilityResultsEl.innerHTML = "";
  feasibilityStatusEl.textContent = "Meriset...";
  feasibilityLoadingText.textContent = "TinyFish AI sedang menganalisis 7 parameter kelayakan...";
  appendActivityLog("Memulai studi kelayakan cabang baru dengan TinyFish AI...");

  try {
    const response = await fetch(`${API_BASE}/api/feasibility-study`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: lat,
        lon: lon,
        locationContext,
        businessType: businessInput.businessType,
        businessDetail: businessInput.businessDetail,
        sellingPrice: businessInput.sellingPrice,
        areaCoverage: latestAnalysisContext?.areaCoverage || [],
        crawledPois: latestAnalysisContext?.crawledPois || latestBasePois,
      }),
    });

    const data = await response.json();
    if (data.error) {
      feasibilityStatusEl.textContent = "Error";
      feasibilityResultsEl.innerHTML = `<p style="color:#dc2626;">Gagal: ${escapeHtml(data.error)}</p>`;
      appendActivityLog(`Error studi kelayakan: ${data.error}`, "error");
      return;
    }

    latestFeasibilityResult = data;
    renderFeasibilityInputSummary(data.input || {});
    renderFeasibilityResults(data);

    const elapsed = data.meta?.elapsed_ms || 0;
    feasibilityStatusEl.textContent = `Skor: ${data.feasibility?.overallScore || 0}/100 (${(elapsed / 1000).toFixed(1)}s)`;
    feasibilityStatusEl.style.background = getScoreColor(data.feasibility?.overallScore || 0) + "15";
    feasibilityStatusEl.style.color = getScoreColor(data.feasibility?.overallScore || 0);
    appendActivityLog(`Studi kelayakan selesai: skor ${data.feasibility?.overallScore || 0}/100 dari ${data.feasibility?.totalSources || 0} sumber.`, "success");
  } catch (error) {
    feasibilityStatusEl.textContent = "Error";
    feasibilityResultsEl.innerHTML = `<p style="color:#dc2626;">Gagal menjalankan studi kelayakan: ${escapeHtml(error.message)}</p>`;
    appendActivityLog(`Error studi kelayakan: ${error.message}`, "error");
  } finally {
    feasibilityLoadingEl.classList.add("hidden");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const radius = 3000;

  try {
    const { lat, lon } = parseCoordinates(coordinatesInput.value);

    // Pindahkan peta langsung ke koordinat yang dimasukkan
    ensureMapLayers();
    const mbMap = getMaplibreMap();
    if (mbMap) {
      mbMap.setCenter([lon, lat]);
      mbMap.setZoom(15);
      if (window.updateRadiusCircle) {
        window.updateRadiusCircle(lat, lon, radius / 1000);
      } else {
        addRadiusCircleLocal(lat, lon, radius / 1000);
      }
    }

    activityLogEl.innerHTML = "";
    await analyzeLocation(lat, lon, radius);
    if (latestAnalysisContext && latestAnalysisFallbackContext) {
      await runUnifiedAnalysis();
    }

    // Run feasibility study if business inputs are provided
    const businessType = document.getElementById("business-type")?.value || "";
    const businessDetail = document.getElementById("business-detail")?.value || "";
    const sellingPrice = document.getElementById("selling-price")?.value || "";
    if (businessType || businessDetail) {
      await runFeasibilityStudy(lat, lon, { businessType, businessDetail, sellingPrice });
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Terjadi kegagalan saat analisa lokasi.", true);
    appendActivityLog(error.message || "Terjadi kegagalan saat analisa lokasi.", "error");
    setLoadingState(false);
    isProcessing = false;
    activeController = null;
    syncActionButtons();
  }
});

downloadPdfBtn.addEventListener("click", () => {
  downloadPdfReport();
});

if (downloadPoiXlsBtn) {
  downloadPoiXlsBtn.addEventListener("click", downloadPoiXls);
}

if (resultsPrevBtn) {
  resultsPrevBtn.addEventListener("click", () => {
    renderResultsPage(currentResultsPage - 1);
  });
}

if (resultsNextBtn) {
  resultsNextBtn.addEventListener("click", () => {
    renderResultsPage(currentResultsPage + 1);
  });
}

if (unifiedAnalysisBtn) {
  unifiedAnalysisBtn.addEventListener("click", () => {
    runUnifiedAnalysis();
  });
}

// Instagram Locations
const instagramLocationsBtn = document.getElementById("instagram-locations-button");
const instagramStatusEl = document.getElementById("ig-layer-status") || document.getElementById("instagram-status");
const instagramLoadingEl = document.getElementById("instagram-loading");
const instagramResultsEl = document.getElementById("ig-search-results") || document.getElementById("instagram-results");
const instagramCookieInput = document.getElementById("ig-cookies-input");
const instagramSearchModeInput = document.getElementById("ig-search-mode");
const instagramGridRadiusInput = document.getElementById("ig-grid-radius");
const instagramGridStepInput = document.getElementById("ig-grid-step");
const instagramCustomCoordsInput = document.getElementById("ig-custom-coords-input");

let latestInstagramLocations = [];

function syncIgCoordsDisplay() {
  const display = document.getElementById("ig-current-coords-display");
  const mainCoords = (coordinatesInput?.value || "").trim();
  if (display) {
    display.textContent = mainCoords || "-";
  }
}

function buildInstagramLocationFeatures(items = []) {
  return items
    .filter((loc) => loc && loc.lat && loc.lng)
    .map((loc) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loc.lng, loc.lat] },
      properties: {
        name: loc.name,
        address: loc.address || "",
        url: loc.url || "#",
        lat: loc.lat,
        lng: loc.lng,
      },
    }));
}

function ensureInstagramLayer(items = []) {
  const mbMap = getMaplibreMap();
  if (!mbMap) return false;

  const igSourceId = "ig-locations-source";
  const igLayerId = "ig-locations-layer";
  const featureCollection = {
    type: "FeatureCollection",
    features: buildInstagramLocationFeatures(items),
  };

  if (!mbMap.getSource(igSourceId)) {
    mbMap.addSource(igSourceId, {
      type: "geojson",
      data: featureCollection,
    });
  } else {
    mbMap.getSource(igSourceId).setData(featureCollection);
  }

  if (!mbMap.getLayer(igLayerId)) {
    mbMap.addLayer({
      id: igLayerId,
      type: "circle",
      source: igSourceId,
      paint: {
        "circle-radius": 6,
        "circle-color": "#E1306C",
        "circle-opacity": 0.8,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#C13584",
      },
    });

    mbMap.on("click", igLayerId, (e) => {
      if (!e.features || !e.features.length) return;
      const feature = e.features[0];
      const props = feature.properties;

      new maplibregl.Popup({ maxWidth: 260, closeOnClick: true, autoClose: true })
        .setLngLat([props.lng, props.lat])
        .setHTML(`
          <div style="font-family:system-ui;font-size:13px;max-width:260px;">
            <strong style="color:#E1306C;">${escapeHtml(props.name)}</strong><br>
            <span style="color:#666;">${escapeHtml(props.address)}</span><br>
            <a href="${escapeAttribute(props.url)}" target="_blank" rel="noopener" style="color:#405DE6;">Buka di Instagram →</a>
          </div>
        `)
        .addTo(mbMap);
    });

    mbMap.on("mouseenter", igLayerId, () => {
      if (mbMap) mbMap.getCanvas().style.cursor = "pointer";
    });
    mbMap.on("mouseleave", igLayerId, () => {
      if (mbMap) mbMap.getCanvas().style.cursor = "";
    });
  }

  setLayerVisibility(igLayerId, instagramLayerEnabled);

  try {
    mbMap.moveLayer(igLayerId);
  } catch (e) {}

  syncInstagramToggleUi();
  return true;
}

syncPoiToggleUi();
syncInstagramToggleUi();

async function handleGetAutoCookie() {
  setStatus("Mengambil cookie Instagram via browser Chrome...");
  appendActivityLog("Membuka browser Chrome / mengambil cookie Instagram...");
  if (instagramStatusEl) instagramStatusEl.textContent = "Ambil cookie...";

  try {
    const response = await fetch(`${API_BASE}/api/instagram-get-cookie`);
    const data = await response.json().catch(() => ({}));
    if (data && data.success && data.cookie) {
      if (instagramCookieInput) {
        instagramCookieInput.value = data.cookie;
      }
      if (instagramStatusEl) instagramStatusEl.textContent = "Cookie Siap";
      setStatus("Cookie Instagram berhasil diambil!", false);
      appendActivityLog("Cookie Instagram (sessionid) berhasil didapatkan dari browser.", "success");
    } else {
      if (instagramStatusEl) instagramStatusEl.textContent = "Gagal Cookie";
      const errMsg = data.error || "Gagal mengambil cookie. Pastikan sudah login di Chrome.";
      setStatus(errMsg, true);
      appendActivityLog(errMsg, "error");
    }
  } catch (err) {
    if (instagramStatusEl) instagramStatusEl.textContent = "Error Cookie";
    setStatus(`Gagal mengambil cookie: ${err.message}`, true);
    appendActivityLog(`Gagal mengambil cookie: ${err.message}`, "error");
  }
}

function clearIgCookie() {
  if (instagramCookieInput) {
    instagramCookieInput.value = "";
  }
  if (instagramStatusEl) instagramStatusEl.textContent = "Cookie Dihapus";
  setStatus("Cookie Instagram telah dihapus.");
  appendActivityLog("Cookie Instagram dihapus.", "success");
}

function handleInstagramSearch(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }
  fetchInstagramLocations();
}

window.handleInstagramSearch = handleInstagramSearch;
window.handleGetAutoCookie = handleGetAutoCookie;
window.clearIgCookie = clearIgCookie;

async function fetchInstagramLocations() {
  const mbMap = getMaplibreMap();
  const customCoords = (instagramCustomCoordsInput?.value || "").trim();
  const mainCoords = (coordinatesInput?.value || "").trim();
  const coordsText = customCoords || mainCoords;

  if (!coordsText) {
    setStatus("Isi koordinat lokasi terlebih dahulu.", true);
    appendActivityLog("Koordinat lokasi belum diisi.", "error");
    if (instagramResultsEl) {
      instagramResultsEl.innerHTML = `<p class="error-text">Koordinat lokasi belum diisi. Masukkan koordinat di Input Lokasi atau di kolom koordinat target area.</p>`;
    }
    return;
  }

  let lat;
  let lon;
  try {
    const parsed = parseCoordinates(coordsText);
    lat = parsed.lat;
    lon = parsed.lon;
  } catch (error) {
    setStatus(error.message || "Koordinat tidak valid.", true);
    appendActivityLog(error.message || "Koordinat tidak valid.", "error");
    if (instagramResultsEl) {
      instagramResultsEl.innerHTML = `<p class="error-text">${escapeHtml(error.message || "Koordinat tidak valid.")}</p>`;
    }
    return;
  }

  if (instagramLoadingEl) instagramLoadingEl.classList.remove("hidden");
  if (instagramResultsEl) {
    instagramResultsEl.innerHTML = `<div style="padding:16px; text-align:center; color:#00f0ff;"><div class="spinner" style="margin:0 auto 10px;"></div>Mencari lokasi Instagram...</div>`;
  }
  if (instagramStatusEl) instagramStatusEl.textContent = "Mencari...";
  appendActivityLog(`Memulai pencarian Instagram lokasi pada koordinat ${lat}, ${lon}...`);

  try {
    let cookie = instagramCookieInput ? instagramCookieInput.value.trim() : "";
    if (!cookie) {
      if (instagramStatusEl) instagramStatusEl.textContent = "Ambil cookie...";
      appendActivityLog("Mencoba mengambil cookie Instagram via browser...");
      const cookieResponse = await fetch(`${API_BASE}/api/instagram-get-cookie`);
      const cookieData = await cookieResponse.json().catch(() => ({}));
      if (cookieData && cookieData.cookie) {
        cookie = cookieData.cookie;
        if (instagramCookieInput) {
          instagramCookieInput.value = cookie;
        }
        appendActivityLog("Cookie Instagram berhasil diambil dari browser.", "success");
      }
    }

    if (!cookie) {
      if (instagramStatusEl) instagramStatusEl.textContent = "Cookie Kosong";
      if (instagramResultsEl) {
        instagramResultsEl.innerHTML = `<p class="error-text">Cookie Instagram tidak ditemukan. Klik <strong>Auto-get Cookie via Browser</strong> di atas untuk login ke Instagram & mengambil cookie otomatis.</p>`;
      }
      appendActivityLog("Cookie Instagram tidak ditemukan.", "error");
      return;
    }

    if (mbMap) {
      mbMap.setCenter([lon, lat]);
      mbMap.setZoom(15);
      if (window.updateRadiusCircle) {
        window.updateRadiusCircle(lat, lon, 3);
      } else {
        addRadiusCircleLocal(lat, lon, 3);
      }
    }

    const selectedMode = instagramSearchModeInput ? instagramSearchModeInput.value : "normal";
    const radiusKm = instagramGridRadiusInput ? (parseFloat(instagramGridRadiusInput.value) || 3.0) : 3.0;
    const stepM = instagramGridStepInput ? (parseFloat(instagramGridStepInput.value) || 200) : 200;

    if (instagramStatusEl) instagramStatusEl.textContent = `Mencari (${selectedMode})...`;

    const response = await fetch(`${API_BASE}/api/instagram-locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lon,
        cookie,
        search_mode: selectedMode,
        radius_km: radiusKm,
        step_m: stepM,
      }),
    });

    const data = await response.json().catch((e) => ({ error: "Respon server tidak valid: " + e.message }));

    if (data.error) {
      if (instagramStatusEl) instagramStatusEl.textContent = "Error";
      if (instagramResultsEl) {
        instagramResultsEl.innerHTML = `<p class="error-text">${escapeHtml(data.error)}</p>`;
      }
      appendActivityLog(`Error Instagram: ${data.error}`, "error");
      return;
    }

    const items = data.items || data.data || [];
    latestInstagramLocations = items;
    if (instagramStatusEl) instagramStatusEl.textContent = `${items.length} lokasi`;

    setInstagramLayerVisible(true);
    if (!ensureInstagramLayer(items)) {
      waitForMap(() => ensureInstagramLayer(items));
    }

    appendActivityLog(`Instagram lokasi: ${items.length} titik dimuat.`, "success");

    if (instagramResultsEl) {
      if (items.length === 0) {
        instagramResultsEl.innerHTML = `<div style="padding:16px; text-align:center; color:#94a3b8; font-size:0.85rem; background:rgba(30,41,59,0.4); border-radius:10px; border:1px dashed rgba(255,255,255,0.15);">Tidak ditemukan Instagram lokasi di sekitar area ini. Coba pilih mode pencarian <strong>Fuzzy Search</strong> atau <strong>Perumahan Search</strong>.</div>`;
      } else {
        instagramResultsEl.innerHTML = `
          <div style="font-size:0.8rem; font-weight:700; color:#00f0ff; margin-bottom:8px;">Terdeteksi ${items.length} Lokasi Instagram:</div>
          <div style="max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
            ${items
              .slice(0, 30)
              .map(
                (loc) => `
                <div class="instagram-result-item" style="background:rgba(15,23,42,0.8); border:1px solid rgba(56,189,248,0.2); border-radius:8px; padding:10px;">
                  <div class="ig-result-name" style="font-weight:700; color:#f8fafc; font-size:0.85rem;">📍 ${escapeHtml(loc.name || "Instagram Location")}</div>
                  <div class="ig-result-address" style="font-size:0.75rem; color:#94a3b8; margin:2px 0 6px;">${escapeHtml(loc.address || "-")}</div>
                  ${loc.url ? `<a href="${escapeAttribute(loc.url)}" target="_blank" rel="noopener" class="ig-result-link" style="font-size:0.75rem; color:#00f0ff; text-decoration:underline;">Lihat di Instagram ↗</a>` : ''}
                </div>
              `
              )
              .join("")}
          </div>
        `;
      }
    }

    appendActivityLog(`Ditemukan ${items.length} Instagram lokasi.`, "success");
  } catch (error) {
    if (instagramStatusEl) instagramStatusEl.textContent = "Error";
    if (instagramResultsEl) {
      instagramResultsEl.innerHTML = `<p class="error-text">Gagal mengambil data: ${escapeHtml(error.message)}</p>`;
    }
    appendActivityLog(`Error Instagram: ${error.message}`, "error");
  } finally {
    if (instagramLoadingEl) instagramLoadingEl.classList.add("hidden");
  }
}

if (instagramLocationsBtn) {
  instagramLocationsBtn.disabled = false;
  instagramLocationsBtn.addEventListener("click", () => {
    fetchInstagramLocations();
  });
}

// Tab switching
document.querySelectorAll(".tinyfish-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tinyfish-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tinyfish-tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    const targetId = tab.getAttribute("data-tab");
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add("active");
  });
});

cancelProcessBtn.addEventListener("click", () => {
  if (!activeController) {
    return;
  }

  appendActivityLog("Permintaan pembatalan dikirim. Menunggu request aktif berhenti.", "error");
  activeController.abort();
});

useMyLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Browser ini tidak mendukung geolocation.", true);
    return;
  }

  setStatus("Meminta koordinat dari browser...");
  appendActivityLog("Meminta izin lokasi dari browser.");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      coordinatesInput.value = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
      coordinatesInput.dispatchEvent(new Event("input", { bubbles: true }));
      coordinatesInput.dispatchEvent(new Event("change", { bubbles: true }));
      setStatus("Koordinat berhasil diambil dari browser.");
      appendActivityLog("Koordinat berhasil diambil dari browser.", "success");
    },
    () => {
      setStatus("Izin lokasi ditolak atau gagal diambil.", true);
      appendActivityLog("Izin lokasi ditolak atau gagal diambil.", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
    },
  );
});

// ==============================================
// DEMOGRAPHY POLYGON LAYER
// ==============================================
// demographyLayer: now managed via Maplibre GeoJSON source (see renderDemographyLayer)
let demographySourceAdded = false;
let demographyVisible = false;
let demographyData = null;
let demographyCurrentProvince = "";
let demographyAbortController = null;
let demographyUserSelected = false;
let allDemographyFeatures = [];
let loadedProvinces = new Set();
let selectedKota = new Set();
let selectedKecamatan = new Set();
const demographyToggleEl = document.getElementById("demography-toggle");
const demographyStatusEl = document.getElementById("demography-status");
const demoCountEl = document.getElementById("demo-count");
const demoKidsEl = document.getElementById("demo-kids");
const demographyInfoPanel = document.getElementById("demography-info-panel");
const demoInfoCloseEl = document.getElementById("demo-info-close");
const demoProvinceEl = document.getElementById("demo-province-select");

function getDemographyColor(u0) {
  // Blue: <1000, Orange: 1001-2000, Red: >2000
  if (u0 < 1000) return "#3b82f6";
  if (u0 <= 2000) return "#f97316";
  return "#ef4444";
}

function formatDemoNum(n) {
  if (n == null) return "—";
  return n.toLocaleString("id-ID");
}

function getProvinceFromCoords(lat, lon) {
  // Sumatera
  if (lat > 5.0 && lon > 95.0 && lon < 99.0) return "ACEH";
  if (lat > 1.0 && lat < 5.5 && lon > 98.0 && lon < 100.5) return "SUMATERA UTARA";
  if (lat > -1.5 && lat < 1.5 && lon > 99.0 && lon < 102.0) return "SUMATERA BARAT";
  if (lat > -1.0 && lat < 4.5 && lon > 101.0 && lon < 105.5) return "RIAU";
  if (lat > -6.0 && lat < -1.0 && lon > 103.0 && lon < 106.5) return "SUMATERA SELATAN";
  if (lat > -5.5 && lat < -1.5 && lon > 104.0 && lon < 106.0) return "LAMPUNG";
  if (lat > 2.0 && lat < 5.0 && lon > 96.0 && lon < 99.5) return "NANGGROE ACEH DARUSSALAM";
  if (lat > -3.0 && lat < 4.0 && lon > 105.0 && lon < 109.0) return "BENGKULU";
  if (lat > -0.5 && lat < 3.5 && lon > 108.0 && lon < 112.0) return "KEPULAUAN RIAU";
  // Jawa
  if (lat > -7.0 && lat < -5.9 && lon > 106.3 && lon < 107.1) return "DKI JAKARTA";
  if (lat > -7.0 && lat < -5.8 && lon > 105.0 && lon < 107.0) return "BANTEN";
  if (lat > -8.0 && lat < -6.0 && lon > 106.0 && lon < 108.5) return "JAWA BARAT";
  if (lat > -8.3 && lat < -7.5 && lon > 110.0 && lon < 110.6) return "YOGYAKARTA";
  if (lat > -8.5 && lat < -6.5 && lon > 108.5 && lon < 112.0) return "JAWA TENGAH";
  if (lat > -8.5 && lat < -7.0 && lon > 111.0 && lon < 114.5) return "JAWA TIMUR";
  // Bali & Nusa Tenggara
  if (lat > -9.0 && lat < -7.5 && lon > 114.4 && lon < 116.5) return "BALI";
  if (lat > -10.5 && lat < -8.0 && lon > 115.5 && lon < 119.5) return "NUSA TENGGARA BARAT";
  if (lat > -10.5 && lat < -8.0 && lon > 119.5 && lon < 125.0) return "NUSA TENGGARA TIMUR";
  // Kalimantan
  if (lat > 2.0 && lat < 8.0 && lon > 108.5 && lon < 118.0) return "KALIMANTAN BARAT";
  if (lat > -5.0 && lat < 2.5 && lon > 114.0 && lon < 118.0) return "KALIMANTAN SELATAN";
  if (lat > -2.0 && lat < 5.0 && lon > 115.5 && lon < 119.5) return "KALIMANTAN TIMUR";
  if (lat > -5.0 && lat < 2.0 && lon > 115.5 && lon < 118.5) return "KALIMANTAN TENGAH";
  // Sulawesi
  if (lat > 1.0 && lat < 6.0 && lon > 119.0 && lon < 125.5) return "SULAWESI UTARA";
  if (lat > -6.0 && lat < 0 && lon > 119.0 && lon < 124.0) return "SULAWESI SELATAN";
  if (lat > -2.0 && lat < 2.0 && lon > 120.0 && lon < 125.0) return "SULAWESI TENGAH";
  if (lat > -6.0 && lat < -1.0 && lon > 121.0 && lon < 125.0) return "SULAWESI TENGGARA";
  if (lat > 1.0 && lat < 4.0 && lon > 124.0 && lon < 128.0) return "MALUKU UTARA";
  if (lat > -9.0 && lat < -1.5 && lon > 124.0 && lon < 132.0) return "MALUKU";
  // Papua
  if (lat > -9.0 && lat < 0 && lon > 127.0 && lon < 142.0) return "PAPUA";
  if (lat > -9.0 && lat < -1.0 && lon > 140.0 && lon < 142.0) return "PAPUA";
  // Fallback
  return "";
}

async function loadDemographyPolygons(forceProvince, options = {}) {
  const province = forceProvince || (demoProvinceEl ? demoProvinceEl.value : "");
  if (!province) {
    if (demographyStatusEl) demographyStatusEl.textContent = "Pilih provinsi";
    return;
  }

  // Avoid reload if province already loaded
  if (loadedProvinces.has(province) && !options.force) {
    if (demographyStatusEl) demographyStatusEl.textContent = "Sudah dimuat";
    return;
  }

  // Cancel previous in-flight request
  if (demographyAbortController) {
    demographyAbortController.abort();
  }
  const controller = new AbortController();
  demographyAbortController = controller;

  if (demographyStatusEl) demographyStatusEl.textContent = "Memuat...";
  demographyCurrentProvince = province;

  try {
    const response = await fetch(`/api/demography-polygons?province=${encodeURIComponent(province)}&level=${getDemoLevel()}&limit=5000`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    // Only render if this is still the active request
    if (controller.signal.aborted) return;

    const features = data.features || [];
    loadedProvinces.add(province);
    allDemographyFeatures = allDemographyFeatures.concat(features);

    const kotaInProvince = new Set(features.map(f => f.properties.nama_kab).filter(Boolean));
    kotaInProvince.forEach(k => selectedKota.add(k));
    const kecInProvince = new Set(features.map(f => f.properties.nama_kec).filter(Boolean));
    kecInProvince.forEach(k => selectedKecamatan.add(k));

    rebuildChecklists();
    filterAndRenderDemography();
    renderLoadedProvinceTags();

    if (demographyStatusEl) demographyStatusEl.textContent = "Aktif";
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("DEMOGRAPHY: Gagal memuat polygon:", error.message);
    if (demographyStatusEl) demographyStatusEl.textContent = "Error";
    demographyCurrentProvince = "";
  }
}

function renderDemographyLayer(features) {
  const mbMap = getMaplibreMap();
  if (!mbMap) {
    waitForMap(() => renderDemographyLayer(features));
    return;
  }

  // Remove existing demography layers
  try {
    mbMap.removeLayer('demography-fill');
    mbMap.removeSource('demography-source');
    mbMap.removeLayer('demography-outline');
  } catch (e) {}

  if (features.length === 0) return;

  // Create GeoJSON source
  mbMap.addSource('demography-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });

  // Add fill layer
  mbMap.addLayer({
    id: 'demography-fill',
    type: 'fill',
    source: 'demography-source',
    paint: {
      'fill-color': [
        'case',
        ['==', ['get', 'u0'], 0], '#1a1a2e',
        ['>=', ['get', 'u0'], 5000], '#ef4444',
        ['>=', ['get', 'u0'], 3000], '#f97316',
        ['>=', ['get', 'u0'], 1500], '#eab308',
        ['>=', ['get', 'u0'], 500], '#3b82f6',
        '#0f766e',
      ],
      'fill-opacity': 0.45,
      'fill-outline-color': '#475569',
    },
    layout: { visibility: 'none' },
  });

  // Add outline layer
  mbMap.addLayer({
    id: 'demography-outline',
    type: 'line',
    source: 'demography-source',
    paint: {
      'line-color': '#475569',
      'line-width': 1.5,
    },
    layout: { visibility: 'none' },
  });

  // Click handler untuk demography polygon
  mbMap.on('click', 'demography-fill', (e) => {
    if (!e.features || !e.features.length) return;
    const feature = e.features[0];
    const p = feature.properties;
    
    const lhr = (p.lhr_2021||0)+(p.lhr_2022||0)+(p.lhr_2023||0)+(p.lhr_2024||0);
    const s = 'font-family:system-ui,sans-serif;font-size:11px;line-height:1.4;color:#e2e8f0;';
    const html = '<div style="' + s + 'padding:8px 10px;min-width:150px;">'
      + '<div style="font-weight:700;font-size:12px;color:#38bdf8;margin-bottom:2px;">' + (p.nama_kel || p.nama_kec || '-') + '</div>'
      + '<div style="font-size:9px;color:#94a3b8;margin-bottom:5px;">' + (p.nama_kec||'') + ', ' + (p.nama_kab||'') + '</div>'
      + '<div style="border-top:1px solid #334155;padding-top:4px;">'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">Penduduk</span><span style="font-weight:600;">' + formatDemoNum(p.jumlah_penduduk) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">KK</span><span style="font-weight:600;">' + formatDemoNum(p.jumlah_kk) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">L / P</span><span style="font-weight:600;">' + formatDemoNum(p.pria) + ' / ' + formatDemoNum(p.wanita) + '</span></div>'
      + '</div>'
      + '<div style="border-top:1px solid #334155;padding-top:4px;margin-top:4px;">'
      + '<div style="font-weight:700;font-size:9px;color:#38bdf8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Usia Dini</div>'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">0–4 th</span><span style="font-weight:600;">' + formatDemoNum(p.u0) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">5–9 th</span><span style="font-weight:600;">' + formatDemoNum(p.u5) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">10–14 th</span><span style="font-weight:600;">' + formatDemoNum(p.u10) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;margin:1px 0;"><span style="color:#94a3b8;">Lahir 21–24</span><span style="font-weight:600;">' + formatDemoNum(lhr) + '</span></div>'
      + '</div>'
      + '<div style="border-top:1px solid #334155;padding-top:4px;margin-top:4px;">'
      + '<div style="display:flex;justify-content:space-between;"><span style="font-weight:700;font-size:12px;color:#f97316;">Total Anak</span><span style="font-weight:700;font-size:12px;color:#f97316;">' + formatDemoNum(p.total_anak) + '</span></div>'
      + '</div></div>';
    
    new maplibregl.Popup({ maxWidth: 200, maxHeight: 240, autoPan: true })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(mbMap);
  });

  // Hover
  mbMap.on('mouseenter', 'demography-fill', () => {
    if (mbMap) mbMap.getCanvas().style.cursor = 'pointer';
  });
  mbMap.on('mouseleave', 'demography-fill', () => {
    if (mbMap) mbMap.getCanvas().style.cursor = '';
  });

  if (demographyVisible) {
    mbMap.setLayoutProperty('demography-fill', 'visibility', 'visible');
    mbMap.setLayoutProperty('demography-outline', 'visibility', 'visible');
    // Bring demography layer di atas POI markers
    try {
      mbMap.moveLayer('demography-fill');
      mbMap.moveLayer('demography-outline');
    } catch (e) {}
  }

  // Bring POI markers, branch layer, dan radius circle di atas
  const mbMap2 = getMaplibreMap();
  if (mbMap2) {
    try {
      mbMap2.moveLayer('poi-markers-layer');
      if (branchVisible) mbMap.moveLayer('branch-markers');
    } catch (e) {}
  }
}

function showDemographyInfo(props) {
  function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  setTxt("demo-info-title", props.nama_kel || props.nama_kec || "—");
  setTxt("demo-info-sub", `${props.nama_kec || ""}, ${props.nama_kab || ""}, ${props.nama_prop || ""}`);
  setTxt("demo-info-pop", formatDemoNum(props.jumlah_penduduk));
  setTxt("demo-info-kk", formatDemoNum(props.jumlah_kk));
  setTxt("demo-info-gender", `${formatDemoNum(props.pria)} / ${formatDemoNum(props.wanita)}`);
  setTxt("demo-info-u0", formatDemoNum(props.u0));
  setTxt("demo-info-u5", formatDemoNum(props.u5));
  setTxt("demo-info-u10", formatDemoNum(props.u10));
  setTxt("demo-info-lhr2021", formatDemoNum(props.lhr_2021));
  setTxt("demo-info-lhr2022", formatDemoNum(props.lhr_2022));
  setTxt("demo-info-lhr2023", formatDemoNum(props.lhr_2023));
  setTxt("demo-info-lhr2024", formatDemoNum(props.lhr_2024));
  setTxt("demo-info-early", formatDemoNum(props.total_anak));
  if (demographyInfoPanel) demographyInfoPanel.classList.remove("hidden");
}

function updateDemographyStats(features) {
  let totalAnak = 0;
  features.forEach(f => { totalAnak += f.properties.total_anak || 0; });
  if (demoCountEl) demoCountEl.textContent = features.length;
  if (demoKidsEl) demoKidsEl.textContent = formatDemoNum(totalAnak);
}

// ── Kota + Kecamatan Checklist (3-level hierarchy) ──
const kotaChecklistEl = document.getElementById("kota-checklist");
const kotaSelectAllEl = document.getElementById("kota-select-all");
const kotaDeselectAllEl = document.getElementById("kota-deselect-all");
const kecamatanChecklistEl = document.getElementById("kecamatan-checklist");
const kecSelectAllEl = document.getElementById("kec-select-all");
const kecDeselectAllEl = document.getElementById("kec-deselect-all");
const addProvinceBtnEl = document.getElementById("demo-add-province");
const loadedProvincesEl = document.getElementById("loaded-provinces");
const demoLevelEl = document.getElementById("demo-level-select");
function getDemoLevel() { return demoLevelEl ? demoLevelEl.value : "kelurahan"; }

// ── Render loaded province tags ──
function renderLoadedProvinceTags() {
  if (!loadedProvincesEl) return;
  loadedProvincesEl.innerHTML = "";
  if (loadedProvinces.size === 0) {
    loadedProvincesEl.style.display = "none";
    return;
  }
  loadedProvincesEl.style.display = "";
  loadedProvinces.forEach(prov => {
    const tag = document.createElement("span");
    tag.className = "loaded-province-tag";
    tag.innerHTML = `${escapeHtml(prov)} <button class="tag-remove" data-prov="${escapeAttribute(prov)}" title="Hapus ${escapeHtml(prov)}">✕</button>`;
    tag.querySelector(".tag-remove").addEventListener("click", () => {
      removeProvince(prov);
    });
    loadedProvincesEl.appendChild(tag);
  });
}

// ── Add a province to the master list ──
let skipToggleHandler = false;
async function addProvince(province) {
  if (!province) return;
  if (loadedProvinces.has(province)) {
    if (demographyStatusEl) demographyStatusEl.textContent = "Sudah dimuat";
    return;
  }

  if (demographyStatusEl) demographyStatusEl.textContent = `Memuat ${province}...`;

  // Cancel previous request
  if (demographyAbortController) {
    demographyAbortController.abort();
  }
  const controller = new AbortController();
  demographyAbortController = controller;

  try {
    const response = await fetch(`/api/demography-polygons?province=${encodeURIComponent(province)}&level=${getDemoLevel()}&limit=5000`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (controller.signal.aborted) return;

    const features = data.features || [];
    if (features.length === 0) {
      if (demographyStatusEl) demographyStatusEl.textContent = "Tidak ada data";
      return;
    }

    // Add to master list
    loadedProvinces.add(province);
    allDemographyFeatures = allDemographyFeatures.concat(features);

    // Add all kota from this province as selected
    const kotaInProvince = new Set(features.map(f => f.properties.nama_kab).filter(Boolean));
    kotaInProvince.forEach(k => selectedKota.add(k));

    // Add all kecamatan from this province as selected
    const kecInProvince = new Set(features.map(f => f.properties.nama_kec).filter(Boolean));
    kecInProvince.forEach(k => selectedKecamatan.add(k));

    rebuildChecklists();
    filterAndRenderDemography();
    renderLoadedProvinceTags();

    if (demographyStatusEl) demographyStatusEl.textContent = "Aktif";
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("DEMOGRAPHY: Gagal memuat polygon:", error.message);
    if (demographyStatusEl) demographyStatusEl.textContent = "Error";
  }
}

// ── Remove a province from the master list ──
function removeProvince(province) {
  loadedProvinces.delete(province);
  allDemographyFeatures = allDemographyFeatures.filter(f => f.properties.nama_prop !== province);

  // Rebuild all selected sets from remaining features
  const remainingKotaKeys = new Set(allDemographyFeatures.map(f => `${f.properties.nama_prop}||${f.properties.nama_kab}`));
  const remainingKecKeys = new Set(allDemographyFeatures.map(f => `${f.properties.nama_prop}||${f.properties.nama_kab}||${f.properties.nama_kec}`));
  selectedKota.forEach(k => { if (!remainingKotaKeys.has(k)) selectedKota.delete(k); });
  selectedKecamatan.forEach(k => {
    // Check both kec and kel keys
    const parts = k.split("||");
    if (parts.length === 4) {
      // kelurahan key — check if kelurahan still exists
      if (!allDemographyFeatures.some(f => `${f.properties.nama_prop}||${f.properties.nama_kab}||${f.properties.nama_kec}||${f.properties.nama_kel}` === k)) {
        selectedKecamatan.delete(k);
      }
    } else {
      if (!remainingKecKeys.has(k)) selectedKecamatan.delete(k);
    }
  });

  if (loadedProvinces.size === 0) {
    demographyCurrentProvince = "";
    demographyData = [];
    renderDemographyLayer([]);
    updateDemographyStats([]);
  } else {
    rebuildChecklists();
    filterAndRenderDemography();
  }
  renderLoadedProvinceTags();
}

// ── Build checklists from accumulated features ──
function rebuildChecklists() {
  buildKotaChecklist();
  rebuildKecamatanFromKota();
}

// Build unique kota list from all features
function buildKotaChecklist() {
  if (!kotaChecklistEl) return;
  kotaChecklistEl.innerHTML = "";

  const kotaMap = new Map();
  allDemographyFeatures.forEach(f => {
    const key = `${f.properties.nama_prop}||${f.properties.nama_kab}`;
    const name = f.properties.nama_kab || "Tidak diketahui";
    const prov = f.properties.nama_prop || "";
    if (!kotaMap.has(key)) {
      kotaMap.set(key, { key, name, prov, kids: 0, kecamatan: new Set() });
    }
    const entry = kotaMap.get(key);
    entry.kids += f.properties.total_anak || 0;
    entry.kecamatan.add(f.properties.nama_kec || "");
  });

  // Group by province
  const byProv = new Map();
  Array.from(kotaMap.values()).forEach(kota => {
    if (!byProv.has(kota.prov)) byProv.set(kota.prov, []);
    byProv.get(kota.prov).push(kota);
  });

  if (kotaMap.size === 0) {
    kotaChecklistEl.innerHTML = `<div class="kec-empty">Tambah provinsi terlebih dahulu</div>`;
    return;
  }

  // Render grouped by province
  const sortedProvs = Array.from(byProv.keys()).sort();
  sortedProvs.forEach(prov => {
    const group = byProv.get(prov).sort((a, b) => b.kids - a.kids);

    // Province header
    const header = document.createElement("div");
    header.className = "kec-province-header";
    header.textContent = prov;
    kotaChecklistEl.appendChild(header);

    group.forEach(kota => {
      const item = document.createElement("label");
      item.className = "kec-item";
      const checked = selectedKota.has(kota.key) ? "checked" : "";
      item.innerHTML = `
        <input type="checkbox" ${checked} data-kota="${escapeAttribute(kota.key)}">
        <span>${escapeHtml(kota.name)}</span>
        <span class="kec-kids">${kota.kecamatan.size} kec · ${formatDemoNum(kota.kids)}</span>
      `;
      const checkbox = item.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedKota.add(kota.key);
        } else {
          selectedKota.delete(kota.key);
        }
        rebuildKecamatanFromKota();
        filterAndRenderDemography();
      });
      kotaChecklistEl.appendChild(item);
    });
  });
}

// Rebuild kecamatan/kelurahan checklist based on selected kota
function rebuildKecamatanFromKota() {
  if (!kecamatanChecklistEl) return;
  kecamatanChecklistEl.innerHTML = "";

  const level = getDemoLevel();
  const isKelurahan = level === "kelurahan";
  const labelEl = kecamatanChecklistEl.closest(".kecamatan-checklist-wrap")?.querySelector(".demo-province-label");
  if (labelEl) labelEl.textContent = isKelurahan ? "Kelurahan:" : "Kecamatan:";

  const featuresInKota = allDemographyFeatures.filter(f => {
    const kotaKey = `${f.properties.nama_prop}||${f.properties.nama_kab}`;
    return selectedKota.has(kotaKey);
  });

  // Build item map based on level
  const itemMap = new Map();
  featuresInKota.forEach(f => {
    const prov = f.properties.nama_prop || "";
    const kab = f.properties.nama_kab || "";
    const kec = f.properties.nama_kec || "";
    const kel = f.properties.nama_kel || "";

    let key, name, groupKey;
    if (isKelurahan) {
      key = `${prov}||${kab}||${kec}||${kel}`;
      name = kel || "Tidak diketahui";
      groupKey = `${prov}||${kab}||${kec}`;
    } else {
      key = `${prov}||${kab}||${kec}`;
      name = kec || "Tidak diketahui";
      groupKey = `${prov}||${kab}`;
    }

    if (!itemMap.has(key)) {
      itemMap.set(key, { key, name, groupKey, kab, kec, prov, kids: 0 });
    }
    itemMap.get(key).kids += f.properties.total_anak || 0;
  });

  // Group items
  const byGroup = new Map();
  Array.from(itemMap.values()).forEach(item => {
    if (!byGroup.has(item.groupKey)) byGroup.set(item.groupKey, { groupKey: item.groupKey, kab: item.kab, kec: item.kec, prov: item.prov, items: [] });
    byGroup.get(item.groupKey).items.push(item);
  });

  if (itemMap.size === 0) {
    kecamatanChecklistEl.innerHTML = `<div class="kec-empty">Pilih kota terlebih dahulu</div>`;
    return;
  }

  // Render grouped
  const sortedGroups = Array.from(byGroup.values()).sort((a, b) => a.prov.localeCompare(b.prov) || a.kab.localeCompare(b.kab) || (a.kec || "").localeCompare(b.kec || ""));
  sortedGroups.forEach(group => {
    group.items.sort((a, b) => b.kids - a.kids);

    const header = document.createElement("div");
    header.className = "kec-province-header";
    header.textContent = isKelurahan ? `${group.kab} — ${group.kec}` : `${group.kab}`;
    kecamatanChecklistEl.appendChild(header);

    group.items.forEach(item => {
      const el = document.createElement("label");
      el.className = "kec-item";
      const dataAttr = isKelurahan ? `data-kec="${escapeAttribute(item.key)}"` : `data-kec="${escapeAttribute(item.key)}"`;
      const checked = selectedKecamatan.has(item.key) ? "checked" : "";
      el.innerHTML = `
        <input type="checkbox" ${checked} ${dataAttr}>
        <span>${escapeHtml(item.name)}</span>
        <span class="kec-kids">${formatDemoNum(item.kids)} anak</span>
      `;
      const checkbox = el.querySelector("input");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedKecamatan.add(item.key);
        } else {
          selectedKecamatan.delete(item.key);
        }
        filterAndRenderDemography();
      });
      kecamatanChecklistEl.appendChild(el);
    });
  });
}

function filterAndRenderDemography() {
  if (!allDemographyFeatures.length) {
    demographyData = [];
    renderDemographyLayer([]);
    updateDemographyStats([]);
    return;
  }

  const level = getDemoLevel();
  const isKelurahan = level === "kelurahan";

  const filtered = allDemographyFeatures.filter(f => {
    const kotaKey = `${f.properties.nama_prop}||${f.properties.nama_kab}`;
    if (!selectedKota.has(kotaKey)) return false;

    if (isKelurahan) {
      const kelKey = `${f.properties.nama_prop}||${f.properties.nama_kab}||${f.properties.nama_kec}||${f.properties.nama_kel}`;
      return selectedKecamatan.has(kelKey);
    } else {
      const kecKey = `${f.properties.nama_prop}||${f.properties.nama_kab}||${f.properties.nama_kec}`;
      return selectedKecamatan.has(kecKey);
    }
  });

  demographyData = filtered;
  renderDemographyLayer(filtered);
  updateDemographyStats(filtered);
}

// ── Tambah Provinsi button ──
if (addProvinceBtnEl) {
  addProvinceBtnEl.addEventListener("click", () => {
    const province = demoProvinceEl ? demoProvinceEl.value : "";
    if (!province) return;
    demographyUserSelected = true;
    if (!demographyVisible && demographyToggleEl) {
      skipToggleHandler = true;
      demographyToggleEl.checked = true;
      demographyVisible = true;
      skipToggleHandler = false;
    }
    addProvince(province);
  });
}

// ── Kota select all / deselect all ──
if (kotaSelectAllEl) {
  kotaSelectAllEl.addEventListener("click", () => {
    if (!kotaChecklistEl) return;
    kotaChecklistEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.checked = true;
      selectedKota.add(cb.dataset.kota);
    });
    rebuildKecamatanFromKota();
    filterAndRenderDemography();
  });
}

if (kotaDeselectAllEl) {
  kotaDeselectAllEl.addEventListener("click", () => {
    if (!kotaChecklistEl) return;
    kotaChecklistEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.checked = false;
      selectedKota.delete(cb.dataset.kota);
    });
    rebuildKecamatanFromKota();
    filterAndRenderDemography();
  });
}

// ── Kecamatan select all / deselect all ──
if (kecSelectAllEl) {
  kecSelectAllEl.addEventListener("click", () => {
    if (!kecamatanChecklistEl) return;
    kecamatanChecklistEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.checked = true;
      selectedKecamatan.add(cb.dataset.kec);
    });
    filterAndRenderDemography();
  });
}

if (kecDeselectAllEl) {
  kecDeselectAllEl.addEventListener("click", () => {
    if (!kecamatanChecklistEl) return;
    kecamatanChecklistEl.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.checked = false;
      selectedKecamatan.delete(cb.dataset.kec);
    });
    filterAndRenderDemography();
  });
}

if (demoLevelEl) {
  demoLevelEl.addEventListener("change", () => {
    // Clear selections and rebuild when level changes
    selectedKecamatan.clear();
    if (allDemographyFeatures.length > 0) {
      rebuildChecklists();
      filterAndRenderDemography();
    }
  });
}

if (demographyToggleEl) {
  demographyToggleEl.addEventListener("change", () => {
    if (skipToggleHandler) return;
    demographyVisible = demographyToggleEl.checked;
    demographyUserSelected = false;
    if (demographyVisible) {
      // Auto-detect province from map center
      const mbMap = getMaplibreMap();
      const center = mbMap ? mbMap.getCenter() : null;
      const detected = center ? getProvinceFromCoords(center.lat, center.lng) : undefined;
      if (detected && demoProvinceEl) {
        demoProvinceEl.value = detected;
      }
      loadDemographyPolygons(detected || undefined);
    } else {
      const mbMap = getMaplibreMap();
      if (mbMap) {
        try {
          mbMap.setLayoutProperty('demography-fill', 'visibility', 'none');
          mbMap.setLayoutProperty('demography-outline', 'visibility', 'none');
        } catch (e) {}
      }
      demographyInfoPanel.classList.add("hidden");
    }
  });
}

if (demoProvinceEl) {
  demoProvinceEl.addEventListener("change", () => {
    demographyUserSelected = true;
    if (demographyVisible) {
      loadDemographyPolygons(demoProvinceEl.value, { force: true });
    }
  });
}

if (demoInfoCloseEl) {
  demoInfoCloseEl.addEventListener("click", () => {
    demographyInfoPanel.classList.add("hidden");
  });
}

// Auto-detect province when map is moved
let demographyMoveTimer = null;
waitForMap((mbMap) => {
  mbMap.on("moveend", () => {
    if (!demographyVisible) return;
    // Skip auto-detect if user explicitly selected a province via dropdown
    if (demographyUserSelected) return;
    clearTimeout(demographyMoveTimer);
    demographyMoveTimer = setTimeout(() => {
      if (demographyUserSelected) return;
      const center = mbMap.getCenter();
      const detected = getProvinceFromCoords(center.lat, center.lng);
      if (detected && detected !== demographyCurrentProvince) {
        if (demoProvinceEl) demoProvinceEl.value = detected;
        loadDemographyPolygons(detected);
      }
    }, 500);
  });
});

// ── Cek Coordinates Button ──
const cekCoordinatesBtn = document.getElementById("cek-coordinates");
if (cekCoordinatesBtn) {
  cekCoordinatesBtn.addEventListener("click", () => {
    try {
      const { lat, lon } = parseCoordinates(coordinatesInput.value);
      ensureMapLayers();
      const mbMap = getMaplibreMap();
      if (mbMap) {
        mbMap.setCenter([lon, lat]);
        mbMap.setZoom(15);
        if (window.updateRadiusCircle) {
          window.updateRadiusCircle(lat, lon, 3);
        } else {
          addRadiusCircleLocal(lat, lon, 3);
        }
      }
      setStatus(`Peta dipindah ke ${lat.toFixed(5)}, ${lon.toFixed(5)}.`);
      appendActivityLog(`Peta dipindah ke koordinat ${lat.toFixed(5)}, ${lon.toFixed(5)}.`, "success");
    } catch (error) {
      setStatus("Format koordinat tidak valid. Gunakan: -6.171, 106.683", true);
    }
  });
}

// ── Demo Search: Filter Kota/Kab Checklist ──
const demoSearchInput = document.getElementById("demo-search-input");
const demoSearchBtn = document.getElementById("demo-search-btn");

function filterKecamatanChecklist(query) {
  const kotaEl = document.getElementById("kota-checklist");
  if (!kotaEl) return;
  const items = kotaEl.querySelectorAll(".kec-item");
  const q = (query || "").toLowerCase().trim();
  items.forEach((item) => {
    const name = (item.textContent || "").toLowerCase();
    item.style.display = !q || name.includes(q) ? "" : "none";
  });
}

if (demoSearchInput) {
  let filterTimer = null;
  demoSearchInput.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      filterKecamatanChecklist(demoSearchInput.value);
    }, 200);
  });
  demoSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      filterKecamatanChecklist(demoSearchInput.value);
    }
  });
}

if (demoSearchBtn) {
  demoSearchBtn.addEventListener("click", () => {
    filterKecamatanChecklist(demoSearchInput ? demoSearchInput.value : "");
  });
}

// ── Peta Sebaran Cabang (MapLibre GL JS) ──
let branchSourceAdded = false;
let branchDataLoaded = false;
let branchVisible = false;
let latestBranchesCache = [];
const toggleBranchBtn = document.getElementById("toggle-branch-map");
const BRANCH_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTz-W8aE93Sbzag_aPVKlEpI8Z9_hEU7JbUS8v7Vaw3LFnfrOK0Gh3Q0tfwdfLUTAB35TRKJ_29F7eC/pub?gid=1353940465&single=true&output=csv";
const BRANCH_RADIUS_KM = 3; // 3 km

const FALLBACK_BRANCHES = [
  { lat: -6.3676427, lon: 106.9703253, nama: "Smartkidz unit Kota Wisata Cibubur" },
  { lat: -6.1856638, lon: 106.9841334, nama: "Smartkidz Unit Harapan Indah" },
  { lat: -6.1485947, lon: 106.9142072, nama: "Smartkidz unit kelapa gading Jakarta Utara" },
  { lat: -6.3832501, lon: 106.9241635, nama: "Smartkidz unit Citragran Cibubur" },
  { lat: -6.3398662, lon: 106.7390978, nama: "Smartkidz Unit Pamulang Tangerang Selatan" },
  { lat: -6.3347656, lon: 106.7877683, nama: "Smartkidz Unit Cinere Depok" },
  { lat: -6.2926717, lon: 106.6209466, nama: "Smartkidz Unit Vanya BSD" },
  { lat: -6.3143229, lon: 106.6846908, nama: "Smartkidz Unit Kencana Loka BSD" },
  { lat: -6.3959026, lon: 106.8038023, nama: "Smartkidz Unit Pancoran Mas Depok" },
  { lat: -6.2791581, lon: 106.6179132, nama: "Smartkidz Unit Latigo" },
  { lat: -6.2770821, lon: 106.9751273, nama: "Smartkidz Unit Galaxy" },
  { lat: -6.2781024, lon: 106.7528951, nama: "Smartkidz Unit Bintaro Sek.2" },
  { lat: -6.2626234, lon: 106.6878713, nama: "Smartkidz Unit Graha Raya" },
  { lat: -6.1490485, lon: 106.6741452, nama: "Smartkidz Pusat" },
  { lat: -6.2172510, lon: 106.9276795, nama: "Smartkidz Unit Duren Sawit Jakarta Timur" },
  { lat: -6.3251518, lon: 106.8830197, nama: "Smartkidz Unit Ciracas Jakarta Timur" },
  { lat: -6.2524887, lon: 106.5760959, nama: "Smartkidz Unit Aryana Tangerang" },
  { lat: -6.1930456, lon: 106.6351772, nama: "Smartkidz Unit Tangcity Tangerang" },
  { lat: -6.1636616, lon: 106.7227535, nama: "Smartkidz Unit Semanan" },
  { lat: -6.1260832, lon: 106.5849651, nama: "Smartkidz Unit Sepatan" },
  { lat: -6.2017543, lon: 106.7306046, nama: "Smartkidz Unit Meruya Jakarta Barat" },
  { lat: -6.4205779, lon: 106.8283590, nama: "Smartkidz Unit GDC Depok" },
  { lat: -6.1966971, lon: 106.6578279, nama: "Smartkidz Unit BanjarWijaya" },
  { lat: -6.1966537, lon: 106.6148351, nama: "Smartkidz Unit Karawaci" },
  { lat: -6.3304421, lon: 106.8084970, nama: "Smartkidz Unit Jagakarsa Jakarta Selatan" },
  { lat: -6.3816106, lon: 106.7485304, nama: "Smartkidz Unit Sawangan Depok" },
  { lat: -6.2843313, lon: 106.8554623, nama: "Smartkidz Unit Condet Jakarta Timur" },
  { lat: -6.2302397, lon: 106.9351988, nama: "Smartkidz Unit Pondok Kelapa Jakarta Timur" },
  { lat: -6.4729146, lon: 106.8430378, nama: "Smartkidz Unit Cibinong Bogor" },
  { lat: -6.5977888, lon: 106.7792694, nama: "Smartkidz Unit Ciomas Bogor" },
  { lat: -6.5823816, lon: 106.8182053, nama: "Smartkidz Unit Pandu Raya Bogor" },
  { lat: -6.2048786, lon: 107.0217528, nama: "Smartkidz Unit Golden City Bekasi" },
  { lat: -6.5349629, lon: 106.7859935, nama: "Smartkidz Unit Cimanggu Bogor" },
  { lat: -6.3410636, lon: 106.6427069, nama: "Smartkidz Unit Cisauk Tangerang" },
  { lat: -6.3990127, lon: 106.8880568, nama: "Smartkidz Cabang Tapos Depok" },
  { lat: -6.1492405, lon: 106.6742739, nama: "Smartkidz Cabang Jurumudi" },
  { lat: -6.1446287, lon: 106.7005402, nama: "Smartkidz Cabang kalideres" },
  { lat: -6.1709723, lon: 106.6799045, nama: "Smartkidz Cabang Poris" },
  { lat: -6.1396052, lon: 106.5389551, nama: "Smartkidz Cabang Grand Batavia" },
  { lat: -6.1353020, lon: 106.7201603, nama: "Smartkidz Cabang Taman Palem Cengkareng" },
  { lat: -6.2312765, lon: 106.7267898, nama: "Smartkidz Cabang Ciledug" },
  { lat: -6.2628934, lon: 106.7340205, nama: "Smartkidz Cabang Pondok Aren" },
  { lat: -6.1705040, lon: 106.5940306, nama: "Smartkidz Cabang Sangiang" },
  { lat: -6.2665928, lon: 106.5247698, nama: "Smartkidz Cabang Citra Raya Cikupa" },
  { lat: -6.3958264, lon: 106.8515917, nama: "Smartkidz Cabang Sukmajaya Depok" },
  { lat: -6.3368338, lon: 106.9255897, nama: "Smartkidz Cabang Jatisampurna Bekasi" },
  { lat: -6.2859400, lon: 106.9194883, nama: "Smartkidz Cabang Pondok Gede Bekasi" },
  { lat: -6.3029087, lon: 106.7285093, nama: "Smartkidz Cabang Citra Garden Bintaro Tangerang Selatan" },
  { lat: -6.1934732, lon: 106.4979835, nama: "Smartkidz Cabang Talaga Bestari Tangerang" }
];

function parseBranchCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(/^"([^"]*)",?\s*(.*)$/);
    if (match) {
      const coords = match[1].split(",").map(Number);
      const nama = match[2].replace(/^"/, '').replace(/"$/, '').trim();
      if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
        results.push({ lat: coords[0], lon: coords[1], nama });
      }
    } else {
      const parts = line.split(",");
      if (parts.length >= 3) {
        const lat = Number(parts[0]);
        const lon = Number(parts[1]);
        const nama = parts.slice(2).join(",").trim();
        if (!isNaN(lat) && !isNaN(lon)) {
          results.push({ lat, lon, nama });
        }
      }
    }
  }
  return results.length > 0 ? results : FALLBACK_BRANCHES;
}

function setupBranchLayers() {
  const mbMap = getMaplibreMap();
  if (!mbMap) return;
  
  try {
    if (mbMap.getLayer('branch-markers')) mbMap.removeLayer('branch-markers');
    if (mbMap.getSource('branch-markers-source')) mbMap.removeSource('branch-markers-source');
    if (mbMap.getLayer('branch-radius-outline')) mbMap.removeLayer('branch-radius-outline');
    if (mbMap.getLayer('branch-radius-fill')) mbMap.removeLayer('branch-radius-fill');
    if (mbMap.getSource('branch-radius-source')) mbMap.removeSource('branch-radius-source');
  } catch (e) {}
  
  mbMap.addSource('branch-radius-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  
  mbMap.addLayer({
    id: 'branch-radius-fill',
    type: 'fill',
    source: 'branch-radius-source',
    paint: {
      'fill-color': '#f59e0b',
      'fill-opacity': 0.12,
    },
    layout: { visibility: 'none' },
  });
  
  mbMap.addLayer({
    id: 'branch-radius-outline',
    type: 'line',
    source: 'branch-radius-source',
    paint: {
      'line-color': '#f59e0b',
      'line-width': 2,
      'line-opacity': 0.8,
    },
    layout: { visibility: 'none' },
  });
  
  mbMap.addSource('branch-markers-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });
  
  mbMap.addLayer({
    id: 'branch-markers',
    type: 'circle',
    source: 'branch-markers-source',
    paint: {
      'circle-radius': 9,
      'circle-color': '#f59e0b',
      'circle-opacity': 1,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
    layout: { visibility: 'none' },
  });
  
  const maplibreglObj = window.maplibregl || (typeof maplibregl !== 'undefined' ? maplibregl : null);
  
  mbMap.on('click', 'branch-markers', (e) => {
    if (!e.features || !e.features.length) return;
    const feature = e.features[0];
    const props = feature.properties;
    
    if (props && props.nama && maplibreglObj) {
      new maplibreglObj.Popup({ maxWidth: 280, closeOnClick: true, autoClose: true })
        .setLngLat([props.lon, props.lat])
        .setHTML(`
          <div style="font-family:Arial,sans-serif;min-width:180px;">
            <div style="font-weight:700;font-size:13px;color:#00f0ff;margin-bottom:4px;">📍 ${escapeHtml(props.nama)}</div>
            <div style="font-size:11px;color:#94a3b8;">${props.lat.toFixed(6)}, ${props.lon.toFixed(6)}</div>
            <div style="font-size:10px;color:#38bdf8;margin-top:3px;">Radius Cabang: ${BRANCH_RADIUS_KM} km</div>
          </div>`)
        .addTo(mbMap);
    }
  });
  
  mbMap.on('mouseenter', 'branch-markers', () => {
    if (mbMap) mbMap.getCanvas().style.cursor = 'pointer';
  });
  mbMap.on('mouseleave', 'branch-markers', () => {
    if (mbMap) mbMap.getCanvas().style.cursor = '';
  });
  
  branchSourceAdded = true;
}

function createBranchCircle(lon, lat, radiusKm = 3, steps = 48) {
  const ret = [];
  const distanceX = radiusKm / (111.320 * Math.cos(lat * Math.PI / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < steps; i++) {
    const theta = (i / steps) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([lon + x, lat + y]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret],
    },
    properties: {},
  };
}

function renderBranchGeoJson(branches) {
  const mbMap = getMaplibreMap();
  if (!mbMap) return;
  
  latestBranchesCache = branches;
  
  const pointFeatures = branches.map((b) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [b.lon, b.lat],
    },
    properties: {
      lat: b.lat,
      lon: b.lon,
      nama: b.nama,
    },
  }));
  
  const polygonFeatures = branches.map((b) => createBranchCircle(b.lon, b.lat, BRANCH_RADIUS_KM));
  const radiusGeoJson = {
    type: 'FeatureCollection',
    features: polygonFeatures,
  };
  
  const radiusSource = mbMap.getSource('branch-radius-source');
  if (radiusSource) {
    radiusSource.setData(radiusGeoJson);
  }
  
  const markersSource = mbMap.getSource('branch-markers-source');
  if (markersSource) {
    markersSource.setData({
      type: 'FeatureCollection',
      features: pointFeatures,
    });
  }
}

async function loadBranchData() {
  if (branchDataLoaded && latestBranchesCache.length > 0) {
    renderBranchGeoJson(latestBranchesCache);
    return;
  }
  
  let branches = FALLBACK_BRANCHES;
  
  try {
    const resp = await fetch(BRANCH_CSV_URL);
    if (resp.ok) {
      const text = await resp.text();
      const parsed = parseBranchCsv(text);
      if (parsed && parsed.length > 0) {
        branches = parsed;
      }
    }
  } catch (err) {
    console.warn("BRANCH_MAP_CSV_FETCH_WARNING, using fallback:", err);
  }
  
  renderBranchGeoJson(branches);
  branchDataLoaded = true;
  appendActivityLog(`Peta Sebaran Cabang: ${branches.length} titik cabang berhasil dimuat.`, "success");
}

if (toggleBranchBtn) {
  toggleBranchBtn.addEventListener("click", async () => {
    const mbMap = getMaplibreMap();
    if (!mbMap) {
      waitForMap(() => {
        if (toggleBranchBtn) toggleBranchBtn.click();
      });
      return;
    }
    
    branchVisible = !branchVisible;
    toggleBranchBtn.classList.toggle("active", branchVisible);
    
    if (!branchSourceAdded || !mbMap.getSource('branch-markers-source')) {
      setupBranchLayers();
    }
    
    if (branchVisible) {
      await loadBranchData();
      if (mbMap) {
        mbMap.setLayoutProperty('branch-radius-fill', 'visibility', 'visible');
        mbMap.setLayoutProperty('branch-radius-outline', 'visibility', 'visible');
        mbMap.setLayoutProperty('branch-markers', 'visibility', 'visible');
        
        try {
          mbMap.moveLayer('branch-radius-fill');
          mbMap.moveLayer('branch-radius-outline');
          mbMap.moveLayer('branch-markers');
        } catch (e) {}
        
        appendActivityLog("Peta Sebaran Cabang ditampilkan.", "success");
      }
    } else {
      if (mbMap) {
        try {
          mbMap.setLayoutProperty('branch-radius-fill', 'visibility', 'none');
          mbMap.setLayoutProperty('branch-radius-outline', 'visibility', 'none');
          mbMap.setLayoutProperty('branch-markers', 'visibility', 'none');
        } catch (e) {}
        appendActivityLog("Peta Sebaran Cabang disembunyikan.");
      }
    }
  });
}

window.addEventListener('map-style-loaded', () => {
  if (branchVisible) {
    setupBranchLayers();
    loadBranchData();
    const mbMap = getMaplibreMap();
    if (mbMap) {
      try {
        mbMap.setLayoutProperty('branch-radius-fill', 'visibility', 'visible');
        mbMap.setLayoutProperty('branch-radius-outline', 'visibility', 'visible');
        mbMap.setLayoutProperty('branch-markers', 'visibility', 'visible');
      } catch (e) {}
    }
  }
});

syncActionButtons();
loadLauncherLog();
startHotmapPolling();
