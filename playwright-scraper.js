const { chromium } = require("playwright");

const STREET_REGEX = /\b(?:jl\.?|jalan)\s+[a-z0-9\s.'/-]{3,80}/i;
const PRICE_REGEX = /\b(?:rp\.?|idr)\s?[\d.,]+\s*(?:miliar|m|juta|jt|ribu|rb|\/tahun|per tahun|total \/tahun)?/i;
const WHATSAPP_REGEX = /(?:\+62|62|0)8[\d\s.-]{7,16}\d/g;

const ACTIVE_SOURCES = [
  {
    name: "Rumah123",
    listingPattern: /^https:\/\/www\.rumah123\.com\/properti\//i,
    buildSeedUrls: (ctx) => [
      "https://www.rumah123.com/jual/ruko/",
      `https://www.rumah123.com/search/?q=${encodeURIComponent(buildSearchPhrase(ctx))}`,
    ],
  },
  {
    name: "Pinhome",
    listingPattern: /^https:\/\/www\.pinhome\.id\/(?:dijual|disewa)\/ruko/i,
    buildSeedUrls: (ctx) => [
      "https://www.pinhome.id/jual/ruko",
      `https://www.pinhome.id/search?query=${encodeURIComponent(buildSearchPhrase(ctx))}`,
    ],
  },
  {
    name: "Brighton",
    listingPattern: /^https:\/\/www\.brighton\.co\.id\/cari-properti\/view\//i,
    buildSeedUrls: (ctx) => [
      "https://www.brighton.co.id/dijual/ruko",
      `https://www.brighton.co.id/cari-properti?keyword=${encodeURIComponent(buildSearchPhrase(ctx))}`,
    ],
  },
  {
    name: "99.co",
    listingPattern: /^https:\/\/www\.99\.co\/id\/(?:jual|sewa|properti)\//i,
    buildSeedUrls: (ctx) => {
      const districtSlug = slugify(ctx.location?.district || "");
      const citySlug = slugify(ctx.location?.city || "");
      return [
        "https://www.99.co/id/jual/ruko",
        "https://www.99.co/id/sewa/ruko",
        districtSlug && citySlug ? `https://www.99.co/id/jual/ruko/area-${citySlug}/${districtSlug}` : "",
      ].filter(Boolean);
    },
  },
  {
    name: "OLX",
    listingPattern: /^https:\/\/www\.olx\.co\.id\//i,
    buildSeedUrls: (ctx) => [
      "https://www.olx.co.id/properti_c88/q-ruko",
      `https://www.olx.co.id/properti_c88/q-${encodeURIComponent(buildSearchPhrase(ctx))}`,
    ],
  },
  {
    name: "Rumah Mitula",
    listingPattern: /^https:\/\/rumah\.mitula\.co\.id\/rumah\//i,
    buildSeedUrls: (ctx) => [
      "https://rumah.mitula.co.id/rumah/ruko",
      `https://rumah.mitula.co.id/find?operationType=sell&propertyType=mitula_studio_apartment&text=${encodeURIComponent(buildSearchPhrase(ctx))}`,
    ],
  },
];

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value) {
  return decodeHtmlEntities(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function buildSearchPhrase(requestContext) {
  const keyword = String(requestContext.keyword || "ruko").trim();
  const location = requestContext.location || {};
  return [
    keyword,
    location.village,
    location.subdistrict,
    location.district,
    location.city,
  ].filter(Boolean).join(" ");
}

function getLocationTokens(requestContext) {
  const location = requestContext.location || {};
  return normalizeText([
    requestContext.streetName,
    requestContext.addressText,
    location.village,
    location.subdistrict,
    location.district,
    location.city,
    requestContext.keyword,
  ].filter(Boolean).join(" "))
    .split(" ")
    .filter((token) => token.length >= 4)
    .slice(0, 14);
}

function scoreListing(text, tokens) {
  const normalized = normalizeText(text);
  let score = 0;

  if (normalized.includes("ruko")) {
    score += 4;
  }

  if (normalized.includes("jual") || normalized.includes("sewa") || normalized.includes("disewa")) {
    score += 2;
  }

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += 3;
    }
  }

  return score;
}

function normalizeWhatsapp(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "");
  if (!digits) {
    return "";
  }

  if (digits.startsWith("+62")) {
    return digits;
  }
  if (digits.startsWith("62")) {
    return `+${digits}`;
  }
  if (digits.startsWith("08")) {
    return `+62${digits.slice(1)}`;
  }

  return digits;
}

function extractWhatsapp(text) {
  const matches = String(text || "").match(WHATSAPP_REGEX) || [];
  const normalized = matches.map(normalizeWhatsapp).filter(Boolean);
  return [...new Set(normalized)][0] || "";
}

function extractStreet(text, fallbackStreetName = "") {
  const normalizedText = decodeHtmlEntities(String(text || "")).replace(/\s+/g, " ").trim();
  const match = normalizedText.match(STREET_REGEX);
  if (match) {
    return match[0].replace(/\s+/g, " ").trim();
  }
  return fallbackStreetName || "";
}

function extractPrice(text) {
  const normalizedText = decodeHtmlEntities(String(text || "")).replace(/\s+/g, " ").trim();
  const match = normalizedText.match(PRICE_REGEX);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function inferListingType(text) {
  const normalized = normalizeText(text);
  if (normalized.includes("disewa") || normalized.includes("sewa")) {
    return "Sewa";
  }
  if (normalized.includes("dijual") || normalized.includes("jual")) {
    return "Jual";
  }
  return "";
}

async function preparePage(browser) {
  const page = await browser.newPage();
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font"].includes(type)) {
      route.abort();
      return;
    }
    route.continue();
  });
  return page;
}

async function scrapeSeed(page, source, seedUrl, requestContext) {
  const tokens = getLocationTokens(requestContext);

  try {
    await page.goto(seedUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3000);

    const anchors = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).map((a) => ({
        href: a.href || "",
        text: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 320),
      })),
    );

    const items = [];
    for (const anchor of anchors) {
      const href = anchor.href || "";
      if (!source.listingPattern.test(href)) {
        continue;
      }

      const score = scoreListing(`${anchor.text} ${href}`, tokens);
      if (score < 5) {
        continue;
      }

      items.push({
        source: source.name,
        name: source.name,
        url: href,
        title: anchor.text || "Listing ruko",
        note: buildSearchPhrase(requestContext),
        whatsapp: "",
        streetName: requestContext.streetName,
        price: "",
        listingType: "",
        score,
      });
    }

    return items;
  } catch {
    return [];
  }
}

async function scrapeSource(browser, source, requestContext) {
  const page = await preparePage(browser);

  try {
    const seedUrls = source.buildSeedUrls(requestContext);
    const allItems = [];
    for (const seedUrl of seedUrls) {
      const items = await scrapeSeed(page, source, seedUrl, requestContext);
      allItems.push(...items);
    }

    const dedupedMap = new Map();
    for (const item of allItems) {
      const existing = dedupedMap.get(item.url);
      if (!existing || item.score > existing.score || (item.title || "").length > (existing.title || "").length) {
        dedupedMap.set(item.url, item);
      }
    }

    return Array.from(dedupedMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeListingDetail(browser, item, requestContext) {
  const page = await preparePage(browser);

  try {
    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    const detail = await page.evaluate(() => {
      const title = document.title || "";
      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      return {
        title,
        bodyText: bodyText.slice(0, 12000),
      };
    });

    const combinedText = `${item.title} ${detail.title} ${detail.bodyText}`;
    return {
      ...item,
      title: item.title && item.title.length > detail.title.length ? item.title : detail.title || item.title,
      note: detail.bodyText.slice(0, 280) || item.note,
      whatsapp: extractWhatsapp(combinedText) || item.whatsapp,
      streetName: extractStreet(combinedText, requestContext.streetName),
      price: extractPrice(combinedText),
      listingType: inferListingType(combinedText),
      score: item.score + (extractWhatsapp(combinedText) ? 3 : 0) + (extractStreet(combinedText, "") ? 2 : 0),
    };
  } catch {
    return {
      ...item,
      streetName: requestContext.streetName,
      price: "",
      listingType: "",
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapePropertyLinks(requestContext) {
  const browser = await chromium.launch({ headless: true });

  try {
    const settled = await Promise.allSettled(
      ACTIVE_SOURCES.map((source) => scrapeSource(browser, source, requestContext)),
    );

    const listings = settled
      .filter((item) => item.status === "fulfilled")
      .flatMap((item) => item.value)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const detailSettled = await Promise.allSettled(
      listings.map((item) => scrapeListingDetail(browser, item, requestContext)),
    );

    return detailSettled
      .filter((item) => item.status === "fulfilled")
      .map((item) => item.value)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  scrapePropertyLinks,
};
