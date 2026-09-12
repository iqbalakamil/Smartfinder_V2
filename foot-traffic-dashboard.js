/**
 * Foot Traffic Dashboard — Smartkidz
 * 
 * Visualizes Google Maps Popular Times data and POI density.
 * Data flow: server.js /api/heatmap-data → frontend rendering.
 * 
 * Inspired by philshem/gmaps_popular_times_scraper data format:
 *   { day_name: [hour_0, hour_1, ..., hour_23] }
 *   Each value = busyness percentage (0-100), null = no data
 */

(function () {
  "use strict";

  const API_BASE =
    window.__POI_API_BASE__ ||
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:3000"
      : window.location.origin);

  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAY_LABELS_ID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const DAY_LABELS_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  // DOM elements
  const coordinatesInput = document.getElementById("ft-coordinates");
  const radiusInput = document.getElementById("ft-radius");
  const dataSourceSelect = document.getElementById("ft-data-source");
  const loadBtn = document.getElementById("ft-load-btn");
  const refreshBtn = document.getElementById("ft-refresh-btn");
  const statusDot = document.getElementById("ft-status-dot");
  const statusText = document.getElementById("ft-status-text");
  const lastUpdatedEl = document.getElementById("ft-last-updated");

  let map = null;
  let markerLayer = null;
  let heatmapLayer = null;
  let allPois = [];
  let allFootTrafficPoints = [];
  let weeklyAggregated = null;
  let currentFilter = "all";
  let sortColumn = "score";
  let sortDir = "desc";

  // ==================== INIT ====================

  function init() {
    initMap();
    bindEvents();
    loadDashboard();
  }

  function initMap() {
    map = L.map("ft-map", { zoomControl: true }).setView([-6.171, 106.683], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }

  function bindEvents() {
    loadBtn.addEventListener("click", loadDashboard);
    refreshBtn.addEventListener("click", loadDashboard);

    coordinatesInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadDashboard();
    });

    // Filter chips
    document.querySelectorAll("#ft-filter-chips .ft-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll("#ft-filter-chips .ft-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        currentFilter = chip.dataset.filter;
        renderPoiTable();
      });
    });
  }

  // ==================== DATA LOADING ====================

  async function loadDashboard() {
    const coords = parseCoordinates(coordinatesInput.value);
    if (!coords) {
      setStatus("error", "Koordinat tidak valid. Gunakan format: -6.171, 106.683");
      return;
    }

    const radius = Number(radiusInput.value) || 3000;
    setStatus("loading", "Memuat data POI dari server...");

    try {
      // STEP 1: Trigger POI crawl first to populate server cache.
      // /api/heatmap-data only reads from in-memory cache, so we must
      // ensure the server has crawled POIs for these coordinates first.
      setStatus("loading", "Step 1/3 — Crawling POI dari Google Maps...");
      let crawlResult = null;
      try {
        const crawlResp = await fetch(`${API_BASE}/api/pois`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: coords.lat, lon: coords.lon, radius: radius }),
        });
        if (crawlResp.ok) {
          crawlResult = await crawlResp.json();
          console.log("FT_DASH: Crawl result:", crawlResult?.items?.length, "POIs");
        }
      } catch (crawlErr) {
        console.warn("FT_DASH: Crawl failed, continuing with existing cache:", crawlErr.message);
      }

      // STEP 2: Fetch heatmap data from server (now populated by crawl)
      setStatus("loading", "Step 2/3 — Mengambil data foot traffic...");
      const url = new URL(`${API_BASE}/api/heatmap-data`, window.location.origin);
      url.searchParams.set("lat", coords.lat);
      url.searchParams.set("lon", coords.lon);
      url.searchParams.set("radius", radius);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      allFootTrafficPoints = data.footTraffic || [];

      // STEP 3: Also get POIs for weekly aggregation
      setStatus("loading", "Step 3/3 — Mengambil data POI untuk weekly aggregation...");
      allPois = await fetchAllPois(coords.lat, coords.lon, radius);

      // Merge crawl POIs if heatmap is empty but crawl succeeded
      if (allFootTrafficPoints.length === 0 && crawlResult?.items?.length > 0) {
        allFootTrafficPoints = crawlResult.items
          .filter((p) => p.lat && p.lon)
          .map((p) => ({
            lat: p.lat,
            lon: p.lon,
            score: p.tags?.foot_traffic_score || Math.round((computeIntensityFromPoi(p)) * 100),
            level: p.tags?.foot_traffic_level || "medium",
            peakHour: p.tags?.foot_traffic_peak_hour || null,
            name: p.name || "POI",
            category: p.category || "",
            reasoning: p.tags?.foot_traffic_reasoning || "",
            rating: p.tags?.rating || null,
            reviewCount: p.tags?.review_count || null,
            address: p.tags?.address || "",
            mapsLink: p.tags?.maps_link || p.tags?.header_link_raw || "",
            popularTimesAvailable: !!(p.tags?.popular_times?.available),
            dataSource: p.tags?.popular_times?.available ? "google-maps-popular-times" : "density-proxy-estimasi",
          }));
        console.log("FT_DASH: Used crawl fallback:", allFootTrafficPoints.length, "points");
      }

      // Update map
      updateMap(coords.lat, coords.lon, radius);

      // Compute weekly aggregation from Popular Times data
      weeklyAggregated = computeWeeklyAggregation(allPois);

      // Render all sections
      updateStats(data);
      renderWeeklyGrid();
      renderHourlyChart();
      renderDailyChart();
      renderPoiTable();
      renderHeatmapMarkers();

      setStatus("success", `Berhasil memuat ${allFootTrafficPoints.length} titik foot traffic.`);
      lastUpdatedEl.textContent = `Terakhir update: ${new Date().toLocaleTimeString("id-ID")}`;
    } catch (error) {
      console.error("LOAD_ERROR:", error);
      setStatus("error", `Gagal memuat data: ${error.message}. Pastikan server berjalan.`);
    }
  }

  /** Estimate intensity from POI data when foot_traffic_score is missing. */
  function computeIntensityFromPoi(poi) {
    const rating = Number(poi.tags?.rating);
    const reviewCount = Number(poi.tags?.review_count) || 0;
    if (Number.isFinite(rating) && rating > 0) {
      return Math.max(0.12, Math.min(1, (rating / 5) * 0.6 + Math.min(0.4, reviewCount / 200)));
    }
    const catMap = { education: 0.55, "family-services": 0.50, residential: 0.40, "daily-needs": 0.60, "child-friendly": 0.50, "traffic-support": 0.55, community: 0.45, risk: 0.25 };
    return catMap[poi.category] || 0.35;
  }

  async function fetchAllPois(lat, lon, radius) {
    try {
      // Try to get POIs from the hotmap endpoint which includes foot traffic tags
      const url = new URL(`${API_BASE}/api/hotmap-v2/pois`, window.location.origin);
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lon);
      url.searchParams.set("radius", radius);
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return Array.isArray(data.items) ? data.items : [];
    } catch {
      // Fallback: use allFootTrafficPoints if hotmap endpoint fails
      return allFootTrafficPoints.map((p) => ({
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        category: p.category,
        tags: {
          foot_traffic_score: p.score,
          foot_traffic_level: p.level,
          foot_traffic_peak_hour: p.peakHour,
          foot_traffic_business_avg: p.businessAvg,
          foot_traffic_reasoning: p.reasoning,
          popular_times: p.popularTimesAvailable ? { available: true } : null,
          rating: p.rating,
          review_count: p.reviewCount,
          address: p.address,
          maps_link: p.mapsLink,
        },
      }));
    }
  }

  // ==================== WEEKLY AGGREGATION ====================

  /**
   * Aggregate Popular Times data across all POIs that have it.
   * Returns { dayName: [avg_hour_0, avg_hour_1, ..., avg_hour_23] }
   * Inspired by philshem/gmaps_popular_times_scraper output format.
   */
  function computeWeeklyAggregation(pois) {
    const sums = {};
    const counts = {};

    for (const day of DAY_NAMES) {
      sums[day] = new Array(24).fill(0);
      counts[day] = new Array(24).fill(0);
    }

    let poisVisibleCount = 0;

    for (const poi of pois) {
      const popularTimes = poi.tags?.popular_times;
      if (!popularTimes?.weeklyData) continue;

      poisVisibleCount++;

      for (const day of DAY_NAMES) {
        const hours = popularTimes.weeklyData[day];
        if (!Array.isArray(hours)) continue;

        for (let h = 0; h < 24; h++) {
          const val = hours[h];
          if (val != null && val !== undefined) {
            sums[day][h] += val;
            counts[day][h] += 1;
          }
        }
      }
    }

    if (poisVisibleCount === 0) return null;

    const averages = {};
    for (const day of DAY_NAMES) {
      averages[day] = sums[day].map((sum, h) =>
        counts[day][h] > 0 ? Math.round(sum / counts[day][h]) : null
      );
    }

    return { averages, poisVisibleCount };
  }

  // ==================== MAP ====================

  function updateMap(lat, lon, radius) {
    map.setView([lat, lon], 14);

    // Clear existing
    markerLayer.clearLayers();
    if (heatmapLayer) {
      map.removeLayer(heatmapLayer);
      heatmapLayer = null;
    }

    // Draw radius circle
    L.circle([lat, lon], {
      radius,
      color: "#0f766e",
      weight: 2,
      fillColor: "#0f766e",
      fillOpacity: 0.05,
      dashArray: "6 4",
    }).addTo(markerLayer);

    // Center marker
    L.marker([lat, lon], {
      icon: L.divIcon({
        className: "",
        html: '<div style="width:16px;height:16px;background:#0b5c55;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(markerLayer);
  }

  function renderHeatmapMarkers() {
    if (!allFootTrafficPoints.length) return;

    allFootTrafficPoints.forEach((point) => {
      const color = getHeatColor(point.score / 100);
      const radius = 6 + Math.round((point.score / 100) * 8);

      const marker = L.circleMarker([point.lat, point.lon], {
        radius,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.8,
      });

      const levelLabels = { very_high: "Sangat Ramai", high: "Ramai", medium: "Sedang", low: "Sepi" };
      const level = point.level || "low";
      const label = levelLabels[level] || level;

      let popupHtml = '<div style="font-family:system-ui,sans-serif;min-width:200px;max-width:300px;">';
      popupHtml += '<div style="font-weight:700;font-size:13px;color:#111827;margin-bottom:4px;">' + escapeHtml(point.name || "POI") + "</div>";

      if (point.category) {
        popupHtml += '<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">' + escapeHtml(point.category) + "</div>";
      }

      popupHtml += '<div style="padding:4px 10px;background:' + color + "15;border:1px solid " + color + "40;border-radius:8px;display:inline-block;margin-bottom:6px;\">";
      popupHtml += '<span style="font-weight:700;color:' + color + ";font-size:12px;\">📊 " + (point.score || 0) + "%</span>";
      popupHtml += ' <span style="font-size:11px;color:#6b7280;">' + escapeHtml(label) + "</span></div>";

      // Evidence: Rating & Reviews
      if (point.rating) {
        popupHtml += '<div style="font-size:11px;color:#eab308;margin-top:4px;">⭐ ' + escapeHtml(String(point.rating));
        if (point.reviewCount) popupHtml += ' (' + escapeHtml(String(point.reviewCount)) + ' ulasan)';
        popupHtml += '</div>';
      }

      // Evidence: Address
      if (point.address) {
        popupHtml += '<div style="font-size:11px;color:#6b7280;margin-top:2px;">📍 ' + escapeHtml(point.address) + '</div>';
      }

      if (point.peakHour) {
        popupHtml += '<div style="font-size:11px;color:#6b7280;margin-top:2px;">⏰ Peak: ' + escapeHtml(point.peakHour) + "</div>";
      }

      // Evidence: Data source indicator
      var sourceBadge = '';
      if (point.dataSource === 'google-maps-popular-times' || point.popularTimesAvailable) {
        sourceBadge = '<span style="display:inline-block;padding:1px 6px;background:#2563eb15;border:1px solid #2563eb40;border-radius:4px;font-size:9px;color:#2563eb;font-weight:600;">📊 Google Popular Times</span>';
      } else {
        sourceBadge = '<span style="display:inline-block;padding:1px 6px;background:#94a3b815;border:1px solid #94a3b840;border-radius:4px;font-size:9px;color:#94a3b8;font-weight:600;">📐 Estimasi Density</span>';
      }
      popupHtml += '<div style="margin-top:4px;">' + sourceBadge + '</div>';

      // Evidence: Reasoning
      if (point.reasoning) {
        popupHtml += '<div style="font-size:9px;color:#9ca3af;margin-top:4px;padding:4px 6px;background:#f8fafc;border-radius:4px;line-height:1.4;">' + escapeHtml(point.reasoning) + "</div>";
      }

      // Evidence: Google Maps link
      if (point.mapsLink) {
        popupHtml += '<div style="margin-top:6px;"><a href="' + escapeHtml(point.mapsLink) + '" target="_blank" rel="noreferrer" style="font-size:11px;color:#2563eb;text-decoration:none;font-weight:600;">📍 Buka di Google Maps →</a></div>';
      }

      // Evidence: Coordinates
      popupHtml += '<div style="font-size:8px;color:#d1d5db;margin-top:4px;">' + escapeHtml(String(point.lat?.toFixed(6) || '')) + ', ' + escapeHtml(String(point.lon?.toFixed(6) || '')) + '</div>';

      popupHtml += "</div>";

      marker.bindPopup(popupHtml, { maxWidth: 300, minWidth: 220 });
      markerLayer.addLayer(marker);
    });
  }

  // ==================== STATS ====================

  function updateStats(data) {
    const stats = data.stats || {};
    setText("ft-total-pois", stats.totalPois || 0);
    setText("ft-avg-score", stats.averageFootTraffic != null ? stats.averageFootTraffic + "%" : "—");
    setText("ft-poi-with-data", weeklyAggregated ? weeklyAggregated.poisVisibleCount : 0);

    // Compute peak hour and day from weekly data
    if (weeklyAggregated) {
      const { peakHour, peakDay } = findPeakFromWeekly(weeklyAggregated.averages);
      setText("ft-peak-hour", peakHour || "—");
      setText("ft-peak-day", peakDay || "—");
    } else {
      setText("ft-peak-hour", "—");
      setText("ft-peak-day", "—");
    }

    // Source label — show clear attribution
    const sourceMap = {
      "popular-times": "📊 Google Maps Popular Times",
      "density-proxy": "📐 Estimasi Density POI",
      "Google Maps": "🗺️ Google Maps",
      "OpenStreetMap": "🗺️ OpenStreetMap",
    };
    setText("ft-data-source-label", sourceMap[stats.source] || stats.source || "—");
    setText("ft-data-source-sub", `${stats.withFootTraffic || 0} POI • ${stats.source === 'popular-times' ? 'Live scrape dari Google Maps' : 'Estimasi dari rating & kategori'}`);
  }

  function findPeakFromWeekly(averages) {
    let maxVal = 0;
    let peakHour = "";
    let peakDay = "";

    for (const day of DAY_NAMES) {
      const hours = averages[day];
      if (!hours) continue;
      for (let h = 0; h < 24; h++) {
        if (hours[h] != null && hours[h] > maxVal) {
          maxVal = hours[h];
          peakHour = String(h).padStart(2, "0") + ":00";
          peakDay = DAY_LABELS_ID[DAY_NAMES.indexOf(day)];
        }
      }
    }

    return { peakHour, peakDay, maxVal };
  }

  // ==================== WEEKLY HEATMAP GRID ====================

  function renderWeeklyGrid() {
    const container = document.getElementById("ft-weekly-grid-container");
    const sourcePill = document.getElementById("ft-grid-source");

    if (!weeklyAggregated) {
      container.innerHTML = '<div class="ft-no-data"><h3>Belum ada data Popular Times</h3><p>Data Popular Times belum tersedia untuk POI di area ini. Coba jalankan crawler dengan Popular Times enabled.</p></div>';
      sourcePill.textContent = "Tidak ada data";
      return;
    }

    sourcePill.textContent = `${weeklyAggregated.poisVisibleCount} POI`;

    const todayIdx = new Date().getDay(); // 0=Sun, 1=Mon...
    const todayDayName = DAY_NAMES[todayIdx === 0 ? 6 : todayIdx - 1];

    let html = '<div class="ft-weekly-grid"><table class="ft-weekly-table">';

    // Header row: hours
    html += "<thead><tr><th class='day-header'>Hari</th>";
    for (let h = 0; h < 24; h++) {
      const label = h < 6 || h >= 22 ? "" : String(h).padStart(2, "0");
      html += "<th>" + label + "</th>";
    }
    html += "</tr></thead>";

    // Body rows: one per day
    html += "<tbody>";
    DAY_NAMES.forEach((day, idx) => {
      const hours = weeklyAggregated.averages[day] || [];
      const isToday = day === todayDayName;
      const dayClass = isToday ? "day-cell today" : "day-cell";

      html += "<tr>";
      html += "<td class='" + dayClass + "'>" + DAY_LABELS_SHORT[idx] + "</td>";

      for (let h = 0; h < 24; h++) {
        const val = hours[h];
        if (val == null) {
          html += '<td><div class="ft-heat-cell" style="background:#f0ebe0;opacity:0.4;"></div></td>';
        } else {
          const color = getHeatColor(val / 100);
          const tooltipText = DAY_LABELS_ID[idx] + " " + String(h).padStart(2, "0") + ":00 — " + val + "%";
          html += "<td><div class='ft-heat-cell' style='background:" + color + ";'>";
          html += '<span class="ft-tooltip">' + escapeHtml(tooltipText) + "</span>";
          html += "</div></td>";
        }
      }

      html += "</tr>";
    });
    html += "</tbody></table></div>";

    container.innerHTML = html;
  }

  // ==================== HOURLY CHART ====================

  function renderHourlyChart() {
    const container = document.getElementById("ft-hourly-chart");

    if (!weeklyAggregated) {
      container.innerHTML = '<div class="ft-no-data"><p>Belum ada data.</p></div>';
      return;
    }

    // Average across all days for each hour
    const hourlyAvg = new Array(24).fill(null);
    const hourlyCounts = new Array(24).fill(0);

    for (const day of DAY_NAMES) {
      const hours = weeklyAggregated.averages[day] || [];
      for (let h = 0; h < 24; h++) {
        if (hours[h] != null) {
          hourlyAvg[h] = (hourlyAvg[h] || 0) + hours[h];
          hourlyCounts[h] += 1;
        }
      }
    }

    for (let h = 0; h < 24; h++) {
      if (hourlyCounts[h] > 0) {
        hourlyAvg[h] = Math.round(hourlyAvg[h] / hourlyCounts[h]);
      }
    }

    const maxVal = Math.max(...hourlyAvg.filter((v) => v != null), 1);

    let html = '<div class="ft-bar-chart">';
    for (let h = 6; h <= 22; h++) {
      const val = hourlyAvg[h];
      if (val == null) continue;
      const width = Math.max(4, Math.round((val / maxVal) * 100));
      const color = getHeatColor(val / 100);
      const label = String(h).padStart(2, "0") + ":00";

      html += '<div class="ft-bar-row">';
      html += '<div class="ft-bar-label">' + label + "</div>";
      html += '<div class="ft-bar-track"><div class="ft-bar-fill" style="width:' + width + "%;background:" + color + ';"></div></div>';
      html += '<div class="ft-bar-value">' + val + "%</div>";
      html += "</div>";
    }
    html += "</div>";

    container.innerHTML = html;
  }

  // ==================== DAILY CHART ====================

  function renderDailyChart() {
    const container = document.getElementById("ft-daily-chart");

    if (!weeklyAggregated) {
      container.innerHTML = '<div class="ft-no-data"><p>Belum ada data.</p></div>';
      return;
    }

    // Average across all hours for each day
    const dailyAvg = [];
    for (const day of DAY_NAMES) {
      const hours = weeklyAggregated.averages[day] || [];
      const validHours = hours.filter((v) => v != null);
      const avg = validHours.length > 0 ? Math.round(validHours.reduce((a, b) => a + b, 0) / validHours.length) : 0;
      dailyAvg.push({ day, label: DAY_LABELS_ID[DAY_NAMES.indexOf(day)], avg });
    }

    const maxVal = Math.max(...dailyAvg.map((d) => d.avg), 1);

    let html = '<div class="ft-bar-chart">';
    dailyAvg.forEach((item) => {
      const width = Math.max(4, Math.round((item.avg / maxVal) * 100));
      const color = getHeatColor(item.avg / 100);

      html += '<div class="ft-bar-row">';
      html += '<div class="ft-bar-label">' + item.label + "</div>";
      html += '<div class="ft-bar-track"><div class="ft-bar-fill" style="width:' + width + "%;background:" + color + ';"></div></div>';
      html += '<div class="ft-bar-value">' + item.avg + "%</div>";
      html += "</div>";
    });
    html += "</div>";

    container.innerHTML = html;
  }

  // ==================== POI TABLE ====================

  function renderPoiTable() {
    const container = document.getElementById("ft-poi-table-wrap");
    const countLabel = document.getElementById("ft-poi-count-label");

    // Build POI list with scores + evidence
    let poisWithScore = allFootTrafficPoints
      .filter((p) => p.lat && p.lon)
      .map((p) => ({
        name: p.name || "POI",
        score: p.score || 0,
        level: p.level || "low",
        category: p.category || "",
        peakHour: p.peakHour || "—",
        businessAvg: p.businessAvg || "—",
        reasoning: p.reasoning || "",
        lat: p.lat,
        lon: p.lon,
        mapsLink: p.mapsLink || "",
        rating: p.rating || null,
        reviewCount: p.reviewCount || null,
        address: p.address || "",
        dataSource: p.dataSource || "unknown",
        popularTimesAvailable: p.popularTimesAvailable || false,
      }));

    // Also include POIs from allPois that have foot_traffic_score
    for (const poi of allPois) {
      const ftScore = poi.tags?.foot_traffic_score;
      if (ftScore == null) continue;

      const key = `${poi.name}|${poi.lat}|${poi.lon}`;
      if (allFootTrafficPoints.length > 0 && poisWithScore.some((p) => p.name === poi.name)) continue;

      poisWithScore.push({
        name: poi.name || "POI",
        score: ftScore,
        level: poi.tags?.foot_traffic_level || "low",
        category: poi.categoryLabel || poi.category || "",
        peakHour: poi.tags?.foot_traffic_peak_hour || "—",
        businessAvg: poi.tags?.foot_traffic_business_avg || "—",
        reasoning: poi.tags?.foot_traffic_reasoning || "",
        lat: poi.lat,
        lon: poi.lon,
        mapsLink: poi.tags?.maps_link || poi.tags?.header_link_raw || "",
        rating: poi.tags?.rating || null,
        reviewCount: poi.tags?.review_count || null,
        address: poi.tags?.address || "",
        dataSource: poi.tags?.popular_times?.available ? "google-maps-popular-times" : "density-proxy-estimasi",
        popularTimesAvailable: !!(poi.tags?.popular_times?.available),
      });
    }

    // Filter
    if (currentFilter !== "all") {
      poisWithScore = poisWithScore.filter((p) => p.level === currentFilter);
    }

    // Sort
    poisWithScore.sort((a, b) => {
      let va = a[sortColumn];
      let vb = b[sortColumn];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    countLabel.textContent = poisWithScore.length + " POI";

    if (poisWithScore.length === 0) {
      container.innerHTML = '<div class="ft-no-data"><h3>Tidak ada data</h3><p>POI dengan data foot traffic belum tersedia di area ini.</p></div>';
      return;
    }

    let html = '<table class="ft-poi-table">';
    html += "<thead><tr>";
    html += buildSortTh("name", "Nama POI");
    html += buildSortTh("score", "Skor");
    html += buildSortTh("level", "Level");
    html += buildSortTh("category", "Kategori");
    html += buildSortTh("peakHour", "Peak Jam");
    html += "<th>Sumber Data</th>";
    html += "<th>Bukti</th>";
    html += "</tr></thead>";

    html += "<tbody>";
    poisWithScore.forEach((poi) => {
      const levelLabels = { very_high: "Sangat Ramai", high: "Ramai", medium: "Sedang", low: "Sepi" };
      const levelLabel = levelLabels[poi.level] || poi.level;
      const scoreClass = poi.level || "low";

      // Source badge
      const isGooglePT = poi.dataSource === 'google-maps-popular-times' || poi.popularTimesAvailable;
      const sourceLabel = isGooglePT ? '📊 Google PT' : '📐 Estimasi';
      const sourceColor = isGooglePT ? '#2563eb' : '#94a3b8';
      const sourceTitle = isGooglePT ? 'Data dari Google Maps Popular Times (live scrape)' : 'Estimasi dari rating & kategori POI';

      html += '<tr>';
      html += '<td style="font-weight:600;">';
      html += escapeHtml(poi.name);
      if (poi.address) {
        html += '<div style="font-size:0.7rem;color:#9ca3af;font-weight:400;margin-top:2px;">📍 ' + escapeHtml(poi.address) + '</div>';
      }
      html += '</td>';
      html += "<td><span class='ft-score-badge " + scoreClass + "'>" + poi.score + "%</span></td>";
      html += '<td>' + escapeHtml(levelLabel) + '</td>';
      html += '<td>' + escapeHtml(poi.category) + '</td>';
      html += '<td>' + escapeHtml(String(poi.peakHour)) + '</td>';
      html += '<td><span style="font-size:0.72rem;color:' + sourceColor + ';font-weight:600;" title="' + escapeHtml(sourceTitle) + '">' + sourceLabel + '</span>';
      if (poi.rating) {
        html += '<div style="font-size:0.68rem;color:#eab308;margin-top:2px;">⭐ ' + escapeHtml(String(poi.rating));
        if (poi.reviewCount) html += ' (' + escapeHtml(String(poi.reviewCount)) + ')';
        html += '</div>';
      }
      html += '</td>';

      // Evidence column
      html += '<td style="white-space:nowrap;">';
      if (poi.mapsLink) {
        html += '<a class="ft-maps-link" href="' + escapeHtml(poi.mapsLink) + '" target="_blank" rel="noreferrer" title="Buka di Google Maps">📍 Maps</a>';
      }
      html += '</td>';

      html += '</tr>';
    });
    html += "</tbody></table>";

    container.innerHTML = html;

    // Bind sort headers
    container.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortColumn = col;
          sortDir = col === "name" ? "asc" : "desc";
        }
        renderPoiTable();
      });
    });
  }

  function buildSortTh(column, label) {
    let cls = "";
    if (sortColumn === column) {
      cls = sortDir === "asc" ? "sorted-asc" : "sorted-desc";
    }
    return '<th data-sort="' + column + '" class="' + cls + '">' + label + "</th>";
  }

  // ==================== UTILITIES ====================

  function parseCoordinates(text) {
    const cleaned = String(text || "").replace(/\s+/g, "").trim();
    const parts = cleaned.split(",");
    if (parts.length < 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  }

  /**
   * Map foot traffic score (0-1) to a color.
   * Thresholds match the level system in popularTimesScraper.js:
   *   very_high >= 0.65  → red
   *   high      >= 0.45  → orange
   *   medium    >= 0.25  → yellow
   *   low       <  0.25  → blue
   */
  function getHeatColor(intensity) {
    const v = Math.max(0, Math.min(1, Number(intensity) || 0));
    if (v >= 0.65) return "#ef4444";  // Sangat Ramai
    if (v >= 0.45) return "#f97316";  // Ramai
    if (v >= 0.25) return "#eab308";  // Sedang
    return "#3b82f6";                  // Sepi
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function setStatus(type, message) {
    statusText.textContent = message;
    statusDot.className = "ft-status-dot" + (type === "error" ? " error" : "");
    if (type === "success") {
      statusDot.className = "ft-status-dot";
      statusDot.style.background = "#1d6b3a";
    }
  }

  // ==================== START ====================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
