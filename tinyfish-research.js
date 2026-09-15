/**
 * TinyFish AI Integration - Riset Daya Beli + Sosial Media + Berita
 *
 * Menggunakan TinyFish Search API (gratis) dan Fetch API (gratis) untuk:
 * 1. Riset daya beli masyarakat (pengeluaran, UMP/UMK, kemiskinan, dll)
 * 2. Riset sosial media (5 platform) - kegiatan lomba anak & keluarga
 * 3. Riset berita (5 portal) - kegiatan lomba anak & keluarga
 */

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || "";
const TINYFISH_SEARCH_URL = "https://api.search.tinyfish.ai";
const TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai";
const TINYFISH_RESEARCH_URL = "https://agent.tinyfish.ai/v1/automation/run-research";

const TINYFISH_SEARCH_TIMEOUT_MS = Number(process.env.TINYFISH_SEARCH_TIMEOUT_MS || 25000);
const TINYFISH_FETCH_TIMEOUT_MS = Number(process.env.TINYFISH_FETCH_TIMEOUT_MS || 45000);
const TINYFISH_DEEP_MODE = /^(1|true|yes|deep)$/i.test(String(process.env.TINYFISH_DEEP_MODE || ""));
const TINYFISH_RESEARCH_TIMEOUT_MS = Number(process.env.TINYFISH_RESEARCH_TIMEOUT_MS || 900000);

// ============================================================
// TinyFish API Wrappers
// ============================================================

async function tinyfishResearch(query, options = {}) {
  if (!TINYFISH_API_KEY) throw new Error("TINYFISH_API_KEY belum dikonfigurasi.");
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || TINYFISH_RESEARCH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const payload = {
    query: String(query || "").slice(0, 2000),
    mode: options.mode || "deep",
    stream: true,
    output_language: options.outputLanguage || "id",
    weak_sources_enabled: options.weakSourcesEnabled !== false,
    domain_type: options.domainType || "web",
  };
  if (options.recencyMinutes) payload.recency_minutes = Number(options.recencyMinutes);
  const events = [];
  let buffer = "";
  let researchRunId = null;
  let finalResult = null;
  let synthesis = "";
  let plan = null;
  let stats = null;
  const consume = (raw) => {
    const dataLines = String(raw || "").split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim());
    if (!dataLines.length) return;
    let parsed;
    try { parsed = JSON.parse(dataLines.join("\n")); } catch { return; }
    const event = parsed.event || parsed.type;
    const data = parsed.data || {};
    events.push({ event, data });
    if (event === "created") researchRunId = data.research_run_id || data.researchRunId || researchRunId;
    if (event === "plan_updated") plan = data;
    if (event === "synthesis_delta") synthesis += String(data.delta || data.text || data.content || "");
    if (event === "partial_summary" && !synthesis) synthesis = String(data.summary || data.text || "");
    if (event === "final_result") {
      finalResult = data;
      if (data.result) synthesis = String(data.result);
    }
    if (event === "run_stats") stats = data;
    if (event === "error") throw new Error(data.message || data.error || "TinyFish Research API pipeline error");
  };
  try {
    const response = await fetch(TINYFISH_RESEARCH_URL, {
      method: "POST",
      headers: { "X-API-Key": TINYFISH_API_KEY, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error("TinyFish Research API " + response.status + ": " + message.slice(0, 300));
    }
    if (!response.body) throw new Error("TinyFish Research API tidak mengembalikan stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() || "";
      chunks.forEach(consume);
    }
    if (buffer.trim()) consume(buffer);
    const report = finalResult?.result || synthesis;
    if (!report) throw new Error("TinyFish Research API selesai tanpa final_result.");
    return {
      ok: true, provider: "tinyfish-research-api", usedResearchApi: true,
      researchRunId, result: report, synthesis, citations: finalResult?.citations || [],
      terminationReason: finalResult?.termination_reason || "completed", plan, stats,
      eventCount: events.length, apiKeyPresent: true,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("TinyFish Research API timeout setelah " + Math.round(timeoutMs / 1000) + " detik");
    throw error;
  } finally { clearTimeout(timer); }
}

function buildFeasibilityResearchPrompt(location = {}, business = {}, context = {}) {
  const area = (context.areaCoverage || []).map(item => item.subdistrict || item.district || item.name).filter(Boolean).slice(0, 12).join(", ") || "belum terpetakan";
  const poiSummary = context.poiSummary || "belum tersedia";
  const demo = context.demographySummary || "akan divalidasi backend Dukcapil";
  return "Riset kelayakan cabang baru di Indonesia. Buat laporan mendalam berbahasa Indonesia, berbasis sumber web terbaru dan sertakan citation URL klik. Jangan mengarang angka; bedakan fakta, inferensi, dan asumsi. Titik: " + context.latitude + ", " + context.longitude + "; radius 3 km. Area/kelurahan: " + area + ". Bisnis: " + (business.businessType || "") + "; detail: " + (business.businessDetail || "") + "; harga jual: " + (business.sellingPrice || "") + ". POI lokal: " + poiSummary + ". Demografi awal: " + demo + ". Fokus calon siswa anak usia dini. Analisis: kesimpulan layak/tidak, calon siswa dan demand, TAM/SAM/SOM, kompetitor dan kisaran SPP, akses/transportasi/visibilitas, perumahan kelas menengah/cluster terbuka, jejak digital media sosial lokal, ulasan pendidikan serupa, kanal promosi, risiko, dan alternatif area bila tidak layak. Gunakan heading: Kesimpulan, Demand, Kompetitor & SPP, Jejak Digital, Lokasi & Promosi, Market Sizing, Risiko & Rekomendasi.";
}

async function tinyfishSearch(query, options = {}) {
  if (!TINYFISH_API_KEY) {
    console.warn("TINYFISH_API_KEY belum dikonfigurasi. Menggunakan mode fallback lokal.");
    return { results: [], fallback: true };
  }

  const params = new URLSearchParams({ query });
  if (options.location) params.set("location", options.location);
  if (options.language) params.set("language", options.language);
  if (options.recency_minutes) params.set("recency_minutes", String(options.recency_minutes));
  if (options.purpose) params.set("purpose", options.purpose);

  const url = `${TINYFISH_SEARCH_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TINYFISH_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": TINYFISH_API_KEY, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn(`TinyFish Search ${response.status}: ${err?.error?.message || response.statusText}`);
      return { results: [], fallback: true };
    }
    return await response.json();
  } catch (err) {
    console.warn("TinyFish Search warning:", err.message);
    return { results: [], fallback: true };
  } finally {
    clearTimeout(timer);
  }
}

async function tinyfishFetch(urls, options = {}) {
  if (!TINYFISH_API_KEY) {
    console.warn("TINYFISH_API_KEY belum dikonfigurasi. Menggunakan mode fallback lokal.");
    return { results: [], fallback: true };
  }

  const urlList = Array.isArray(urls) ? urls : [urls];
  const limitedUrls = urlList.slice(0, 10);

  const body = { urls: limitedUrls };
  if (options.format) body.format = options.format;
  if (options.ttl != null) body.ttl = options.ttl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TINYFISH_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(TINYFISH_FETCH_URL, {
      method: "POST",
      headers: {
        "X-API-Key": TINYFISH_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn(`TinyFish Fetch ${response.status}: ${err?.error?.message || response.statusText}`);
      return { results: [], fallback: true };
    }
    return await response.json();
  } catch (err) {
    console.warn("TinyFish Fetch warning:", err.message);
    return { results: [], fallback: true };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Utility
// ============================================================

function getHostname(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function stripHtmlTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

function getAreaLabel(loc = {}) {
  return [loc.subdistrict || loc.district, loc.city, loc.province].filter(Boolean).join(", ");
}

// ============================================================
// 1. Query Builders
// ============================================================

function buildPurchasingPowerQueries(loc = {}, options = {}) {
  const district = loc.subdistrict || loc.district || "";
  const city = loc.city || "";
  const province = loc.province || "";
  const adminArea = [district, city, province].filter(Boolean).join(" ");

  const queries = [
    { kind: "buying_power_overview", query: `"${city}" "${province}" daya beli masyarakat pengeluaran per kapita` },
    { kind: "minimum_wage", query: `"${city}" "${province}" UMP UMK "upah minimum" 2025 2026` },
    { kind: "poverty_rate", query: `"${city}" "${province}" kemiskinan "garis kemiskinan" BPS` },
    { kind: "spending_profile", query: `"${city}" "pengeluaran non makanan" OR "pengeluaran bukan makanan" BPS` },
    { kind: "hdi", query: `"${city}" OR "${province}" "indeks pembangunan manusia" OR IPM BPS` },
  ];

  if (options.deep || TINYFISH_DEEP_MODE) {
    queries.push(
      { kind: "buying_power_deep", query: `"${adminArea}" (SUSENAS OR "indikator kesejahteraan rakyat" OR "kondisi ekonomi") site:bps.go.id` },
      { kind: "buying_power_deep", query: `"${city}" "${province}" ("pengeluaran per kapita sebulan" OR "pengeluaran makanan" OR "pengeluaran non makanan") site:bps.go.id` },
      { kind: "buying_power_deep", query: `"${city}" "${province}" ("rumah tangga miskin" OR "pendapatan per kapita" OR "ketimpangan") site:bps.go.id` },
      { kind: "buying_power_deep", query: `"${city}" "${province}" ("daya beli" OR "kemampuan konsumsi" OR "kesejahteraan") site:bps.go.id` },
    );
  }

  return queries;
}

/**
 * Query sosial media: 5 platform tentang lomba anak & keluarga
 * Recency: 1 tahun terakhir = 525600 menit
 */
function buildSocialMediaQueries(loc = {}, options = {}) {
  const city = loc.city || "";
  const province = loc.province || "";
  const adminArea = getAreaLabel(loc);
  const recency = 525600; // 1 tahun

  const queries = [
    {
      kind: "ig_lomba_anak",
      platform: "Instagram",
      query: `site:instagram.com lomba anak OR event keluarga "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "tiktok_lomba_anak",
      platform: "TikTok",
      query: `site:tiktok.com lomba anak OR family day "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "yt_lomba_anak",
      platform: "YouTube",
      query: `site:youtube.com lomba anak OR event keluarga "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "fb_lomba_anak",
      platform: "Facebook",
      query: `site:facebook.com lomba anak OR family day "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "x_lomba_anak",
      platform: "X",
      query: `site:x.com OR site:twitter.com lomba anak "${city}" OR "${province}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "x_event_keluarga",
      platform: "X",
      query: `site:x.com OR site:twitter.com event keluarga family day "${city}" 2025 2026`,
      recency_minutes: recency,
    },
  ];

  if (options.deep || TINYFISH_DEEP_MODE) {
    queries.push(
      {
        kind: "ig_komunitas_parenting",
        platform: "Instagram",
        query: `site:instagram.com ("komunitas parenting" OR "kelas anak" OR "playdate" OR "family day") "${adminArea}" 2025 2026`,
        recency_minutes: recency,
      },
      {
        kind: "fb_komunitas_parenting",
        platform: "Facebook",
        query: `site:facebook.com ("komunitas parenting" OR "kelas anak" OR "playdate" OR "family day") "${adminArea}" 2025 2026`,
        recency_minutes: recency,
      }
    );
  }

  return queries;
}

/**
 * Query berita: 5 portal berita tentang lomba anak & keluarga
 * Recency: 1 tahun terakhir
 */
function buildNewsQueries(loc = {}, options = {}) {
  const city = loc.city || "";
  const province = loc.province || "";
  const adminArea = getAreaLabel(loc);
  const recency = 525600;

  const queries = [
    {
      kind: "berita_lomba_anak",
      platform: "Kompas",
      query: `site:kompas.com lomba anak OR event keluarga "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "detik_lomba_anak",
      platform: "Detik",
      query: `site:detik.com lomba anak OR family day "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "kumparan_lomba_anak",
      platform: "Kumparan",
      query: `site:kumparan.com lomba anak OR event keluarga "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "cnbc_lomba_anak",
      platform: "CNBC Indonesia",
      query: `site:cnbcindonesia.com lomba anak OR festival "${city}" 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "liputan6_lomba_anak",
      platform: "Liputan6",
      query: `site:liputan6.com lomba anak OR event keluarga "${city}" 2025 2026`,
      recency_minutes: recency,
    },
  ];

  if (options.deep || TINYFISH_DEEP_MODE) {
    queries.push(
      {
        kind: "berita_parenting",
        platform: "Kompas",
        query: `site:kompas.com ("komunitas parenting" OR "kelas anak" OR "family day") "${adminArea}" 2025 2026`,
        recency_minutes: recency,
      },
      {
        kind: "berita_parenting",
        platform: "Detik",
        query: `site:detik.com ("komunitas parenting" OR "kelas anak" OR "family day") "${adminArea}" 2025 2026`,
        recency_minutes: recency,
      }
    );
  }

  return queries;
}

// ============================================================
// 2. Score & Rank
// ============================================================

function scorePurchasingPowerSource(source) {
  let score = 0;
  const kindScores = {
    buying_power_overview: 20, per_capita_expenditure: 28, minimum_wage: 22,
    poverty_rate: 24, spending_profile: 26, inflation_price: 18,
    employment: 20, hdi: 22, household_consumption: 24, property_rent_signal: 16,
  };
  score += kindScores[source.kind] || 10;

  const hostname = getHostname(source.url);
  if (/(?:^|\.)bps\.go\.id$/i.test(hostname)) score += 30;
  else if (/(?:^|\.)katadata\.co\.id$/i.test(hostname)) score += 20;
  else if (/(?:^|\.)kompas\.com$/i.test(hostname)) score += 12;
  else if (/(?:^|\.)detik\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)cnbcindonesia\.com$/i.test(hostname)) score += 12;
  else if (/(?:^|\.)go\.id$/i.test(hostname)) score += 16;
  else if (/(?:^|\.)numbeo\.com$/i.test(hostname)) score += 14;
  else if (/(?:^|\.)rumah123\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)99\.co$/i.test(hostname)) score += 10;

  const haystack = [source.title, source.snippet, source.abstract].filter(Boolean).join(" ").toLowerCase();
  if (/pengeluaran per kapita/i.test(haystack)) score += 12;
  if (/daya beli/i.test(haystack)) score += 10;
  if (/kemiskinan|garis kemiskinan/i.test(haystack)) score += 8;
  if (/ump|umk|upah minimum/i.test(haystack)) score += 8;
  if (/tpak|tpt|pengangguran/i.test(haystack)) score += 6;
  if (/ipm|indeks pembangunan manusia/i.test(haystack)) score += 8;
  if (/susenas|sakernas/i.test(haystack)) score += 10;
  if (/dalam angka/i.test(haystack)) score += 10;

  return score;
}

function scoreEventSource(source) {
  let score = 0;

  const hostname = getHostname(source.url);
  // Platform sosial media = lebih relevan untuk event
  if (/instagram\.com$/i.test(hostname)) score += 25;
  else if (/tiktok\.com$/i.test(hostname)) score += 22;
  else if (/youtube\.com$/i.test(hostname)) score += 20;
  else if (/facebook\.com$/i.test(hostname)) score += 18;
  else if (/x\.com$|twitter\.com$/i.test(hostname)) score += 16;
  // Berita portal
  else if (/(?:^|\.)kompas\.com$/i.test(hostname)) score += 15;
  else if (/(?:^|\.)detik\.com$/i.test(hostname)) score += 14;
  else if (/(?:^|\.)kumparan\.com$/i.test(hostname)) score += 14;
  else if (/(?:^|\.)cnbcindonesia\.com$/i.test(hostname)) score += 13;
  else if (/(?:^|\.)liputan6\.com$/i.test(hostname)) score += 13;
  else if (/(?:^|\.)go\.id$/i.test(hostname)) score += 12;

  const haystack = [source.title, source.snippet, source.abstract].filter(Boolean).join(" ").toLowerCase();
  // Relevansi kata kunci lomba/event
  if (/lomba anak|lomba balita|lomba melukis|lomba mewarnai|lomba menyanyi/i.test(haystack)) score += 20;
  if (/festival anak|fun run|family day|family fun/i.test(haystack)) score += 18;
  if (/event keluarga|kegiatan keluarga|acara keluarga/i.test(haystack)) score += 16;
  if (/lomba keluarga|lomba keluarga berencana|lomba masak/i.test(haystack)) score += 14;
  if (/kids activity|playground|bazar|pameran/i.test(haystack)) score += 10;
  if (/paud|tk|preschool|daycare|bimbel|les anak/i.test(haystack)) score += 12;
  if (/2025|2026/i.test(haystack)) score += 6;

  return score;
}

// ============================================================
// 3. Extract Metrics
// ============================================================

function extractPurchasingPowerMetrics(text) {
  const cleaned = stripHtmlTags(text);
  if (!cleaned) return [];

  const patterns = [
    { regex: /(?:pengeluaran per kapita(?:\s+sebulan)?(?:\s+penduduk)?(?:\s+\w+){0,5}\s+(?:mencapai|sebesar|adalah|menjadi|Rp\.?|IDR)?\s*(?:rp\.?|IDR)?\s*[\d.,]+)/i, label: "Pengeluaran per kapita" },
    { regex: /((?:daya beli|purchasing power)(?:\s+\w+){0,6}\s+[\d.,]+\s*(?:persen|%|poin)?)/i, label: "Daya beli" },
    { regex: /((?:UMP|UMK|upah minimum)(?:\s+\w+){0,6}\s*(?:rp\.?|IDR)?\s*[\d.,]+)/i, label: "UMP/UMK" },
    { regex: /((?:penduduk miskin|tingkat kemiskinan|garis kemiskinan)(?:\s+\w+){0,6}\s+[\d.,]+\s*(?:persen|%|rupiah|Rp\.?)?)/i, label: "Kemiskinan" },
    { regex: /((?:TPAK|TPT|tingkat pengangguran terbuka)(?:\s+\w+){0,6}\s+[\d.,]+\s*(?:persen|%))/i, label: "Ketenagakerjaan" },
    { regex: /((?:indeks pembangunan manusia|IPM)(?:\s+\w+){0,6}\s+[\d.,]+)/i, label: "IPM" },
    { regex: /((?:inflasi|indeks harga konsumen|IHK)(?:\s+\w+){0,6}\s+[\d.,]+\s*(?:persen|%))/i, label: "Inflasi/IHK" },
    { regex: /((?:pengeluaran non makanan|pengeluaran bukan makanan|non-food)(?:\s+\w+){0,8}\s*(?:rp\.?|IDR)?\s*[\d.,]+)/i, label: "Pengeluaran non-pangan" },
  ];

  return patterns
    .map((p) => {
      const m = cleaned.match(p.regex);
      return m ? `${p.label}: ${(m[1] || "").trim()}` : "";
    })
    .filter(Boolean);
}

function extractEventDetails(text) {
  const cleaned = stripHtmlTags(text);
  if (!cleaned) return [];

  const patterns = [
    { regex: /(lomba\s+(?:anak|balita|mewarnai|melukis|menyanyi|berhitung|pidato|tari|olahraga|menghafal)[^.!?\n]{0,80})/i, label: "Lomba Anak" },
    { regex: /(event\s+keluarga[^.!\n]{0,80})/i, label: "Event Keluarga" },
    { regex: /(family\s+(?:day|fun)[^.!\n]{0,80})/i, label: "Family Day" },
    { regex: /(festival\s+(?:anak|keluarga)[^.!\n]{0,80})/i, label: "Festival" },
    { regex: /(fun\s+run[^.!\n]{0,80})/i, label: "Fun Run" },
    { regex: /(bazar[^.!\n]{0,80})/i, label: "Bazar" },
  ];

  return patterns
    .map((p) => {
      const m = cleaned.match(p.regex);
      return m ? { label: p.label, text: m[1].trim() } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
}

// ============================================================
// 4. Research Runners
// ============================================================

async function runSearchQueries(queries, options = {}) {
  const allSources = [];

  for (const item of queries) {
    try {
      const opts = {
        location: options.location || "Indonesia",
        language: "id",
        purpose: item.purpose || `Mencari data ${item.kind}`,
      };
      if (item.recency_minutes) opts.recency_minutes = item.recency_minutes;

      const searchResult = await tinyfishSearch(item.query, opts);
      const results = Array.isArray(searchResult?.results) ? searchResult.results : [];

      for (const result of results) {
        allSources.push({
          kind: item.kind,
          platform: item.platform || "",
          title: result.title || "",
          url: result.url || "",
          snippet: result.snippet || "",
          siteName: result.site_name || "",
        });
      }
    } catch (error) {
      console.warn(`TinyFish Search gagal [${item.kind}]:`, error.message);
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  return allSources.filter((s) => {
    const key = (s.url || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enrichWithFetch(sources, maxFetch = 4, options = {}) {
  const targets = sources
    .filter((s) => s.url && !s.url.includes("google.com/search") && !s.url.includes("bing.com/search"))
    .slice(0, maxFetch);

  if (!targets.length) return;

  try {
    const batchSize = options.deep ? 3 : 4;
    for (let index = 0; index < targets.length; index += batchSize) {
      const batch = targets.slice(index, index + batchSize);
      const urlsToFetch = batch.map((s) => s.url);
      const fetchResponse = await tinyfishFetch(urlsToFetch, { format: "markdown" });
      const pages = Array.isArray(fetchResponse?.results) ? fetchResponse.results : [];

      for (const source of batch) {
        const fetched = pages.find((f) => f.url === source.url || f.final_url === source.url);
        if (fetched) {
          source.abstract = (fetched.text || "").slice(0, 1500);
        }
      }
    }
  } catch (error) {
    if (error?.name === "AbortError" || /aborted/i.test(error?.message || "")) {
      console.warn("TinyFish Fetch timeout: melewati sebagian halaman agar riset tetap lanjut.");
      return;
    }
    console.warn("TinyFish Fetch gagal:", error.message);
  }
}

// ============================================================
// 5. Main Research Functions
// ============================================================

/**
 * Riset Daya Beli Masyarakat
 */
async function runPurchasingPowerResearch(loc = {}, options = {}) {
  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);
  const queries = buildPurchasingPowerQueries(loc, { deep });
  const allSources = await runSearchQueries(queries, { location: loc.city || "Indonesia" });

  const scored = allSources.map((s) => ({ ...s, score: scorePurchasingPowerSource(s) }))
    .sort((a, b) => b.score - a.score);
  const topSources = scored.slice(0, deep ? 18 : 12);

  await enrichWithFetch(topSources, deep ? 8 : 4, { deep });

  // Extract metrics
  const allMetrics = [];
  const seenMetrics = new Set();
  for (const source of topSources) {
    const content = [source.title, source.snippet, source.abstract].filter(Boolean).join(". ");
    for (const metric of extractPurchasingPowerMetrics(content)) {
      const key = metric.toLowerCase();
      if (!seenMetrics.has(key)) {
        seenMetrics.add(key);
        allMetrics.push({ text: metric, source: source.title });
      }
    }
  }

  // Group
  const grouped = {};
  topSources.forEach((s) => {
    if (!grouped[s.kind]) grouped[s.kind] = [];
    grouped[s.kind].push(s);
  });

  const summaryParts = [];
  if (allMetrics.length) summaryParts.push(`Ditemukan ${allMetrics.length} metrik daya beli dari ${topSources.length} sumber.`);
  if (grouped.per_capita_expenditure?.length) summaryParts.push(`Pengeluaran per kapita: ${grouped.per_capita_expenditure.length} sumber.`);
  if (grouped.minimum_wage?.length) summaryParts.push(`UMP/UMK tersedia.`);
  if (grouped.poverty_rate?.length) summaryParts.push(`Kemiskinan tersedia.`);

  return {
    ok: true,
    researchDepth: deep ? "deep" : "standard",
    summary: summaryParts.join(" ") || "Riset daya beli selesai.",
    totalSources: topSources.length,
    totalMetrics: allMetrics.length,
    metrics: allMetrics,
    sources: topSources.map((s) => ({
      kind: s.kind, title: s.title, url: s.url, snippet: s.snippet, score: s.score,
    })),
    grouped,
    searchQueries: queries.length,
    apiKeyPresent: Boolean(TINYFISH_API_KEY),
  };
}

/**
 * Riset Sosial Media: lomba anak & keluarga (5 platform)
 */
async function runSocialMediaResearch(loc = {}, options = {}) {
  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);
  const queries = buildSocialMediaQueries(loc, { deep });
  const allSources = await runSearchQueries(queries, { location: loc.city || "Indonesia" });

  const scored = allSources.map((s) => ({ ...s, score: scoreEventSource(s) }))
    .sort((a, b) => b.score - a.score);
  const topSources = scored.slice(0, deep ? 20 : 15);

  await enrichWithFetch(topSources, deep ? 8 : 5, { deep });

  // Extract event details
  const allEvents = [];
  const seenEvents = new Set();
  for (const source of topSources) {
    const content = [source.title, source.snippet, source.abstract].filter(Boolean).join(". ");
    for (const event of extractEventDetails(content)) {
      const key = event.text.toLowerCase().slice(0, 60);
      if (!seenEvents.has(key)) {
        seenEvents.add(key);
        allEvents.push({ ...event, source: source.title, url: source.url });
      }
    }
  }

  // Group by platform
  const grouped = {};
  topSources.forEach((s) => {
    const platform = s.platform || "Lainnya";
    if (!grouped[platform]) grouped[platform] = [];
    grouped[platform].push(s);
  });

  // Platform stats
  const platformStats = Object.entries(grouped).map(([platform, items]) => ({
    platform,
    count: items.length,
    topTitle: items[0]?.title || "",
  }));

  const summaryParts = [];
  summaryParts.push(`${topSources.length} hasil dari ${platformStats.length} platform sosial media.`);
  if (allEvents.length) summaryParts.push(`Ditemukan ${allEvents.length} referensi kegiatan lomba/event.`);
  platformStats.forEach((p) => summaryParts.push(`${p.platform}: ${p.count} hasil.`));

  return {
    ok: true,
    researchDepth: deep ? "deep" : "standard",
    summary: summaryParts.join(" "),
    totalSources: topSources.length,
    totalEvents: allEvents.length,
    events: allEvents,
    platformStats,
    sources: topSources.map((s) => ({
      kind: s.kind, platform: s.platform, title: s.title, url: s.url,
      snippet: s.snippet, score: s.score,
    })),
    grouped,
    searchQueries: queries.length,
    apiKeyPresent: Boolean(TINYFISH_API_KEY),
  };
}

/**
 * Riset Berita: lomba anak & keluarga (5 portal berita)
 */
async function runNewsResearch(loc = {}, options = {}) {
  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);
  const queries = buildNewsQueries(loc, { deep });
  const allSources = await runSearchQueries(queries, { location: loc.city || "Indonesia" });

  const scored = allSources.map((s) => ({ ...s, score: scoreEventSource(s) }))
    .sort((a, b) => b.score - a.score);
  const topSources = scored.slice(0, deep ? 20 : 15);

  await enrichWithFetch(topSources, deep ? 8 : 5, { deep });

  // Extract event details
  const allEvents = [];
  const seenEvents = new Set();
  for (const source of topSources) {
    const content = [source.title, source.snippet, source.abstract].filter(Boolean).join(". ");
    for (const event of extractEventDetails(content)) {
      const key = event.text.toLowerCase().slice(0, 60);
      if (!seenEvents.has(key)) {
        seenEvents.add(key);
        allEvents.push({ ...event, source: source.title, url: source.url });
      }
    }
  }

  // Group by portal
  const grouped = {};
  topSources.forEach((s) => {
    const platform = s.platform || "Lainnya";
    if (!grouped[platform]) grouped[platform] = [];
    grouped[platform].push(s);
  });

  const portalStats = Object.entries(grouped).map(([portal, items]) => ({
    portal,
    count: items.length,
    topTitle: items[0]?.title || "",
  }));

  const summaryParts = [];
  summaryParts.push(`${topSources.length} artikel berita dari ${portalStats.length} portal.`);
  if (allEvents.length) summaryParts.push(`Ditemukan ${allEvents.length} referensi kegiatan lomba/event.`);
  portalStats.forEach((p) => summaryParts.push(`${p.portal}: ${p.count} artikel.`));

  return {
    ok: true,
    researchDepth: deep ? "deep" : "standard",
    summary: summaryParts.join(" "),
    totalSources: topSources.length,
    totalEvents: allEvents.length,
    events: allEvents,
    portalStats,
    sources: topSources.map((s) => ({
      kind: s.kind, platform: s.platform, title: s.title, url: s.url,
      snippet: s.snippet, score: s.score,
    })),
    grouped,
    searchQueries: queries.length,
    apiKeyPresent: Boolean(TINYFISH_API_KEY),
  };
}

/**
 * Riset Gabungan: Daya Beli + Sosial Media + Berita
 */
async function runFullResearch(loc = {}, options = {}) {
  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);
  const [purchasingPower, socialMedia, news] = await Promise.all([
    runPurchasingPowerResearch(loc, { deep }).catch((e) => ({ ok: false, error: e.message, summary: "Gagal." })),
    runSocialMediaResearch(loc, { deep }).catch((e) => ({ ok: false, error: e.message, summary: "Gagal." })),
    runNewsResearch(loc, { deep }).catch((e) => ({ ok: false, error: e.message, summary: "Gagal." })),
  ]);

  return {
    ok: true,
    researchDepth: deep ? "deep" : "standard",
    purchasingPower,
    socialMedia,
    news,
    summary: [
      purchasingPower.summary || "",
      socialMedia.summary || "",
      news.summary || "",
    ].filter(Boolean).join(" | "),
    apiKeyPresent: Boolean(TINYFISH_API_KEY),
  };
}

// ============================================================
// 6. Riset SPP Kompetitor (untuk estimasi pendapatan)
// ============================================================

/**
 * Query untuk mencari SPP aktual kompetitor di sekitar lokasi
 */
function buildCompetitorSppQueries(loc = {}, competitorNames = [], options = {}) {
  const city = loc.city || "";
  const province = loc.province || "";
  const adminArea = getAreaLabel(loc);
  const recency = 525600; // 1 tahun

  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);

  const queries = [
    {
      kind: "area_spp_all",
      query: `SPP PAUD TK preschool "${city}" biaya bulanan 2025 2026`,
      recency_minutes: recency,
    },
    {
      kind: "area_spp_bimba",
      query: `SPP Bimba Smartkidz "${city}" OR "${province}" biaya`,
      recency_minutes: recency,
    },
  ];

  // Tambah 1 query per kompetitor (max 2)
  for (const name of competitorNames.slice(0, deep ? 4 : 2)) {
    queries.push({
      kind: "competitor_spp_name",
      query: `"${name}" SPP biaya bulanan 2025 2026`,
      recency_minutes: recency,
    });
  }

  if (deep) {
    queries.push(
      {
        kind: "area_spp_deep",
        query: `"${adminArea}" ("uang masuk" OR "uang pangkal" OR "biaya tahunan" OR "daya tampung") (PAUD OR TK OR preschool OR daycare)`,
        recency_minutes: recency,
      },
      {
        kind: "area_spp_deep",
        query: `"${city}" "${province}" ("profil sekolah" OR "tuition fee" OR "biaya sekolah" OR "jadwal belajar") (PAUD OR TK OR preschool)`,
        recency_minutes: recency,
      }
    );
  }

  return queries;
}

/**
 * Score untuk sumber SPP kompetitor
 */
function scoreSppSource(source) {
  let score = 0;

  const haystack = [source.title, source.snippet, source.abstract].filter(Boolean).join(" ").toLowerCase();

  // Kata kunci SPP
  if (/spp|biaya bulanan|tuition|uang sekolah/i.test(haystack)) score += 20;
  if (/rp\.?\s*[\d.,]+\/bulan|per bulan|monthly/i.test(haystack)) score += 15;
  if (/biaya masuk|uang masuk|uang daftar/i.test(haystack)) score += 10;
  if (/paud|tk|preschool|daycare|bimba/i.test(haystack)) score += 12;

  // Bonus untuk angka spesifik
  const priceMatch = haystack.match(/rp\.?\s*([\d.,]+)/i);
  if (priceMatch) {
    const price = Number(priceMatch[1].replace(/\./g, '').replace(/,/g, '.'));
    if (price >= 100000 && price <= 5000000) score += 25; // range wajar SPP PAUD/TK
  }

  // Domain
  const hostname = getHostname(source.url);
  if (/google\.com\/maps/i.test(hostname)) score += 18;
  else if (/(?:^|\.)go\.id$/i.test(hostname)) score += 14;
  else if (/(?:^|\.)kompas\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)detik\.com$/i.test(hostname)) score += 10;
  else if (/instagram\.com$/i.test(hostname)) score += 8;

  return score;
}

/**
 * Ekstrak angka SPP dari teks
 */
function extractSppFromText(text) {
  const cleaned = stripHtmlTags(text);
  if (!cleaned) return [];

  const patterns = [
    // SPP Rp500.000/bulan
    /spp[^.]*?rp\.?\s*([\d.,]+)[^.]*?(?:per\s*bulan|\/bulan|per\s*bln|sebulan)/i,
    // Biaya Rp300.000 per bulan
    /biaya[^.]*?rp\.?\s*([\d.,]+)[^.]*?(?:per\s*bulan|\/bulan|per\s*bln|sebulan)/i,
    // Rp500.000 - Rp700.000 per bulan
    /rp\.?\s*([\d.,]+)\s*[-–]\s*rp\.?\s*([\d.,]+)[^.]*?(?:per\s*bulan|\/bulan|sebulan)/i,
    // Tuition fee Rp400.000
    /tuition[^.]*?rp\.?\s*([\d.,]+)/i,
    // Uang sekolah Rp250.000
    /uang\s+sekolah[^.]*?rp\.?\s*([\d.,]+)/i,
    // Angka dengan konteks PAUD/TK
    /(paud|tk|preschool|bimba|daycare)[^.]*?rp\.?\s*([\d.,]+)/i,
  ];

  const results = [];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      // Ambil semua angka yang cocok
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          const cleaned_num = match[i].replace(/[^\d]/g, '');
          const price = Number(cleaned_num);
          if (price >= 100000 && price <= 5000000) {
            results.push(price);
          }
        }
      }
    }
  }

  return [...new Set(results)];
}

/**
 * Riset SPP kompetitor di sekitar lokasi
 */
async function runCompetitorSppResearch(loc = {}, competitorNames = [], options = {}) {
  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);
  const queries = buildCompetitorSppQueries(loc, competitorNames, { deep });
  const allSources = await runSearchQueries(queries, { location: loc.city || "Indonesia" });

  // Score
  const scored = allSources.map((s) => ({ ...s, score: scoreSppSource(s) }))
    .sort((a, b) => b.score - a.score);
  const topSources = scored.slice(0, deep ? 14 : 10);

  // Fetch untuk ekstrak SPP
  await enrichWithFetch(topSources, deep ? 8 : 5, { deep });

  // Ekstrak angka SPP dari semua konten
  const allSppValues = [];
  const sppBySource = [];

  for (const source of topSources) {
    const content = [source.title, source.snippet, source.abstract].filter(Boolean).join(". ");
    const sppValues = extractSppFromText(content);
    if (sppValues.length) {
      sppBySource.push({
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        spp_values: sppValues,
        score: source.score,
      });
    }
    allSppValues.push(...sppValues);
  }

  // Hitung statistik
  let avgSpp = null;
  let minSpp = null;
  let maxSpp = null;
  let medianSpp = null;
  let sppCount = 0;

  if (allSppValues.length) {
    const sorted = [...allSppValues].sort((a, b) => a - b);
    sppCount = sorted.length;
    avgSpp = Math.round(sorted.reduce((sum, v) => sum + v, 0) / sppCount);
    minSpp = sorted[0];
    maxSpp = sorted[sorted.length - 1];
    medianSpp = sorted[Math.floor(sorted.length / 2)];
  }

  const summaryParts = [];
  if (sppCount > 0) {
    summaryParts.push(`Ditemukan ${sppCount} data SPP dari ${sppBySource.length} sumber.`);
    summaryParts.push(`Rata-rata SPP: Rp${avgSpp?.toLocaleString("id-ID") || "-"}/bulan.`);
    summaryParts.push(`Range: Rp${minSpp?.toLocaleString("id-ID") || "-"} - Rp${maxSpp?.toLocaleString("id-ID") || "-"}/bulan.`);
  } else {
    summaryParts.push("Data SPP spesifik belum ditemukan dari pencarian web.");
  }

  return {
    ok: true,
    researchDepth: deep ? "deep" : "standard",
    summary: summaryParts.join(" "),
    avg_spp: avgSpp,
    min_spp: minSpp,
    max_spp: maxSpp,
    median_spp: medianSpp,
    spp_count: sppCount,
    sources_with_spp: sppBySource,
    all_spp_values: allSppValues,
    searchQueries: queries.length,
    apiKeyPresent: Boolean(TINYFISH_API_KEY),
  };
}

// ============================================================
// 7. Feasibility Study - Studi Kelayakan Cabang Baru
// ============================================================

/**
 * Build queries for each feasibility parameter:
 * 1. Aksesibilitas - akses jalan, transportasi, kemudahan mencapai lokasi
 * 2. Visibilitas - visibilitas ruko, signage, penglihatan dari jalan
 * 3. Demografi - jumlah penduduk, usia target, keluarga muda
 * 4. Kompetitor - pesaing sejenis di radius 3km
 * 5. Fasilitas & Lingkungan - fasilitas pendukung, keamanan, lingkungan
 * 6. Potensi Promosi - komunitas, kerjasama, peluang promosi
 * 7. History Kegiatan (Jejak Digital) - event, kegiatan, aktivitas online
 */
function buildFeasibilityStudyQueries(locationContext = {}, businessInput = {}) {
  const city = locationContext.city || "";
  const province = locationContext.province || "";
  const district = locationContext.subdistrict || locationContext.district || "";
  const adminArea = [district, city, province].filter(Boolean).join(" ");
  const businessType = businessInput.businessType || "";
  const businessDetail = businessInput.businessDetail || "";
  const sellingPrice = businessInput.sellingPrice || "";
  const businessLabel = businessDetail || businessType || "bisnis";
  const recency = 525600; // 1 tahun

  const queries = [
    // 1. Aksesibilitas
    {
      kind: "accessibility",
      parameter: "Aksesibilitas",
      query: `"${district}" "${city}" aksesibilitas jalan akses transportasi kemudahan lokasi komersial ruko`,
    },
    {
      kind: "accessibility",
      parameter: "Aksesibilitas",
      query: `"${district}" "${city}" akses jalan raya angkutan umum parkir kendaraan kemacetan lalu lintas`,
    },

    // 2. Visibilitas
    {
      kind: "visibility",
      parameter: "Visibilitas",
      query: `"${district}" "${city}" visibilitas ruko toko signage papan nama strategis jalan utama`,
    },
    {
      kind: "visibility",
      parameter: "Visibilitas",
      query: `"${district}" "${city}" lokasi strategis komersial traffic pejalan kaki lalu lintas ramai`,
    },

    // 3. Demografi
    {
      kind: "demography",
      parameter: "Demografi",
      query: `"${district}" "${city}" jumlah penduduk demografi keluarga muda anak usia dini kelurahan`,
    },
    {
      kind: "demography",
      parameter: "Demografi",
      query: `"${district}" "${city}" "${province}" penduduk usia 0-14 kelompok umur BPS kecamatan dalam angka site:bps.go.id`,
    },
    {
      kind: "demography",
      parameter: "Demografi",
      query: `"${district}" "${city}" jumlah keluarga rumah tangga perumahan cluster hunian penduduk`,
    },

    // 4. Kompetitor
    {
      kind: "competitor",
      parameter: "Kompetitor",
      query: `"${district}" "${city}" ${businessLabel} kompetitor pesaing sejenis usaha serupa`,
    },
    {
      kind: "competitor",
      parameter: "Kompetitor",
      query: `"${district}" "${city}" ${businessLabel} jumlah toko usaha sejenis persaingan pasar`,
    },
    {
      kind: "competitor",
      parameter: "Kompetitor",
      query: `"${district}" "${city}" ${businessLabel} harga ${sellingPrice} tarif biaya`,
    },

    // 5. Fasilitas & Lingkungan
    {
      kind: "facilities",
      parameter: "Fasilitas & Lingkungan",
      query: `"${district}" "${city}" fasilitas umum lingkungan sekitar minimarket supermarket rumah sakit klinik taman`,
    },
    {
      kind: "facilities",
      parameter: "Fasilitas & Lingkungan",
      query: `"${district}" "${city}" keamanan lingkungan RT RW kebersihan banjir genangan sanitasi`,
    },

    // 6. Potensi Promosi
    {
      kind: "promotion",
      parameter: "Potensi Promosi",
      query: `"${district}" "${city}" komunitas warga kerjasama promosi event kelurahan pasar tradisional`,
    },
    {
      kind: "promotion",
      parameter: "Potensi Promosi",
      query: `"${district}" "${city}" potensi pasar daya beli masyarakat pengeluaran per kapita UMP UMK`,
    },

    // 7. History Kegiatan (Jejak Digital)
    {
      kind: "digital_footprint",
      parameter: "History Kegiatan",
      query: `"${district}" "${city}" kegiatan event lomba bazar festival komunitas anak keluarga site:instagram.com OR site:facebook.com`,
      recency_minutes: recency,
    },
    {
      kind: "digital_footprint",
      parameter: "History Kegiatan",
      query: `"${district}" "${city}" ${businessLabel} ulasan review rekomendasi pengalaman pelanggan`,
    },
    {
      kind: "digital_footprint",
      parameter: "History Kegiatan",
      query: `"${district}" "${city}" event kegiatan masyarakat warga perumahan RT RW 17 agustus pengajian senam`,
      recency_minutes: recency,
    },
  ];

  return queries;
}

/**
 * Score a feasibility research source based on parameter relevance
 */
function scoreFeasibilitySource(source) {
  let score = 0;
  const haystack = [source.title, source.snippet, source.abstract].filter(Boolean).join(" ").toLowerCase();

  // Domain authority
  const hostname = getHostname(source.url);
  if (/(?:^|\.)bps\.go\.id$/i.test(hostname)) score += 30;
  else if (/(?:^|\.)go\.id$/i.test(hostname)) score += 20;
  else if (/(?:^|\.)katadata\.co\.id$/i.test(hostname)) score += 18;
  else if (/(?:^|\.)kompas\.com$/i.test(hostname)) score += 14;
  else if (/(?:^|\.)detik\.com$/i.test(hostname)) score += 12;
  else if (/(?:^|\.)kumparan\.com$/i.test(hostname)) score += 12;
  else if (/(?:^|\.)cnbcindonesia\.com$/i.test(hostname)) score += 12;
  else if (/(?:^|\.)instagram\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)facebook\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)tiktok\.com$/i.test(hostname)) score += 8;
  else if (/(?:^|\.)youtube\.com$/i.test(hostname)) score += 8;
  else if (/(?:^|\.)numbeo\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)rumah123\.com$/i.test(hostname)) score += 10;
  else if (/(?:^|\.)99\.co$/i.test(hostname)) score += 10;

  // Parameter-specific scoring
  if (source.parameter === "Aksesibilitas") {
    if (/akses|jalan|transportasi|parkir|angkutan|lalu lintas|kemacetan|commute/i.test(haystack)) score += 20;
    if (/jalan utama|jalan raya|arteri|tol|stasiun|halte|bandara/i.test(haystack)) score += 15;
  }
  if (source.parameter === "Visibilitas") {
    if (/visibilitas|signage|papan nama|terlihat|strategis|ramai|pejalan kaki/i.test(haystack)) score += 20;
    if (/jalan utama|traffico|pusat kota|keramaian/i.test(haystack)) score += 12;
  }
  if (source.parameter === "Demografi") {
    if (/penduduk|jumlah penduduk|keluarga|rumah tangga|anak usia|kelompok umur/i.test(haystack)) score += 20;
    if (/usia 0|usia 14|usia 5|usia 9|anak dini/i.test(haystack)) score += 15;
    if (/susenas|sakernas|BPS|dukcapil/i.test(haystack)) score += 10;
  }
  if (source.parameter === "Kompetitor") {
    if (/kompetitor|pesaing|sejenis|serupa|persaingan/i.test(haystack)) score += 20;
    if (/harga|tarif|biaya|SPP|tarif/i.test(haystack)) score += 15;
  }
  if (source.parameter === "Fasilitas & Lingkungan") {
    if (/fasilitas|lingkungan|keamanan|kebersihan|taman|klinik|rumah sakit|minimarket/i.test(haystack)) score += 20;
    if (/banjir|genangan|sanitasi|RT RW/i.test(haystack)) score += 12;
  }
  if (source.parameter === "Potensi Promosi") {
    if (/komunitas|kerjasama|promosi|event|pasar|daya beli|pengeluaran/i.test(haystack)) score += 20;
    if (/UMP|UMK|upah minimum|pengeluaran per kapita/i.test(haystack)) score += 15;
  }
  if (source.parameter === "History Kegiatan") {
    if (/event|kegiatan|lomba|bazar|festival|komunitas/i.test(haystack)) score += 20;
    if (/instagram|facebook|tiktok|youtube|sosial media/i.test(haystack)) score += 15;
    if (/2025|2026|terbaru|baru/i.test(haystack)) score += 8;
  }

  return score;
}

/**
 * Extract metrics from text for each parameter
 */
function extractFeasibilityMetrics(text, parameter) {
  const cleaned = stripHtmlTags(text);
  if (!cleaned) return [];
  const metrics = [];

  if (parameter === "Demografi") {
    const patterns = [
      { regex: /jumlah penduduk[^.]*?([0-9.,]+(?:\s*(?:ribu|juta|jiwa))?)/i, label: "Jumlah penduduk" },
      { regex: /(?:rumah tangga|keluarga)[^.]*?([0-9.,]+(?:\s*(?:ribu|juta))?)/i, label: "Rumah tangga" },
      { regex: /usia\s*(?:0[-–]4|0[-–]6|3[-–]5|5[-–]9|0[-–]14)[^.]*?([0-9.,]+)/i, label: "Usia target" },
      { regex: /keluarga muda[^.]*?([0-9.,]+)/i, label: "Keluarga muda" },
    ];
    for (const p of patterns) {
      const m = cleaned.match(p.regex);
      if (m) metrics.push(`${p.label}: ${m[1].trim()}`);
    }
  }

  if (parameter === "Aksesibilitas") {
    const patterns = [
      { regex: /(?:jarak|waktu tempuh|travel time|akses ke)[^.]*?([0-9.,]+\s*(?:menit|km|meter))/i, label: "Aksesibilitas" },
      { regex: /(?:jalan utama|rute utama|koridor)[^.]*?([^.]{10,80})/i, label: "Jalan utama" },
    ];
    for (const p of patterns) {
      const m = cleaned.match(p.regex);
      if (m) metrics.push(`${p.label}: ${m[1].trim()}`);
    }
  }

  if (parameter === "Potensi Promosi") {
    const patterns = [
      { regex: /pengeluaran per kapita[^.]*?(?:Rp\.?|IDR)?\s*([0-9.,]+)/i, label: "Pengeluaran per kapita" },
      { regex: /(?:UMP|UMK|upah minimum)[^.]*?(?:Rp\.?|IDR)?\s*([0-9.,]+)/i, label: "UMP/UMK" },
      { regex: /daya beli[^.]*?([0-9.,]+\s*(?:persen|%|poin)?)/i, label: "Daya beli" },
    ];
    for (const p of patterns) {
      const m = cleaned.match(p.regex);
      if (m) metrics.push(`${p.label}: ${m[1].trim()}`);
    }
  }

  if (parameter === "Kompetitor") {
    const patterns = [
      { regex: /(?:jumlah|ada|terdapat)\s*(?:\d+)?\s*(?:toko|usaha|kompetitor|pesaing)/i, label: "Jumlah kompetitor" },
      { regex: /SPP[^.]*?(?:Rp\.?|IDR)?\s*([0-9.,]+)/i, label: "SPP" },
      { regex: /biaya[^.]*?(?:Rp\.?|IDR)?\s*([0-9.,]+)/i, label: "Biaya" },
    ];
    for (const p of patterns) {
      const m = cleaned.match(p.regex);
      if (m) metrics.push(`${p.label}: ${(m[1] || m[0]).trim()}`);
    }
  }

  return metrics.slice(0, 5);
}

/**
 * Score each parameter 0-100 based on collected evidence
 */
function scoreFeasibilityParameter(parameter, sources) {
  let score = 30; // baseline
  const maxScore = 100;
  const positiveIndicators = sources.filter(s => {
    const haystack = [s.title, s.snippet, s.abstract].filter(Boolean).join(" ").toLowerCase();
    if (parameter === "Aksesibilitas") return /akses|jalan|strategis|dekat|pusat|utama|ramai/i.test(haystack);
    if (parameter === "Visibilitas") return /visibilitas|terlihat|strategis|ramai|signage|papan nama/i.test(haystack);
    if (parameter === "Demografi") return /penduduk|keluarga|anak|rumah tangga|perumahan|kelompok usia/i.test(haystack);
    if (parameter === "Kompetitor") return /kompetitor|pesaing|sejenis|serupa|persaingan|toko sejenis/i.test(haystack);
    if (parameter === "Fasilitas & Lingkungan") return /fasilitas|lingkungan|aman|bersih|taman|klinik|minimarket/i.test(haystack);
    if (parameter === "Potensi Promosi") return /komunitas|promosi|kerjasama|event|pasar|daya beli/i.test(haystack);
    if (parameter === "History Kegiatan") return /event|kegiatan|lomba|bazar|festival|komunitas|aktif/i.test(haystack);
    return false;
  });

  // More positive sources = higher score
  score += Math.min(positiveIndicators.length * 8, 40);

  // Bonus for high-quality sources
  const highQualitySources = sources.filter(s => s.score > 20);
  score += Math.min(highQualitySources.length * 5, 20);

  // Bonus for metrics found
  const allMetrics = sources.flatMap(s => s.metrics || []);
  score += Math.min(allMetrics.length * 3, 10);

  return Math.min(maxScore, Math.max(0, score));
}

/**
 * Run full feasibility study research — optimized with parallel batches
 */
async function runFeasibilityStudyResearch(locationContext = {}, businessInput = {}, options = {}) {
  const deep = Boolean(options.deep || TINYFISH_DEEP_MODE);
  const queries = buildFeasibilityStudyQueries(locationContext, businessInput);
  // The broad Unified pass already collects the web evidence. Use one query
  // per feasibility parameter here so one click stays below TinyFish's
  // 30-requests-per-minute Search limit.
  const selectedQueries = [];
  const seenParameters = new Set();
  for (const query of queries) {
    if (seenParameters.has(query.parameter)) continue;
    seenParameters.add(query.parameter);
    selectedQueries.push(query);
  }
  const allSources = [];
  const BATCH_SIZE = 2;
  const PER_QUERY_TIMEOUT_MS = 15000; // 15s per query

  // Helper: run a single query with timeout
  async function runSingleQuery(item) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_QUERY_TIMEOUT_MS);
    try {
      const opts = {
        location: locationContext.city || "Indonesia",
        language: "id",
        purpose: `Riset kelayakan: ${item.parameter}`,
      };
      if (item.recency_minutes) opts.recency_minutes = item.recency_minutes;
      const searchResult = await tinyfishSearch(item.query, opts);
      const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
      return results.map(r => ({
        kind: item.kind,
        parameter: item.parameter,
        title: r.title || "",
        url: r.url || "",
        snippet: r.snippet || "",
        siteName: r.site_name || "",
      }));
    } catch (error) {
      console.warn(`TinyFish batch gagal [${item.parameter}/${item.kind}]:`, error.message);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  // Run queries in parallel batches of BATCH_SIZE
  for (let i = 0; i < selectedQueries.length; i += BATCH_SIZE) {
    const batch = selectedQueries.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(runSingleQuery));
    for (const results of batchResults) {
      allSources.push(...results);
    }
    // If we already have enough sources, stop early
    if (allSources.length >= 15) break;
  }

  // Deduplicate by URL
  const seen = new Set();
  const dedupedSources = allSources.filter((s) => {
    const key = (s.url || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Score and rank sources
  const scoredSources = dedupedSources
    .map((s) => ({ ...s, score: scoreFeasibilitySource(s) }))
    .sort((a, b) => b.score - a.score);

  const topSources = scoredSources.slice(0, deep ? 20 : 15);

  // Fetch abstracts for top sources (parallel, fewer)
  try {
    await enrichWithFetch(topSources, deep ? 6 : 3, { deep });
  } catch (e) {
    console.warn("Enrich fetch error:", e.message);
  }

  // Extract metrics per source
  for (const source of topSources) {
    const content = [source.title, source.snippet, source.abstract].filter(Boolean).join(". ");
    source.metrics = extractFeasibilityMetrics(content, source.parameter);
  }

  // Group by parameter
  const byParameter = {};
  const parameters = ["Aksesibilitas", "Visibilitas", "Demografi", "Kompetitor", "Fasilitas & Lingkungan", "Potensi Promosi", "History Kegiatan"];
  for (const param of parameters) {
    byParameter[param] = topSources.filter(s => s.parameter === param);
  }

  // Score each parameter
  const parameterScores = {};
  for (const param of parameters) {
    parameterScores[param] = scoreFeasibilityParameter(param, byParameter[param]);
  }

  // Calculate overall score
  const overallScore = Math.round(
    parameters.reduce((sum, param) => sum + parameterScores[param], 0) / parameters.length
  );

  // Collect all metrics
  const allMetrics = [];
  const seenMetrics = new Set();
  for (const source of topSources) {
    for (const metric of source.metrics || []) {
      const key = metric.toLowerCase();
      if (!seenMetrics.has(key)) {
        seenMetrics.add(key);
        allMetrics.push({ text: metric, parameter: source.parameter, source: source.title });
      }
    }
  }

  // Build summary
  const summaryParts = [];
  summaryParts.push(`${topSources.length} sumber riset dari ${parameters.length} parameter.`);
  for (const param of parameters) {
    const count = byParameter[param].length;
    const score = parameterScores[param];
    summaryParts.push(`${param}: ${count} sumber (skor: ${score}/100).`);
  }
  summaryParts.push(`Skor keseluruhan: ${overallScore}/100.`);

  return {
    ok: true,
    researchDepth: deep ? "deep" : "standard",
    summary: summaryParts.join(" "),
    totalSources: topSources.length,
    totalMetrics: allMetrics.length,
    parameters,
    parameterScores,
    overallScore,
    byParameter: Object.fromEntries(
      Object.entries(byParameter).map(([param, sources]) => [
        param,
        {
          sources: sources.map(s => ({
            title: s.title, url: s.url, snippet: s.snippet, score: s.score, metrics: s.metrics || [],
          })),
          score: parameterScores[param],
          sourceCount: sources.length,
        },
      ])
    ),
    metrics: allMetrics,
    searchQueries: selectedQueries.length,
    apiKeyPresent: Boolean(TINYFISH_API_KEY),
  };
}

module.exports = {
  tinyfishSearch,
  tinyfishFetch,
  tinyfishResearch,
  buildFeasibilityResearchPrompt,
  buildPurchasingPowerQueries,
  buildSocialMediaQueries,
  buildNewsQueries,
  buildCompetitorSppQueries,
  runPurchasingPowerResearch,
  runSocialMediaResearch,
  runNewsResearch,
  runFullResearch,
  runCompetitorSppResearch,
  runFeasibilityStudyResearch,
  buildFeasibilityStudyQueries,
  scoreFeasibilitySource,
  scoreFeasibilityParameter,
  extractFeasibilityMetrics,
  extractPurchasingPowerMetrics,
  extractEventDetails,
  extractSppFromText,
  scorePurchasingPowerSource,
  scoreEventSource,
  scoreSppSource,
  TINYFISH_API_KEY,
};
