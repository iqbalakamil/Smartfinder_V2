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
const MAX_POI_PER_CATEGORY = 100;
const MAX_CRAWL_PAGES = process.env.VERCEL ? 1 : 8;
// Satu keyword inti per kategori dijalankan untuk setiap kelurahan. Cakupan
// kelurahan tetap lengkap, tetapi crawler tidak membuat ratusan query yang
// akhirnya timeout dan membuang seluruh hasil parsial.
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
const SEARCH_READY_TIMEOUT_MS = VERCEL_MODE ? 10000 : 12000;
const QUERY_POST_LOAD_DELAY_MS = VERCEL_MODE ? 900 : 1000;
const MAX_SCROLL_ROUNDS = VERCEL_MODE ? 4 : 6;
const SCROLL_DELAY_MS = VERCEL_MODE ? 300 : 350;
const MAX_CRAWL_TASKS = VERCEL_MODE ? 3 : 999;
const CRAWL_DEADLINE_MS = Number(process.env.POI_CRAWL_DEADLINE_MS || 75000);

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

function buildQueries(location = {}) {
  const areas = buildSearchAreas(location);
  return areas.flatMap((area) => {
    const locationLabel = buildLocationLabel(area);
    return Object.entries(CATEGORY_CONFIG).flatMap(([mode, config]) =>
      config.keywords.slice(0, KEYWORDS_PER_CATEGORY).map((keyword) => ({
        mode,
        keyword,
        area,
        query: [keyword, locationLabel].filter(Boolean).join(" "),
      })),
    );
  });
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
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
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
      if (parsed.lat && parsed.lon) {
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

async function crawlQuery(page, query) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=id&gl=id&authuser=0`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: process.env.VERCEL ? 30000 : 60000 });
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
  const coordinates = parseCoordinatesFromHref(coordinateHref);
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
      coord_source: coordinates.lat && coordinates.lon ? "google-header-link" : "",
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
    const tasks = buildQueries(location).slice(0, MAX_CRAWL_TASKS);
    let nextTaskIndex = 0;
    const workerCount = Math.min(MAX_CRAWL_PAGES, Math.max(1, tasks.length));

    const workers = Array.from({ length: workerCount }, async () => {
      const page = await pageFactory();
      try {
        while (nextTaskIndex < tasks.length && Date.now() < crawlDeadline) {
          const task = tasks[nextTaskIndex];
          nextTaskIndex += 1;
          console.log(`GOOGLE_MAPS_TASK_START ${nextTaskIndex}/${tasks.length} ${task.mode} ${task.area?.village || ""}`);
          const rows = await crawlQuery(page, task.query).catch(() => []);
          console.log(`GOOGLE_MAPS_TASK_DONE ${nextTaskIndex}/${tasks.length} rows=${rows.length} ${task.mode} ${task.area?.village || ""}`);
          for (const row of rows) {
            if (!shouldKeepRow(row, task)) {
              continue;
            }

            const poi = mapResultToPoi(row, task);
            if ((!poi.lat || !poi.lon) && row.href && !VERCEL_MODE) {
              const resolved = await resolveCoordinatesFromPlacePage(page, row.href).catch(() => ({ lat: null, lon: null, resolvedHref: "" }));
              if (resolved.lat && resolved.lon) {
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
      if (bucket.length < MAX_POI_PER_CATEGORY) {
        bucket.push(item);
        categoryBuckets.set(item.category, bucket);
      }
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
