const puppeteer = require("puppeteer-core");

const DEFAULT_EXECUTABLE_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

const MAPS_SEARCH_PLAN = [
  { category: "bimba", queries: ["bimba"] },
  { category: "paud", queries: ["paud"] },
  { category: "tk", queries: ["tk"] },
  { category: "daycare", queries: ["daycare"] },
  { category: "les anak", queries: ["kursus anak"] },
  { category: "fasilitas keluarga", queries: ["playground", "rumah sakit anak"] }
];

async function crawlGoogleMapsPlaces({ latitude, longitude, radiusMeters = 3000, maxQueries = 6 }) {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await preparePage(page);

    const results = [];
    const seen = new Set();
    const flatPlan = MAPS_SEARCH_PLAN.flatMap((entry) =>
      entry.queries.map((query) => ({ category: entry.category, query }))
    ).slice(0, maxQueries);

    for (const item of flatPlan) {
      const searchUrl = buildMapsSearchUrl(item.query, latitude, longitude);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(1800);

      const rows = await page.evaluate(scrapeGoogleMapsResultsInPage);
      for (const row of rows) {
        const coordinates = extractCoordinatesFromGoogleMapsUrl(row.href);
        if (!coordinates) {
          continue;
        }

        const distanceKm = haversineKm(latitude, longitude, coordinates.latitude, coordinates.longitude);
        if (distanceKm > radiusMeters / 1000) {
          continue;
        }

        const key = `${row.title}|${coordinates.latitude}|${coordinates.longitude}|${item.category}`.toLowerCase();
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        const normalizedCategory = inferCategoryFromResult(item.category, row);
        results.push({
          name: row.title || null,
          category: normalizedCategory,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          rating: toFiniteNumber(row.rating),
          reviews: toInteger(row.reviewCount),
          address: row.address || null,
          website: row.companyUrl || null,
          industry: row.industry || null,
          source_query: item.query,
          google_maps_url: row.href || null,
          distance_km: roundTo(distanceKm, 3)
        });
      }
    }

    results.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
    return {
      pois: results,
      source: "google_maps_browser_crawler",
      data_quality: results.length > 0 ? "high" : "low",
      estimated: false,
      reasoning: results.length > 0
        ? "Data POI diambil dari Google Maps melalui browser crawler yang diadaptasi dari hotspot map V.2 dan difilter radius 3 KM."
        : "Crawler Google Maps berjalan, tetapi belum menemukan POI yang lolos filter radius 3 KM.",
      assumption_source: null
    };
  } finally {
    await browser.close();
  }
}

async function crawlGoogleWebEvidence({ district, city, province, maxPerTopic = 3 }) {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await preparePage(page);

    const scope = [district, city, province].filter(Boolean).join(" ");
    const compactScope = [district, city].filter(Boolean).join(" ");
    const topics = [
      {
        topic: "demography",
        query: `site:bps.go.id ${compactScope || scope} "Jumlah Penduduk" OR "Jumlah Penduduk Menurut Kelompok Umur dan Jenis Kelamin"`
      },
      {
        topic: "buying_power",
        query: `site:bps.go.id ${compactScope || scope} "pengeluaran per kapita" OR "pengeluaran rumah tangga"`
      },
      {
        topic: "family_activity",
        query: `${compactScope || scope} event anak OR komunitas parenting OR acara keluarga`
      }
    ];

    const collected = [];

    for (const topic of topics) {
      const googleSearchUrl = `https://www.google.com/search?hl=id&q=${encodeURIComponent(topic.query)}`;
      let rows = [];
      let engineUsed = "google";

      await page.goto(googleSearchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(1800);

      const googleState = await page.evaluate(() => ({
        title: document.title || "",
        body: document.body ? document.body.innerText || "" : ""
      }));

      if (looksLikeGoogleBlockedPage(googleState)) {
        engineUsed = "yahoo_fallback";
        const fallbackUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(topic.query)}`;
        await page.goto(fallbackUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await sleep(1800);
        rows = await page.evaluate(scrapeYahooResultsInPage);
      } else {
        rows = await page.evaluate(scrapeGoogleSearchResultsInPage);
      }

      collected.push({
        topic: topic.topic,
        query: topic.query,
        engine_used: engineUsed,
        google_search_url: googleSearchUrl,
        results: rows.slice(0, maxPerTopic)
      });
    }

    return collected;
  } finally {
    await browser.close();
  }
}

async function launchBrowser() {
  const executablePath = DEFAULT_EXECUTABLE_CANDIDATES.find(Boolean);
  if (!executablePath) {
    throw new Error("Chrome/Edge executable tidak ditemukan untuk crawler lokal.");
  }

  return puppeteer.launch({
    headless: true,
    executablePath,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--lang=id-ID",
      "--ignore-certificate-errors"
    ]
  });
}

async function preparePage(page) {
  await page.setViewport({ width: 1440, height: 1200 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
  );
}

function buildMapsSearchUrl(query, latitude, longitude) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${latitude},${longitude},15z?entry=ttu`;
}

function scrapeGoogleMapsResultsInPage() {
  const sleepInsidePage = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  function getFeed() {
    return (
      document.querySelector('div[role="feed"]') ||
      document.querySelector('div[aria-label][role="main"] div[role="feed"]')
    );
  }

  function extractCardData(link) {
    const container =
      link.closest('div[role="article"]') ||
      link.closest('[jsaction*="mouseover:pane"]') ||
      link.parentElement;

    if (!container) {
      return null;
    }

    const text = container.innerText || "";
    const titleNode = container.querySelector(".fontHeadlineSmall") || link;
    const title = (titleNode.textContent || "").trim();

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
      Array.from(container.querySelectorAll("a[href]")).find(
        (anchor) => anchor.href && !anchor.href.includes("google.com/maps/place")
      );

    const infoSpans = Array.from(container.querySelectorAll(".fontBodyMedium span"))
      .map((node) => node.textContent.trim())
      .filter(Boolean);

    const industry = infoSpans.find((value) => !/^\d/.test(value) && value.length < 80) || "";
    const address = addressNode
      ? (addressNode.getAttribute("aria-label") || addressNode.textContent || "")
          .replace(/^Address:\s*/i, "")
          .trim()
      : "";

    return {
      title,
      rating,
      reviewCount: normalizeIntegerValue(reviewCount),
      phone,
      industry,
      address,
      companyUrl: websiteNode ? websiteNode.href : "",
      href: link.href
    };
  }

  async function collect() {
    const feed = getFeed();
    if (feed) {
      let stableRounds = 0;
      let previousCount = 0;

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const currentCount = feed.querySelectorAll('a[href^="https://www.google.com/maps/place"]').length;
        if (currentCount === previousCount) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
        }

        if (stableRounds >= 3) {
          break;
        }

        previousCount = currentCount;
        feed.scrollTop = feed.scrollHeight;
        await sleepInsidePage(650);
      }
    }

    const links = Array.from(document.querySelectorAll('a[href^="https://www.google.com/maps/place"]'));
    const unique = new Map();

    links.forEach((link) => {
      const row = extractCardData(link);
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

  return collect();
}

function scrapeGoogleSearchResultsInPage() {
  const anchors = Array.from(document.querySelectorAll("a")).filter((anchor) => {
    const href = anchor.href || "";
    return /^https?:\/\//i.test(href) && !href.includes("google.com");
  });

  const results = [];
  const seen = new Set();

  anchors.forEach((anchor) => {
    const container = anchor.closest("div") || anchor.parentElement;
    const titleNode = anchor.querySelector("h3") || container?.querySelector("h3");
    const title = (titleNode?.textContent || anchor.textContent || "").trim();
    const snippetNode = container?.querySelector(".VwiC3b, .yXK7lf, .MUxGbd");
    const snippet = (snippetNode?.textContent || "").trim();
    const url = anchor.href;

    if (!title || !url) return;
    if (seen.has(url)) return;
    seen.add(url);

    results.push({
      title,
      url,
      snippet: snippet || null
    });
  });

  return results;
}

function scrapeYahooResultsInPage() {
  const anchors = Array.from(document.querySelectorAll("a"));
  const results = [];
  const seen = new Set();

  anchors.forEach((anchor) => {
    const href = anchor.href || "";
    if (!/^https?:\/\//i.test(href)) return;
    if (href.includes("yahoo.com")) return;

    const title = (anchor.textContent || "").trim();
    const url = anchor.href || "";
    const container = anchor.closest("div") || anchor.parentElement;
    const snippetNode = container?.querySelector("p, .compText, .lh-21");
    const snippet = (snippetNode?.textContent || container?.textContent || "").trim();

    if (!title || !url) return;
    if (seen.has(url)) return;
    seen.add(url);

    results.push({
      title,
      url,
      snippet: snippet || null
    });
  });

  return results;
}

function extractCoordinatesFromGoogleMapsUrl(url) {
  const text = String(url || "");
  let match = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (match) {
    return {
      latitude: Number(match[1]),
      longitude: Number(match[2])
    };
  }

  match = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (match) {
    return {
      latitude: Number(match[1]),
      longitude: Number(match[2])
    };
  }

  return null;
}

function inferCategoryFromResult(seedCategory, row) {
  const text = `${row?.title || ""} ${row?.industry || ""} ${row?.address || ""}`.toLowerCase();
  if (text.includes("bimba")) return "bimba";
  if (text.includes("paud") || text.includes("kelompok bermain")) return "paud";
  if (text.includes("daycare") || text.includes("day care") || text.includes("child care")) return "daycare";
  if (text.includes("tk ") || text.startsWith("tk") || text.includes("taman kanak")) return "tk";
  if (text.includes("kursus anak") || text.includes("les anak") || text.includes("bimbel") || text.includes("preschool")) return "les anak";
  if (
    text.includes("playground") ||
    text.includes("taman") ||
    text.includes("mall") ||
    text.includes("rumah sakit") ||
    text.includes("hospital") ||
    text.includes("klinik") ||
    text.includes("mcdonald") ||
    text.includes("kfc")
  ) {
    return "fasilitas keluarga";
  }

  return seedCategory === "fasilitas keluarga" ? "fasilitas keluarga" : "lainnya";
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toInteger(value) {
  const parsed = toFiniteNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeGoogleBlockedPage(state) {
  const title = String(state?.title || "").toLowerCase();
  const body = String(state?.body || "").toLowerCase();
  return title.includes("sorry") ||
    body.includes("lalu lintas yang tidak wajar") ||
    body.includes("unusual traffic") ||
    body.includes("recaptcha");
}

module.exports = {
  crawlGoogleMapsPlaces,
  crawlGoogleWebEvidence
};
