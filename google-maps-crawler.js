const SERVERLESS_CHROMIUM_ENABLED = process.platform === "linux" && (
  /^(1|true|yes)$/i.test(String(process.env.VERCEL || "")) ||
  Boolean(process.env.VERCEL_URL) ||
  Boolean(process.env.VERCEL_REGION) ||
  Boolean(process.env.VERCEL_ENV) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
);
let chromium = null;
let browserLauncher;

if (SERVERLESS_CHROMIUM_ENABLED) {
  try {
    chromium = require("@sparticuz/chromium");
    browserLauncher = require("playwright-core").chromium;
  } catch {
    browserLauncher = require("playwright").chromium;
  }
} else {
  browserLauncher = require("playwright").chromium;
}
const EXTENSION_CATEGORY_CONFIG = require("./hotspot map V.2/category-config.js");
const { scrapePopularTimes, calculateFootTrafficScore, batchScrapePopularTimes } = require("./crawlers/popularTimesScraper");

const POPULAR_TIMES_ENABLED = String(process.env.POPULAR_TIMES_ENABLED || "false").toLowerCase() !== "false";
const POPULAR_TIMES_MAX_POIS = Number(process.env.POPULAR_TIMES_MAX_POIS || 15);
const POPULAR_TIMES_DELAY_MS = Number(process.env.POPULAR_TIMES_DELAY_MS || 1500);
const MIN_REVIEW_COUNT = 0;
const MAX_CRAWL_PAGES = process.env.VERCEL ? 1 : 8;
// Kategori non-hunian memakai satu keyword inti agar crawl tetap cepat.
// Affiliate dikecualikan karena keyword brand (McDonald's/Burger King) harus
// benar-benar dijalankan agar hasil affiliate tidak hanya berisi taman.
const KEYWORDS_PER_CATEGORY = 1;

const CATEGORY_CONFIG = {
  hunian: {
    signal: "positive",
    category: "residential",
    categoryLabel: "Perumahan / Hunian",
    keywords: EXTENSION_CATEGORY_CONFIG.hunian.keywords,
    googleTypes: ["housing_complex"],
    fallbackName: "Kompleks hunian",
  },
  kids_education: {
    signal: "positive",
    category: "education",
    categoryLabel: "Pendidikan anak",
    keywords: EXTENSION_CATEGORY_CONFIG.kids_education.keywords,
    googleTypes: ["school", "preschool"],
    fallbackName: "Kids education",
  },
  affiliate: {
    signal: "positive",
    category: "family-services",
    categoryLabel: "Affiliate keluarga",
    keywords: EXTENSION_CATEGORY_CONFIG.affiliate.keywords,
    googleTypes: ["park", "hospital", "restaurant", "playground"],
    fallbackName: "Affiliate keluarga",
  },
};

const VERCEL_MODE = Boolean(process.env.VERCEL);
const SEARCH_READY_TIMEOUT_MS = VERCEL_MODE ? 5000 : 12000;
const QUERY_POST_LOAD_DELAY_MS = VERCEL_MODE ? 300 : 1000;
const MAX_SCROLL_ROUNDS = VERCEL_MODE ? 2 : 6;
const SCROLL_DELAY_MS = VERCEL_MODE ? 300 : 350;
const GOOGLE_MAPS_NAVIGATION_TIMEOUT_MS = VERCEL_MODE ? 10000 : 30000;
// Keep each request bounded. The radius grid has broad coverage already; running
// every keyword for every intersecting village made a single POI search exceed
// serverless and desktop request limits.
const MAX_CRAWL_TASKS = VERCEL_MODE ? 3 : Number(process.env.POI_MAX_CRAWL_TASKS || 150);
const CRAWL_DEADLINE_MS = Number(process.env.POI_CRAWL_DEADLINE_MS || 210000);
const DEFAULT_SEARCH_RADIUS_METERS = 3000;
const GRID_SEARCH_STEP_KM = 1.2;

function selectBalancedCrawlTasks(tasks, limit) {
  if (tasks.length <= limit) return tasks;
  const selected = [];
  const selectedKeys = new Set();
  const modes = Object.keys(CATEGORY_CONFIG);
  const gridGroups = new Map();
  const areaGroups = new Map();
  for (const task of tasks) {
    const isGridTask = Boolean(task.searchPoint || task.searchScope);
    const area = task.area || {};
    const locationKey = isGridTask
      ? `grid:${task.searchScope || `${task.searchPoint?.lat},${task.searchPoint?.lon}`}`
      : `area:${[area.village, area.subdistrict || area.district, area.city, area.province].filter(Boolean).join("|").toLowerCase()}`;
    const groups = isGridTask ? gridGroups : areaGroups;
    if (!groups.has(locationKey)) groups.set(locationKey, new Map());
    const modeGroups = groups.get(locationKey);
    if (!modeGroups.has(task.mode)) modeGroups.set(task.mode, []);
    modeGroups.get(task.mode).push(task);
  }

  const addTask = (task) => {
    if (!task || selected.length >= limit) return false;
    const key = `${task.mode}|${task.query}`;
    if (selectedKeys.has(key)) return false;
    selectedKeys.add(key);
    selected.push(task);
    return true;
  };

  // Cover every nearby grid point and intersecting area once per POI family
  // before spending the remaining request budget on alternate keywords.
  const orderedLocations = [
    ...Array.from(gridGroups.values()),
    ...Array.from(areaGroups.values()),
  ];
  for (const group of orderedLocations) {
    for (const mode of modes) addTask(group.get(mode)?.[0]);
    if (selected.length >= limit) break;
  }

  const maxVariants = Math.max(0, ...orderedLocations.flatMap((group) =>
    Array.from(group.values()).map((variants) => variants.length)
  ));
  for (let variantIndex = 1; variantIndex < maxVariants && selected.length < limit; variantIndex += 1) {
    for (const group of orderedLocations) {
      for (const mode of modes) {
        addTask(group.get(mode)?.[variantIndex]);
        if (selected.length >= limit) break;
      }
      if (selected.length >= limit) break;
    }
  }

  // Preserve any task families not represented in the location groups.
  for (const task of tasks) {
    if (selected.length >= limit) break;
    addTask(task);
  }
  return selected;
}

async function launchConfiguredBrowser(launchOptions = {}) {
  if (chromium) {
    const executablePath = await chromium.executablePath().catch(() => "");
    if (executablePath) {
      return browserLauncher.launch({
        args: chromium.args,
        executablePath,
        headless: true,
        ...launchOptions,
      });
    }
  }

  return browserLauncher.launch({
    headless: true,
    ...launchOptions,
  });
}

function buildLocationLabel(location = {}) {
  return [location.village, location.subdistrict, location.district, location.city, location.province].filter(Boolean).join(", ");
}

function buildSearchAreas(location = {}) {
  const explicitAreas = Array.isArray(location.searchAreas) ? location.searchAreas : [];
  const fallbackArea = {
    village: location.village || "",
    subdistrict: location.subdistrict || "",
    district: location.district || "",
    city: location.city || "",
    province: location.province || "",
  };

  const unique = new Map();
  const areasToUse = explicitAreas.length ? explicitAreas : [fallbackArea];
  areasToUse.forEach((area) => {
    const key = [area.village, area.subdistrict, area.district, area.city, area.province].filter(Boolean).join("|").toLowerCase();
    if (key && !unique.has(key)) {
      unique.set(key, area);
    }
  });

  return Array.from(unique.values());
}

function buildGridSearchPoints(location = {}) {
  const lat = Number(location.targetLat ?? location.lat);
  const lon = Number(location.targetLon ?? location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  // Overlapping search centers ensure Maps' per-query ranking does not hide
  // places near the edge of the requested circle. The final POI filter still
  // uses the exact center and radius, so outer grid points cannot add outsiders.
  const radiusKm = Math.max(0, Number(location.radiusMeters ?? location.radius ?? DEFAULT_SEARCH_RADIUS_METERS) / 1000);
  const latKm = 1 / 111.32;
  const lonKm = 1 / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const latitudeRange = radiusKm / 111.32;
  const longitudeRange = radiusKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const points = [{ lat, lon, label: "center" }];
  for (let y = -latitudeRange; y <= latitudeRange + 1e-9; y += GRID_SEARCH_STEP_KM * latKm) {
    for (let x = -longitudeRange; x <= longitudeRange + 1e-9; x += GRID_SEARCH_STEP_KM * lonKm) {
      const pointLat = lat + y;
      const pointLon = lon + x;
      if (haversineMeters(lat, lon, pointLat, pointLon) > radiusKm * 1000 + GRID_SEARCH_STEP_KM * 1000) continue;
      points.push({ lat: pointLat, lon: pointLon, label: `grid-${points.length + 1}` });
    }
  }
  return points.sort((left, right) =>
    haversineMeters(lat, lon, left.lat, left.lon) - haversineMeters(lat, lon, right.lat, right.lon)
  );
}

function buildQueries(location = {}) {
  const areas = buildSearchAreas(location);
  const targetAreaLabel = [
    location.village,
    location.subdistrict || location.district,
    location.city,
    location.province,
  ].filter(Boolean).join(", ") || buildLocationLabel(areas[0] || {});
  if (location.poiSearchMode === "mix-search") {
    const area = areas[0] || {};
    const lat = Number(location.targetLat ?? location.lat);
    const lon = Number(location.targetLon ?? location.lon);
    const queries = [
      { mode: "kids_education", keyword: "preschool" },
      { mode: "kids_education", keyword: "bimba" },
      { mode: "kids_education", keyword: "daycare" },
      { mode: "kids_education", keyword: "PAUD" },
      { mode: "kids_education", keyword: "TK" },
      { mode: "affiliate", keyword: "McDonald's" },
      { mode: "affiliate", keyword: "KFC" },
      { mode: "affiliate", keyword: "Burger King" },
      { mode: "affiliate", keyword: "taman" },
      { mode: "affiliate", keyword: "playground" },
      { mode: "affiliate", keyword: "rumah sakit" },
      { mode: "affiliate", keyword: "McDonalds" },
      { mode: "affiliate", keyword: "Pizza Hut OR Domino's Pizza" },
      { mode: "affiliate", keyword: "Starbucks" },
      { mode: "affiliate", keyword: "Subway" },
      { mode: "affiliate", keyword: "J.CO" },
      { mode: "affiliate", keyword: "HokBen" },
      { mode: "affiliate", keyword: "Richeese Factory" },
      { mode: "affiliate", keyword: "Kopi Kenangan" },
      { mode: "affiliate", keyword: "Chatime" },
      { mode: "affiliate", keyword: "bakery restaurant cafe" },
    ];
    // Search the center and four points within the requested 3 km circle.
    // Google Maps ranks only a small page of results for each query, so one
    // center query misses places on the edge of the radius.
    const radiusKm = Math.min(1.8, Math.max(1.2, Number(location.radiusMeters || 3000) / 2000));
    const offsets = [
      { north: 0, east: 0, label: "center" },
      { north: radiusKm, east: 0, label: "north" },
      { north: -radiusKm, east: 0, label: "south" },
      { north: 0, east: radiusKm, label: "east" },
      { north: 0, east: -radiusKm, label: "west" },
    ];
    return offsets.flatMap((offset) => {
      const point = {
        lat: lat + offset.north / 111.32,
        lon: lon + offset.east / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))),
        label: `mix-${offset.label}`,
      };
      return queries.map((item) => ({
        ...item,
        area,
        searchScope: point.label,
        searchPoint: point,
        query: `${item.keyword} near ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`,
      }));
    });
  }

  const areaQueries = areas.flatMap((area) => {
    const locationLabel = buildLocationLabel(area);
    return Object.entries(CATEGORY_CONFIG).flatMap(([mode, config]) => {
      // Hunian memakai seluruh variasi keyword agar cluster/perumahan/apartment
      // yang memakai penamaan berbeda tetap terdeteksi. Kategori lain tetap
      // dibatasi satu keyword untuk menjaga waktu crawl.
      const keywords = mode === "hunian" || mode === "affiliate"
        ? config.keywords
        : config.keywords.slice(0, KEYWORDS_PER_CATEGORY);
      return keywords.map((keyword) => ({
        mode,
        keyword,
        area,
        query: [keyword, locationLabel].filter(Boolean).join(", "),
      }));
    });
  });

  const gridPoints = buildGridSearchPoints(location);
  const gridQueries = gridPoints.flatMap((point) => Object.entries(CATEGORY_CONFIG).flatMap(([mode, config]) => {
    const keywords = mode === "hunian" || mode === "affiliate"
      ? config.keywords
      : config.keywords.slice(0, KEYWORDS_PER_CATEGORY);
    return keywords.map((keyword) => ({
      mode,
      keyword,
      area: areas[0] || {},
      query: `${keyword} near ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}${targetAreaLabel ? `, ${targetAreaLabel}` : ""}`,
      searchScope: point.label,
      searchPoint: point,
    }));
  }));

  const unique = new Map();
  // Prioritaskan hasil berbasis titik target supaya batas 100 POI per kategori
  // tidak habis lebih dulu oleh hasil query kelurahan yang biasanya lebih luas.
  [...gridQueries, ...areaQueries].forEach((task) => {
    const key = `${task.mode}|${task.keyword}|${task.query}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, task);
  });
  return Array.from(unique.values());
}

function normalizePhone(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseReviewCount(value) {
  const normalized = String(value || "").replace(/[^\d]/g, "");
  if (!normalized) {
    return 0;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function shouldKeepRow(row, task) {
  const reviewCount = parseReviewCount(row.reviewCount);
  if (reviewCount >= MIN_REVIEW_COUNT) {
    return true;
  }

  if (task.mode === "hunian") {
    return true;
  }

  return Boolean(row.title && row.href);
}

function parseCoordinatesFromHref(href) {
  let value = String(href || "");
  try { value = decodeURIComponent(value); } catch {}
  const headerLatMatch = value.match(/8m2!3d(-?\d+(?:\.\d+)?)/i);
  const headerLonMatch = value.match(/!4d(-?\d+(?:\.\d+)?)(?:!|$)/i);
  if (headerLatMatch && headerLonMatch) {
    return {
      lat: Number(headerLatMatch[1]),
      lon: Number(headerLonMatch[1]),
    };
  }

  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i,
    /ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return {
        lat: /!2d/i.test(pattern.source) ? Number(match[2]) : Number(match[1]),
        lon: /!2d/i.test(pattern.source) ? Number(match[1]) : Number(match[2]),
      };
    }
  }

  // Koordinat @ pada URL hasil pencarian adalah viewport dan bisa menunjuk
  // ke pusat area, bukan tempatnya. Untuk URL halaman tempat langsung,
  // @ biasanya merupakan posisi tempat dan boleh dipakai sebagai cadangan.
  if (/\/maps\/place\//i.test(value)) {
    const placeViewport = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|[/?#]|$)/i);
    if (placeViewport) {
      return { lat: Number(placeViewport[1]), lon: Number(placeViewport[2]) };
    }
  }

  return {
    lat: null,
    lon: null,
  };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveCoordinatesFromPlacePage(page, href) {
  if (!href) {
    return { lat: null, lon: null, resolvedHref: "" };
  }

  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 10000 });
    await page.waitForTimeout(500);

    const candidates = await page.evaluate(() => {
      const values = [];
      values.push(window.location.href);

      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && canonical.href) {
        values.push(canonical.href);
      }

      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl && ogUrl.content) {
        values.push(ogUrl.content);
      }

      const openInMapsLink = Array.from(document.querySelectorAll("a[href]"))
        .map((node) => node.href)
        .find((url) => url.includes("/maps/place/") || url.includes("/maps/dir/"));
      if (openInMapsLink) {
        values.push(openInMapsLink);
      }

      return values.filter(Boolean);
    });

    for (const candidate of candidates) {
      const parsed = parseCoordinatesFromHref(candidate);
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) {
        return {
          lat: parsed.lat,
          lon: parsed.lon,
          resolvedHref: candidate,
        };
      }
    }
  } catch {
    return { lat: null, lon: null, resolvedHref: "" };
  }

  return { lat: null, lon: null, resolvedHref: "" };
}

async function maybeDismissGoogleConsent(page) {
  try {
    await page.evaluate(() => {
      const candidates = [
        "accept all",
        "i agree",
        "setuju",
        "terima semua",
        "accept",
        "saya setuju",
        "agree",
      ];
      const nodes = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
      for (const node of nodes) {
        const label = String(node.innerText || node.value || node.getAttribute("aria-label") || "").trim().toLowerCase();
        if (!label) {
          continue;
        }
        if (candidates.some((candidate) => label.includes(candidate))) {
          node.click();
          return true;
        }
      }
      return false;
    });
    await page.waitForTimeout(800);
  } catch {
    // Ignore consent handling failures and continue with the crawl.
  }
}

async function scrapeGoogleMapsResults(options = {}) {
  const sleepInsidePage = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxScrollRounds = Number(options.maxScrollRounds || 12);
  const scrollDelayMs = Number(options.scrollDelayMs || 700);
  const stableRoundTarget = Number(options.stableRoundTarget || 4);

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
      container.querySelector('a[href*="/maps/place/"]'),
      container.querySelector('a[href*="/maps/search/"]'),
      container.querySelector('a[href*="/maps/dir/"]'),
      container.querySelector('a[href*="google.com/maps"]'),
      container.querySelector('a[href*="maps.google.com"]'),
      container.querySelector("a[href]"),
    ].filter(Boolean);

    const isGenericText = (text = "") => /^(directions?|rute|petunjuk arah|save|simpan|bagikan|share|website|call|telepon|menu)$/i.test(text.trim());
    const isMapsHref = (href = "") => /google\.com\/maps|maps\.google\.com/i.test(href);
    const isLikelyPlaceHref = (href = "") => /\/maps\/(place|search|dir)\//i.test(href) || href.includes("8m2!3d") || href.includes("@") || /[?&]cid=/i.test(href);

    const coordinateAnchor = candidates.find((anchor) => {
      const href = anchor.href || "";
      return /(?:8m2!3d|!3d-?\d|@-?\d|[?&](?:q|ll)=)/i.test(href);
    });
    if (coordinateAnchor) {
      return coordinateAnchor;
    }

    return candidates.find((anchor) => {
      const href = anchor.href || "";
      const text = (anchor.textContent || anchor.getAttribute("aria-label") || "").trim();
      if (!href || !isMapsHref(href)) {
        return false;
      }
      if (isLikelyPlaceHref(href)) {
        return true;
      }
      return Boolean(text) && !isGenericText(text);
    }) || null;
  };

  const extractCardData = (container) => {
    const headerLink = resolveHeaderLink(container);

    if (!container || !headerLink) {
      return null;
    }

    const text = container.innerText || "";
    const titleNode = container.querySelector(".fontHeadlineSmall");
    const title = (
      titleNode?.textContent ||
      headerLink?.getAttribute("aria-label") ||
      headerLink?.textContent ||
      text.split("\n").map((line) => line.trim()).find(Boolean) ||
      ""
    ).trim();
    if (!title) {
      return null;
    }

    let rating = "";
    let reviewCount = "";
    const ratingNode = container.querySelector('[role="img"][aria-label*="star"]');
    if (ratingNode) {
      const ariaLabel = ratingNode.getAttribute("aria-label") || "";
      const ratingMatch = ariaLabel.match(/([0-9]+(?:[.,][0-9]+)?)/);
      const reviewMatch = ariaLabel.match(/([0-9.,]+)\s+(?:review|reviews|ulasan)/i);
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

    const infoSpans = Array.from(container.querySelectorAll(".fontBodyMedium span"))
      .map((node) => node.textContent.trim())
      .filter(Boolean);
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
      headerLinkRaw: headerLink.href,
    };
  };

  const feed = getFeed();
  if (feed) {
    let stableRounds = 0;
    let previousCount = 0;

    for (let attempt = 0; attempt < maxScrollRounds; attempt += 1) {
      const currentCount = feed.querySelectorAll('div[role="article"], [jsaction*="mouseover:pane"]').length;
      if (currentCount === previousCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      if (stableRounds >= stableRoundTarget) {
        break;
      }

      previousCount = currentCount;
      feed.scrollTop = feed.scrollHeight;
      await sleepInsidePage(scrollDelayMs);
    }
  }

  const cards = Array.from(document.querySelectorAll('div[role="article"], [jsaction*="mouseover:pane"]'));
  const placeAnchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"], a[href*="/maps/search/"], a[href*="/maps/dir/"]'));
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

  placeAnchors.forEach((anchor) => {
    const container = anchor.closest('div[role="article"], [jsaction*="mouseover:pane"]') || anchor.closest("div") || anchor.parentElement;
    if (!container) {
      return;
    }
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

async function crawlQuery(page, task) {
  const point = task.searchPoint;
  const mixSearch = point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon));
  const searchText = mixSearch ? task.keyword : task.query;
  // Put the search term in the Maps search path and anchor its viewport to the
  // actual target coordinate. A textual "near lat,lon" query is often ignored
  // by Maps, which otherwise returns places from central Jakarta.
  const url = mixSearch
    ? `https://www.google.com/maps/search/${encodeURIComponent(searchText)}/@${Number(point.lat)},${Number(point.lon)},15z?hl=id&gl=id&authuser=0`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchText)}&hl=id&gl=id&authuser=0`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOOGLE_MAPS_NAVIGATION_TIMEOUT_MS });
  await maybeDismissGoogleConsent(page);
  await page.waitForFunction(() => Boolean(
    document.querySelector('div[role="feed"]') ||
    document.querySelector('div[role="article"]') ||
    document.querySelector('a[href*="/maps/place/"]') ||
    document.querySelector('a[href*="/maps/search/"]') ||
    document.querySelector('a[href*="/maps/dir/"]') ||
    document.querySelector(".fontHeadlineSmall")
  ), { timeout: SEARCH_READY_TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(QUERY_POST_LOAD_DELAY_MS);
  let rows = await page.evaluate(scrapeGoogleMapsResults, {
    maxScrollRounds: MAX_SCROLL_ROUNDS,
    scrollDelayMs: SCROLL_DELAY_MS,
    stableRoundTarget: VERCEL_MODE ? 3 : 4,
  }).catch(() => []);
  if (!rows.length) {
    try {
      const debug = await page.evaluate(() => {
        const bodyText = document.body ? String(document.body.innerText || "").slice(0, 1200) : "";
        return {
          title: document.title || "",
          url: window.location.href || "",
          bodyText,
        };
      });
      console.log("GOOGLE_MAPS_CRAWL_EMPTY", JSON.stringify({
        query,
        title: debug.title,
        url: debug.url,
        bodyText: debug.bodyText,
      }));
    } catch {
      // ignore debug collection errors
    }
    await page.waitForTimeout(VERCEL_MODE ? 1500 : 2500);
    rows = await page.evaluate(scrapeGoogleMapsResults, {
      maxScrollRounds: MAX_SCROLL_ROUNDS,
      scrollDelayMs: SCROLL_DELAY_MS,
      stableRoundTarget: VERCEL_MODE ? 3 : 4,
    }).catch(() => []);
  }
  return rows;
}

function mapResultToPoi(row, task) {
  const config = CATEGORY_CONFIG[task.mode];
  // Google sering menaruh koordinat aktual pada headerLinkRaw, sementara href
  // hanya berisi URL redirect/pencarian. Prioritaskan link header agar POI
  // yang sudah ditemukan tidak hilang sebelum dikirim ke peta.
  const coordinateHref = row.headerLinkRaw || row.href;
  const parsedCoordinates = parseCoordinatesFromHref(coordinateHref);
  const directLat = Number(row.lat ?? row.latitude ?? row.coordinates?.lat ?? row.position?.lat);
  const directLon = Number(row.lon ?? row.lng ?? row.longitude ?? row.coordinates?.lon ?? row.coordinates?.lng ?? row.position?.lon ?? row.position?.lng);
  const directCoordinatesValid = Number.isFinite(directLat) && Number.isFinite(directLon)
    && directLat >= -90 && directLat <= 90 && directLon >= -180 && directLon <= 180;
  const parsedCoordinatesValid = Number.isFinite(parsedCoordinates.lat) && Number.isFinite(parsedCoordinates.lon)
    && parsedCoordinates.lat >= -90 && parsedCoordinates.lat <= 90
    && parsedCoordinates.lon >= -180 && parsedCoordinates.lon <= 180;
  const coordinates = directCoordinatesValid
    ? { lat: directLat, lon: directLon, source: "google-result-fields" }
    : parsedCoordinatesValid
      ? parsedCoordinates
      : { lat: null, lon: null };
  const reviewCount = parseReviewCount(row.reviewCount);
  return {
    name: row.title || config.fallbackName,
    lat: coordinates.lat,
    lon: coordinates.lon,
    tags: {
      category_hint: config.category,
      address: row.address || "",
      phone: normalizePhone(row.phone),
      website: row.companyUrl || "",
      maps_link: row.href || row.headerLinkRaw || "",
      header_link_raw: row.headerLinkRaw || row.href || "",
      coord_source: Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lon)
        ? (coordinates.source || "google-header-link")
        : "",
      keyword: task.keyword,
      query: task.query,
      industry: row.industry || "",
      google_types: config.googleTypes,
      crawl_mode: task.mode,
      rating: row.rating || "",
      review_count: reviewCount,
      search_area_label: buildLocationLabel(task.area || {}),
      search_area_village: task.area?.village || "",
      search_area_subdistrict: task.area?.subdistrict || "",
      search_area_city: task.area?.city || "",
    },
    signal: config.signal,
    category: config.category,
    categoryLabel: config.categoryLabel,
    source: "google-maps-crawl",
  };
}

async function crawlGoogleMapsPois(location = {}) {
  const debug = {
    platform: process.platform,
    serverlessChromium: SERVERLESS_CHROMIUM_ENABLED,
    location: buildLocationLabel(location),
    taskCount: buildQueries(location).length,
  };

  let browser;
  try {
    browser = await launchConfiguredBrowser();
  } catch (error) {
    return Object.assign([], {
      debug: {
        ...debug,
        stage: "browser-launch",
        message: error.message,
      },
    });
  }

  let context = null;
  const crawlDeadline = Date.now() + CRAWL_DEADLINE_MS;

  try {
    context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "id-ID",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }).catch(() => null);
    const pageFactory = async () => {
      if (context) {
        const page = await context.newPage();
        return page;
      }
      return browser.newPage();
    };

    const all = [];
    const mixSearch = location.poiSearchMode === "mix-search";
    const taskLimit = mixSearch && VERCEL_MODE
      ? Math.max(3, Math.min(16, Number(process.env.POI_MIX_SEARCH_TASKS || 16)))
      : MAX_CRAWL_TASKS;
    const tasks = selectBalancedCrawlTasks(buildQueries(location), taskLimit);
    debug.selectedTaskCount = tasks.length;
    debug.taskLimit = taskLimit;
    let nextTaskIndex = 0;
    const mixWorkerLimit = mixSearch && VERCEL_MODE ? 4 : MAX_CRAWL_PAGES;
    const workerCount = Math.min(mixWorkerLimit, Math.max(1, tasks.length));

    const workers = Array.from({ length: workerCount }, async () => {
      const page = await pageFactory();
      try {
        while (nextTaskIndex < tasks.length && Date.now() < crawlDeadline) {
          const taskIndex = nextTaskIndex;
          const task = tasks[taskIndex];
          nextTaskIndex += 1;
          console.log(`GOOGLE_MAPS_TASK_START ${taskIndex + 1}/${tasks.length} ${task.mode} ${task.searchScope || task.area?.village || ""}`);
          const rows = await crawlQuery(page, task).catch(() => []);
          console.log(`GOOGLE_MAPS_TASK_DONE ${taskIndex + 1}/${tasks.length} rows=${rows.length} ${task.mode} ${task.searchScope || task.area?.village || ""}`);
          for (const row of rows) {
            if (!shouldKeepRow(row, task)) {
              continue;
            }

            const poi = mapResultToPoi(row, task);
            if ((!Number.isFinite(poi.lat) || !Number.isFinite(poi.lon)) && (row.headerLinkRaw || row.href) && !VERCEL_MODE) {
              const resolved = await resolveCoordinatesFromPlacePage(page, row.headerLinkRaw || row.href).catch(() => ({ lat: null, lon: null, resolvedHref: "" }));
              if (Number.isFinite(resolved.lat) && Number.isFinite(resolved.lon)) {
                poi.lat = resolved.lat;
                poi.lon = resolved.lon;
                poi.tags = {
                  ...(poi.tags || {}),
                  coord_source: "google-place-page",
                  place_page_url: resolved.resolvedHref || row.href,
                };
              }
            }

            all.push(poi);
          }
        }
      } finally {
        await page.close().catch(() => {});
      }
    });

    await Promise.all(workers);

    if (Date.now() >= crawlDeadline && nextTaskIndex < tasks.length) {
      console.log(`GOOGLE_MAPS_CRAWL_PARTIAL completed=${all.length} remaining_tasks=${tasks.length - nextTaskIndex}`);
    }

    const deduped = new Map();
    for (const item of all) {
      const key = `${String(item.name || "").toLowerCase()}|${String(item.tags?.address || "").toLowerCase()}|${item.category}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }

    const categoryBuckets = new Map();
    for (const item of deduped.values()) {
      const bucket = categoryBuckets.get(item.category) || [];
      bucket.push(item);
      categoryBuckets.set(item.category, bucket);
    }

    let results = Array.from(categoryBuckets.values()).flat();

    // Phase 2: Scrape Popular Times for foot traffic data
    if (POPULAR_TIMES_ENABLED && results.length > 0 && !VERCEL_MODE) {
      try {
        const popularTimesPage = await pageFactory();
        try {
          const footTrafficData = await batchScrapePopularTimes(popularTimesPage, results, {
            maxPoIs: POPULAR_TIMES_MAX_POIS,
            delayBetweenMs: POPULAR_TIMES_DELAY_MS,
          });

          // Merge foot traffic data into POIs
          results = results.map((poi) => {
            const key = `${poi.name}|${poi.lat}|${poi.lon}`;
            const ftData = footTrafficData.get(key);
            if (ftData) {
              return {
                ...poi,
                tags: {
                  ...(poi.tags || {}),
                  popular_times: ftData.popularTimes,
                  foot_traffic_score: ftData.footTraffic.score,
                  foot_traffic_level: ftData.footTraffic.level,
                  foot_traffic_peak_hour: ftData.footTraffic.peakHour,
                  foot_traffic_business_avg: ftData.footTraffic.businessHourAvg,
                  foot_traffic_reasoning: ftData.footTraffic.reasoning,
                },
              };
            }
            return poi;
          });

          console.log(`POPULAR_TIMES_SCRAPE_DONE: ${footTrafficData.size} POIs enriched with foot traffic data.`);
        } finally {
          await popularTimesPage.close().catch(() => {});
        }
      } catch (error) {
        console.error("POPULAR_TIMES_BATCH_ERROR:", error.message);
      }
    }

    results.debug = {
      ...debug,
      stage: "done",
      total: results.length,
      popularTimesEnabled: POPULAR_TIMES_ENABLED,
    };
    return results;
  } catch (error) {
    return Object.assign([], {
      debug: {
        ...debug,
        stage: "crawl",
        message: error.message,
      },
    });
  } finally {
    // The context is optional, so close it before the browser if it exists.
    if (context) {
      await context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

module.exports = {
  crawlGoogleMapsPois,
};
