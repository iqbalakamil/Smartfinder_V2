const CATEGORY_CONFIG = globalThis.HOTMAP_CATEGORY_CONFIG;
const MAX_POI_PER_CATEGORY = 50;

const CITY_GROUPS = [
  {
    id: "jakarta_selatan",
    name: "Jakarta Selatan",
    regencies: [
      { id: "3171", name: "KOTA JAKARTA SELATAN" }
    ]
  },
  {
    id: "jakarta_barat",
    name: "Jakarta Barat",
    regencies: [
      { id: "3174", name: "KOTA JAKARTA BARAT" }
    ]
  },
  {
    id: "jakarta_timur",
    name: "Jakarta Timur",
    regencies: [
      { id: "3172", name: "KOTA JAKARTA TIMUR" }
    ]
  },
  {
    id: "jakarta_utara",
    name: "Jakarta Utara",
    regencies: [
      { id: "3175", name: "KOTA JAKARTA UTARA" }
    ]
  },
  {
    id: "jakarta_pusat",
    name: "Jakarta Pusat",
    regencies: [
      { id: "3173", name: "KOTA JAKARTA PUSAT" }
    ]
  },
  {
    id: "kepulauan_seribu",
    name: "Kepulauan Seribu",
    regencies: [
      { id: "3101", name: "KABUPATEN KEPULAUAN SERIBU" }
    ]
  },
  {
    id: "bogor",
    name: "Bogor",
    regencies: [
      { id: "3271", name: "KOTA BOGOR" },
      { id: "3201", name: "KABUPATEN BOGOR" }
    ]
  },
  {
    id: "depok",
    name: "Depok",
    regencies: [
      { id: "3276", name: "KOTA DEPOK" }
    ]
  },
  {
    id: "tangerang",
    name: "Tangerang",
    regencies: [
      { id: "3671", name: "KOTA TANGERANG" },
      { id: "3674", name: "KOTA TANGERANG SELATAN" },
      { id: "3603", name: "KABUPATEN TANGERANG" }
    ]
  },
  {
    id: "bekasi",
    name: "Bekasi",
    regencies: [
      { id: "3275", name: "KOTA BEKASI" },
      { id: "3216", name: "KABUPATEN BEKASI" }
    ]
  },
  {
    id: "bandung",
    name: "Bandung",
    regencies: [
      { id: "3273", name: "KOTA BANDUNG" },
      { id: "3204", name: "KABUPATEN BANDUNG" },
      { id: "3217", name: "KABUPATEN BANDUNG BARAT" }
    ]
  }
];

const state = {
  currentTab: null,
  mapReady: false,
  isSearching: false,
  resultsByCategory: {
    hunian: [],
    kids_education: [],
    affiliate: [],
    others: []
  },
  districtCache: new Map(),
  villageCache: new Map()
};

document.addEventListener("DOMContentLoaded", async () => {
  const ui = getUi();
  populateCities(ui.citySelect);
  ui.categoryButtons.forEach(syncCategoryButtonState);
  bindCategoryButtons(ui);
  bindAreaSelectors(ui);
  bindActions(ui);
  resetSummary(ui);

  await detectActiveTab(ui);
});

function getUi() {
  return {
    categoryButtons: Array.from(document.querySelectorAll("[data-category]")),
    otherKeywords: document.getElementById("otherKeywords"),
    citySelect: document.getElementById("citySelect"),
    districtSelect: document.getElementById("districtSelect"),
    villageSelect: document.getElementById("villageSelect"),
    searchButton: document.getElementById("searchButton"),
    downloadButton: document.getElementById("downloadExcelButton"),
    syncMapButton: document.getElementById("syncMapButton"),
    filenameInput: document.getElementById("filenameInput"),
    message: document.getElementById("message"),
    progressBar: document.getElementById("progressBar"),
    progressLabel: document.getElementById("progressLabel"),
    resultsCompact: document.getElementById("resultsCompact"),
    countTotal: document.getElementById("countTotal"),
    countHunian: document.getElementById("countHunian"),
    countKids: document.getElementById("countKids"),
    countAffiliate: document.getElementById("countAffiliate"),
    countOthers: document.getElementById("countOthers")
  };
}

function bindCategoryButtons(ui) {
  ui.categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");
      syncCategoryButtonState(button);
      const othersActive = getSelectedCategories().includes("others");
      ui.otherKeywords.disabled = !othersActive;
      if (!othersActive) {
        ui.otherKeywords.value = "";
      }
      refreshSearchButtonState(ui);
    });
  });
}

function bindAreaSelectors(ui) {
  ui.citySelect.addEventListener("change", async () => {
    clearSelect(ui.districtSelect, "Pilih kecamatan");
    clearSelect(ui.villageSelect, "Pilih kelurahan");
    ui.districtSelect.disabled = true;
    ui.villageSelect.disabled = true;

    const cityGroup = getSelectedCityGroup(ui.citySelect.value);
    if (!cityGroup) {
      refreshSearchButtonState(ui);
      return;
    }

    setMessage(ui, `Memuat kecamatan untuk area ${cityGroup.name}...`);
    setProgress(ui, 0);

    try {
      const districts = await loadDistrictsForCity(cityGroup);
      fillSelect(ui.districtSelect, districts, "Semua kecamatan");
      ui.districtSelect.disabled = false;
      setMessage(ui, `Kecamatan untuk ${cityGroup.name} berhasil dimuat.`, "success");
    } catch (error) {
      setMessage(ui, `Gagal memuat kecamatan: ${error.message}`, "error");
    }

    refreshSearchButtonState(ui);
  });

  ui.districtSelect.addEventListener("change", async () => {
    clearSelect(ui.villageSelect, "Pilih kelurahan");
    ui.villageSelect.disabled = true;

    const districtId = ui.districtSelect.value;
    if (!districtId) {
      refreshSearchButtonState(ui);
      return;
    }

    const selectedOption = ui.districtSelect.selectedOptions[0];
    setMessage(ui, `Memuat kelurahan untuk ${selectedOption.textContent}...`);

    try {
      const villages = await loadVillagesForDistrict(districtId);
      fillSelect(ui.villageSelect, villages, "Semua kelurahan");
      ui.villageSelect.disabled = false;
      setMessage(ui, `Kelurahan untuk ${selectedOption.textContent} berhasil dimuat.`, "success");
    } catch (error) {
      setMessage(ui, `Gagal memuat kelurahan: ${error.message}`, "error");
    }

    refreshSearchButtonState(ui);
  });
}

function bindActions(ui) {
  ui.searchButton.addEventListener("click", async () => {
    if (state.isSearching) {
      return;
    }

    const selectedCategories = getSelectedCategories();
    if (!selectedCategories.length) {
      setMessage(ui, "Pilih minimal satu kategori pencarian.", "error");
      return;
    }

    const cityGroup = getSelectedCityGroup(ui.citySelect.value);
    if (!cityGroup) {
      setMessage(ui, "Pilih kota terlebih dahulu.", "error");
      return;
    }

    const searchPlan = buildSearchPlan(ui);
    if (!searchPlan.length) {
      setMessage(ui, "Keyword pencarian kosong. Isi kategori Lainnya jika ingin dipakai.", "error");
      return;
    }

    state.isSearching = true;
    state.resultsByCategory = {
      hunian: [],
      kids_education: [],
      affiliate: [],
      others: []
    };

    renderResults(ui);
    resetSummary(ui);
    ui.downloadButton.disabled = true;
    ui.syncMapButton.disabled = true;
    ui.searchButton.disabled = true;

    try {
      await runSearch(ui, searchPlan, cityGroup);
      const totalRows = getAllResults().length;
      if (totalRows > 0) {
        setMessage(
          ui,
          `Selesai. Total ${totalRows} POI. Hunian ${state.resultsByCategory.hunian.length}, Kids Education ${state.resultsByCategory.kids_education.length}, Affiliate ${state.resultsByCategory.affiliate.length}, Lainnya ${state.resultsByCategory.others.length}.`,
          "success"
        );
        ui.downloadButton.disabled = false;
        ui.syncMapButton.disabled = false;
      } else {
        setMessage(ui, "Pencarian selesai, tetapi belum ada data yang ditemukan.", "error");
      }
    } catch (error) {
      setMessage(ui, `Pencarian gagal: ${error.message}`, "error");
    } finally {
      state.isSearching = false;
      refreshSearchButtonState(ui);
    }
  });

  ui.downloadButton.addEventListener("click", () => {
    const baseName = slugify(ui.filenameInput.value.trim() || "smartkidz_hotmap");
    const exported = [];

    Object.entries(state.resultsByCategory).forEach(([category, rows]) => {
      if (!rows.length) {
        return;
      }

      const sheetData = rows.map((item) => ({
        kategori: item.categoryLabel,
        keyword: item.keyword,
        title: item.title,
        rating: normalizeNumericValue(item.rating),
        reviews: normalizeIntegerValue(item.reviewCount),
        phone: item.phone,
        industry: item.industry,
        address: item.address,
        website: item.companyUrl,
        latitude: item.latitude,
        longitude: item.longitude,
        header_link_raw: item.headerLinkRaw || "",
        google_maps_link: item.href
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
      XLSX.writeFile(workbook, `${baseName}_${CATEGORY_CONFIG[category].exportLabel}.xlsx`);
      exported.push(CATEGORY_CONFIG[category].exportLabel);
    });

    if (exported.length) {
      setMessage(ui, `File Excel berhasil diunduh terpisah: ${exported.join(", ")}.`, "success");
    } else {
      setMessage(ui, "Belum ada data untuk diunduh.", "error");
    }
  });

  ui.syncMapButton.addEventListener("click", async () => {
    const items = getAllResults()
      .map((item) => ({
        title: item.title,
        href: item.href,
        headerLinkRaw: item.headerLinkRaw || item.href,
        latitude: item.latitude,
        longitude: item.longitude,
        category: item.category,
        categoryLabel: item.categoryLabel,
        keyword: item.keyword,
        address: item.address,
        signal: item.category === "others" ? "neutral" : "positive"
      }))
      .filter((item) => item.headerLinkRaw || item.href || (item.latitude !== "" && item.longitude !== ""));

    if (!items.length) {
      setMessage(ui, "Belum ada POI berkoordinat yang bisa dikirim ke peta.", "error");
      return;
    }

    ui.syncMapButton.disabled = true;
    setMessage(ui, "Mengirim hasil Hotmap V2 ke peta lokal...");

    try {
      const response = await fetch("http://127.0.0.1:3000/api/hotmap-v2/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ items })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      setMessage(ui, `Berhasil kirim ${payload.imported || items.length} titik ke peta. Buka dashboard dan jalankan analisa lokasi yang sama.`, "success");
    } catch (error) {
      setMessage(ui, `Gagal kirim ke peta lokal: ${error.message}`, "error");
    } finally {
      ui.syncMapButton.disabled = false;
    }
  });
}

async function detectActiveTab(ui) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTab = tabs[0] || null;

  if (state.currentTab && state.currentTab.url && state.currentTab.url.includes("google.com/maps")) {
    state.mapReady = true;
    setMessage(ui, "Google Maps terdeteksi. Silakan pilih area dan mulai pencarian.", "success");
  } else {
    state.mapReady = false;
    setMessage(ui, "Buka tab Google Maps terlebih dahulu, lalu buka popup ini lagi.", "error");
  }

  refreshSearchButtonState(ui);
}

function populateCities(selectElement) {
  CITY_GROUPS.forEach((city) => {
    const option = document.createElement("option");
    option.value = city.id;
    option.textContent = city.name;
    selectElement.appendChild(option);
  });
}

function refreshSearchButtonState(ui) {
  const citySelected = Boolean(ui.citySelect.value);
  const categorySelected = getSelectedCategories().length > 0;
  ui.searchButton.disabled = !state.mapReady || state.isSearching || !citySelected || !categorySelected;
}

function getSelectedCategories() {
  return Array.from(document.querySelectorAll("[data-category].active")).map((button) => button.dataset.category);
}

function getSelectedCityGroup(cityId) {
  return CITY_GROUPS.find((city) => city.id === cityId) || null;
}

function clearSelect(selectElement, placeholder) {
  selectElement.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  selectElement.appendChild(option);
}

function fillSelect(selectElement, items, defaultLabel) {
  clearSelect(selectElement, defaultLabel);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label || item.name;
    selectElement.appendChild(option);
  });
}

function syncCategoryButtonState(button) {
  const toggleText = button.querySelector(".toggle-text");
  if (toggleText) {
    toggleText.textContent = button.classList.contains("active") ? "ON" : "OFF";
  }
}

async function loadDistrictsForCity(cityGroup) {
  if (state.districtCache.has(cityGroup.id)) {
    return state.districtCache.get(cityGroup.id);
  }

  const districtLists = await Promise.all(
    cityGroup.regencies.map(async (regency) => {
      const response = await fetch(`https://emsifa.github.io/api-wilayah-indonesia/api/districts/${regency.id}.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const districts = await response.json();
      return districts.map((district) => ({
        ...district,
        regencyName: regency.name
      }));
    })
  );

  const flattened = districtLists.flat();
  const nameCounts = flattened.reduce((accumulator, district) => {
    const key = district.name.toUpperCase();
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  const districts = flattened
    .map((district) => ({
      id: district.id,
      name: district.name,
      label: nameCounts[district.name.toUpperCase()] > 1 ? `${toTitleCase(district.name)} - ${toTitleCase(district.regencyName)}` : toTitleCase(district.name)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "id"));

  state.districtCache.set(cityGroup.id, districts);
  return districts;
}

async function loadVillagesForDistrict(districtId) {
  if (state.villageCache.has(districtId)) {
    return state.villageCache.get(districtId);
  }

  const response = await fetch(`https://emsifa.github.io/api-wilayah-indonesia/api/villages/${districtId}.json`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const villages = (await response.json())
    .map((village) => ({
      id: village.id,
      name: village.name,
      label: toTitleCase(village.name)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "id"));

  state.villageCache.set(districtId, villages);
  return villages;
}

function buildSearchPlan(ui) {
  const categories = getSelectedCategories();
  const otherKeywords = parseOtherKeywords(ui.otherKeywords.value);
  const districtLabel = ui.districtSelect.value ? ui.districtSelect.selectedOptions[0].textContent : "";
  const villageLabel = ui.villageSelect.value ? ui.villageSelect.selectedOptions[0].textContent : "";
  const cityLabel = ui.citySelect.selectedOptions[0] ? ui.citySelect.selectedOptions[0].textContent : "";

  const locationParts = [villageLabel, districtLabel, cityLabel].filter(Boolean);
  const locationLabel = locationParts.join(", ");
  const searchPlan = [];

  categories.forEach((category) => {
    const config = CATEGORY_CONFIG[category];
    const keywords = category === "others" ? otherKeywords : config.keywords;
    keywords.forEach((keyword) => {
      const query = [keyword, locationLabel].filter(Boolean).join(" ");
      searchPlan.push({
        category,
        categoryLabel: config.label,
        keyword,
        query,
        cityLabel,
        districtLabel,
        villageLabel
      });
    });
  });

  return searchPlan;
}

function parseOtherKeywords(value) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

async function runSearch(ui, searchPlan, cityGroup) {
  const seenByCategory = {
    hunian: new Set(),
    kids_education: new Set(),
    affiliate: new Set(),
    others: new Set()
  };

  for (let index = 0; index < searchPlan.length; index += 1) {
    const task = searchPlan[index];
    const progress = Math.round((index / searchPlan.length) * 100);
    setProgress(ui, progress);
    setMessage(
      ui,
      `Mencari ${task.categoryLabel} dengan keyword "${task.keyword}" di ${cityGroup.name} (${index + 1}/${searchPlan.length})...`
    );

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(task.query)}`;
    await navigateTabAndWait(state.currentTab.id, searchUrl);
    await sleep(2200);

    const injected = await chrome.scripting.executeScript({
      target: { tabId: state.currentTab.id },
      func: scrapeGoogleMapsResults
    });

    const rows = (injected[0] && injected[0].result) || [];
    rows.forEach((row) => {
      if (state.resultsByCategory[task.category].length >= MAX_POI_PER_CATEGORY) {
        return;
      }

      const dedupeKey = `${row.title}|${row.address}|${row.phone}|${row.href}`.toLowerCase();
      if (seenByCategory[task.category].has(dedupeKey)) {
        return;
      }

      seenByCategory[task.category].add(dedupeKey);
      state.resultsByCategory[task.category].push({
        ...row,
        ...parseCoordinatesFromGoogleMapsLink(row.href),
        headerLinkRaw: row.href,
        category: task.category,
        categoryLabel: task.categoryLabel,
        keyword: task.keyword,
        city: task.cityLabel,
        district: task.districtLabel,
        village: task.villageLabel
      });
    });

    renderResults(ui);
    updateSummary(ui);
  }

  setProgress(ui, 100);
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function navigateTabAndWait(tabId, url) {
  const waiting = waitForTabComplete(tabId);
  await chrome.tabs.update(tabId, { url });
  await waiting;
}

function renderResults(ui) {
  const sections = [
    { key: "hunian", label: "Hunian" },
    { key: "kids_education", label: "Kids Education" },
    { key: "affiliate", label: "Affiliate" },
    { key: "others", label: "Lainnya" }
  ];

  ui.resultsCompact.innerHTML = sections
    .map(({ key, label }) => {
      const rows = state.resultsByCategory[key] || [];
      const itemsHtml = rows.length
        ? rows
            .map((item) => {
              const name = escapeHtml(item.title || "-");
              const link = item.href
                ? `<a href="${escapeAttribute(item.href)}" target="_blank" rel="noreferrer">${escapeHtml(item.href)}</a>`
                : "-";
              return `<li><strong>${name}</strong><br>${link}</li>`;
            })
            .join("")
        : "<li>Belum ada data.</li>";

      return `
        <div class="compact-group">
          <p><strong>${label}</strong> (${rows.length})</p>
          <ul>${itemsHtml}</ul>
        </div>
      `;
    })
    .join("");
}

function updateSummary(ui) {
  ui.countTotal.textContent = getAllResults().length;
  ui.countHunian.textContent = state.resultsByCategory.hunian.length;
  ui.countKids.textContent = state.resultsByCategory.kids_education.length;
  ui.countAffiliate.textContent = state.resultsByCategory.affiliate.length;
  ui.countOthers.textContent = state.resultsByCategory.others.length;
}

function resetSummary(ui) {
  ui.countTotal.textContent = "0";
  ui.countHunian.textContent = "0";
  ui.countKids.textContent = "0";
  ui.countAffiliate.textContent = "0";
  ui.countOthers.textContent = "0";
}

function getAllResults() {
  return Object.values(state.resultsByCategory).flat();
}

function setMessage(ui, text, type) {
  ui.message.textContent = text;
  ui.message.className = `message${type ? ` ${type}` : ""}`;
}

function setProgress(ui, percent) {
  ui.progressBar.style.width = `${percent}%`;
  ui.progressLabel.textContent = `${percent}%`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function toTitleCase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeIntegerValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const digitsOnly = String(value).replace(/[^\d-]/g, "");
  if (!digitsOnly) {
    return "";
  }

  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isNaN(parsed) ? "" : parsed;
}

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const normalized = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized) {
    return "";
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? "" : parsed;
}

function parseCoordinatesFromGoogleMapsLink(value) {
  const href = String(value || "");
  const latMatch = href.match(/8m2!3d(-?\d+(?:\.\d+)?)/i);
  const lonMatch = href.match(/!4d(-?\d+(?:\.\d+)?)(?:!|$)/i);
  if (latMatch && lonMatch) {
    return {
      latitude: Number(latMatch[1]),
      longitude: Number(lonMatch[1])
    };
  }

  return {
    latitude: "",
    longitude: ""
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeGoogleMapsResults() {
  const sleepInsidePage = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getFeed = () =>
    document.querySelector('div[role="feed"]') ||
    document.querySelector('div[aria-label][role="main"] div[role="feed"]');

  const resolveHeaderLink = (container) => {
    if (!container) {
      return null;
    }

    const titleNode = container.querySelector(".fontHeadlineSmall");
    const candidates = [
      titleNode ? titleNode.closest("a[href]") : null,
      container.querySelector('a.hfpxzc[href*="8m2!3d"]'),
      container.querySelector('a[href*="8m2!3d"][href*="/maps/place/"]'),
      container.querySelector('a[href*="8m2!3d"]'),
      container.querySelector('a.hfpxzc[href]'),
      container.querySelector('a[href*="/maps/place/"]')
    ].filter(Boolean);

    return candidates.find((anchor) => anchor.href && anchor.href.includes("8m2!3d")) || null;
  };

  const extractCardData = (container) => {
    const headerLink = resolveHeaderLink(container);

    if (!container || !headerLink) {
      return null;
    }

    const text = container.innerText || "";
    const title = (container.querySelector(".fontHeadlineSmall") || headerLink).textContent.trim();

    let rating = "";
    let reviewCount = "";
    const ratingNode = container.querySelector('[role="img"][aria-label*="star"]');
    if (ratingNode) {
      const ariaLabel = ratingNode.getAttribute("aria-label") || "";
      const ratingMatch = ariaLabel.match(/([0-9]+(?:[.,][0-9]+)?)/);
      const reviewMatch = ariaLabel.match(/([0-9.,]+)\s+review/i);
      rating = ratingMatch ? ratingMatch[1].replace(",", ".") : "";
      reviewCount = reviewMatch ? reviewMatch[1].replace(/[.,]/g, "") : "";
    }

    const phoneMatch = text.match(/(?:\+62|62|0)(?:[\s-]?\d){8,15}/);
    const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, " ").trim() : "";

    const addressNode =
      container.querySelector('button[data-item-id*="address"]') ||
      container.querySelector('[aria-label^="Address:"]');
    const websiteNode =
      container.querySelector('a[data-item-id*="authority"]') ||
      Array.from(container.querySelectorAll("a[href]")).find((anchor) => !anchor.href.includes("google.com/maps/place"));

    const infoSpans = Array.from(container.querySelectorAll(".fontBodyMedium span")).map((node) => node.textContent.trim()).filter(Boolean);
    const industry = infoSpans.find((value) => !/^\d/.test(value) && value.length < 80) || "";
    const address = addressNode
      ? (addressNode.getAttribute("aria-label") || addressNode.textContent || "").replace(/^Address:\s*/i, "").trim()
      : "";

    return {
      title,
      rating,
      reviewCount,
      phone,
      industry,
      address,
      companyUrl: websiteNode ? websiteNode.href : "",
      href: headerLink.href,
      headerLinkRaw: headerLink.href
    };
  };

  const feed = getFeed();
  if (feed) {
    let stableRounds = 0;
    let previousCount = 0;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const currentCount = feed.querySelectorAll('div[role="article"], [jsaction*="mouseover:pane"]').length;
      if (currentCount === previousCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      if (stableRounds >= 4) {
        break;
      }

      previousCount = currentCount;
      feed.scrollTop = feed.scrollHeight;
      await sleepInsidePage(1200);
    }
  }

  const cards = Array.from(document.querySelectorAll('div[role="article"], [jsaction*="mouseover:pane"]'));
  const unique = new Map();

  cards.forEach((container) => {
    const row = extractCardData(container);
    if (!row || !row.title) {
      return;
    }

    const key = `${row.title}|${row.address}|${row.href}`.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  });

  return Array.from(unique.values());
}
