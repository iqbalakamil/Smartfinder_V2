const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");
const { crawlGoogleMapsPlaces, crawlGoogleWebEvidence } = require("./crawlers/googleBrowserCrawler");

const PORT = Number(process.env.PORT || 8787);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const PLACES_PROVIDER_URL = normalizeOptionalUrl(process.env.PLACES_PROVIDER_URL);
const OVERPASS_API_URL = normalizeOptionalUrl(process.env.OVERPASS_API_URL) || "https://overpass-api.de/api/interpreter";
const WORLDPOP_API_URL = normalizeOptionalUrl(process.env.WORLDPOP_API_URL) || "https://api.worldpop.org/v1";
const DUKCAPIL_ARCGIS_BASE_URL = normalizeOptionalUrl(process.env.DUKCAPIL_ARCGIS_BASE_URL) || "https://gis.dukcapil.kemendagri.go.id/arcgis/rest/services";
const DUKCAPIL_DEMOGRAPHY_SERVICE = process.env.DUKCAPIL_DEMOGRAPHY_SERVICE || "AGR_VISUAL_KEC_FIX";
const DUKCAPIL_DEMOGRAPHY_LAYER_ID = Number(process.env.DUKCAPIL_DEMOGRAPHY_LAYER_ID || 2);
const ENABLE_GOOGLE_MAPS_CRAWLER = String(process.env.ENABLE_GOOGLE_MAPS_CRAWLER || "true").toLowerCase() === "true";
const ENABLE_GOOGLE_WEB_EVIDENCE = String(process.env.ENABLE_GOOGLE_WEB_EVIDENCE || "true").toLowerCase() === "true";
const ENABLE_OSM_FALLBACK = String(process.env.ENABLE_OSM_FALLBACK || "false").toLowerCase() === "true";
const ENABLE_WORLDPOP_FALLBACK = String(process.env.ENABLE_WORLDPOP_FALLBACK || "true").toLowerCase() === "true";
const WORLDPOP_REQUEST_TIMEOUT_MS = Number(process.env.WORLDPOP_REQUEST_TIMEOUT_MS || 15000);
const WORLDPOP_POLL_ATTEMPTS = Number(process.env.WORLDPOP_POLL_ATTEMPTS || 5);
const WORLDPOP_POLL_DELAY_MS = Number(process.env.WORLDPOP_POLL_DELAY_MS || 1200);
const DEFAULT_CAPACITY_PER_UNIT = Number(process.env.DEFAULT_CAPACITY_PER_UNIT || 40);
const DEFAULT_UTILIZATION_RATE = Number(process.env.DEFAULT_UTILIZATION_RATE || 0.7);
const MARKET_SIZE_CAPACITY_PER_COMPETITOR = Number(process.env.MARKET_SIZE_CAPACITY_PER_COMPETITOR || 50);
const MARKET_SIZE_MONTHLY_FEE = Number(process.env.MARKET_SIZE_MONTHLY_FEE || 450000);
const MONTHLY_COST_ESTIMATE = parseOptionalNumber(process.env.MONTHLY_COST_ESTIMATE);
const BRANCH_CAPACITY_IDEAL_MIN = Number(process.env.BRANCH_CAPACITY_IDEAL_MIN || 200);
const BRANCH_CAPACITY_MAX = Number(process.env.BRANCH_CAPACITY_MAX || 300);
const BPS_AGE_SHARE_REFERENCE_URL = "https://sensus.bps.go.id/topik/tabular/sp2022/188/1/0";
const INDONESIA_AGE_0_14_SHARE = (22094426 + 22013768 + 22088673) / 275773774;
const INDONESIA_AGE_2_7_SHARE = ((22094426 * (3 / 5)) + (22013768 * (3 / 5))) / 275773774;
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://localhost:3000"
]);

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const origin = req.headers.origin;
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "http://127.0.0.1:5500";

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id");
  res.setHeader("X-Request-Id", requestId);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    logInfo(requestId, `${req.method} ${requestUrl.pathname}`);

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "smartkidz-geo-research-api",
        request_id: requestId,
        places_provider_configured: Boolean(PLACES_PROVIDER_URL),
        google_maps_crawler_enabled: ENABLE_GOOGLE_MAPS_CRAWLER,
        google_web_evidence_enabled: ENABLE_GOOGLE_WEB_EVIDENCE,
        osm_fallback_enabled: ENABLE_OSM_FALLBACK,
        worldpop_fallback_enabled: ENABLE_WORLDPOP_FALLBACK,
        dukcapil_demography_service: `${DUKCAPIL_DEMOGRAPHY_SERVICE}/${DUKCAPIL_DEMOGRAPHY_LAYER_ID}`
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/reverse-geocode") {
      const body = await readJsonBody(req);
      const latitude = toFiniteNumber(body.latitude);
      const longitude = toFiniteNumber(body.longitude);
      assertCoordinates(latitude, longitude);

      const data = await reverseGeocode({ latitude, longitude, requestId });
      sendJson(res, 200, data);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/places") {
      const latitude = toFiniteNumber(requestUrl.searchParams.get("lat"));
      const longitude = toFiniteNumber(requestUrl.searchParams.get("lng"));
      const radiusMeters = toFiniteNumber(requestUrl.searchParams.get("radius")) ?? 3000;
      assertCoordinates(latitude, longitude);

      const placesPayload = await fetchPlacesWithinRadius({
        latitude,
        longitude,
        radiusMeters,
        requestId
      });

      sendJson(res, 200, placesPayload);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/demography") {
      const latitude = toFiniteNumber(requestUrl.searchParams.get("lat"));
      const longitude = toFiniteNumber(requestUrl.searchParams.get("lng"));
      assertCoordinates(latitude, longitude);

      const demographyPayload = await fetchDemographyWithinRadius({
        latitude,
        longitude,
        radiusMeters: 3000,
        requestId
      });

      sendJson(res, 200, demographyPayload);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/analysis") {
      const body = await readJsonBody(req);
      const latitude = toFiniteNumber(body.latitude);
      const longitude = toFiniteNumber(body.longitude);
      assertCoordinates(latitude, longitude);

      const radiusMeters = 3000;
      const [locationValidation, placesPayload, demographyPayload] = await Promise.all([
        reverseGeocode({ latitude, longitude, requestId }),
        fetchPlacesWithinRadius({ latitude, longitude, radiusMeters, requestId }),
        fetchDemographyWithinRadius({ latitude, longitude, radiusMeters, requestId })
      ]);

      const webEvidence = await fetchGoogleEvidence({
        reverseGeocodeResult: locationValidation,
        requestId
      });

      const result = buildAnalysisResult({
        latitude,
        longitude,
        radiusMeters,
        businessInput: body,
        reverseGeocodeResult: locationValidation,
        placesPayload,
        demographyPayload,
        webEvidence
      });

      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, {
      error: {
        message: "Not found"
      }
    });
  } catch (error) {
    logError(requestId, error);
    sendJson(res, error.statusCode || 500, {
      error: {
        message: error.message || "Request failed.",
        request_id: requestId
      }
    });
  } finally {
    logInfo(requestId, `completed in ${Date.now() - startedAt}ms`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Smartkidz geo research API running on http://127.0.0.1:${PORT}`);
});

async function reverseGeocode({ latitude, longitude, requestId }) {
  const target = new URL("https://nominatim.openstreetmap.org/reverse");
  target.searchParams.set("format", "jsonv2");
  target.searchParams.set("lat", String(latitude));
  target.searchParams.set("lon", String(longitude));
  target.searchParams.set("zoom", "18");
  target.searchParams.set("addressdetails", "1");

  return fetchJsonWithRetry(target.toString(), {
    headers: {
      "User-Agent": "SmartkidzDashboard/2.0 (Geo research validation)"
    }
  }, requestId);
}

async function fetchPlacesWithinRadius({ latitude, longitude, radiusMeters, requestId }) {
  if (!PLACES_PROVIDER_URL) {
    if (ENABLE_GOOGLE_MAPS_CRAWLER) {
      try {
        return await fetchPlacesFromGoogleMapsCrawler({ latitude, longitude, radiusMeters, requestId });
      } catch (error) {
        logInfo(requestId, `google maps crawler unavailable: ${error.message}`);
      }
    }

    if (!ENABLE_OSM_FALLBACK) {
      return {
        pois: [],
        source: null,
        data_quality: "low",
        estimated: false,
        reasoning: "Backend scraping service Google Maps belum aktif, crawler lokal belum berhasil, dan fallback OSM dimatikan, sehingga data POI dikembalikan null/kosong.",
        assumption_source: "places_provider_not_configured"
      };
    }

    try {
      return await fetchPlacesFromOverpass({ latitude, longitude, radiusMeters, requestId });
    } catch (error) {
      logInfo(requestId, `overpass unavailable: ${error.message}`);
      return {
        pois: [],
        source: null,
        data_quality: "low",
        estimated: false,
        reasoning: "Fallback OpenStreetMap Overpass tidak tersedia, sehingga data POI dikembalikan null/kosong.",
        assumption_source: "overpass_unavailable"
      };
    }
  }

  const target = new URL("/places", PLACES_PROVIDER_URL);
  target.searchParams.set("lat", String(latitude));
  target.searchParams.set("lng", String(longitude));
  target.searchParams.set("radius", String(radiusMeters));

  const upstream = await fetchJsonWithRetry(target.toString(), {}, requestId);
  const normalized = normalizePlacesPayload(upstream, latitude, longitude, radiusMeters);

  return {
    ...normalized,
    source: target.origin,
    data_quality: normalized.pois.length > 0 ? "high" : "low",
    estimated: false,
    reasoning: normalized.pois.length > 0
      ? "Data POI berasal dari backend scraping service dan sudah difilter radius 3 KM."
      : "Backend scraping service merespons, tetapi tidak ada POI valid di radius 3 KM.",
    assumption_source: null
  };
}

async function fetchPlacesFromGoogleMapsCrawler({ latitude, longitude, radiusMeters, requestId }) {
  const payload = await crawlGoogleMapsPlaces({
    latitude,
    longitude,
    radiusMeters
  });

  return {
    pois: payload.pois.map((item) => ({
      name: item.name,
      category: item.category,
      latitude: item.latitude,
      longitude: item.longitude,
      rating: item.rating,
      reviews: item.reviews,
      address: item.address,
      website: item.website,
      google_maps_url: item.google_maps_url,
      source_query: item.source_query,
      distance_km: item.distance_km
    })),
    source: payload.source,
    data_quality: payload.data_quality,
    estimated: payload.estimated,
    reasoning: payload.reasoning,
    assumption_source: payload.assumption_source
  };
}

async function fetchPlacesFromOverpass({ latitude, longitude, radiusMeters, requestId }) {
  const query = buildOverpassQuery(latitude, longitude, radiusMeters);
  const target = new URL(OVERPASS_API_URL);
  target.searchParams.set("data", query);
  const text = await fetchTextWithRetry(target.toString(), {}, requestId);

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    error.statusCode = 502;
    throw error;
  }

  const pois = normalizeOverpassElements(payload?.elements, latitude, longitude, radiusMeters);

  return {
    pois,
    source: "openstreetmap_overpass",
    data_quality: pois.length > 0 ? "medium" : "low",
    estimated: false,
    reasoning: pois.length > 0
      ? "Data POI fallback berasal dari OpenStreetMap Overpass dan sudah difilter radius 3 KM."
      : "Fallback OpenStreetMap aktif, tetapi tidak menghasilkan POI yang relevan dalam radius 3 KM.",
    assumption_source: null
  };
}

async function fetchDemographyWithinRadius({ latitude, longitude, radiusMeters, requestId }) {
  try {
    const dukcapilPayload = await fetchDemographyFromDukcapil({ latitude, longitude, requestId });
    if (dukcapilPayload) {
      return dukcapilPayload;
    }
  } catch (error) {
    logInfo(requestId, `dukcapil demography unavailable: ${error.message}`);
  }

  if (!ENABLE_WORLDPOP_FALLBACK) {
    return {
      population: null,
      age_0_14: null,
      early_childhood_population: null,
      estimated: false,
      reasoning: "Fallback demografi WorldPop dimatikan pada konfigurasi backend.",
      assumption_source: "worldpop_fallback_disabled"
    };
  }

  const geojson = buildCircleGeoJson(latitude, longitude, radiusMeters, 24);
  const encodedGeojson = encodeURIComponent(JSON.stringify(geojson));
  const year = "2020";
  const totalUrl = `${WORLDPOP_API_URL}/services/stats?dataset=wpgppop&year=${year}&geojson=${encodedGeojson}&runasync=true`;
  const ageUrl = `${WORLDPOP_API_URL}/services/stats?dataset=wpgpas&year=${year}&geojson=${encodedGeojson}&runasync=true`;

  try {
    const [totalPopulationResult, agePopulationResult] = await Promise.allSettled([
      fetchWorldPopStats(totalUrl, requestId),
      fetchWorldPopStats(ageUrl, requestId)
    ]);

    const totalData = totalPopulationResult.status === "fulfilled" ? totalPopulationResult.value : null;
    const ageData = agePopulationResult.status === "fulfilled" ? agePopulationResult.value : null;

    if (!totalData && !ageData) {
      throw new Error("WorldPop total population and age pyramid both unavailable.");
    }

    const totalPopulation = toInteger(totalData?.data?.total_population);
    const ageSexPyramid = Array.isArray(ageData?.data?.agesexpyramid)
      ? ageData.data.agesexpyramid
      : [];

    const age014 = ageSexPyramid.length > 0 ? sumAgeRange(ageSexPyramid, [
      "0 to 1",
      "1 to 5",
      "5 to 10",
      "10 to 15"
    ]) : null;
    const earlyChildhood = estimateEarlyChildhoodFromWorldPop(ageSexPyramid);

    return finalizeDemographyFallback({
      totalPopulation,
      age014,
      earlyChildhood,
      sourceLabel: "WorldPop wpgppop + wpgpas year 2020",
      primaryReasoning: "Populasi radius 3 KM dihitung dari WorldPop grid stats. Anak usia 2-7 diestimasi dari bucket umur WorldPop yang tidak persis sama dengan 2-7 tahun."
    });
  } catch (error) {
    logInfo(requestId, `worldpop unavailable: ${error.message}`);
    return {
      population: null,
      age_0_14: null,
      early_childhood_population: null,
      estimated: false,
      reasoning: "Demography service WorldPop belum berhasil diakses atau tidak mengembalikan hasil valid.",
      assumption_source: "worldpop_unavailable"
    };
  }
}

async function fetchDemographyFromDukcapil({ latitude, longitude, requestId }) {
  const target = new URL(`${DUKCAPIL_DEMOGRAPHY_SERVICE}/FeatureServer/${DUKCAPIL_DEMOGRAPHY_LAYER_ID}/query`, `${DUKCAPIL_ARCGIS_BASE_URL}/`);
  target.searchParams.set("geometry", `${longitude},${latitude}`);
  target.searchParams.set("geometryType", "esriGeometryPoint");
  target.searchParams.set("inSR", "4326");
  target.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  target.searchParams.set("outFields", "*");
  target.searchParams.set("returnGeometry", "false");
  target.searchParams.set("f", "pjson");

  const payload = await fetchJsonWithRetry(target.toString(), {
    headers: {
      "User-Agent": "SmartkidzDashboard/3.0 (Dukcapil demography fetch)"
    }
  }, requestId);

  if (payload?.error) {
    const error = new Error(`Dukcapil ArcGIS error: ${payload.error.message || "unknown error"}`);
    error.statusCode = 502;
    throw error;
  }

  const attributes = payload?.features?.[0]?.attributes;
  if (!attributes || typeof attributes !== "object") {
    return null;
  }

  return buildDukcapilDemographyPayload(attributes, {
    latitude,
    longitude,
    sourceUrl: target.toString()
  });
}

async function fetchGoogleEvidence({ reverseGeocodeResult, requestId }) {
  if (!ENABLE_GOOGLE_WEB_EVIDENCE) {
    return [];
  }

  try {
    return await crawlGoogleWebEvidence({
      district: reverseGeocodeResult?.address?.city_district || reverseGeocodeResult?.address?.township || reverseGeocodeResult?.address?.suburb || null,
      city: reverseGeocodeResult?.address?.city || reverseGeocodeResult?.address?.county || reverseGeocodeResult?.address?.municipality || null,
      province: reverseGeocodeResult?.address?.state || null
    });
  } catch (error) {
    logInfo(requestId, `google web evidence unavailable: ${error.message}`);
    return [];
  }
}

async function fetchWorldPopStats(url, requestId) {
  const result = await fetchJsonWithRetry(url, {}, requestId, WORLDPOP_REQUEST_TIMEOUT_MS);
  if (result?.status === "finished") {
    return result;
  }

  if (result?.taskid) {
    for (let attempt = 0; attempt < WORLDPOP_POLL_ATTEMPTS; attempt += 1) {
      await delay(WORLDPOP_POLL_DELAY_MS);
      const taskResult = await fetchJsonWithRetry(
        `${WORLDPOP_API_URL.replace(/\/+$/, "")}/tasks/${result.taskid}`,
        {},
        requestId,
        WORLDPOP_REQUEST_TIMEOUT_MS
      );
      if (taskResult?.status === "finished") {
        return taskResult;
      }
    }
  }

  throw new Error("WorldPop task did not finish in time.");
}

function normalizePlacesPayload(payload, centerLat, centerLng, radiusMeters) {
  const pois = Array.isArray(payload?.pois) ? payload.pois : [];
  const normalized = [];

  pois.forEach((poi) => {
    const latitude = toFiniteNumber(poi.latitude);
    const longitude = toFiniteNumber(poi.longitude);
    if (latitude == null || longitude == null) {
      return;
    }

    const distanceKm = haversineKm(centerLat, centerLng, latitude, longitude);
    if (distanceKm > radiusMeters / 1000) {
      return;
    }

    normalized.push({
      name: nullableString(poi.name),
      category: categorizePlace(poi.category, poi.name),
      latitude,
      longitude,
      rating: toFiniteNumber(poi.rating),
      reviews: toInteger(poi.reviews),
      address: nullableString(poi.address),
      distance_km: roundTo(distanceKm, 3)
    });
  });

  normalized.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));

  return { pois: normalized };
}

function buildAnalysisResult({ latitude, longitude, radiusMeters, businessInput, reverseGeocodeResult, placesPayload, demographyPayload, webEvidence }) {
  const pois = Array.isArray(placesPayload?.pois) ? placesPayload.pois : [];
  const hasPoiSource = Boolean(placesPayload?.source);
  const poiSummary = buildPoiSummary(pois, placesPayload);
  const competitorMap = buildCompetitorMap(pois, hasPoiSource);
  const districtAnalysis = buildDistrictAnalysis(reverseGeocodeResult, pois, hasPoiSource, demographyPayload, placesPayload, webEvidence);
  const marketEstimation = buildMarketEstimation({
    radiusKm: radiusMeters / 1000,
    districtAnalysis,
    competitorMap,
    reverseGeocodeResult
  });
  const unitEconomics = buildUnitEconomics(marketEstimation);
  const decision = buildDecision({
    marketEstimation,
    competitorMap,
    districtAnalysis,
    poiSummary
  });
  const dataQuality = buildDataQuality({
    placesPayload,
    districtAnalysis,
    marketEstimation
  });

  return {
    location: {
      latitude,
      longitude,
      analysis_anchor: "radius_3km",
      reverse_geocode: {
        display_name: reverseGeocodeResult?.display_name || null,
        district: reverseGeocodeResult?.address?.city_district || reverseGeocodeResult?.address?.township || reverseGeocodeResult?.address?.suburb || null,
        city: reverseGeocodeResult?.address?.city || reverseGeocodeResult?.address?.county || reverseGeocodeResult?.address?.municipality || null,
        province: reverseGeocodeResult?.address?.state || null,
        country: reverseGeocodeResult?.address?.country || null,
        postal_code: reverseGeocodeResult?.address?.postcode || null
      }
    },
    radius_km: 3,
    poi_summary: poiSummary,
    competitor_map: competitorMap,
    district_analysis: districtAnalysis,
    demography_report: demographyPayload?.report || null,
    demography_text: demographyPayload?.formatted_text || null,
    market_estimation: marketEstimation,
    unit_economics: unitEconomics,
    decision,
    data_quality: dataQuality,
    executive_summary: buildExecutiveSummary({
      marketEstimation,
      competitorMap,
      decision
    }),
    opportunity_signals: buildOpportunitySignals({ poiSummary, competitorMap, marketEstimation }),
    risk_signals: buildRiskSignals({ dataQuality, competitorMap, marketEstimation }),
    recommendation_summary: buildRecommendationSummary(decision),
    web_evidence: webEvidence,
    meta: {
      generated_at: new Date().toISOString(),
      business_type: nullableString(businessInput.businessType),
      target_customer: nullableString(businessInput.targetCustomer),
      notes: nullableString(businessInput.extraNotes)
    }
  };
}

function buildPoiSummary(pois, placesPayload) {
  const hasPoiSource = Boolean(placesPayload?.source);
  return {
    total_pois: hasPoiSource ? pois.length : null,
    categories: {
      bimba: hasPoiSource ? countCategory(pois, "bimba") : null,
      paud: hasPoiSource ? countCategory(pois, "paud") : null,
      tk: hasPoiSource ? countCategory(pois, "tk") : null,
      daycare: hasPoiSource ? countCategory(pois, "daycare") : null,
      les_anak: hasPoiSource ? countCategory(pois, "les anak") : null,
      fasilitas_keluarga: hasPoiSource ? countCategory(pois, "fasilitas keluarga") : null
    },
    source: placesPayload?.source || null,
    data_quality: placesPayload?.data_quality || "low"
  };
}

function buildCompetitorMap(pois, hasPoiSource) {
  if (!hasPoiSource) {
    return {
      radius_km: 3,
      count_estimate: null,
      capacity_per_unit: null,
      total_capacity: null,
      density_level: null,
      nearest_distance_km: null,
      type_distribution: {
        bimba: null,
        paud: null,
        tk: null,
        les: null,
        daycare: null
      },
      estimated: false,
      reasoning: "Data kompetitor tidak tersedia karena backend scraping service Google Maps belum aktif.",
      assumption_source: "places_provider_not_configured"
    };
  }

  const competitors = pois.filter((poi) => isCompetitorCategory(poi.category));
  if (competitors.length === 0) {
    return {
      radius_km: 3,
      count_estimate: 0,
      capacity_per_unit: null,
      total_capacity: 0,
      density_level: "low",
      nearest_distance_km: null,
      type_distribution: {
        bimba: 0,
        paud: 0,
        tk: 0,
        les: 0,
        daycare: 0
      },
      estimated: false,
      reasoning: "Tidak ada kompetitor yang berhasil tervalidasi dari backend POI radius 3 KM.",
      assumption_source: null
    };
  }

  const count = competitors.length;
  const nearestDistanceKm = competitors[0]?.distance_km ?? null;
  const capacityPerUnit = DEFAULT_CAPACITY_PER_UNIT > 0 ? DEFAULT_CAPACITY_PER_UNIT : null;
  const totalCapacity = capacityPerUnit == null ? null : count * capacityPerUnit;

  return {
    radius_km: 3,
    count_estimate: count,
    capacity_per_unit: capacityPerUnit,
    total_capacity: totalCapacity,
    density_level: count >= 12 ? "high" : count >= 6 ? "medium" : "low",
    nearest_distance_km: nearestDistanceKm,
    type_distribution: {
      bimba: countCategory(competitors, "bimba"),
      paud: countCategory(competitors, "paud"),
      tk: countCategory(competitors, "tk"),
      les: countCategory(competitors, "les anak"),
      daycare: countCategory(competitors, "daycare")
    },
    estimated: true,
    reasoning: "Jumlah kompetitor berasal dari backend POI nyata radius 3 KM. Kapasitas per unit masih estimasi operasional karena backend belum menyediakan data kapasitas lembaga.",
    assumption_source: "DEFAULT_CAPACITY_PER_UNIT env atau default sistem"
  };
}

function buildDukcapilDemographyPayload(attributes, context) {
  const age0to14 = sumNumbers([
    attributes.u0,
    attributes.u5,
    attributes.u10
  ]);
  const earlyChildhood = estimateEarlyChildhoodFromAgeBands(attributes);
  const religion = {
    islam: toInteger(attributes.islam),
    kristen: toInteger(attributes.kristen),
    katholik: toInteger(attributes.katholik),
    hindu: toInteger(attributes.hindu),
    buddha: toInteger(attributes.budha),
    konghucu: toInteger(attributes.konghucu),
    kepercayaan_terhadap_tuhan_yme: toInteger(attributes.kepercayaan)
  };
  const gender = {
    laki_laki: toInteger(attributes.pria),
    perempuan: toInteger(attributes.wanita)
  };
  const maritalStatus = {
    belum_kawin: toInteger(attributes.belum_kawin),
    kawin: toInteger(attributes.kawin),
    cerai_hidup: toInteger(attributes.cerai_hidup),
    cerai_mati: toInteger(attributes.cerai_mati)
  };
  const ageGroups = {
    usia_0_4_tahun: toInteger(attributes.u0),
    usia_5_9_tahun: toInteger(attributes.u5),
    usia_10_14_tahun: toInteger(attributes.u10),
    usia_15_19_tahun: toInteger(attributes.u15),
    usia_20_24_tahun: toInteger(attributes.u20),
    usia_25_29_tahun: toInteger(attributes.u25),
    usia_30_34_tahun: toInteger(attributes.u30),
    usia_35_39_tahun: toInteger(attributes.u35),
    usia_40_44_tahun: toInteger(attributes.u40),
    usia_45_49_tahun: toInteger(attributes.u45),
    usia_50_54_tahun: toInteger(attributes.u50),
    usia_55_59_tahun: toInteger(attributes.u55),
    usia_60_64_tahun: toInteger(attributes.u60),
    usia_65_69_tahun: toInteger(attributes.u65),
    usia_70_74_tahun: toInteger(attributes.u70),
    usia_75_tahun_ke_atas: toInteger(attributes.u75)
  };
  const birthsAndGrowth = {
    lahir_tahun_2020: toInteger(attributes.lhr_2020),
    lahir_sebelum_tahun_2020: toInteger(attributes.lhr_sebelum_2020),
    lahir_tahun_2021: toInteger(attributes.lhr_2021),
    lahir_sebelum_tahun_2021: toInteger(attributes.lhr_sebelum_2021),
    lahir_tahun_2022: toInteger(attributes.lhr_2022),
    lahir_sebelum_tahun_2022: toInteger(attributes.lhr_sebelum_2022),
    lahir_tahun_2023: toInteger(attributes.lhr_2023),
    lahir_sebelum_tahun_2023: toInteger(attributes.lhr_sebelum_2023),
    lahir_tahun_2024: toInteger(attributes.lhr_2024),
    lahir_sebelum_tahun_2024: toInteger(attributes.lhr_sebelum_2024),
    pertumbuhan_penduduk_tahun_2020_persen: toInteger(attributes.pertumbuhan_2020),
    pertumbuhan_penduduk_tahun_2021_persen: toInteger(attributes.pertumbuhan_2021),
    pertumbuhan_penduduk_tahun_2022_persen: toInteger(attributes.pertumbuhan_2022),
    pertumbuhan_penduduk_tahun_2023_persen: toInteger(attributes.pertumbuhan_2023),
    pertumbuhan_penduduk_tahun_2024_persen: toInteger(attributes.pertumbuhan_2024)
  };
  const education = {
    tidak_belum_sekolah: toInteger(attributes.tidak_blm_sekolah),
    belum_tamat_sd: toInteger(attributes.belum_tamat_sd),
    tamat_sd: toInteger(attributes.tamat_sd),
    sltp: toInteger(attributes.sltp),
    slta: toInteger(attributes.slta),
    d1_dan_d2: toInteger(attributes.d1_dan_d2),
    d3: toInteger(attributes.d3),
    s1: toInteger(attributes.s1),
    s2: toInteger(attributes.s2),
    s3: toInteger(attributes.s3)
  };
  const bloodTypes = {
    golongan_darah_a: toInteger(attributes.a),
    golongan_darah_b: toInteger(attributes.b),
    golongan_darah_ab: toInteger(attributes.ab),
    golongan_darah_o: toInteger(attributes.o),
    golongan_darah_a_positif: toInteger(attributes.a_),
    golongan_darah_a_negatif: toInteger(attributes.a1),
    golongan_darah_b_positif: toInteger(attributes.b1),
    golongan_darah_b_negatif: toInteger(attributes.b_),
    golongan_darah_ab_positif: toInteger(attributes.ab1),
    golongan_darah_ab_negatif: toInteger(attributes.ab_),
    golongan_darah_o_positif: toInteger(attributes.o_),
    golongan_darah_o_negatif: toInteger(attributes.o1),
    golongan_darah_tidak_diketahui: toInteger(attributes.tidak_tahu)
  };
  const occupations = {
    belum_tidak_bekerja: toInteger(attributes.belum_tidak_bekerja),
    nelayan: toInteger(attributes.nelayan),
    pelajar_dan_mahasiswa: toInteger(attributes.pelajar_mahasiswa),
    pensiunan: toInteger(attributes.pensiunan),
    perdagangan: toInteger(attributes.perdagangan),
    mengurus_rumah_tangga: toInteger(attributes.mengurus_rumah_tangga),
    wiraswasta: toInteger(attributes.wiraswasta),
    guru: toInteger(attributes.guru),
    perawat: toInteger(attributes.perawat),
    pengacara: toInteger(attributes.pengacara),
    pekerjaan_lainnya: toInteger(attributes.lainnya)
  };
  const report = {
    wilayah: {
      provinsi: nullableString(attributes.nama_prop),
      kabupaten_kota: nullableString(attributes.nama_kab),
      kecamatan: nullableString(attributes.nama_kec)
    },
    ringkasan: {
      jumlah_kelurahan: toInteger(attributes.jumlah_kelurahan),
      jumlah_desa: toInteger(attributes.jumlah_desa),
      jumlah_penduduk: toInteger(attributes.jumlah_penduduk),
      kepala_keluarga: toInteger(attributes.jumlah_kk),
      perpindahan_penduduk: toInteger(attributes.perpindahan_pddk),
      jumlah_meninggal: toInteger(attributes.jml_meninggal),
      perubahan_data: toInteger(attributes.perubahan_data),
      jumlah_wajib_ktp: toInteger(attributes.jml_wktp),
      jumlah_rekam_wajib_ktp: toInteger(attributes.jml_rekam_wktp)
    },
    agama: religion,
    penduduk: gender,
    status_perkawinan: maritalStatus,
    kelompok_usia: ageGroups,
    pertumbuhan_penduduk: birthsAndGrowth,
    pendidikan: education,
    golongan_darah: bloodTypes,
    pekerjaan: occupations,
    derived_metrics: {
      usia_0_14: age0to14,
      estimasi_anak_usia_2_7: earlyChildhood,
      metode_estimasi_anak_usia_2_7: "3/5 dari usia 0-4 ditambah 3/5 dari usia 5-9"
    },
    source: {
      system: "dukcapil_arcgis_kecamatan",
      service: DUKCAPIL_DEMOGRAPHY_SERVICE,
      layer_id: DUKCAPIL_DEMOGRAPHY_LAYER_ID,
      query_url: context.sourceUrl,
      coordinate_input: {
        latitude: context.latitude,
        longitude: context.longitude
      }
    }
  };

  return {
    population: report.ringkasan.jumlah_penduduk,
    age_0_14: age0to14,
    early_childhood_population: earlyChildhood,
    estimated: false,
    reasoning: "Demografi utama diambil dari layer ArcGIS Dukcapil tingkat kecamatan yang memotong titik input. Field anak usia 2-7 diturunkan dari bucket usia 0-4 dan 5-9 agar market sizing tetap relevan untuk target Smartkidz.",
    assumption_source: `${DUKCAPIL_DEMOGRAPHY_SERVICE}/FeatureServer/${DUKCAPIL_DEMOGRAPHY_LAYER_ID}`,
    source: "dukcapil_arcgis_kecamatan",
    area_basis: "kecamatan",
    area_name: report.wilayah.kecamatan,
    province: report.wilayah.provinsi,
    city: report.wilayah.kabupaten_kota,
    report,
    formatted_text: formatDukcapilDemographyText(report)
  };
}

function buildDistrictAnalysis(reverseGeocodeResult, pois, hasPoiSource, demographyPayload, placesPayload, webEvidence) {
  const familyFacilities = pois.filter((poi) => poi.category === "fasilitas keluarga");
  const nearestFamilyFacility = familyFacilities[0]?.distance_km ?? null;
  const evidenceByTopic = indexEvidenceByTopic(webEvidence);
  const districtName = reverseGeocodeResult?.address?.city_district
    || reverseGeocodeResult?.address?.township
    || reverseGeocodeResult?.address?.suburb
    || reverseGeocodeResult?.address?.city
    || null;

  return [
    {
      district_name: districtName,
      distance_km: 0,
      accessibility: {
        anchor_point: reverseGeocodeResult?.display_name || null,
        family_facility_count: hasPoiSource ? familyFacilities.length : null,
        nearest_family_facility_km: hasPoiSource ? nearestFamilyFacility : null,
        estimated: !hasPoiSource || familyFacilities.length === 0,
        reasoning: !hasPoiSource
          ? (placesPayload?.reasoning || "Data fasilitas keluarga belum tersedia karena backend POI belum aktif.")
          : familyFacilities.length > 0
          ? "Aksesibilitas awal dibaca dari kedekatan fasilitas keluarga dalam radius 3 KM."
          : "Belum ada fasilitas keluarga tervalidasi dari backend POI, sehingga aksesibilitas butuh validasi lapangan.",
        assumption_source: !hasPoiSource
          ? "places_provider_not_configured"
          : familyFacilities.length > 0 ? "backend_poi_radius_3km" : "field_validation_needed"
      },
      demography: {
        population: demographyPayload?.population ?? null,
        age_0_14: demographyPayload?.age_0_14 ?? null,
        early_childhood_population: demographyPayload?.early_childhood_population ?? null,
        estimated: Boolean(demographyPayload?.estimated),
        reasoning: demographyPayload?.reasoning || "Belum ada sumber demografi radius 3 KM yang terhubung ke backend.",
        assumption_source: demographyPayload?.assumption_source || "demography_service_not_configured",
        source: demographyPayload?.source || null,
        area_basis: demographyPayload?.area_basis || null,
        area_name: demographyPayload?.area_name || null,
        report: demographyPayload?.report || null,
        formatted_text: demographyPayload?.formatted_text || null
      },
      economy: {
        environment_type: inferEnvironmentType(pois, reverseGeocodeResult),
        spending_power_fit: null,
        estimated: true,
        reasoning: evidenceByTopic.buying_power.length > 0
          ? `Link bukti daya beli ditemukan melalui Google Search sebanyak ${evidenceByTopic.buying_power.length} hasil teratas, tetapi angka tidak diisi otomatis agar tidak mengarang.`
          : "Kelas ekonomi belum boleh diisi tanpa data pendapatan/pengeluaran yang tervalidasi.",
        assumption_source: evidenceByTopic.buying_power.length > 0
          ? "google_search_evidence_links"
          : "waiting_for_demography_or_economy_source",
        evidence_links: evidenceByTopic.buying_power
      },
      market_needs: {
        competitor_density: hasPoiSource ? inferDensityLabelFromCount(pois.filter((poi) => isCompetitorCategory(poi.category)).length) : null,
        family_activity_signal: hasPoiSource ? (familyFacilities.length > 0 ? "present" : "weak") : null,
        market_gap_signal: null,
        estimated: true,
        reasoning: hasPoiSource
          ? "Sinyal kebutuhan pasar awal diambil dari kepadatan kompetitor dan fasilitas keluarga, belum dari demand radius yang lengkap."
          : (placesPayload?.reasoning || "Sinyal kebutuhan pasar belum bisa dibaca karena backend POI belum tersedia."),
        assumption_source: hasPoiSource ? "backend_poi_radius_3km" : "places_provider_not_configured",
        evidence_links: evidenceByTopic.family_activity
      },
      facilities: {
        total_family_facilities: hasPoiSource ? familyFacilities.length : null,
        highlighted_places: hasPoiSource ? familyFacilities.slice(0, 5).map((poi) => ({
          name: poi.name,
          category: poi.category,
          distance_km: poi.distance_km
        })) : []
      },
      digital_footprint: {
        website: evidenceByTopic.demography.concat(evidenceByTopic.buying_power).map((entry) => entry.url).slice(0, 8),
        instagram: [],
        facebook: [],
        maps: hasPoiSource ? pois.slice(0, 10).map((poi) => poi.google_maps_url || buildGoogleMapsLink(poi.latitude, poi.longitude, poi.name)) : []
      },
      promotion: {
        child_events: [],
        family_events: [],
        community_links: evidenceByTopic.family_activity.map((entry) => entry.url)
      },
      score: hasPoiSource ? buildDistrictScore(pois) : null
    }
  ];
}

function buildMarketEstimation({ radiusKm, districtAnalysis, competitorMap, reverseGeocodeResult }) {
  const demography = districtAnalysis[0]?.demography || {};
  const earlyChildhood = toInteger(demography.early_childhood_population);
  const tam = earlyChildhood != null ? earlyChildhood : null;
  const samFactorInfo = resolveSamFactor(reverseGeocodeResult);
  const sam = tam != null ? Math.round(tam * samFactorInfo.factor) : null;
  const annualFeeLow = 500000 * 12;
  const annualFeeMid = 600000 * 12;
  const annualFeeHigh = 700000 * 12;
  const marketSizeScenarios = buildMarketSizeScenarios({ sam, branchCapacityMax: BRANCH_CAPACITY_MAX });
  const rawSom = marketSizeScenarios.mid.students;
  const som = rawSom != null ? Math.min(rawSom, BRANCH_CAPACITY_MAX) : null;
  const competitorPoiCount = toInteger(competitorMap?.count_estimate);
  const marketSizeCapacityPerCompetitor = MARKET_SIZE_CAPACITY_PER_COMPETITOR;
  const marketSizeFeeInfo = resolveMarketSizeMonthlyFee(reverseGeocodeResult);
  const marketSizeMonthlyFee = marketSizeFeeInfo.monthlyFee;
  const marketSizeAnnualFee = marketSizeMonthlyFee * 12;
  const totalCapacity = toInteger(competitorMap?.total_capacity);
  const utilizationRate = totalCapacity != null ? DEFAULT_UTILIZATION_RATE : null;
  const activeMarket = totalCapacity != null && utilizationRate != null ? Math.round(totalCapacity * utilizationRate) : null;
  const marketSize = competitorPoiCount != null
    ? competitorPoiCount * marketSizeCapacityPerCompetitor * marketSizeAnnualFee
    : null;
  const marketShare = som != null && totalCapacity ? roundTo((som / totalCapacity) * 100, 2) : null;
  const potentialRevenue = marketSize;
  const marketGap = tam != null && activeMarket != null ? tam - activeMarket : null;
  const estimated = Boolean(demography?.estimated) || totalCapacity == null;
  const reasoningParts = [];
  const demandAreaLabel = demography?.area_basis === "kecamatan"
    ? `kecamatan ${demography?.area_name || "target"}`
    : `radius ${radiusKm} KM`;

  if (tam == null) {
    reasoningParts.push("TAM/SAM/SOM belum bisa dihitung karena data anak usia 2-7 tahun dari sumber demografi backend belum tersedia.");
  } else {
    reasoningParts.push(`TAM memakai jumlah anak usia 2-7 tahun pada ${demandAreaLabel}.`);
    reasoningParts.push(`SAM memakai faktor ${Math.round(samFactorInfo.factor * 100)}% berdasarkan rule wilayah untuk ${samFactorInfo.label}.`);
  }

  if (rawSom != null) {
    if (rawSom > BRANCH_CAPACITY_MAX) {
      reasoningParts.push(`SOM demand mentah ${rawSom} siswa dibatasi ke ${BRANCH_CAPACITY_MAX} siswa karena kapasitas maksimum cabang.`);
    } else if (rawSom >= BRANCH_CAPACITY_IDEAL_MIN) {
      reasoningParts.push(`SOM berada dalam band kapasitas operasional cabang ${BRANCH_CAPACITY_IDEAL_MIN}-${BRANCH_CAPACITY_MAX} siswa.`);
    } else {
      reasoningParts.push(`SOM masih di bawah band ideal kapasitas cabang ${BRANCH_CAPACITY_IDEAL_MIN}-${BRANCH_CAPACITY_MAX} siswa.`);
    }
  }

  if (totalCapacity != null) {
    reasoningParts.push("Supply-based memakai jumlah kompetitor nyata x kapasitas per unit yang masih berupa asumsi operasional.");
  } else {
    reasoningParts.push("Supply-based belum lengkap karena kapasitas kompetitor belum tersedia.");
  }

  if (marketSize != null) {
    reasoningParts.push(`Market size dihitung dari ${competitorPoiCount} POI kompetitor x kapasitas maksimum ${marketSizeCapacityPerCompetitor} siswa x SPP bulanan Rp${formatPlainInteger(marketSizeMonthlyFee)} x 12 bulan untuk area ${marketSizeFeeInfo.label}.`);
  } else {
    reasoningParts.push("Market size belum bisa dihitung karena jumlah POI kompetitor belum tersedia.");
  }

  return {
    radius_km: radiusKm,
    area_basis: demography?.area_basis || "radius_3km",
    area_name: demography?.area_name || null,
    tam,
    sam,
    som,
    supply_based: {
      total_capacity: totalCapacity,
      utilization_rate: utilizationRate,
      active_market: activeMarket
    },
    market_size_formula: {
      competitor_poi_count: competitorPoiCount,
      max_capacity_per_poi: marketSizeCapacityPerCompetitor,
      spp_monthly: marketSizeMonthlyFee,
      spp_area_label: marketSizeFeeInfo.label,
      annual_multiplier: 12,
      computed_market_size: marketSize
    },
    market_size_scenarios: marketSizeScenarios,
    market_size: marketSize,
    market_share: marketShare,
    potential_revenue: potentialRevenue,
    market_gap: marketGap,
    estimated,
    reasoning: reasoningParts.join(" "),
    assumption_source: tam == null
      ? "demography_service_not_configured"
      : `${demography?.assumption_source || "demography_source_unknown"} | DEFAULT_UTILIZATION_RATE and DEFAULT_CAPACITY_PER_UNIT | sam_factor_rule:${samFactorInfo.label}:${Math.round(samFactorInfo.factor * 100)}% | spp_rule:${marketSizeFeeInfo.label}:${formatPlainInteger(marketSizeMonthlyFee)}`
  };
}

function buildUnitEconomics(marketEstimation) {
  const targetStudents = toInteger(marketEstimation?.som);
  const branchTargetBand = {
    ideal_min: BRANCH_CAPACITY_IDEAL_MIN,
    max: BRANCH_CAPACITY_MAX
  };
  if (MONTHLY_COST_ESTIMATE == null || targetStudents == null || targetStudents <= 0) {
    return {
      estimated_cost_monthly: MONTHLY_COST_ESTIMATE,
      break_even_students: null,
      target_students: targetStudents,
      margin_estimate: null,
      payback_period_months: null,
      branch_capacity_band: branchTargetBand
    };
  }

  const avgMonthlyFee = 600000;
  const breakEvenStudents = Math.ceil(MONTHLY_COST_ESTIMATE / avgMonthlyFee);
  const targetRevenueMonthly = targetStudents * avgMonthlyFee;
  const marginEstimate = roundTo(((targetRevenueMonthly - MONTHLY_COST_ESTIMATE) / targetRevenueMonthly) * 100, 2);

  return {
    estimated_cost_monthly: MONTHLY_COST_ESTIMATE,
    break_even_students: breakEvenStudents,
    target_students: targetStudents,
    margin_estimate: Number.isFinite(marginEstimate) ? marginEstimate : null,
    payback_period_months: null,
    branch_capacity_band: branchTargetBand
  };
}

function buildDecision({ marketEstimation, competitorMap, districtAnalysis, poiSummary }) {
  let score = 50;
  const reasons = [];
  const competitorCount = toInteger(competitorMap?.count_estimate);
  const familyFacilities = toInteger(districtAnalysis[0]?.facilities?.total_family_facilities);
  const hasDemandData = toInteger(marketEstimation?.tam) != null;
  const marketGap = toInteger(marketEstimation?.market_gap);
  const hasCompetitorData = competitorCount != null;
  const hasFamilyData = familyFacilities != null;

  if (familyFacilities != null && familyFacilities >= 5) {
    score += 10;
    reasons.push("aktivitas keluarga di radius 3 KM terlihat cukup hidup");
  } else if (familyFacilities != null && familyFacilities === 0) {
    score -= 10;
    reasons.push("sinyal fasilitas keluarga di radius 3 KM masih lemah");
  } else {
    score -= 8;
    reasons.push("data fasilitas keluarga radius 3 KM belum tersedia");
  }

  if (competitorCount == null) {
    score -= 8;
    reasons.push("data kompetitor radius 3 KM belum tersedia");
  } else if (competitorCount >= 12) {
    score -= 20;
    reasons.push("kepadatan kompetitor tergolong tinggi");
  } else if (competitorCount >= 6) {
    score -= 8;
    reasons.push("kompetitor sudah cukup banyak");
  } else {
    score += 8;
    reasons.push("kepadatan kompetitor masih relatif rendah");
  }

  if (marketGap != null) {
    if (marketGap > 0) {
      score += 12;
      reasons.push("market gap positif");
    } else {
      score -= 15;
      reasons.push("market gap negatif atau over supply");
    }
  } else if (!hasDemandData) {
    score -= 12;
    reasons.push("data demand radius 3 KM belum cukup untuk menghitung market gap");
  }

  if ((poiSummary?.data_quality || "low") === "low") {
    score -= 10;
    reasons.push("kualitas data POI masih rendah");
  }

  score = Math.max(0, Math.min(100, score));

  let recommendation = "CONSIDER";
  if (!hasDemandData && !hasCompetitorData && !hasFamilyData) {
    recommendation = "CONSIDER";
  } else if (score >= 70 && (marketGap == null || marketGap > 0)) {
    recommendation = "OPEN";
  } else if (score <= 40 && hasDemandData && marketGap != null) {
    recommendation = "AVOID";
  } else if (score <= 25 && dataQualityAllowsHardAvoid(poiSummary, districtAnalysis)) {
    recommendation = "AVOID";
  }

  return {
    score,
    recommendation,
    reason: reasons.length > 0
      ? `Keputusan ${recommendation} didasarkan pada ${reasons.join(", ")}.`
      : "Belum ada data cukup untuk alasan keputusan yang kuat."
  };
}

function buildDataQuality({ placesPayload, districtAnalysis, marketEstimation }) {
  const populationData = districtAnalysis[0]?.demography?.population != null
    ? (districtAnalysis[0]?.demography?.source === "dukcapil_arcgis_kecamatan" ? "high" : "medium")
    : "low";
  const competitorData = placesPayload?.data_quality || "low";
  const digitalFootprintData = districtAnalysis[0]?.digital_footprint?.maps?.length > 0 ? "medium" : "low";
  const overallConfidence = [populationData, competitorData, digitalFootprintData].includes("low")
    || marketEstimation?.tam == null
    ? "low"
    : "medium";

  return {
    population_data: populationData,
    competitor_data: competitorData,
    digital_footprint_data: digitalFootprintData,
    overall_confidence: overallConfidence
  };
}

function buildExecutiveSummary({ marketEstimation, competitorMap, decision }) {
  if (marketEstimation?.tam == null && competitorMap?.count_estimate == null) {
    return "Analisis radius 3 KM baru memiliki reverse geocode, tetapi demand size dan peta kompetitor belum bisa dipastikan karena backend data mikro belum lengkap.";
  }

  if (marketEstimation?.tam == null) {
    return "Analisis radius 3 KM sudah memiliki peta kompetitor berbasis backend, tetapi demand size belum bisa dipastikan karena data demografi mikro belum tersedia.";
  }

  return `Radius 3 KM menunjukkan ${competitorMap?.count_estimate != null ? competitorMap.count_estimate : "jumlah kompetitor belum tervalidasi"} dengan rekomendasi akhir ${decision.recommendation}.`;
}

function buildOpportunitySignals({ poiSummary, competitorMap, marketEstimation }) {
  const items = [];
  if ((poiSummary?.categories?.fasilitas_keluarga || 0) > 0) {
    items.push("Terdapat fasilitas keluarga dalam radius 3 KM.");
  }
  if (competitorMap?.count_estimate != null && competitorMap.count_estimate <= 5) {
    items.push("Kepadatan kompetitor relatif rendah.");
  }
  if ((marketEstimation?.market_gap || 0) > 0) {
    items.push("Market gap masih positif.");
  }
  return items;
}

function buildRiskSignals({ dataQuality, competitorMap, marketEstimation }) {
  const items = [];
  if (dataQuality?.population_data === "low") {
    items.push("Data populasi mikro radius 3 KM belum tersedia.");
  }
  if (competitorMap?.count_estimate != null && competitorMap.count_estimate >= 12) {
    items.push("Kompetitor dalam radius 3 KM padat.");
  }
  if (competitorMap?.count_estimate == null) {
    items.push("Data kompetitor radius 3 KM belum tersedia.");
  }
  if (marketEstimation?.market_gap != null && marketEstimation.market_gap < 0) {
    items.push("Supply indikatif melebihi demand.");
  }
  if (items.length === 0) {
    items.push("Validasi lapangan tetap dibutuhkan untuk aksesibilitas dan daya beli.");
  }
  return items;
}

function indexEvidenceByTopic(webEvidence) {
  const groups = {
    demography: [],
    buying_power: [],
    family_activity: []
  };

  (Array.isArray(webEvidence) ? webEvidence : []).forEach((topicGroup) => {
    const key = topicGroup?.topic;
    if (!key || !groups[key]) return;
    const results = Array.isArray(topicGroup.results) ? topicGroup.results : [];
    groups[key] = results.map((entry) => ({
      title: entry.title || null,
      url: entry.url || null,
      snippet: entry.snippet || null,
      query: topicGroup.query || null,
      engine_used: topicGroup.engine_used || null,
      google_search_url: topicGroup.google_search_url || null
    })).filter((entry) => entry.url);
  });

  return groups;
}

function finalizeDemographyFallback({ totalPopulation, age014, earlyChildhood, sourceLabel, primaryReasoning }) {
  let resolvedPopulation = totalPopulation ?? null;
  let resolvedAge014 = age014 ?? null;
  let resolvedEarlyChildhood = earlyChildhood ?? null;
  const reasoningParts = [primaryReasoning];
  const sources = [sourceLabel];

  if (resolvedPopulation != null && resolvedAge014 == null) {
    resolvedAge014 = Math.round(resolvedPopulation * INDONESIA_AGE_0_14_SHARE);
    reasoningParts.push("Usia 0-14 diestimasi memakai proporsi nasional BPS 2022 karena age pyramid radius tidak tersedia.");
    sources.push(BPS_AGE_SHARE_REFERENCE_URL);
  }

  if (resolvedPopulation != null && resolvedEarlyChildhood == null) {
    resolvedEarlyChildhood = Math.round(resolvedPopulation * INDONESIA_AGE_2_7_SHARE);
    reasoningParts.push("Anak usia 2-7 diestimasi memakai proporsi nasional BPS 2022 karena bucket umur radius tidak tersedia.");
    sources.push(BPS_AGE_SHARE_REFERENCE_URL);
  }

  if (resolvedPopulation == null && resolvedAge014 != null) {
    resolvedPopulation = Math.round(resolvedAge014 / INDONESIA_AGE_0_14_SHARE);
    reasoningParts.push("Total populasi diestimasi balik dari usia 0-14 menggunakan proporsi nasional BPS 2022.");
    sources.push(BPS_AGE_SHARE_REFERENCE_URL);
  }

  if (resolvedPopulation == null && resolvedEarlyChildhood != null) {
    resolvedPopulation = Math.round(resolvedEarlyChildhood / INDONESIA_AGE_2_7_SHARE);
    reasoningParts.push("Total populasi diestimasi balik dari usia 2-7 menggunakan proporsi nasional BPS 2022.");
    sources.push(BPS_AGE_SHARE_REFERENCE_URL);
  }

  return {
    population: resolvedPopulation,
    age_0_14: resolvedAge014,
    early_childhood_population: resolvedEarlyChildhood,
    estimated: true,
    reasoning: reasoningParts.join(" "),
    assumption_source: Array.from(new Set(sources)).join(" | ")
  };
}

function dataQualityAllowsHardAvoid(poiSummary, districtAnalysis) {
  const poiQuality = poiSummary?.data_quality || "low";
  const populationAvailable = districtAnalysis?.[0]?.demography?.population != null;
  return poiQuality === "high" && populationAvailable;
}

function buildMarketSizeScenarios({ sam, branchCapacityMax }) {
  return {
    low: buildSingleMarketScenario({ sam, rate: 0.01, annualFee: 500000 * 12, branchCapacityMax }),
    mid: buildSingleMarketScenario({ sam, rate: 0.02, annualFee: 600000 * 12, branchCapacityMax }),
    high: buildSingleMarketScenario({ sam, rate: 0.05, annualFee: 700000 * 12, branchCapacityMax })
  };
}

function buildSingleMarketScenario({ sam, rate, annualFee, branchCapacityMax }) {
  const rawStudents = sam != null ? Math.max(1, Math.round(sam * rate)) : null;
  const students = rawStudents != null && branchCapacityMax != null ? Math.min(rawStudents, branchCapacityMax) : rawStudents;
  return {
    penetration_rate: rate,
    students,
    annual_revenue: students != null ? students * annualFee : null
  };
}

function resolveSamFactor(reverseGeocodeResult) {
  const text = [
    reverseGeocodeResult?.display_name,
    reverseGeocodeResult?.address?.city_district,
    reverseGeocodeResult?.address?.township,
    reverseGeocodeResult?.address?.suburb,
    reverseGeocodeResult?.address?.city,
    reverseGeocodeResult?.address?.county,
    reverseGeocodeResult?.address?.municipality,
    reverseGeocodeResult?.address?.state
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("pagedangan")) {
    return { factor: 0.1512, label: "Kecamatan Pagedangan" };
  }

  if (text.includes("serpong")) {
    return { factor: 0.1427, label: "Kecamatan Serpong" };
  }

  if (text.includes("bsd")) {
    return { factor: 0.14, label: "BSD" };
  }

  if (text.includes("cibinong")) {
    return { factor: 0.28, label: "Kecamatan Cibinong" };
  }

  if (text.includes("kota bogor") || text.includes("bogor kota")) {
    return { factor: 0.2724, label: "Kota Bogor" };
  }

  if (text.includes("tangerang selatan") || text.includes("south tangerang") || text.includes("tangsel")) {
    return { factor: 0.35, label: "Tangerang Selatan" };
  }

  if (text.includes("tangerang")) {
    return { factor: 0.3, label: "Tangerang" };
  }

  if (text.includes("bogor")) {
    return { factor: 0.23, label: "Bogor" };
  }

  if (text.includes("jakarta") || text.includes("dki jakarta") || text.includes("daerah khusus ibukota jakarta")) {
    return { factor: 0.14, label: "Jakarta" };
  }

  return { factor: 0.5, label: "Default" };
}

function resolveMarketSizeMonthlyFee(reverseGeocodeResult) {
  const text = [
    reverseGeocodeResult?.display_name,
    reverseGeocodeResult?.address?.city_district,
    reverseGeocodeResult?.address?.township,
    reverseGeocodeResult?.address?.suburb,
    reverseGeocodeResult?.address?.city,
    reverseGeocodeResult?.address?.county,
    reverseGeocodeResult?.address?.municipality,
    reverseGeocodeResult?.address?.state
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("bsd")) {
    return { monthlyFee: 730000, label: "BSD" };
  }

  if (text.includes("serpong")) {
    return { monthlyFee: 730000, label: "Serpong" };
  }

  if (text.includes("jakarta") || text.includes("dki jakarta") || text.includes("daerah khusus ibukota jakarta")) {
    return { monthlyFee: 730000, label: "Jakarta" };
  }

  if (text.includes("kota bogor") || text.includes("bogor kota")) {
    return { monthlyFee: 510000, label: "Bogor Kota" };
  }

  if (text.includes("kab bogor") || text.includes("kab. bogor") || text.includes("kabupaten bogor")) {
    return { monthlyFee: 450000, label: "Kabupaten Bogor" };
  }

  if (text.includes("bogor")) {
    return { monthlyFee: 450000, label: "Bogor" };
  }

  return { monthlyFee: MARKET_SIZE_MONTHLY_FEE, label: "Default" };
}

function buildRecommendationSummary(decision) {
  if (!decision) return null;
  if (decision.recommendation === "OPEN") return "Area layak dibuka dengan catatan validasi lapangan tetap dilakukan.";
  if (decision.recommendation === "AVOID") return "Area sebaiknya dihindari sampai ada bukti demand atau diferensiasi yang lebih kuat.";
  return "Area masih layak dipertimbangkan, tetapi keputusan akhir membutuhkan data demand mikro yang lebih kuat.";
}

function formatDukcapilDemographyText(report) {
  if (!report) return null;

  const lines = [
    `Provinsi\t${safeText(report.wilayah?.provinsi)}`,
    `Kabupaten/Kota\t${safeText(report.wilayah?.kabupaten_kota)}`,
    `Kecamatan\t${safeText(report.wilayah?.kecamatan)}`,
    `Jumlah Kelurahan\t${formatDecimalLike(report.ringkasan?.jumlah_kelurahan)}`,
    `Jumlah Desa\t${formatDecimalLike(report.ringkasan?.jumlah_desa)}`,
    `Jumlah Penduduk\t${formatDecimalLike(report.ringkasan?.jumlah_penduduk)}`,
    `Kepala Keluarga\t${formatDecimalLike(report.ringkasan?.kepala_keluarga)}`,
    `Perpindahan Penduduk\t${formatDecimalLike(report.ringkasan?.perpindahan_penduduk)}`,
    `Jumlah Meninggal\t${formatDecimalLike(report.ringkasan?.jumlah_meninggal)}`,
    `Perubahan Data\t${formatDecimalLike(report.ringkasan?.perubahan_data)}`,
    `Jumlah Wajib KTP\t${formatDecimalLike(report.ringkasan?.jumlah_wajib_ktp)}`,
    `Jumlah Rekam Wajib KTP\t${formatDecimalLike(report.ringkasan?.jumlah_rekam_wajib_ktp)}`,
    "",
    "Agama",
    `Islam\t${formatDecimalLike(report.agama?.islam)}`,
    `Kristen\t${formatDecimalLike(report.agama?.kristen)}`,
    `Katholik\t${formatDecimalLike(report.agama?.katholik)}`,
    `Hindu\t${formatDecimalLike(report.agama?.hindu)}`,
    `Buddha\t${formatDecimalLike(report.agama?.buddha)}`,
    `Konghucu\t${formatDecimalLike(report.agama?.konghucu)}`,
    `Kepercayaan terhadap Tuhan YME\t${formatDecimalLike(report.agama?.kepercayaan_terhadap_tuhan_yme)}`,
    "",
    "Penduduk",
    `Laki-laki\t${formatDecimalLike(report.penduduk?.laki_laki)}`,
    `Perempuan\t${formatDecimalLike(report.penduduk?.perempuan)}`,
    "",
    "Status Perkawinan",
    `Belum Kawin\t${formatDecimalLike(report.status_perkawinan?.belum_kawin)}`,
    `Kawin\t${formatDecimalLike(report.status_perkawinan?.kawin)}`,
    `Cerai Hidup\t${formatDecimalLike(report.status_perkawinan?.cerai_hidup)}`,
    `Cerai Mati\t${formatDecimalLike(report.status_perkawinan?.cerai_mati)}`,
    "",
    "Kelompok Usia",
    `Usia 0-4 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_0_4_tahun)}`,
    `Usia 5-9 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_5_9_tahun)}`,
    `Usia 10-14 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_10_14_tahun)}`,
    `Usia 15-19 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_15_19_tahun)}`,
    `Usia 20-24 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_20_24_tahun)}`,
    `Usia 25-29 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_25_29_tahun)}`,
    `Usia 30-34 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_30_34_tahun)}`,
    `Usia 35-39 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_35_39_tahun)}`,
    `Usia 40-44 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_40_44_tahun)}`,
    `Usia 45-49 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_45_49_tahun)}`,
    `Usia 50-54 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_50_54_tahun)}`,
    `Usia 55-59 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_55_59_tahun)}`,
    `Usia 60-64 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_60_64_tahun)}`,
    `Usia 65-69 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_65_69_tahun)}`,
    `Usia 70-74 Tahun\t${formatDecimalLike(report.kelompok_usia?.usia_70_74_tahun)}`,
    `Usia 75 Tahun ke Atas\t${formatDecimalLike(report.kelompok_usia?.usia_75_tahun_ke_atas)}`,
    "",
    "Pertumbuhan Penduduk",
    `Lahir Tahun 2020\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_tahun_2020)}`,
    `Lahir Sebelum Tahun 2020\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_sebelum_tahun_2020)}`,
    `Lahir Tahun 2021\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_tahun_2021)}`,
    `Lahir Sebelum Tahun 2021\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_sebelum_tahun_2021)}`,
    `Lahir Tahun 2022\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_tahun_2022)}`,
    `Lahir Sebelum Tahun 2022\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_sebelum_tahun_2022)}`,
    `Lahir Tahun 2023\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_tahun_2023)}`,
    `Lahir Sebelum Tahun 2023\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_sebelum_tahun_2023)}`,
    `Lahir Tahun 2024\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_tahun_2024)}`,
    `Lahir Sebelum Tahun 2024\t${formatDecimalLike(report.pertumbuhan_penduduk?.lahir_sebelum_tahun_2024)}`,
    `Pertumbuhan Penduduk Tahun 2020\t${formatPercentLike(report.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2020_persen)}`,
    `Pertumbuhan Penduduk Tahun 2021\t${formatPercentLike(report.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2021_persen)}`,
    `Pertumbuhan Penduduk Tahun 2022\t${formatPercentLike(report.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2022_persen)}`,
    `Pertumbuhan Penduduk Tahun 2023\t${formatPercentLike(report.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2023_persen)}`,
    `Pertumbuhan Penduduk Tahun 2024\t${formatPercentLike(report.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2024_persen)}`,
    "",
    "Pendidikan",
    `Tidak/Belum Sekolah\t${formatDecimalLike(report.pendidikan?.tidak_belum_sekolah)}`,
    `Belum Tamat SD\t${formatDecimalLike(report.pendidikan?.belum_tamat_sd)}`,
    `Tamat SD\t${formatDecimalLike(report.pendidikan?.tamat_sd)}`,
    `SLTP\t${formatDecimalLike(report.pendidikan?.sltp)}`,
    `SLTA\t${formatDecimalLike(report.pendidikan?.slta)}`,
    `D1 dan D2\t${formatDecimalLike(report.pendidikan?.d1_dan_d2)}`,
    `D3\t${formatDecimalLike(report.pendidikan?.d3)}`,
    `S1\t${formatDecimalLike(report.pendidikan?.s1)}`,
    `S2\t${formatDecimalLike(report.pendidikan?.s2)}`,
    `S3\t${formatDecimalLike(report.pendidikan?.s3)}`,
    "",
    "Golongan Darah",
    `Golongan Darah A\t${formatDecimalLike(report.golongan_darah?.golongan_darah_a)}`,
    `Golongan Darah B\t${formatDecimalLike(report.golongan_darah?.golongan_darah_b)}`,
    `Golongan Darah AB\t${formatDecimalLike(report.golongan_darah?.golongan_darah_ab)}`,
    `Golongan Darah O\t${formatDecimalLike(report.golongan_darah?.golongan_darah_o)}`,
    `Golongan Darah A+\t${formatDecimalLike(report.golongan_darah?.golongan_darah_a_positif)}`,
    `Golongan Darah A-\t${formatDecimalLike(report.golongan_darah?.golongan_darah_a_negatif)}`,
    `Golongan Darah B+\t${formatDecimalLike(report.golongan_darah?.golongan_darah_b_positif)}`,
    `Golongan Darah B-\t${formatDecimalLike(report.golongan_darah?.golongan_darah_b_negatif)}`,
    `Golongan Darah AB+\t${formatDecimalLike(report.golongan_darah?.golongan_darah_ab_positif)}`,
    `Golongan Darah AB-\t${formatDecimalLike(report.golongan_darah?.golongan_darah_ab_negatif)}`,
    `Golongan Darah O+\t${formatDecimalLike(report.golongan_darah?.golongan_darah_o_positif)}`,
    `Golongan Darah O-\t${formatDecimalLike(report.golongan_darah?.golongan_darah_o_negatif)}`,
    `Golongan Darah Tidak Diketahui\t${formatDecimalLike(report.golongan_darah?.golongan_darah_tidak_diketahui)}`,
    "",
    "Pekerjaan",
    `Belum/Tidak Bekerja\t${formatDecimalLike(report.pekerjaan?.belum_tidak_bekerja)}`,
    `Nelayan\t${formatDecimalLike(report.pekerjaan?.nelayan)}`,
    `Pelajar dan Mahasiswa\t${formatDecimalLike(report.pekerjaan?.pelajar_dan_mahasiswa)}`,
    `Pensiunan\t${formatDecimalLike(report.pekerjaan?.pensiunan)}`,
    `Perdagangan\t${formatDecimalLike(report.pekerjaan?.perdagangan)}`,
    `Mengurus Rumah Tangga\t${formatDecimalLike(report.pekerjaan?.mengurus_rumah_tangga)}`,
    `Wiraswasta\t${formatDecimalLike(report.pekerjaan?.wiraswasta)}`,
    `Guru\t${formatDecimalLike(report.pekerjaan?.guru)}`,
    `Perawat\t${formatDecimalLike(report.pekerjaan?.perawat)}`,
    `Pengacara\t${formatDecimalLike(report.pekerjaan?.pengacara)}`,
    `Pekerjaan Lainnya\t${formatDecimalLike(report.pekerjaan?.pekerjaan_lainnya)}`
  ];

  return lines.join("\n");
}

function buildDistrictScore(pois) {
  const familyFacilities = countCategory(pois, "fasilitas keluarga");
  const competitors = pois.filter((poi) => isCompetitorCategory(poi.category)).length;
  const score = 55 + Math.min(familyFacilities * 4, 20) - Math.min(competitors * 2, 20);
  return Math.max(0, Math.min(100, score));
}

function countCategory(items, category) {
  return items.filter((item) => item.category === category).length;
}

function inferEnvironmentType(pois, reverseGeocodeResult) {
  const districtText = String(reverseGeocodeResult?.display_name || "").toLowerCase();
  if (districtText.includes("industri")) return "industrial";
  if (districtText.includes("apartemen") || districtText.includes("residence")) return "residential";
  const familyCount = countCategory(pois, "fasilitas keluarga");
  const competitorCount = pois.filter((poi) => isCompetitorCategory(poi.category)).length;
  if (familyCount > 0 && competitorCount > 0) return "mixed";
  return "residential";
}

function inferDensityLabelFromCount(count) {
  if (count >= 12) return "high";
  if (count >= 6) return "medium";
  return "low";
}

function categorizePlace(rawCategory, rawName) {
  const text = `${rawCategory || ""} ${rawName || ""}`.toLowerCase();
  if (text.includes("bimba")) return "bimba";
  if (text.includes("daycare") || text.includes("day care")) return "daycare";
  if (text.includes("paud")) return "paud";
  if (text.includes("tk") || text.includes("taman kanak")) return "tk";
  if (text.includes("les") || text.includes("kursus") || text.includes("bimbel")) return "les anak";
  if (text.includes("playground") || text.includes("taman") || text.includes("mall") || text.includes("rumah sakit") || text.includes("klinik anak") || text.includes("kids")) {
    return "fasilitas keluarga";
  }
  return nullableString(rawCategory) || "lainnya";
}

function buildOverpassQuery(latitude, longitude, radiusMeters) {
  return `
[out:json][timeout:25];
(
  node(around:${Math.round(radiusMeters)},${latitude},${longitude})["amenity"~"kindergarten|school|childcare|hospital|clinic"];
  node(around:${Math.round(radiusMeters)},${latitude},${longitude})["leisure"~"playground|park"];
  node(around:${Math.round(radiusMeters)},${latitude},${longitude})["shop"~"mall|supermarket"];
  way(around:${Math.round(radiusMeters)},${latitude},${longitude})["amenity"~"kindergarten|school|childcare|hospital|clinic"];
  way(around:${Math.round(radiusMeters)},${latitude},${longitude})["leisure"~"playground|park"];
  way(around:${Math.round(radiusMeters)},${latitude},${longitude})["shop"~"mall|supermarket"];
);
out center tags;
`.trim();
}

function normalizeOverpassElements(elements, centerLat, centerLng, radiusMeters) {
  const items = Array.isArray(elements) ? elements : [];
  const normalized = [];
  const seen = new Set();

  items.forEach((element) => {
    const latitude = toFiniteNumber(element?.lat) ?? toFiniteNumber(element?.center?.lat);
    const longitude = toFiniteNumber(element?.lon) ?? toFiniteNumber(element?.center?.lon);
    if (latitude == null || longitude == null) return;

    const name = nullableString(element?.tags?.name)
      || nullableString(element?.tags?.operator)
      || nullableString(element?.tags?.brand)
      || nullableString(element?.tags?.amenity)
      || nullableString(element?.tags?.leisure)
      || nullableString(element?.tags?.shop);

    const category = categorizePlace(
      [
        element?.tags?.amenity,
        element?.tags?.leisure,
        element?.tags?.shop,
        element?.tags?.name
      ].filter(Boolean).join(" "),
      name
    );

    const distanceKm = haversineKm(centerLat, centerLng, latitude, longitude);
    if (distanceKm > radiusMeters / 1000) return;

    const key = `${name || "unnamed"}:${latitude}:${longitude}:${category}`;
    if (seen.has(key)) return;
    seen.add(key);

    normalized.push({
      name: name || "Unnamed place",
      category,
      latitude,
      longitude,
      rating: null,
      reviews: null,
      address: buildOverpassAddress(element?.tags),
      distance_km: roundTo(distanceKm, 3)
    });
  });

  normalized.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
  return normalized;
}

function buildOverpassAddress(tags) {
  if (!tags || typeof tags !== "object") return null;
  const parts = [
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
    tags["addr:postcode"]
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildCircleGeoJson(latitude, longitude, radiusMeters, steps) {
  const coordinates = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const point = destinationPoint(latitude, longitude, angle, radiusMeters);
    coordinates.push([point.longitude, point.latitude]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates]
        }
      }
    ]
  };
}

function destinationPoint(latitude, longitude, bearingRadians, distanceMeters) {
  const earthRadiusMeters = 6371000;
  const angularDistance = distanceMeters / earthRadiusMeters;
  const lat1 = degToRad(latitude);
  const lon1 = degToRad(longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    latitude: radToDeg(lat2),
    longitude: radToDeg(lon2)
  };
}

function sumAgeRange(ages, labels) {
  const wanted = new Set(labels);
  return Math.round(ages.reduce((sum, row) => {
    if (!wanted.has(row?.age)) return sum;
    return sum + (toFiniteNumber(row?.male) || 0) + (toFiniteNumber(row?.female) || 0);
  }, 0));
}

function estimateEarlyChildhoodFromWorldPop(ages) {
  const bucket1to5 = findAgeBucketTotal(ages, "1 to 5");
  const bucket5to10 = findAgeBucketTotal(ages, "5 to 10");
  if (bucket1to5 == null && bucket5to10 == null) {
    return null;
  }

  const age2to4 = bucket1to5 == null ? 0 : bucket1to5 * (3 / 4);
  const age5to7 = bucket5to10 == null ? 0 : bucket5to10 * (3 / 5);
  return Math.round(age2to4 + age5to7);
}

function findAgeBucketTotal(ages, label) {
  const row = ages.find((item) => item?.age === label);
  if (!row) return null;
  return (toFiniteNumber(row?.male) || 0) + (toFiniteNumber(row?.female) || 0);
}

function isCompetitorCategory(category) {
  return ["bimba", "paud", "tk", "les anak", "daycare"].includes(category);
}

function buildGoogleMapsLink(latitude, longitude, name) {
  const query = encodeURIComponent(name || `${latitude},${longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

async function fetchJsonWithRetry(url, options, requestId, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;

  const maxAttempts = shouldRetryUpstream(url) ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchJson(url, options, requestId, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt >= maxAttempts) {
        break;
      }
      logInfo(requestId, `retry ${attempt} failed for ${url}: ${error.message}`);
    }
  }

  throw lastError;
}

async function fetchJson(url, options, requestId, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Upstream request failed with status ${response.status}: ${text.slice(0, 300)}`);
      error.statusCode = 502;
      throw error;
    }

    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Upstream request timed out after ${timeoutMs}ms.`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithRetry(url, options, requestId, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastError;
  const maxAttempts = shouldRetryUpstream(url) ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchText(url, options, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!shouldRetryError(error) || attempt >= maxAttempts) {
        break;
      }
      logInfo(requestId, `retry ${attempt} failed for ${url}: ${error.message}`);
    }
  }
  throw lastError;
}

async function fetchText(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Upstream request failed with status ${response.status}: ${text.slice(0, 300)}`);
      error.statusCode = 502;
      throw error;
    }

    return response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Upstream request timed out after ${timeoutMs}ms.`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        error.statusCode = 400;
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function assertCoordinates(latitude, longitude) {
  if (latitude == null || longitude == null) {
    const error = new Error("latitude dan longitude wajib berupa angka.");
    error.statusCode = 400;
    throw error;
  }

  if (latitude < -11 || latitude > 6 || longitude < 95 || longitude > 141) {
    const error = new Error("Koordinat di luar rentang umum Indonesia.");
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
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

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function radToDeg(value) {
  return (value * 180) / Math.PI;
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sumNumbers(values) {
  return values.reduce((sum, value) => {
    const parsed = toFiniteNumber(value);
    return sum + (parsed || 0);
  }, 0);
}

function estimateEarlyChildhoodFromAgeBands(attributes) {
  const age0to4 = toFiniteNumber(attributes?.u0);
  const age5to9 = toFiniteNumber(attributes?.u5);
  if (age0to4 == null && age5to9 == null) {
    return null;
  }

  return Math.round(((age0to4 || 0) * (3 / 5)) + ((age5to9 || 0) * (3 / 5)));
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

function parseOptionalNumber(value) {
  const parsed = toFiniteNumber(value);
  return parsed == null ? null : parsed;
}

function nullableString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function safeText(value) {
  return nullableString(value) || "-";
}

function formatDecimalLike(value) {
  const parsed = toFiniteNumber(value);
  return parsed == null ? "-" : String(parsed);
}

function formatPercentLike(value) {
  const parsed = toFiniteNumber(value);
  return parsed == null ? "-" : `${parsed}%`;
}

function formatPlainInteger(value) {
  const parsed = toInteger(value);
  return parsed == null ? "-" : String(parsed);
}

function normalizeOptionalUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value)).toString();
  } catch {
    return null;
  }
}

function logInfo(requestId, message) {
  console.log(`[${requestId}] ${message}`);
}

function logError(requestId, error) {
  console.error(`[${requestId}] ${error.stack || error.message || error}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryUpstream(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("overpass-api.de")) return false;
  return true;
}

function shouldRetryError(error) {
  const statusCode = error?.statusCode;
  const message = String(error?.message || "");
  if (statusCode === 406) return false;
  if (message.includes("406")) return false;
  return true;
}
