(function () {
  "use strict";

  // Center on Kota Bogor
  const map = L.map("map", {
    center: [-6.588, 106.795],
    zoom: 13,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | CCTV Kota Bogor (BSW)',
    maxZoom: 19,
  }).addTo(map);

  // Legend
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.style.background = "rgba(255,255,255,0.92)";
    div.style.padding = "8px 12px";
    div.style.borderRadius = "8px";
    div.style.boxShadow = "0 2px 10px rgba(0,0,0,0.15)";
    div.style.fontSize = "12px";
    div.style.lineHeight = "1.5";
    div.innerHTML =
      "<b style='color:#b00020;'>CCTV Kota Bogor (93 Kamera)</b><br>" +
      "Klik titik kamera merah untuk memutar video live stream.<br>" +
      "Sumber: <a href='https://bsw.kotabogor.go.id/cctv' target='_blank' style='color:#b00020;'>bsw.kotabogor.go.id</a>";
    return div;
  };
  legend.addTo(map);

  // DOM Elements
  const panel = document.getElementById("cctv-panel");
  const titleEl = document.getElementById("cctv-title");
  const playerEl = document.getElementById("cctv-player");
  const hintEl = document.getElementById("cctv-hint");
  const linkWrapperEl = document.getElementById("cctv-link-wrapper");
  const closeBtn = document.getElementById("cctv-close-btn");
  const searchInput = document.getElementById("search-input");

  let currentHls = null;

  function destroyPlayer() {
    if (currentHls) {
      try {
        currentHls.destroy();
      } catch (e) {
        console.warn("HLS destroy error:", e);
      }
      currentHls = null;
    }
    if (playerEl) {
      playerEl.innerHTML = "";
    }
    if (hintEl) {
      hintEl.textContent = "";
    }
    if (linkWrapperEl) {
      linkWrapperEl.innerHTML = "";
    }
  }

  closeBtn.addEventListener("click", function () {
    panel.classList.remove("active");
    destroyPlayer();
  });

  function openPlayer(cctv) {
    destroyPlayer();

    const cctvName = cctv.name || "CCTV-" + cctv.id;
    titleEl.textContent = cctvName;
    panel.classList.add("active");

    const src = (cctv.videoSrc || "").trim();

    if (src) {
      // Create HTML5 <video> element
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.muted = true; // Required for browser autoplay
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "contain";
      video.style.backgroundColor = "#000";

      playerEl.appendChild(video);

      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
          maxBufferLength: 10,
          lowLatencyMode: false,
        });
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          video.play().catch(function (err) {
            console.warn("Autoplay was prevented:", err);
          });
        });

        hls.on(window.Hls.Events.ERROR, function (event, data) {
          if (data.fatal) {
            console.error("HLS fatal error:", data);
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
              hintEl.textContent = "Status: Memuat ulang stream...";
              hls.startLoad();
            } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              hintEl.textContent = "Status: Memulihkan media...";
              hls.recoverMediaError();
            } else {
              hintEl.textContent = "Status: Live stream gagal dimuat.";
              hls.destroy();
            }
          }
        });

        currentHls = hls;
        hintEl.textContent = "Status: Stream aktif (restreamer.kotabogor.go.id)";
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS support (Safari / iOS)
        video.src = src;
        video.play().catch(function () {});
        hintEl.textContent = "Status: Stream aktif (Native HLS)";
      } else {
        hintEl.textContent = "Browser ini tidak mendukung pemutaran video HLS.";
      }
    } else {
      hintEl.textContent = "Tautan stream langsung tidak tersedia.";
    }

    // Detail page link
    const detailUrl = (typeof CCTV_DETAIL_BASE !== "undefined" ? CCTV_DETAIL_BASE : "https://bsw.kotabogor.go.id/cctv/") + cctv.id + "/detail";
    linkWrapperEl.innerHTML = `<a href="${detailUrl}" target="_blank" rel="noopener">🔗 Buka Halaman Resmi CCTV di BSW</a>`;
  }

  // Render Markers
  const markers = [];
  const markersLayerGroup = L.layerGroup().addTo(map);

  if (typeof CCTVDATA !== "undefined" && Array.isArray(CCTVDATA)) {
    CCTVDATA.forEach(function (cctv) {
      const icon = L.divIcon({
        className: "",
        html: '<div class="cctv-marker-dot" title="' + (cctv.name || 'CCTV-' + cctv.id) + '"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -10],
      });

      const marker = L.marker([cctv.lat, cctv.lng], { icon: icon });

      marker.bindPopup(
        "<b>" + (cctv.name || "CCTV-" + cctv.id) + "</b><br/>" +
        "<span style='font-size:11px;color:#555;'>Klik untuk menonton live stream</span>"
      );

      marker.on("click", function () {
        map.panTo([cctv.lat, cctv.lng]);
        openPlayer(cctv);
      });

      markersLayerGroup.addLayer(marker);
      markers.push({ cctv: cctv, marker: marker });
    });
  }

  // Live Search Filter
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      const query = (e.target.value || "").toLowerCase().trim();
      markers.forEach(function (item) {
        const name = (item.cctv.name || "").toLowerCase();
        const idStr = String(item.cctv.id);
        if (name.includes(query) || idStr.includes(query)) {
          if (!markersLayerGroup.hasLayer(item.marker)) {
            markersLayerGroup.addLayer(item.marker);
          }
        } else {
          if (markersLayerGroup.hasLayer(item.marker)) {
            markersLayerGroup.removeLayer(item.marker);
          }
        }
      });
    });
  }
})();
