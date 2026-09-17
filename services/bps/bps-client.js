const DEFAULT_BASE_URL = "https://webapi.bps.go.id/v1/api";

class BpsApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BpsApiError";
    Object.assign(this, details);
  }
}

function cleanSegment(value) {
  return encodeURIComponent(String(value));
}

function readRows(payload) {
  if (!Array.isArray(payload?.data)) return [];
  return Array.isArray(payload.data[1]) ? payload.data[1] : [];
}

function readPageInfo(payload) {
  const info = Array.isArray(payload?.data) && payload.data[0] ? payload.data[0] : {};
  return {
    page: Number(info.page || 1),
    pages: Number(info.pages || 1),
    total: Number(info.total || 0),
  };
}

class BpsClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.BPS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = String(options.apiKey || process.env.BPS_API_KEY || "").trim();
    this.timeoutMs = Number(options.timeoutMs || process.env.BPS_API_TIMEOUT_MS || 30000);
    this.cacheTtlMs = Number(options.cacheTtlMs || process.env.BPS_DISCOVERY_CACHE_TTL_MS || 86400000);
    this.cache = options.cache || new Map();
  }

  assertKey() {
    if (!this.apiKey) {
      throw new BpsApiError("BPS_API_KEY belum dikonfigurasi.", { code: "BPS_API_KEY_MISSING" });
    }
  }

  async requestPath(pathname, options = {}) {
    this.assertKey();
    const url = `${this.baseUrl}/${String(pathname).replace(/^\//, "")}`;
    const cacheKey = `${options.method || "GET"}:${url}`;
    const cached = this.cache.get(cacheKey);
    if (!options.noCache && cached && cached.expiresAt > Date.now()) return cached.payload;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let payload;
    try {
      response = await fetch(url, { method: options.method || "GET", signal: controller.signal });
      payload = await response.json();
    } catch (error) {
      const message = error.name === "AbortError" ? "BPS API request timeout." : `BPS API request gagal: ${error.message}`;
      throw new BpsApiError(message, { code: error.name === "AbortError" ? "BPS_TIMEOUT" : "BPS_NETWORK_ERROR" });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BpsApiError(`BPS API HTTP ${response.status}.`, { httpStatus: response.status, payload });
    }
    if (!payload || payload.status !== "OK") {
      throw new BpsApiError(payload?.message || "BPS API mengembalikan status Error.", { httpStatus: response.status, payload });
    }

    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, payload });
    return payload;
  }

  async listDomains(type = "all", provinceId = "") {
    const suffix = provinceId
      ? `/type/${cleanSegment(type)}/prov/${cleanSegment(provinceId)}/key/${cleanSegment(this.apiKey)}/`
      : `/type/${cleanSegment(type)}/key/${cleanSegment(this.apiKey)}/`;
    return this.requestPath(`/domain${suffix}`);
  }

  async listSubjects({ domain, page = 1, subcat, lang = "ind" }) {
    let path = `/list/model/subject/lang/${cleanSegment(lang)}/domain/${cleanSegment(domain)}`;
    if (subcat) path += `/subcat/${cleanSegment(subcat)}`;
    path += `/page/${cleanSegment(page)}/key/${cleanSegment(this.apiKey)}/`;
    return this.requestPath(path);
  }

  async listVariables({ domain, subject, page = 1, year, area = 1, lang = "ind" }) {
    let path = `/list/model/var/lang/${cleanSegment(lang)}/domain/${cleanSegment(domain)}`;
    if (subject) path += `/subject/${cleanSegment(subject)}`;
    if (year) path += `/year/${cleanSegment(year)}`;
    if (area != null) path += `/area/${cleanSegment(area)}`;
    path += `/page/${cleanSegment(page)}/key/${cleanSegment(this.apiKey)}/`;
    return this.requestPath(path);
  }

  async listPeriods({ domain, variableId, page = 1, lang = "ind" }) {
    const path = `/list/model/th/lang/${cleanSegment(lang)}/domain/${cleanSegment(domain)}/var/${cleanSegment(variableId)}/page/${cleanSegment(page)}/key/${cleanSegment(this.apiKey)}/`;
    return this.requestPath(path);
  }

  async fetchDynamicData({ domain, variableId, periodId, derivedVariableId, verticalVariableId, lang = "ind" }) {
    let path = `/list/model/data/lang/${cleanSegment(lang)}/domain/${cleanSegment(domain)}/var/${cleanSegment(variableId)}/th/${cleanSegment(periodId)}`;
    if (derivedVariableId) path += `/turvar/${cleanSegment(derivedVariableId)}`;
    if (verticalVariableId) path += `/vervar/${cleanSegment(verticalVariableId)}`;
    path += `/key/${cleanSegment(this.apiKey)}/`;
    return this.requestPath(path, { noCache: false });
  }

  async searchStaticTables({ domain, keyword, year, page = 1, lang = "ind" }) {
    const params = new URLSearchParams({
      model: "statictable",
      domain: String(domain),
      keyword: String(keyword),
      page: String(page),
      lang,
      key: this.apiKey,
    });
    if (year) params.set("year", String(year));
    return this.requestPath(`/list/?${params.toString()}`);
  }

  async getStaticTable({ domain, tableId, lang = "ind" }) {
    const params = new URLSearchParams({
      model: "statictable",
      domain: String(domain),
      id: String(tableId),
      lang,
      key: this.apiKey,
    });
    return this.requestPath(`/../view?${params.toString()}`);
  }
}

module.exports = { BpsClient, BpsApiError, readRows, readPageInfo };
