const STORAGE_KEY = "smartkidz-geo-dashboard-settings";

const form = document.getElementById("research-form");
const submitButton = document.getElementById("submitButton");
const sampleButton = document.getElementById("sampleButton");
const copyButton = document.getElementById("copyButton");
const downloadButton = document.getElementById("downloadButton");
const promptPreview = document.getElementById("promptPreview");
const jsonOutput = document.getElementById("jsonOutput");
const statusBanner = document.getElementById("statusBanner");
const coordinateHint = document.getElementById("coordinateHint");
const resolvedLocation = document.getElementById("resolvedLocation");
const topDistricts = document.getElementById("topDistricts");
const opportunitySnapshot = document.getElementById("opportunitySnapshot");
const summaryCards = Array.from(document.querySelectorAll(".summary-card strong"));

bootstrap();

form.addEventListener("submit", handleSubmit);
sampleButton.addEventListener("click", fillSampleCoordinates);
copyButton.addEventListener("click", copyJson);
downloadButton.addEventListener("click", downloadJson);

function bootstrap() {
  const saved = loadSettings();
  if (!saved) return;

  setValue("proxyUrl", saved.proxyUrl);
  setValue("analysisMode", saved.analysisMode || "balanced");
  setValue("businessType", saved.businessType);
  setValue("targetCustomer", saved.targetCustomer);
  setValue("extraNotes", saved.extraNotes);
  document.getElementById("useProxy").checked = saved.useProxy !== false;
  const rememberSettings = document.getElementById("rememberSettings");
  if (rememberSettings) rememberSettings.checked = true;
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element && typeof value === "string") {
    element.value = value;
  }
}

function fillSampleCoordinates() {
  setValue("coordinates", "-6.174465, 106.822745");
  setValue("extraNotes", "Prioritaskan area keluarga muda, dekat sekolah, minim kompetitor sejenis, dan cocok untuk pricing Rp500-700 ribu per bulan.");
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const coordinates = parseCoordinates(payload.coordinates);
  const rememberSettings = document.getElementById("rememberSettings")?.checked;
  const useProxy = document.getElementById("useProxy").checked;
  coordinateHint.textContent = `Koordinat aktif: latitude ${formatCoordinate(coordinates.latitude)}, longitude ${formatCoordinate(coordinates.longitude)}.${coordinates.autoSwapped ? " Input terdeteksi tertukar dan sudah diperbaiki otomatis." : ""}`;
  resolvedLocation.textContent = "Sedang memvalidasi lokasi dari koordinat...";
  setStatus("loading", "Memvalidasi koordinat lalu menyiapkan analisis backend.");
  jsonOutput.textContent = "Menunggu validasi lokasi...";
  submitButton.disabled = true;

  if (rememberSettings) {
    saveSettings({
      proxyUrl: payload.proxyUrl,
      analysisMode: payload.analysisMode,
      businessType: payload.businessType,
      targetCustomer: payload.targetCustomer,
      extraNotes: payload.extraNotes,
      useProxy
    });
  } else {
    clearSettings();
  }

  try {
    const locationValidation = await fetchValidatedLocation({
      useProxy,
      proxyUrl: payload.proxyUrl,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    });
    resolvedLocation.textContent = `Validasi peta: ${locationValidation.display_name}`;

    promptPreview.textContent = JSON.stringify({
      analysis_anchor: "radius_3km",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      reverse_geocode: locationValidation.display_name,
      requested_backend: buildProxyAnalysisUrl(payload.proxyUrl)
    }, null, 2);

    const result = await requestBackendAnalysis({
      coordinates,
      payload,
      proxyUrl: payload.proxyUrl,
      useProxy
    });

    jsonOutput.textContent = JSON.stringify(result, null, 2);
    renderSummary(result);
    setStatus("success", "Analisis backend berhasil dibuat dan JSON tervalidasi.");
  } catch (error) {
    setStatus("error", humanizeError(error, useProxy, payload.proxyUrl));
    jsonOutput.textContent = String(error.stack || error.message || error);
  } finally {
    submitButton.disabled = false;
  }
}

async function requestBackendAnalysis({ coordinates, payload, proxyUrl, useProxy }) {
  if (!useProxy) {
    throw new Error("Mode tanpa backend lokal belum didukung untuk analisis radius 3 KM.");
  }

  const response = await fetch(buildProxyAnalysisUrl(proxyUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      businessType: payload.businessType,
      targetCustomer: payload.targetCustomer,
      analysisMode: payload.analysisMode,
      extraNotes: payload.extraNotes
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || "Analisis backend gagal.");
  }

  return data;
}

async function runThreeStageResearch({ payload, coordinates, locationValidation, useProxy, proxyUrl, baseUrl, apiKey, model }) {
  const stage1Prompt = buildStage1Prompt({
    ...payload,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    locationValidation
  });

  setStatus("loading", "Tahap 1/3: identifikasi lokasi dan pemetaan kecamatan terdekat.");
  promptPreview.textContent = stage1Prompt;
  jsonOutput.textContent = "Menjalankan Tahap 1...";

  const stage1 = await requestStageJson({
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    researchPrompt: stage1Prompt,
    fastResearchPrompt: buildStage1Prompt({
      ...payload,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      locationValidation,
      compactMode: true
    }),
    stageName: "Tahap 1"
  });

  const normalizedStage1 = normalizeStage1Result(stage1, locationValidation, coordinates);

  setStatus("loading", "Tahap 2/3: menyusun district analysis per kecamatan.");
  const stage2Prompt = buildStage2Prompt({
    ...payload,
    stage1Result: normalizedStage1
  });
  promptPreview.textContent = stage2Prompt;
  jsonOutput.textContent = JSON.stringify(normalizedStage1, null, 2);

  const stage2 = await requestStageJson({
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    researchPrompt: stage2Prompt,
    fastResearchPrompt: buildStage2Prompt({
      ...payload,
      stage1Result: normalizedStage1,
      compactMode: true
    }),
    stageName: "Tahap 2"
  });

  const normalizedStage2 = normalizeStage2Result(stage2, normalizedStage1);

  setStatus("loading", "Tahap 3/3: market estimation dan rekomendasi strategis.");
  const stage3Prompt = buildStage3Prompt({
    ...payload,
    stage1Result: normalizedStage1,
    stage2Result: normalizedStage2
  });
  promptPreview.textContent = stage3Prompt;
  jsonOutput.textContent = JSON.stringify(mergeResearchResults(normalizedStage1, normalizedStage2), null, 2);

  const stage3 = await requestStageJson({
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    researchPrompt: stage3Prompt,
    fastResearchPrompt: buildStage3Prompt({
      ...payload,
      stage1Result: normalizedStage1,
      stage2Result: normalizedStage2,
      compactMode: true
    }),
    stageName: "Tahap 3"
  });

  const merged = mergeResearchResults(
    mergeResearchResults(normalizedStage1, normalizedStage2),
    normalizeStage3Result(stage3)
  );

  merged.market_estimation = recalculateMarketEstimation(merged);
  merged.strategic_recommendation = enrichRecommendationWithDeterministicMarket(merged);

  const validation = validateResearchShape(merged);
  if (!validation.valid) {
    throw new Error(`Hasil 3 tahap masih belum lengkap: ${validation.issues.join(", ")}`);
  }

  return merged;
}

async function requestStageJson({ useProxy, proxyUrl, baseUrl, apiKey, model, researchPrompt, fastResearchPrompt, stageName }) {
  const response = await sendChatWithFallback({
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    researchPrompt,
    fastResearchPrompt
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || `${stageName} gagal.`);
  }

  return parseModelJson(data?.choices?.[0]?.message?.content);
}

async function fetchValidatedLocation({ useProxy, proxyUrl, latitude, longitude }) {
  if (!useProxy) {
    throw new Error("Validasi lokasi membutuhkan proxy lokal aktif agar geocoding konsisten.");
  }

  const response = await fetch(buildProxyReverseGeocodeUrl(proxyUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      latitude,
      longitude
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || "Gagal melakukan reverse geocoding.");
  }

  return data;
}

function buildProxyReverseGeocodeUrl(proxyUrl) {
  try {
    return new URL("/api/reverse-geocode", proxyUrl).toString();
  } catch {
    return "http://127.0.0.1:8787/api/reverse-geocode";
  }
}

function buildProxyAnalysisUrl(proxyUrl) {
  try {
    return new URL("/api/analysis", proxyUrl).toString();
  } catch {
    return "http://127.0.0.1:8787/api/analysis";
  }
}

async function sendChatCompletion({ useProxy, proxyUrl, baseUrl, apiKey, model, researchPrompt }) {
  const requestBody = {
    model,
    temperature: 0.2,
    max_tokens: 3200,
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content: [
          "Anda adalah AI Geo-Market Research Analyst senior untuk ekspansi cabang Bimba Smartkidz di Indonesia.",
          "Fokus pada insight bisnis yang tajam, data terbaru, perbandingan antar kecamatan, estimasi yang jujur bila data tidak lengkap, dan output WAJIB JSON valid.",
          "Jangan mengarang URL. Jika referensi tidak ada, gunakan null atau array kosong.",
          "Semua skor harus punya reasoning singkat dalam field yang relevan."
        ].join(" ")
      },
      {
        role: "user",
        content: researchPrompt
      }
    ]
  };

  if (useProxy) {
    return fetch(normalizeBaseUrl(proxyUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseUrl,
        apiKey,
        payload: requestBody
      })
    });
  }

  return fetch(normalizeBaseUrl(baseUrl) + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });
}

async function ensureCompleteResearchJson({ initialContent, useProxy, proxyUrl, baseUrl, apiKey, model, originalPrompt }) {
  const firstParsed = normalizeParsedResearch(parseModelJson(initialContent));
  const firstValidation = validateResearchShape(firstParsed);

  if (firstValidation.valid) {
    return firstParsed;
  }

  setStatus("loading", "Output AI belum lengkap. Saya sedang melengkapi bagian yang kosong secara bertahap.");

  const repaired = await repairIncompleteResearchJson({
    partialResult: firstParsed,
    issues: firstValidation.issues,
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    originalPrompt
  });

  const repairedValidation = validateResearchShape(repaired);

  if (!repairedValidation.valid) {
    throw new Error(`Output AI masih belum lengkap. Field wajib yang masih kurang: ${repairedValidation.issues.join(", ")}`);
  }

  return repaired;
}

async function repairIncompleteResearchJson({ partialResult, issues, useProxy, proxyUrl, baseUrl, apiKey, model, originalPrompt }) {
  let merged = deepClone(partialResult);

  if (issues.includes("district_analysis_nonempty")) {
    const districtAnalysis = await requestDistrictAnalysisBlock({
      partialResult: merged,
      useProxy,
      proxyUrl,
      baseUrl,
      apiKey,
      model,
      originalPrompt
    });
    merged.district_analysis = Array.isArray(districtAnalysis) ? districtAnalysis : [];
  }

  const postDistrictValidation = validateResearchShape(merged);
  if (postDistrictValidation.valid) {
    return merged;
  }

  const repairPrompt = buildRepairPrompt({
    originalPrompt,
    invalidOutput: stringifyForPrompt(merged),
    issues: postDistrictValidation.issues
  });

  promptPreview.textContent = repairPrompt;

  const repairResponse = await sendChatCompletion({
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    researchPrompt: repairPrompt
  });

  const repairData = await readJsonResponse(repairResponse);
  if (!repairResponse.ok) {
    throw new Error(repairData?.error?.message || "Permintaan perbaikan JSON ke LiteLLM gagal.");
  }

  const repaired = normalizeParsedResearch(parseModelJson(repairData?.choices?.[0]?.message?.content));
  return mergeResearchResults(merged, repaired);
}

async function requestDistrictAnalysisBlock({ partialResult, useProxy, proxyUrl, baseUrl, apiKey, model, originalPrompt }) {
  const nearbyDistricts = Array.isArray(partialResult?.nearby_districts) ? partialResult.nearby_districts : [];

  if (nearbyDistricts.length === 0) {
    return [];
  }

  const districtPrompt = buildDistrictAnalysisPrompt({
    originalPrompt,
    nearbyDistricts
  });

  promptPreview.textContent = districtPrompt;

  const response = await sendChatCompletion({
    useProxy,
    proxyUrl,
    baseUrl,
    apiKey,
    model,
    researchPrompt: districtPrompt
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data?.error?.message || "Permintaan district analysis ke LiteLLM gagal.");
  }

  const parsed = parseModelJson(data?.choices?.[0]?.message?.content);
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.district_analysis)) {
    return parsed.district_analysis;
  }

  return [];
}

async function sendChatWithFallback({ useProxy, proxyUrl, baseUrl, apiKey, model, researchPrompt, fastResearchPrompt }) {
  let primaryResponse;

  try {
    primaryResponse = await sendChatCompletion({
      useProxy,
      proxyUrl,
      baseUrl,
      apiKey,
      model,
      researchPrompt
    });

    if (!primaryResponse.ok) {
      const primaryData = await readJsonResponse(primaryResponse.clone());
      const primaryError = extractUpstreamError(primaryResponse.status, primaryData);
      if (!shouldRetryWithFastMode(primaryError)) {
        throw primaryError;
      }
    }

    return primaryResponse;
  } catch (error) {
    if (!shouldRetryWithFastMode(error)) {
      throw error;
    }

    setStatus("loading", "Server AI sedang lambat. Mencoba ulang dengan mode analisis yang lebih ringan.");
    promptPreview.textContent = fastResearchPrompt;

    return sendChatCompletion({
      useProxy,
      proxyUrl,
      baseUrl,
      apiKey,
      model,
      researchPrompt: fastResearchPrompt
    });
  }
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (looksLikeCloudflare524(text)) {
    throw new Error("Cloudflare 524: server LiteLLM timeout saat memproses request.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || "Server mengembalikan respons non-JSON.");
  }
}

function parseCoordinates(value) {
  const raw = String(value || "").trim();
  const parts = raw.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

  if (parts.length !== 2) {
    throw new Error("Format koordinat harus `latitude, longitude`, contoh `-6.174465, 106.822745`.");
  }

  let latitude = Number(parts[0]);
  let longitude = Number(parts[1]);
  let autoSwapped = false;

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new Error("Koordinat harus berupa angka valid.");
  }

  if (!isLikelyIndonesiaLatitude(latitude) && isLikelyIndonesiaLatitude(longitude) && isLikelyIndonesiaLongitude(latitude)) {
    [latitude, longitude] = [longitude, latitude];
    autoSwapped = true;
  }

  if (!isLikelyIndonesiaLatitude(latitude) || !isLikelyIndonesiaLongitude(longitude)) {
    throw new Error("Koordinat di luar rentang umum Indonesia. Gunakan urutan `latitude, longitude` dengan latitude sekitar -11 sampai 6 dan longitude sekitar 95 sampai 141.");
  }

  return {
    latitude,
    longitude,
    autoSwapped
  };
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function humanizeError(error, useProxy, proxyUrl) {
  const message = error?.message || String(error);

  if (message.includes("Failed to fetch")) {
    if (useProxy) {
      return `Gagal menghubungi backend lokal. Pastikan service berjalan di ${proxyUrl}.`;
    }

    return "Browser gagal menghubungi backend analisis secara langsung. Aktifkan backend lokal lalu coba lagi.";
  }

  if (message.includes("timed out")) {
    return "Backend timeout saat memanggil upstream service. Coba lagi atau cek koneksi ke provider data.";
  }

  return message || "Terjadi kesalahan saat menjalankan analisis.";
}

function shouldRetryWithFastMode(error) {
  const message = error?.message || String(error);
  return message.includes("Cloudflare 524") || message.includes("A timeout occurred") || message.includes("524");
}

function extractUpstreamError(status, data) {
  const message = data?.error?.message || `Permintaan ke LiteLLM gagal dengan status ${status}.`;
  return new Error(message);
}

function looksLikeCloudflare524(text) {
  const normalized = String(text || "").toLowerCase();
  return normalized.includes("error code 524") || normalized.includes("a timeout occurred");
}

function reconcileLocation(result, locationValidation, coordinates) {
  const validatedLocation = {
    full_address: locationValidation.display_name || null,
    village_or_suburb: locationValidation.address?.village || locationValidation.address?.suburb || locationValidation.address?.quarter || null,
    district: locationValidation.address?.city_district || locationValidation.address?.township || locationValidation.address?.subdistrict || null,
    city: locationValidation.address?.city || locationValidation.address?.county || locationValidation.address?.municipality || null,
    province: locationValidation.address?.state || null,
    country: locationValidation.address?.country || null,
    postal_code: locationValidation.address?.postcode || null,
    area_type: inferAreaTypeFromOsm(locationValidation),
    input_coordinate_validation: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      country_code: locationValidation.address?.country_code || null,
      source: "OpenStreetMap Nominatim",
      matched: true
    }
  };

  result.location = {
    ...result.location,
    ...validatedLocation
  };

  return result;
}

function parseModelJson(rawContent) {
  if (!rawContent) {
    throw new Error("Model tidak mengembalikan konten.");
  }

  if (typeof rawContent === "object") {
    return rawContent;
  }

  const cleaned = cleanModelOutput(rawContent);
  const candidates = buildJsonCandidates(cleaned);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  const preview = cleaned.slice(0, 600);
  throw new Error(`Output model bukan JSON valid. Preview respons: ${preview}`);
}

function normalizeParsedResearch(parsed) {
  if (Array.isArray(parsed)) {
    return {
      location: {},
      nearby_districts: parsed,
      district_analysis: [],
      market_estimation: {
        tam: 0,
        sam: 0,
        som: 0,
        market_size: 0,
        market_share: 0,
        potential_revenue: 0
      },
      strategic_recommendation: {
        top_3_districts: [],
        swot: {},
        positioning: {},
        customer_persona: {},
        strategy: {}
      },
      confidence_level: ""
    };
  }

  return parsed;
}

function normalizeStage1Result(parsed, locationValidation, coordinates) {
  const result = !parsed || Array.isArray(parsed) ? {} : parsed;

  return {
    location: {
      ...(result.location || {}),
      full_address: locationValidation.display_name || null,
      district: locationValidation.address?.city_district || locationValidation.address?.township || null,
      city: locationValidation.address?.city || locationValidation.address?.county || null,
      province: locationValidation.address?.state || null,
      country: locationValidation.address?.country || "Indonesia",
      area_type: result?.location?.area_type || inferAreaTypeFromOsm(locationValidation),
      input_coordinate_validation: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        source: "OpenStreetMap Nominatim",
        matched: true
      }
    },
    nearby_districts: Array.isArray(result.nearby_districts)
      ? result.nearby_districts
      : Array.isArray(parsed)
        ? parsed
        : [],
    district_analysis: [],
    market_estimation: {
      tam: 0,
      sam: 0,
      som: 0,
      market_size: 0,
      market_share: 0,
      potential_revenue: 0
    },
    strategic_recommendation: {
      top_3_districts: [],
      swot: {},
      positioning: {},
      customer_persona: {},
      strategy: {}
    },
    confidence_level: result.confidence_level || ""
  };
}

function normalizeStage2Result(parsed, stage1Result) {
  const districtAnalysis = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.district_analysis)
      ? parsed.district_analysis
      : [];

  return {
    ...stage1Result,
    district_analysis: districtAnalysis
  };
}

function normalizeStage3Result(parsed) {
  const result = !parsed || Array.isArray(parsed) ? {} : parsed;

  return {
    location: {},
    nearby_districts: [],
    district_analysis: [],
    market_estimation: {
      tam: result?.market_estimation?.tam ?? 0,
      sam: result?.market_estimation?.sam ?? 0,
      som: result?.market_estimation?.som ?? 0,
      market_size: result?.market_estimation?.market_size ?? 0,
      market_share: result?.market_estimation?.market_share ?? 0,
      potential_revenue: result?.market_estimation?.potential_revenue ?? 0,
      radius_demography: result?.market_estimation?.radius_demography || {
        radius_1km: {},
        radius_2km: {},
        radius_3km: {}
      },
      scenario_estimation: result?.market_estimation?.scenario_estimation || {
        conservative: {},
        moderate: {},
        aggressive: {}
      }
    },
    strategic_recommendation: {
      top_3_districts: result?.strategic_recommendation?.top_3_districts || [],
      swot: result?.strategic_recommendation?.swot || {},
      positioning: result?.strategic_recommendation?.positioning || {},
      customer_persona: result?.strategic_recommendation?.customer_persona || {},
      strategy: result?.strategic_recommendation?.strategy || {}
    },
    confidence_level: result?.confidence_level || ""
  };
}

function recalculateMarketEstimation(result) {
  const districts = Array.isArray(result?.district_analysis) ? result.district_analysis : [];
  const topDistricts = districts.length > 0 ? districts : [];
  const annualFeeLow = 500000 * 12;
  const annualFeeMid = 600000 * 12;
  const annualFeeHigh = 700000 * 12;

  const radiusPopulation = estimateRadiusPopulation(topDistricts);
  const radiusDemography = {
    radius_1km: buildRadiusDemography(radiusPopulation.radius_1km, 0.08, 0.10, "Radius kecil dekat titik, estimasi anak usia 2-7 memakai 8%-10% dari populasi."),
    radius_2km: buildRadiusDemography(radiusPopulation.radius_2km, 0.09, 0.10, "Radius utama operasional Smartkidz, estimasi anak usia 2-7 memakai 9%-10% dari populasi."),
    radius_3km: buildRadiusDemography(radiusPopulation.radius_3km, 0.10, 0.12, "Radius terluas, estimasi anak usia 2-7 memakai 10%-12% dari populasi jika tidak ada data usia langsung.")
  };

  const tamChildren = radiusDemography.radius_2km.early_childhood_estimate;
  const buyingPowerFactor = inferBuyingPowerFactor(topDistricts);
  const samChildren = Math.round(tamChildren * buyingPowerFactor);

  const conservative = buildScenario({
    label: "conservative",
    tamChildren,
    samChildren,
    somRate: 0.01,
    annualFee: annualFeeLow
  });
  const moderate = buildScenario({
    label: "moderate",
    tamChildren,
    samChildren,
    somRate: 0.02,
    annualFee: annualFeeMid
  });
  const aggressive = buildScenario({
    label: "aggressive",
    tamChildren,
    samChildren,
    somRate: 0.05,
    annualFee: annualFeeHigh
  });

  const chosen = moderate;

  return {
    tam: tamChildren,
    sam: samChildren,
    som: chosen.som_students,
    market_size: chosen.annual_revenue,
    market_share: chosen.market_share,
    potential_revenue: chosen.annual_revenue,
    radius_demography: radiusDemography,
    scenario_estimation: {
      conservative,
      moderate,
      aggressive
    },
    assumptions: [
      "Jumlah anak usia 2-7 tahun diestimasi dari 8%-12% populasi bila data usia langsung tidak tersedia.",
      "TAM menggunakan seluruh estimasi anak usia 2-7 tahun pada radius utama 2 km.",
      "SAM disesuaikan daya beli area, bukan seluruh TAM.",
      "SOM realistis untuk cabang baru dibatasi pada 1%-5% dari SAM.",
      "Omzet memakai SPP tahunan Rp6.000.000-Rp8.400.000 per siswa."
    ]
  };
}

function enrichRecommendationWithDeterministicMarket(result) {
  const recommendation = result?.strategic_recommendation || {};
  const strategy = recommendation.strategy || {};
  const market = result?.market_estimation || {};

  return {
    ...recommendation,
    strategy: {
      ...strategy,
      market_sizing_method: {
        formula: "Market Size = Jumlah Anak x Penetrasi x SPP Tahunan",
        tam_basis: "Seluruh anak usia 2-7 tahun",
        sam_basis: "Bagian TAM yang sesuai daya beli area",
        som_basis: "1%-5% dari SAM untuk target realistis cabang baru"
      },
      buying_power_analysis: strategy.buying_power_analysis || inferBuyingPowerNarrative(result?.district_analysis || []),
      key_risks: Array.isArray(strategy.key_risks) && strategy.key_risks.length > 0
        ? strategy.key_risks
        : ["demand rendah", "kompetitor kuat", "mismatch harga"],
      competitor_insight: normalizeCompetitorInsight(strategy.competitor_insight, result?.district_analysis || []),
      pricing_strategy: strategy.pricing_strategy || "Mulai dari positioning menengah dengan penawaran awal dekat batas bawah SPP bila daya beli area mixed atau middle-low.",
      area_character: strategy.area_character || inferAreaCharacter(result?.district_analysis || []),
      deterministic_summary: {
        tam_children: market.tam || 0,
        sam_children: market.sam || 0,
        som_students: market.som || 0,
        annual_revenue: market.potential_revenue || 0
      }
    }
  };
}

function validateResearchShape(result) {
  const issues = [];

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    issues.push("root_object");
    return { valid: false, issues };
  }

  const requiredRootKeys = [
    "location",
    "nearby_districts",
    "district_analysis",
    "market_estimation",
    "strategic_recommendation",
    "confidence_level"
  ];

  requiredRootKeys.forEach((key) => {
    if (!(key in result)) {
      issues.push(key);
    }
  });

  if (!Array.isArray(result.nearby_districts) || result.nearby_districts.length === 0) {
    issues.push("nearby_districts_nonempty");
  }

  if (!Array.isArray(result.district_analysis) || result.district_analysis.length === 0) {
    issues.push("district_analysis_nonempty");
  }

  if (!result.market_estimation || typeof result.market_estimation !== "object") {
    issues.push("market_estimation_object");
  } else {
    ["tam", "sam", "som", "market_size", "market_share", "potential_revenue"].forEach((key) => {
      if (!(key in result.market_estimation)) {
        issues.push(`market_estimation.${key}`);
      }
    });

    if (!result.market_estimation.radius_demography) {
      issues.push("market_estimation.radius_demography");
    }

    if (!result.market_estimation.scenario_estimation) {
      issues.push("market_estimation.scenario_estimation");
    }
  }

  if (!result.strategic_recommendation || typeof result.strategic_recommendation !== "object") {
    issues.push("strategic_recommendation_object");
  } else {
    ["top_3_districts", "swot", "positioning", "customer_persona", "strategy"].forEach((key) => {
      if (!(key in result.strategic_recommendation)) {
        issues.push(`strategic_recommendation.${key}`);
      }
    });
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function mergeResearchResults(baseResult, incomingResult) {
  return {
    ...baseResult,
    ...incomingResult,
    location: {
      ...(baseResult.location || {}),
      ...(incomingResult.location || {})
    },
    nearby_districts: mergeArrayPreference(baseResult.nearby_districts, incomingResult.nearby_districts),
    district_analysis: mergeArrayPreference(baseResult.district_analysis, incomingResult.district_analysis),
    market_estimation: {
      ...(baseResult.market_estimation || {}),
      ...(incomingResult.market_estimation || {})
    },
    strategic_recommendation: {
      ...(baseResult.strategic_recommendation || {}),
      ...(incomingResult.strategic_recommendation || {})
    }
  };
}

function mergeArrayPreference(primary, secondary) {
  if (Array.isArray(secondary) && secondary.length > 0) {
    return secondary;
  }

  if (Array.isArray(primary)) {
    return primary;
  }

  return [];
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRepairPrompt({ originalPrompt, invalidOutput, issues }) {
  return `
Anda sebelumnya mengembalikan output yang belum lengkap terhadap schema wajib.

MASALAH UTAMA:
- Field wajib yang kurang atau kosong: ${issues.join(", ")}
- Output sebelumnya:
${invalidOutput}

TUGAS:
- Perbaiki dan lengkapi output menjadi SATU JSON VALID lengkap sesuai schema wajib.
- Gunakan output sebelumnya sebagai petunjuk awal, tetapi lengkapi semua field yang hilang.
- Jangan kembalikan array saja.
- Jangan beri markdown, jangan beri penjelasan, jangan beri teks pembuka/penutup.
- Karakter pertama harus "{" dan karakter terakhir harus "}".

PROMPT ASLI:
${originalPrompt}
`.trim();
}

function buildSharedContextPrompt(payload) {
  return `
KONTEKS BISNIS:
- Brand: Bimba Smartkidz
- Jenis usaha: ${payload.businessType || "Pendidikan anak usia dini"}
- Program: Bimba & Preschool
- Target usia anak: 2-7 tahun
- Harga SPP: Rp500.000 - Rp700.000 per bulan
- Frekuensi: 12 kali pertemuan per bulan
- Target customer: ${payload.targetCustomer || "Orang tua anak usia dini"}

KOORDINAT TERVALIDASI:
- Latitude: ${formatCoordinate(payload.latitude)}
- Longitude: ${formatCoordinate(payload.longitude)}
- Full address: ${payload.locationValidation?.display_name || "Tidak tersedia"}
- District/kecamatan: ${payload.locationValidation?.address?.city_district || payload.locationValidation?.address?.township || "Tidak tersedia"}
- City/kota: ${payload.locationValidation?.address?.city || payload.locationValidation?.address?.county || "Tidak tersedia"}
- Province/provinsi: ${payload.locationValidation?.address?.state || "Tidak tersedia"}
- Country: ${payload.locationValidation?.address?.country || "Indonesia"}

ATURAN UMUM:
- Gunakan hasil reverse geocoding di atas sebagai ground truth.
- Jangan mengarang URL.
- Fokus pada insight bisnis area Indonesia.
- Kembalikan JSON valid tanpa markdown.
- Gunakan pendekatan market sizing yang konservatif dan realistis, bukan over-claim.
`.trim();
}

function buildStage1Prompt(payload) {
  const mode = payload.compactMode || payload.analysisMode === "fast" ? "fast" : "balanced";
  return `
${buildSharedContextPrompt(payload)}

TUGAS TAHAP 1:
- Identifikasi detail lokasi dari titik koordinat.
- Petakan seluruh kecamatan dalam radius 3 KM atau beririsan.
- Klasifikasikan Tier 1 dan Tier 2.
- Ranking berdasarkan kedekatan.

BATASAN:
- Tahap ini HANYA mengisi field "location" dan "nearby_districts".
- Jangan isi district_analysis, market_estimation, atau strategic_recommendation.
- Mode: ${mode}
- Jika mode fast aktif, cukup prioritaskan kecamatan paling relevan di sekitar titik.

OUTPUT WAJIB:
{
  "location": {},
  "nearby_districts": []
}
`.trim();
}

function buildStage2Prompt(payload) {
  const mode = payload.compactMode || payload.analysisMode === "fast" ? "fast" : "balanced";
  const nearby = payload.stage1Result?.nearby_districts || [];
  return `
${buildSharedContextPrompt({
  ...payload,
  latitude: payload.stage1Result?.location?.input_coordinate_validation?.latitude || payload.latitude,
  longitude: payload.stage1Result?.location?.input_coordinate_validation?.longitude || payload.longitude,
  locationValidation: {
    display_name: payload.stage1Result?.location?.full_address,
    address: {
      city_district: payload.stage1Result?.location?.district,
      city: payload.stage1Result?.location?.city,
      state: payload.stage1Result?.location?.province,
      country: payload.stage1Result?.location?.country
    }
  }
})}

DAFTAR KECAMATAN DASAR:
${JSON.stringify(nearby, null, 2)}

TUGAS TAHAP 2:
- Isi district_analysis untuk kecamatan pada daftar di atas.
- Untuk setiap item, isi: district_name, tier, distance_km, accessibility, demography, economy, market_needs, facilities, digital_footprint, promotion, score.
- Semua digital footprint wajib URL penuh jika ada.
- Pada bagian demography, usahakan isi field population, age_0_14, dan jika memungkinkan early_childhood_population untuk anak usia 2-7 tahun. Jika data langsung tidak ada, boleh estimasi konservatif dan jelaskan di reasoning.
- Pada bagian promotion atau news/community, prioritaskan referensi kegiatan anak, event keluarga, lomba anak, playground event, sekolah event, komunitas parenting, atau aktivitas anak lain yang memang terjadi di sekitar area tersebut, lengkap dengan link penuh.
- Pada bagian market_needs dan score, wajib jelaskan tingkat kompetisi realistis: Bimba/lembaga serupa, TK/PAUD, les privat. Jangan mengarang brand jika tidak yakin; lebih baik tulis level kompetisi rendah/sedang/tinggi dengan reasoning.
- Pada bagian economy, jelaskan tipe lingkungan dan estimasi kelas ekonomi area: perumahan/kampung/mixed serta low/middle/high bila memungkinkan.
- Jika mode fast aktif, fokus ke maksimal 3 kecamatan teratas.

OUTPUT WAJIB:
{
  "district_analysis": []
}
`.trim();
}

function buildStage3Prompt(payload) {
  const mode = payload.compactMode || payload.analysisMode === "fast" ? "fast" : "balanced";
  return `
${buildSharedContextPrompt({
  ...payload,
  latitude: payload.stage1Result?.location?.input_coordinate_validation?.latitude || payload.latitude,
  longitude: payload.stage1Result?.location?.input_coordinate_validation?.longitude || payload.longitude,
  locationValidation: {
    display_name: payload.stage1Result?.location?.full_address,
    address: {
      city_district: payload.stage1Result?.location?.district,
      city: payload.stage1Result?.location?.city,
      state: payload.stage1Result?.location?.province,
      country: payload.stage1Result?.location?.country
    }
  }
})}

INPUT HASIL TAHAP 1:
${stringifyForPrompt({
  location: payload.stage1Result?.location,
  nearby_districts: payload.stage1Result?.nearby_districts
})}

INPUT HASIL TAHAP 2:
${stringifyForPrompt({
  district_analysis: payload.stage2Result?.district_analysis
})}

TUGAS TAHAP 3:
- Hitung market_estimation: tam, sam, som, market_size, market_share, potential_revenue.
- Susun strategic_recommendation: top_3_districts, swot, positioning, customer_persona, strategy.
- Isi confidence_level.
- Mode: ${mode}
- Jika mode fast aktif, ringkas tetapi tetap isi semua field wajib.
- WAJIB gunakan asumsi realistis berikut untuk pendidikan anak usia dini:
  1. jumlah anak usia 2-7 tahun dihitung dari data langsung jika ada
  2. jika tidak ada, estimasi dari 8%-12% total penduduk
  3. jelaskan asumsi yang digunakan, jangan asal angka
  4. TAM = seluruh anak usia 2-7 tahun
  5. SAM = bagian TAM yang sesuai daya beli area
  6. SOM = market realistis yang bisa didapat dalam kisaran 1%-5%
  7. Market Size = Jumlah Anak x Penetrasi x SPP Tahunan
- Di strategy atau field relevan, sertakan reasoning singkat bahwa market sizing memakai pendekatan realistis dan konservatif untuk cabang baru.
- Wajib hitung radius demography untuk 1 km, 2 km, dan 3 km:
  population_estimate, early_childhood_estimate, assumptions
- Wajib buat 3 skenario market size:
  conservative, moderate, aggressive
- Setiap skenario harus memuat:
  tam_children, sam_children, som_students, penetration_rate, annual_fee_assumption, monthly_revenue, annual_revenue, market_share
- Gunakan rumus:
  Market Size = Jumlah Anak x Penetrasi x SPP Tahunan
- SAM harus disesuaikan daya beli area, SOM harus realistis di kisaran 1%-5%.
- Strategy wajib memuat minimal:
  competitor_insight, pricing_strategy, promotion_strategy, collaboration_strategy, area_character, buying_power_analysis, key_risks
- Sebutkan minimal 3 risiko nyata: demand rendah, kompetitor kuat, mismatch harga, atau risiko lain yang relevan.

OUTPUT WAJIB:
{
  "market_estimation": {
    "tam": 0,
    "sam": 0,
    "som": 0,
    "market_size": 0,
    "market_share": 0,
    "potential_revenue": 0,
    "radius_demography": {
      "radius_1km": {},
      "radius_2km": {},
      "radius_3km": {}
    },
    "scenario_estimation": {
      "conservative": {},
      "moderate": {},
      "aggressive": {}
    }
  },
  "strategic_recommendation": {
    "top_3_districts": [],
    "swot": {},
    "positioning": {},
    "customer_persona": {},
    "strategy": {}
  },
  "confidence_level": ""
}
`.trim();
}

function buildDistrictAnalysisPrompt({ originalPrompt, nearbyDistricts }) {
  return `
Anda sedang melanjutkan riset yang sama, tetapi sekarang fokus HANYA pada field "district_analysis".

TUGAS:
- Gunakan daftar kecamatan berikut sebagai dasar:
${JSON.stringify(nearbyDistricts, null, 2)}
- Buat field "district_analysis" lengkap untuk setiap kecamatan di atas.
- Untuk setiap item, isi:
  district_name, tier, distance_km, accessibility, demography, economy, market_needs, facilities, digital_footprint, promotion, score
- Semua insight digital wajib URL penuh jika ada, jika tidak ada gunakan array kosong atau null.
- Kembalikan HANYA salah satu dari dua format ini:
  1. array JSON berisi item district_analysis
  2. object JSON dengan root { "district_analysis": [...] }
- Jangan sertakan field lain.
- Jangan gunakan markdown.

PROMPT ASLI:
${originalPrompt}
`.trim();
}

function stringifyForPrompt(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function cleanModelOutput(rawContent) {
  return String(rawContent)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^\uFEFF/, "");
}

function buildJsonCandidates(text) {
  const candidates = [];
  const trimmed = text.trim();

  if (trimmed) {
    candidates.push(trimmed);
  }

  const objectSlice = extractBalancedJsonSlice(trimmed, "{", "}");
  if (objectSlice) {
    candidates.push(objectSlice);
  }

  const arraySlice = extractBalancedJsonSlice(trimmed, "[", "]");
  if (arraySlice) {
    candidates.push(arraySlice);
  }

  return [...new Set(candidates)];
}

function extractBalancedJsonSlice(text, openChar, closeChar) {
  const start = text.indexOf(openChar);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function renderSummary(result) {
  const decision = result?.decision?.recommendation || "-";
  const confidence = result?.data_quality?.overall_confidence || "-";
  const revenue = formatCurrency(result?.market_estimation?.potential_revenue);
  const marketAreaName = resolveMarketAreaName(result);

  summaryCards[0].textContent = decision;
  summaryCards[1].textContent = confidence;
  summaryCards[2].textContent = revenue;

  topDistricts.innerHTML = "";
  const districts = Array.isArray(result?.district_analysis) ? result.district_analysis : [];
  if (districts.length === 0) {
    const item = document.createElement("li");
    item.textContent = marketAreaName
      ? `${marketAreaName} (market area terdekat)`
      : "Tidak ada district analysis pada hasil.";
    topDistricts.appendChild(item);
  } else {
    districts.slice(0, 3).forEach((entry) => {
      const item = document.createElement("li");
      const score = entry?.score ?? "-";
      const density = entry?.market_needs?.competitor_density ?? "-";
      const districtName = entry?.district_name || marketAreaName || "Area sekitar";
      item.textContent = `${districtName} (score: ${score}, competitor: ${density})`;
      topDistricts.appendChild(item);
    });
  }

  opportunitySnapshot.innerHTML = buildNarrativeHtml(result);
}

function stringifyValue(value) {
  if (value == null) return "Belum tersedia.";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function buildNarrativeHtml(result) {
  const location = result?.location || {};
  const market = result?.market_estimation || {};
  const decision = result?.decision || {};
  const topEntry = result?.district_analysis?.[0] || {};
  const marketAreaName = resolveMarketAreaName(result);
  const topDistrictName = topEntry?.district_name || marketAreaName || "area prioritas";
  const competitorMap = result?.competitor_map || {};
  const unitEconomics = result?.unit_economics || {};
  const dataQuality = result?.data_quality || {};
  const webEvidence = Array.isArray(result?.web_evidence) ? result.web_evidence : [];
  const demographyReport = result?.demography_report || topEntry?.demography?.report || null;
  const demographyText = result?.demography_text || topEntry?.demography?.formatted_text || null;
  const marketSizeFormula = market?.market_size_formula || {};
  const marketAreaBasis = market?.area_basis === "kecamatan"
    ? `Total anak usia 2-7 tahun pada kecamatan ${market?.area_name || topDistrictName}`
    : `Total anak usia 2-7 tahun dalam radius ${result?.radius_km ?? 3} KM`;

  const locationText = [
    location?.reverse_geocode?.district,
    location?.reverse_geocode?.city,
    location?.reverse_geocode?.province
  ].filter(Boolean).join(", ");
  const evidenceCount = webEvidence.reduce((sum, item) => sum + ((item?.results || []).length), 0);
  const ageDetails = buildAgeDetails(topEntry?.demography);
  const marketShareScenarios = buildMarketShareScenarios(market, unitEconomics?.branch_capacity_band);
  const capacityBandText = unitEconomics?.branch_capacity_band
    ? `${formatNumber(unitEconomics.branch_capacity_band.ideal_min)}-${formatNumber(unitEconomics.branch_capacity_band.max)} siswa`
    : "200-300 siswa";

  return `
    <div class="narrative-block">
      <h4>Ringkasan Lokasi</h4>
      <p>${escapeHtml(`Lokasi yang dianalisis berada di ${locationText || "wilayah target"} dengan anchor radius 3 KM. Market area terdekat saat ini adalah ${topDistrictName} dan keputusan backend membaca area ini sebagai ${decision.recommendation || "CONSIDER"}.`)}</p>
      <p>${escapeHtml(`Dari sisi kompetisi, backend menemukan ${formatNumber(competitorMap?.count_estimate)} kompetitor tervalidasi di radius 3 KM dengan density ${competitorMap?.density_level || "-"}. Nearest competitor berada sekitar ${competitorMap?.nearest_distance_km != null ? `${competitorMap.nearest_distance_km} km` : "-"}.`)}</p>
      <p>${escapeHtml(`Kapasitas operasional cabang dibaca pada band ${capacityBandText}. Karena itu target siswa dan simulasi penetrasi di bawah ini tidak boleh dibaca melampaui kapasitas maksimum cabang.`)}</p>
      <p>${escapeHtml(result?.recommendation_summary || decision?.reason || "Belum ada ringkasan rekomendasi.")}</p>
    </div>

    <div class="narrative-block">
      <h4>Snapshot JSON</h4>
      <table class="narrative-table">
        <tbody>
          <tr><th>Market Area</th><td>${escapeHtml(topDistrictName)}</td></tr>
          <tr><th>Radius</th><td>${escapeHtml(String(result?.radius_km ?? 3))} KM</td></tr>
          <tr><th>Decision</th><td>${escapeHtml(decision?.recommendation || "-")} (score: ${escapeHtml(formatNumber(decision?.score))})</td></tr>
          <tr><th>Total POI</th><td>${escapeHtml(formatNumber(result?.poi_summary?.total_pois))}</td></tr>
          <tr><th>Competitor Count</th><td>${escapeHtml(formatNumber(competitorMap?.count_estimate))}</td></tr>
          <tr><th>Competitor Density</th><td>${escapeHtml(competitorMap?.density_level || "-")}</td></tr>
          <tr><th>Nearest Competitor</th><td>${escapeHtml(competitorMap?.nearest_distance_km != null ? `${competitorMap.nearest_distance_km} km` : "-")}</td></tr>
          <tr><th>Evidence Links</th><td>${escapeHtml(formatNumber(evidenceCount))}</td></tr>
          <tr><th>Overall Confidence</th><td>${escapeHtml(dataQuality?.overall_confidence || "-")}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="narrative-block">
      <h4>Tabel TAM SAM SOM</h4>
      <table class="narrative-table">
        <thead>
          <tr><th>Metric</th><th>Value</th><th>Basis</th></tr>
        </thead>
        <tbody>
          <tr><td>TAM</td><td>${escapeHtml(formatNumber(market?.tam))}</td><td>${escapeHtml(marketAreaBasis)}</td></tr>
          <tr><td>SAM</td><td>${escapeHtml(formatNumber(market?.sam))}</td><td>Bagian TAM yang diasumsikan sesuai daya beli</td></tr>
          <tr><td>SOM</td><td>${escapeHtml(formatNumber(market?.som))}</td><td>Target realistis cabang baru</td></tr>
        </tbody>
      </table>
      <p>${escapeHtml(market?.reasoning || "Belum ada reasoning market estimation.")}</p>
    </div>

    <div class="narrative-block">
      <h4>Tabel Market Size</h4>
      <table class="narrative-table">
        <thead>
          <tr><th>Komponen</th><th>Value</th><th>Keterangan</th></tr>
        </thead>
        <tbody>
          <tr><td>Jumlah POI Kompetitor</td><td>${escapeHtml(formatNumber(marketSizeFormula?.competitor_poi_count))}</td><td>Total POI kompetitor dalam radius ${escapeHtml(String(result?.radius_km ?? 3))} KM</td></tr>
          <tr><td>Maksimum Capacity</td><td>${escapeHtml(formatNumber(marketSizeFormula?.max_capacity_per_poi))}</td><td>Estimasi kapasitas maksimum per kompetitor</td></tr>
          <tr><td>SPP per Bulan</td><td>${escapeHtml(formatCurrency(marketSizeFormula?.spp_monthly))}</td><td>${escapeHtml(`Estimasi SPP bulanan untuk area ${marketSizeFormula?.spp_area_label || "-"}`)}</td></tr>
          <tr><td>Periode</td><td>${escapeHtml(formatNumber(marketSizeFormula?.annual_multiplier))}</td><td>Bulan per tahun</td></tr>
          <tr><td>Market Size</td><td>${escapeHtml(formatCurrency(marketSizeFormula?.computed_market_size ?? market?.market_size))}</td><td>Jumlah POI kompetitor x maksimum capacity x SPP perbulan x 12</td></tr>
        </tbody>
      </table>
    </div>

    <div class="narrative-block">
      <h4>Simulasi Market Share</h4>
      <table class="narrative-table">
        <thead>
          <tr><th>Scenario</th><th>Penetration</th><th>Students</th><th>Annual Revenue</th><th>Share Basis</th></tr>
        </thead>
        <tbody>
          ${marketShareScenarios.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${escapeHtml(row.penetration)}</td>
              <td>${escapeHtml(formatNumber(row.students))}</td>
              <td>${escapeHtml(formatCurrency(row.annualRevenue))}</td>
              <td>${escapeHtml(row.shareText)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="narrative-block">
      <h4>Detail Usia</h4>
      <ul class="narrative-list">
        ${ageDetails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>

    <div class="narrative-block">
      <h4>Demografi Lengkap</h4>
      ${demographyReport
        ? buildDemographyTablesHtml(demographyReport)
        : demographyText
        ? `<pre class="narrative-pre">${escapeHtml(demographyText)}</pre>`
        : "<p>Demografi lengkap belum tersedia pada hasil backend.</p>"}
    </div>

    <div class="narrative-block">
      <h4>Market, Unit Economics, dan Data Quality</h4>
      <p>${escapeHtml(`Supply-based market membaca total kapasitas ${formatNumber(market?.supply_based?.total_capacity)} dengan active market ${formatNumber(market?.supply_based?.active_market)}. Potensi revenue tahunan saat ini ${formatCurrency(market?.potential_revenue)} dan market gap ${formatNumber(market?.market_gap)}.`)}</p>
      <p>${escapeHtml(`Unit economics membaca target siswa ${unitEconomics?.target_students != null ? formatNumber(unitEconomics.target_students) : "-"} dengan band kapasitas cabang ${capacityBandText}.`)}</p>
      <p>${escapeHtml(`Kualitas data saat ini: populasi ${dataQuality?.population_data || "-"}, kompetitor ${dataQuality?.competitor_data || "-"}, digital footprint ${dataQuality?.digital_footprint_data || "-"}, overall confidence ${dataQuality?.overall_confidence || "-"}. Link bukti yang berhasil dikumpulkan saat ini mencakup ${formatNumber(evidenceCount)} hasil lintas demografi, daya beli, dan aktivitas keluarga.`)}</p>
    </div>

    <div class="narrative-block">
      <h4>Link Bukti</h4>
      ${buildEvidenceHtml(webEvidence)}
    </div>
  `;
}

function buildAgeDetails(demography) {
  if (!demography || typeof demography !== "object") {
    return ["Detail usia belum tersedia."];
  }

  return [
    `Total population: ${formatNumber(demography.population)}`,
    `Usia 0-14: ${formatNumber(demography.age_0_14)}`,
    `Usia 2-7 / early childhood: ${formatNumber(demography.early_childhood_population)}`,
    `Estimated: ${demography.estimated ? "true" : "false"}`,
    `Reasoning: ${demography.reasoning || "-"}`,
    `Assumption source: ${demography.assumption_source || "-"}`
  ];
}

function buildMarketShareScenarios(market, branchCapacityBand) {
  const sam = toNumber(market?.sam);
  const maxCapacity = toNumber(branchCapacityBand?.max);
  const backendScenarios = market?.market_size_scenarios;
  const scenarioConfig = [
    { key: "low", label: "Low", fallbackRate: 0.01, fallbackAnnualFee: 500000 * 12 },
    { key: "mid", label: "Mid", fallbackRate: 0.02, fallbackAnnualFee: 600000 * 12 },
    { key: "high", label: "High", fallbackRate: 0.05, fallbackAnnualFee: 700000 * 12 }
  ];

  return scenarioConfig.map((scenario) => {
    const backend = backendScenarios?.[scenario.key] || {};
    const rate = toNumber(backend.penetration_rate) ?? scenario.fallbackRate;
    const rawStudents = sam != null ? Math.round(sam * rate) : null;
    const students = toNumber(backend.students) ?? (rawStudents != null && maxCapacity != null ? Math.min(rawStudents, maxCapacity) : rawStudents);
    const annualRevenue = toNumber(backend.annual_revenue) ?? (students != null ? students * scenario.fallbackAnnualFee : null);
    return {
      label: scenario.label,
      penetration: `${Math.round(rate * 100)}%`,
      students,
      annualRevenue,
      shareText: sam != null
        ? rawStudents != null && maxCapacity != null && rawStudents > maxCapacity
          ? `${Math.round(rate * 100)}% dari SAM, capped ke ${formatNumber(maxCapacity)} siswa`
          : `${Math.round(rate * 100)}% dari SAM`
        : "-"
    };
  });
}

function buildEvidenceHtml(webEvidence) {
  if (!Array.isArray(webEvidence) || webEvidence.length === 0) {
    return "<p>Tidak ada link bukti yang berhasil dikumpulkan.</p>";
  }

  return webEvidence.map((topicGroup) => `
    <div class="evidence-group">
      <p><strong>${escapeHtml(toTitleCase(topicGroup.topic || "evidence"))}</strong> - engine: ${escapeHtml(topicGroup.engine_used || "-")}</p>
      <p>Google query: <a href="${escapeHtml(topicGroup.google_search_url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(topicGroup.query || "-")}</a></p>
      <ul class="narrative-list">
        ${(topicGroup.results || []).map((entry) => `
          <li><a href="${escapeHtml(entry.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(entry.title || entry.url || "-")}</a>${entry.snippet ? ` - ${escapeHtml(entry.snippet)}` : ""}</li>
        `).join("") || "<li>Tidak ada result link.</li>"}
      </ul>
    </div>
  `).join("");
}

function resolveMarketAreaName(result) {
  return result?.market_estimation?.area_name
    || result?.demography_report?.wilayah?.kecamatan
    || result?.district_analysis?.[0]?.district_name
    || result?.district_analysis?.[0]?.demography?.area_name
    || result?.location?.reverse_geocode?.district
    || result?.location?.reverse_geocode?.city
    || null;
}

function buildDemographyTablesHtml(report) {
  if (!report || typeof report !== "object") {
    return "<p>Demografi lengkap belum tersedia pada hasil backend.</p>";
  }

  const sections = [
    {
      title: "Wilayah dan Ringkasan",
      rows: [
        ["Provinsi", report?.wilayah?.provinsi],
        ["Kabupaten/Kota", report?.wilayah?.kabupaten_kota],
        ["Kecamatan", report?.wilayah?.kecamatan],
        ["Jumlah Kelurahan", report?.ringkasan?.jumlah_kelurahan],
        ["Jumlah Desa", report?.ringkasan?.jumlah_desa],
        ["Jumlah Penduduk", report?.ringkasan?.jumlah_penduduk],
        ["Kepala Keluarga", report?.ringkasan?.kepala_keluarga],
        ["Perpindahan Penduduk", report?.ringkasan?.perpindahan_penduduk],
        ["Jumlah Meninggal", report?.ringkasan?.jumlah_meninggal],
        ["Perubahan Data", report?.ringkasan?.perubahan_data],
        ["Jumlah Wajib KTP", report?.ringkasan?.jumlah_wajib_ktp],
        ["Jumlah Rekam Wajib KTP", report?.ringkasan?.jumlah_rekam_wajib_ktp]
      ]
    },
    {
      title: "Agama",
      rows: [
        ["Islam", report?.agama?.islam],
        ["Kristen", report?.agama?.kristen],
        ["Katholik", report?.agama?.katholik],
        ["Hindu", report?.agama?.hindu],
        ["Buddha", report?.agama?.buddha],
        ["Konghucu", report?.agama?.konghucu],
        ["Kepercayaan terhadap Tuhan YME", report?.agama?.kepercayaan_terhadap_tuhan_yme]
      ]
    },
    {
      title: "Penduduk",
      rows: [
        ["Laki-laki", report?.penduduk?.laki_laki],
        ["Perempuan", report?.penduduk?.perempuan]
      ]
    },
    {
      title: "Status Perkawinan",
      rows: [
        ["Belum Kawin", report?.status_perkawinan?.belum_kawin],
        ["Kawin", report?.status_perkawinan?.kawin],
        ["Cerai Hidup", report?.status_perkawinan?.cerai_hidup],
        ["Cerai Mati", report?.status_perkawinan?.cerai_mati]
      ]
    },
    {
      title: "Kelompok Usia",
      rows: [
        ["Usia 0-4 Tahun", report?.kelompok_usia?.usia_0_4_tahun],
        ["Usia 5-9 Tahun", report?.kelompok_usia?.usia_5_9_tahun],
        ["Usia 10-14 Tahun", report?.kelompok_usia?.usia_10_14_tahun],
        ["Usia 15-19 Tahun", report?.kelompok_usia?.usia_15_19_tahun],
        ["Usia 20-24 Tahun", report?.kelompok_usia?.usia_20_24_tahun],
        ["Usia 25-29 Tahun", report?.kelompok_usia?.usia_25_29_tahun],
        ["Usia 30-34 Tahun", report?.kelompok_usia?.usia_30_34_tahun],
        ["Usia 35-39 Tahun", report?.kelompok_usia?.usia_35_39_tahun],
        ["Usia 40-44 Tahun", report?.kelompok_usia?.usia_40_44_tahun],
        ["Usia 45-49 Tahun", report?.kelompok_usia?.usia_45_49_tahun],
        ["Usia 50-54 Tahun", report?.kelompok_usia?.usia_50_54_tahun],
        ["Usia 55-59 Tahun", report?.kelompok_usia?.usia_55_59_tahun],
        ["Usia 60-64 Tahun", report?.kelompok_usia?.usia_60_64_tahun],
        ["Usia 65-69 Tahun", report?.kelompok_usia?.usia_65_69_tahun],
        ["Usia 70-74 Tahun", report?.kelompok_usia?.usia_70_74_tahun],
        ["Usia 75 Tahun ke Atas", report?.kelompok_usia?.usia_75_tahun_ke_atas]
      ]
    },
    {
      title: "Pertumbuhan Penduduk",
      rows: [
        ["Lahir Tahun 2020", report?.pertumbuhan_penduduk?.lahir_tahun_2020],
        ["Lahir Sebelum Tahun 2020", report?.pertumbuhan_penduduk?.lahir_sebelum_tahun_2020],
        ["Lahir Tahun 2021", report?.pertumbuhan_penduduk?.lahir_tahun_2021],
        ["Lahir Sebelum Tahun 2021", report?.pertumbuhan_penduduk?.lahir_sebelum_tahun_2021],
        ["Lahir Tahun 2022", report?.pertumbuhan_penduduk?.lahir_tahun_2022],
        ["Lahir Sebelum Tahun 2022", report?.pertumbuhan_penduduk?.lahir_sebelum_tahun_2022],
        ["Lahir Tahun 2023", report?.pertumbuhan_penduduk?.lahir_tahun_2023],
        ["Lahir Sebelum Tahun 2023", report?.pertumbuhan_penduduk?.lahir_sebelum_tahun_2023],
        ["Lahir Tahun 2024", report?.pertumbuhan_penduduk?.lahir_tahun_2024],
        ["Lahir Sebelum Tahun 2024", report?.pertumbuhan_penduduk?.lahir_sebelum_tahun_2024],
        ["Pertumbuhan Penduduk Tahun 2020", formatPercent(report?.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2020_persen)],
        ["Pertumbuhan Penduduk Tahun 2021", formatPercent(report?.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2021_persen)],
        ["Pertumbuhan Penduduk Tahun 2022", formatPercent(report?.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2022_persen)],
        ["Pertumbuhan Penduduk Tahun 2023", formatPercent(report?.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2023_persen)],
        ["Pertumbuhan Penduduk Tahun 2024", formatPercent(report?.pertumbuhan_penduduk?.pertumbuhan_penduduk_tahun_2024_persen)]
      ]
    },
    {
      title: "Pendidikan",
      rows: [
        ["Tidak/Belum Sekolah", report?.pendidikan?.tidak_belum_sekolah],
        ["Belum Tamat SD", report?.pendidikan?.belum_tamat_sd],
        ["Tamat SD", report?.pendidikan?.tamat_sd],
        ["SLTP", report?.pendidikan?.sltp],
        ["SLTA", report?.pendidikan?.slta],
        ["D1 dan D2", report?.pendidikan?.d1_dan_d2],
        ["D3", report?.pendidikan?.d3],
        ["S1", report?.pendidikan?.s1],
        ["S2", report?.pendidikan?.s2],
        ["S3", report?.pendidikan?.s3]
      ]
    },
    {
      title: "Golongan Darah",
      rows: [
        ["Golongan Darah A", report?.golongan_darah?.golongan_darah_a],
        ["Golongan Darah B", report?.golongan_darah?.golongan_darah_b],
        ["Golongan Darah AB", report?.golongan_darah?.golongan_darah_ab],
        ["Golongan Darah O", report?.golongan_darah?.golongan_darah_o],
        ["Golongan Darah A+", report?.golongan_darah?.golongan_darah_a_positif],
        ["Golongan Darah A-", report?.golongan_darah?.golongan_darah_a_negatif],
        ["Golongan Darah B+", report?.golongan_darah?.golongan_darah_b_positif],
        ["Golongan Darah B-", report?.golongan_darah?.golongan_darah_b_negatif],
        ["Golongan Darah AB+", report?.golongan_darah?.golongan_darah_ab_positif],
        ["Golongan Darah AB-", report?.golongan_darah?.golongan_darah_ab_negatif],
        ["Golongan Darah O+", report?.golongan_darah?.golongan_darah_o_positif],
        ["Golongan Darah O-", report?.golongan_darah?.golongan_darah_o_negatif],
        ["Golongan Darah Tidak Diketahui", report?.golongan_darah?.golongan_darah_tidak_diketahui]
      ]
    },
    {
      title: "Pekerjaan",
      rows: [
        ["Belum/Tidak Bekerja", report?.pekerjaan?.belum_tidak_bekerja],
        ["Nelayan", report?.pekerjaan?.nelayan],
        ["Pelajar dan Mahasiswa", report?.pekerjaan?.pelajar_dan_mahasiswa],
        ["Pensiunan", report?.pekerjaan?.pensiunan],
        ["Perdagangan", report?.pekerjaan?.perdagangan],
        ["Mengurus Rumah Tangga", report?.pekerjaan?.mengurus_rumah_tangga],
        ["Wiraswasta", report?.pekerjaan?.wiraswasta],
        ["Guru", report?.pekerjaan?.guru],
        ["Perawat", report?.pekerjaan?.perawat],
        ["Pengacara", report?.pekerjaan?.pengacara],
        ["Pekerjaan Lainnya", report?.pekerjaan?.pekerjaan_lainnya]
      ]
    }
  ];

  return sections.map((section) => `
    <div class="demography-section">
      <h5>${escapeHtml(section.title)}</h5>
      <table class="narrative-table">
        <thead>
          <tr><th>Field</th><th>Value</th></tr>
        </thead>
        <tbody>
          ${section.rows.map(([label, value]) => `
            <tr>
              <td>${escapeHtml(label)}</td>
              <td>${escapeHtml(formatDemographyValue(value))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("");
}

function formatDemographyValue(value) {
  if (value == null || value === "") return "-";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstMeaningful(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value[0];
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === "object" && Object.keys(value).length > 0) {
      return Object.values(value)[0];
    }
  }

  return "belum ada detail yang cukup kuat";
}

function summarizeChildPopulation(districtAnalysis) {
  let total = 0;
  let found = false;

  districtAnalysis.forEach((district) => {
    const demography = district?.demography || {};
    const direct = toNumber(demography?.early_childhood_population);
    const age0to14 = toNumber(demography?.age_0_14) ?? toNumber(demography?.["0_14"]) ?? toNumber(demography?.["0-14"]);
    const population = toNumber(demography?.population);

    if (direct != null) {
      total += direct;
      found = true;
      return;
    }

    if (age0to14 != null) {
      total += Math.round(age0to14 * 0.4);
      found = true;
      return;
    }

    if (population != null) {
      total += Math.round(population * 0.1);
      found = true;
    }
  });

  return {
    totalEarlyChildhood: found ? total : null,
    totalEarlyChildhoodText: found ? `${formatNumber(total)} anak` : "belum terukur jelas"
  };
}

function estimateRadiusPopulation(districtAnalysis) {
  const totalPopulation = districtAnalysis.reduce((sum, district) => {
    const population = toNumber(district?.demography?.population);
    return sum + (population || 0);
  }, 0);

  if (totalPopulation > 0) {
    return {
      radius_1km: Math.round(totalPopulation * 0.18),
      radius_2km: Math.round(totalPopulation * 0.45),
      radius_3km: Math.round(totalPopulation * 0.72)
    };
  }

  return {
    radius_1km: 8000,
    radius_2km: 18000,
    radius_3km: 30000
  };
}

function buildRadiusDemography(populationEstimate, lowChildRate, highChildRate, assumptions) {
  const midpointRate = (lowChildRate + highChildRate) / 2;
  return {
    population_estimate: populationEstimate,
    child_percentage_range: `${Math.round(lowChildRate * 100)}%-${Math.round(highChildRate * 100)}%`,
    early_childhood_estimate: Math.round(populationEstimate * midpointRate),
    assumptions
  };
}

function inferBuyingPowerFactor(districtAnalysis) {
  const narrative = inferAreaCharacter(districtAnalysis).toLowerCase();
  if (narrative.includes("high")) return 0.7;
  if (narrative.includes("middle")) return 0.5;
  if (narrative.includes("mixed")) return 0.4;
  return 0.3;
}

function inferBuyingPowerNarrative(districtAnalysis) {
  const area = inferAreaCharacter(districtAnalysis);
  const factor = inferBuyingPowerFactor(districtAnalysis);
  return `Area cenderung ${area}, sehingga SAM dibatasi sekitar ${Math.round(factor * 100)}% dari TAM agar tetap realistis terhadap kemampuan bayar keluarga target.`;
}

function inferAreaCharacter(districtAnalysis) {
  const values = districtAnalysis
    .map((district) => [
      district?.economy?.economic_class,
      district?.economy?.kelas_ekonomi,
      district?.facilities?.area_perumahan,
      district?.market_needs?.demand_utama
    ].filter(Boolean).join(" ").toLowerCase())
    .join(" ");

  if (values.includes("high")) return "high";
  if (values.includes("middle")) return "middle";
  if (values.includes("mixed")) return "mixed";
  if (values.includes("perumahan")) return "mixed";
  return "middle-low";
}

function buildScenario({ label, tamChildren, samChildren, somRate, annualFee }) {
  const somStudents = Math.round(samChildren * somRate);
  const monthlyRevenue = Math.round((somStudents * annualFee) / 12);
  const annualRevenue = somStudents * annualFee;

  return {
    scenario: label,
    tam_children: tamChildren,
    sam_children: samChildren,
    som_students: somStudents,
    penetration_rate: `${Math.round(somRate * 100)}%`,
    annual_fee_assumption: annualFee,
    monthly_revenue: monthlyRevenue,
    annual_revenue: annualRevenue,
    market_share: tamChildren > 0 ? Number(((somStudents / tamChildren) * 100).toFixed(2)) : 0
  };
}

function normalizeCompetitorInsight(existingInsight, districtAnalysis) {
  if (existingInsight && typeof existingInsight === "object") {
    return {
      competition_level: existingInsight.competition_level || inferCompetitionLevel(districtAnalysis),
      competitor_types: existingInsight.competitor_types || ["Bimba/lembaga serupa", "TK/PAUD", "les privat"],
      notes: existingInsight.notes || "Nama brand tidak dipaksakan jika tidak tervalidasi; fokus pada tingkat kompetisi area."
    };
  }

  return {
    competition_level: inferCompetitionLevel(districtAnalysis),
    competitor_types: ["Bimba/lembaga serupa", "TK/PAUD", "les privat"],
    notes: "Nama brand tidak dipaksakan jika tidak tervalidasi; fokus pada tingkat kompetisi area."
  };
}

function inferCompetitionLevel(districtAnalysis) {
  const saturationText = districtAnalysis
    .map((district) => stringifyValue(district?.market_needs?.market_saturation))
    .join(" ")
    .toLowerCase();

  if (saturationText.includes("tinggi") || saturationText.includes("high")) return "tinggi";
  if (saturationText.includes("rendah") || saturationText.includes("low")) return "rendah";
  return "sedang";
}

function collectLocalActivityReferences(result) {
  const districtAnalysis = Array.isArray(result?.district_analysis) ? result.district_analysis : [];
  const items = [];

  districtAnalysis.forEach((district) => {
    const districtName = district?.district_name || "Area sekitar";
    const newsLinks = district?.digital_footprint?.news_and_community?.news_links || [];
    const communityLinks = district?.digital_footprint?.news_and_community?.community_links || [];
    const promotionEvents = district?.promotion?.event_lokal || district?.promotion?.events || district?.promotion?.community_events || [];
    const socialLinks = [
      ...(district?.digital_footprint?.social_media?.instagram || []),
      ...(district?.digital_footprint?.social_media?.facebook || []),
      ...(district?.digital_footprint?.social_media?.tiktok || []),
      ...(district?.digital_footprint?.social_media?.youtube || [])
    ];

    [...newsLinks, ...communityLinks, ...socialLinks].forEach((entry) => {
      const normalized = normalizeLinkEntry(entry, districtName);
      if (normalized) items.push(normalized);
    });

    const eventEntries = Array.isArray(promotionEvents) ? promotionEvents : [promotionEvents];
    eventEntries.forEach((entry) => {
      const normalized = normalizeLinkEntry(entry, districtName);
      if (normalized) items.push(normalized);
    });
  });

  const unique = [];
  const seen = new Set();

  items.forEach((item) => {
    if (!item?.url || seen.has(item.url)) return;
    seen.add(item.url);
    unique.push(item);
  });

  return unique.slice(0, 6);
}

function collectMainRisks(result) {
  const strategy = result?.strategic_recommendation?.strategy || {};
  const swot = result?.strategic_recommendation?.swot || {};
  const candidates = [
    ...(Array.isArray(strategy?.risk) ? strategy.risk : []),
    ...(Array.isArray(swot?.threats) ? swot.threats : []),
    ...(Array.isArray(result?.risk) ? result.risk : [])
  ].map((item) => stringifyValue(item)).filter(Boolean);

  if (candidates.length === 0) {
    return "demand rendah, kompetitor kuat, dan mismatch harga";
  }

  return candidates.slice(0, 3).join(", ");
}

function normalizeLinkEntry(entry, districtName) {
  if (!entry) return null;

  if (typeof entry === "string") {
    if (!/^https?:\/\//i.test(entry)) return null;
    return {
      title: `Referensi aktivitas/komunitas di ${districtName}`,
      url: entry
    };
  }

  if (typeof entry === "object") {
    const url = entry.url || entry.link || entry.href;
    if (!url || !/^https?:\/\//i.test(String(url))) return null;
    return {
      title: entry.title || entry.name || entry.topic || `Referensi aktivitas/komunitas di ${districtName}`,
      url: String(url)
    };
  }

  return null;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatCurrency(value) {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number") return "-";
  return `${value}%`;
}

function formatNumber(value) {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatRadiusSummary(radiusData) {
  if (!radiusData || typeof radiusData !== "object") return "belum tersedia";
  const population = formatNumber(toNumber(radiusData.population_estimate));
  const children = formatNumber(toNumber(radiusData.early_childhood_estimate));
  return `${population} penduduk dan ${children} anak usia 2-7 tahun`;
}

function formatScenarioSummary(scenario) {
  if (!scenario || typeof scenario !== "object") return "belum tersedia";
  return `SOM ${formatNumber(toNumber(scenario.som_students))} siswa, omzet bulanan ${formatCurrency(toNumber(scenario.monthly_revenue))}, omzet tahunan ${formatCurrency(toNumber(scenario.annual_revenue))}`;
}

function formatCoordinate(value) {
  if (typeof value !== "number") return "-";
  return value.toFixed(6);
}

function isLikelyIndonesiaLatitude(value) {
  return value >= -11 && value <= 6;
}

function isLikelyIndonesiaLongitude(value) {
  return value >= 95 && value <= 141;
}

function inferAreaTypeFromOsm(locationValidation) {
  const type = String(locationValidation?.type || "").toLowerCase();
  const category = String(locationValidation?.category || "").toLowerCase();
  const display = String(locationValidation?.display_name || "").toLowerCase();

  if (category.includes("amenity") || display.includes("school") || display.includes("kampus")) {
    return "education";
  }

  if (type.includes("industrial") || display.includes("industri")) {
    return "industrial";
  }

  if (type.includes("commercial") || display.includes("mall") || display.includes("ruko")) {
    return "commercial";
  }

  if (display.includes("boulevard") || display.includes("residence") || display.includes("jaya")) {
    return "mixed";
  }

  return "residential";
}

function toTitleCase(text) {
  return String(text)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function setStatus(type, message) {
  statusBanner.className = `status-banner ${type}`;
  statusBanner.textContent = message;
}

async function copyJson() {
  const text = jsonOutput.textContent.trim();
  if (!text || text === "Belum ada hasil.") return;

  await navigator.clipboard.writeText(text);
  setStatus("success", "JSON berhasil disalin ke clipboard.");
}

function downloadJson() {
  const text = jsonOutput.textContent.trim();
  if (!text || text === "Belum ada hasil.") return;

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smartkidz-market-research-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildResearchPrompt(payload) {
  const analysisMode = payload.compactMode || payload.analysisMode === "fast" ? "fast" : "balanced";
  const districtLimitInstruction = analysisMode === "fast"
    ? "- Batasi district_analysis ke maksimal 3 kecamatan terdekat yang paling relevan.\n- Ringkas reasoning per field, jangan panjang.\n- Prioritaskan data paling berdampak bisnis, bukan detail panjang."
    : "- Analisa semua kecamatan relevan dalam radius 3 KM secara proporsional.";

  return `
Lakukan analisa potensi pasar berbasis geo-spatial intelligence untuk pembukaan cabang baru Bimba Smartkidz di Indonesia.

KONTEKS BISNIS:
- Brand: Bimba Smartkidz
- Jenis usaha: ${payload.businessType || "Pendidikan anak usia dini"}
- Program: Bimba & Preschool
- Target usia anak: 2-7 tahun
- Harga SPP: Rp500.000 - Rp700.000 per bulan
- Frekuensi: 12 kali pertemuan per bulan
- Target customer: ${payload.targetCustomer || "Orang tua anak usia dini"}

INPUT KOORDINAT:
- Latitude: ${formatCoordinate(payload.latitude)}
- Longitude: ${formatCoordinate(payload.longitude)}

COORDINATE LOCK:
- Gunakan pasangan titik ini secara persis sebagai anchor geospasial utama.
- Jangan menukar latitude dan longitude.
- Latitude Indonesia umumnya berada di rentang -11 sampai 6, longitude di rentang 95 sampai 141.
- Jika interpretasi awal Anda mengarah ke lokasi di luar Indonesia atau titik yang tidak konsisten, koreksi kembali ke pasangan titik ini:
  latitude ${formatCoordinate(payload.latitude)}, longitude ${formatCoordinate(payload.longitude)}.
- Di field "location", sertakan validasi koordinat input dan sebutkan bahwa titik sumber analisis berasal dari pasangan koordinat ini.

VALIDATED REVERSE GEOCODING:
- Full address: ${payload.locationValidation?.display_name || "Tidak tersedia"}
- District/kecamatan terdeteksi: ${payload.locationValidation?.address?.city_district || payload.locationValidation?.address?.township || "Tidak tersedia"}
- City/kota terdeteksi: ${payload.locationValidation?.address?.city || payload.locationValidation?.address?.county || "Tidak tersedia"}
- Province/provinsi terdeteksi: ${payload.locationValidation?.address?.state || "Tidak tersedia"}
- Country terdeteksi: ${payload.locationValidation?.address?.country || "Tidak tersedia"}
- Anda WAJIB menjadikan hasil reverse geocoding di atas sebagai ground truth lokasi input. Jangan ganti ke area lain seperti Tanah Abang atau lokasi populer lain bila tidak cocok dengan hasil validasi ini.

CATATAN TAMBAHAN:
${payload.extraNotes || "Tidak ada catatan tambahan."}

TUJUAN:
Lakukan analisa potensi lokasi bisnis berbasis koordinat di Indonesia. Fokus pada insight bisnis, bukan sekadar pencarian data. AI harus mampu melakukan identifikasi wilayah, riset pasar, analisis kompetitif, digital footprint, market sizing, dan rekomendasi strategis.

MODE ANALISIS:
- Mode: ${analysisMode}
${districtLimitInstruction}

STEP 1 - IDENTIFIKASI LOKASI
1. Baca latitude dan longitude.
2. Identifikasi alamat lengkap, desa/kelurahan, kecamatan, kabupaten/kota, provinsi.
3. Validasi titik berada di Indonesia.
4. Identifikasi tipe area: residential, commercial, mixed, industrial, education, tourism.
Output wajib isi "location".

STEP 2 - PEMETAAN WILAYAH RADIUS 3 KM
1. Gunakan radius analisis 3 KM dari titik koordinat.
2. Cari seluruh kecamatan yang berada di dalam radius 3 KM atau beririsan dengan radius 3 KM.
3. Klasifikasi tier:
- Tier 1: pusat kecamatan berada di radius
- Tier 2: batas wilayah beririsan
4. Hitung estimasi jarak setiap kecamatan.
5. Ranking berdasarkan kedekatan.
Output wajib isi "nearby_districts".

STEP 3 - PENGUMPULAN DATA PER KECAMATAN
Untuk setiap kecamatan dalam radius, analisa:
- accessibility
- demography
- economy
- market_needs
- facilities
- digital_footprint
- promotion

Detail wajib:
- accessibility: jalan utama, kondisi jalan, volume lalu lintas, akses kendaraan, angkutan umum, visibilitas, hotspot aktivitas, waktu tempuh, mobilitas komuter
- demography: populasi, kepadatan penduduk, pertumbuhan penduduk, urbanisasi, distribusi usia (0-14, 15-24, 25-34, 35-44, 45-54, 55+), komposisi keluarga
- economy: pendapatan rumah tangga, pengeluaran bulanan, pengeluaran non pangan, spending power, kelas ekonomi, tingkat konsumsi, sektor ekonomi utama, UMKM
- market_needs: demand utama, kebutuhan masyarakat, pain point, peluang produk, market gap, kompetitor, market saturation, peluang diferensiasi
- facilities: sekolah, kampus, rumah sakit, mall, minimarket, pasar, area perumahan, perkantoran, industri, tempat ibadah, fasilitas publik
- promotion: komunitas, event lokal, influencer, B2B, partnership, sponsorship

Digital footprint wajib URL asli, jangan palsu:
- google_maps: business_count, avg_rating, review_volume, references
- social_media: instagram, facebook, tiktok, youtube, trend_topics
- marketplace: shopee, tokopedia, tiktok_shop
- search_behavior: keywords, google_trend_links, search_links
- news_and_community: news_links, community_links

Aturan digital footprint:
- semua insight digital harus memiliki URL penuh
- minimal 3 referensi per kecamatan jika memungkinkan
- jika tidak ada, gunakan null atau array kosong

STEP 4 - SCORING DAN MARKET ESTIMATION
Buat skor 1-100:
- Market Potential
- Buying Power
- Accessibility
- Competition
- Digital Opportunity
- Growth Potential

Gunakan rumus:
Market Score =
(0.25 x Buying Power) +
(0.20 x Population Density) +
(0.15 x Accessibility) +
(0.15 x Demand Strength) +
(0.10 x Digital Activity) +
(0.10 x Growth Potential) +
(0.05 x Competition Advantage)

Hitung juga:
- TAM
- SAM
- SOM
- Market Size
- Potential Revenue
- Market Share

STEP 5 - ANALISA STRATEGIS
Berikan:
- top_3_districts
- ranking area
- opportunity map
- SWOT
- risk
- competitor insight
- pricing strategy
- promotion strategy
- collaboration strategy
- positioning
- customer persona

STEP 6 - OUTPUT WAJIB JSON VALID
Kembalikan hanya JSON valid tanpa markdown, tanpa penjelasan di luar JSON.
Jangan tambahkan kalimat pembuka, penutup, catatan, atau blok kode.
Karakter pertama output harus "{" dan karakter terakhir output harus "}".

Gunakan struktur ini persis sebagai root object:
{
  "location": {},
  "nearby_districts": [],
  "district_analysis": [
    {
      "district_name": "",
      "tier": "",
      "distance_km": 0,
      "accessibility": {},
      "demography": {},
      "economy": {},
      "market_needs": {},
      "facilities": {},
      "digital_footprint": {
        "google_maps": {
          "business_count": 0,
          "avg_rating": 0,
          "review_volume": 0,
          "references": []
        },
        "social_media": {
          "instagram": [],
          "facebook": [],
          "tiktok": [],
          "youtube": [],
          "trend_topics": []
        },
        "marketplace": {
          "shopee": [],
          "tokopedia": [],
          "tiktok_shop": []
        },
        "search_behavior": {
          "keywords": [],
          "google_trend_links": [],
          "search_links": []
        },
        "news_and_community": {
          "news_links": [],
          "community_links": []
        }
      },
      "promotion": {},
      "score": {}
    }
  ],
  "market_estimation": {
    "tam": 0,
    "sam": 0,
    "som": 0,
    "market_size": 0,
    "market_share": 0,
    "potential_revenue": 0
  },
  "strategic_recommendation": {
    "top_3_districts": [],
    "swot": {},
    "positioning": {},
    "customer_persona": {},
    "strategy": {}
  },
  "confidence_level": ""
}

ATURAN ANALISA:
1. Gunakan data terbaru.
2. Prioritas sumber: BPS, Google Maps, OpenStreetMap, Google Trends, Marketplace, Media Sosial, Portal berita, Pemerintah daerah.
3. Jika data tidak ada, boleh estimasi berbasis data terdekat dan jelaskan di field reasoning.
4. Jangan mengarang data atau URL.
5. Semua skor wajib reasoning.
6. Fokus pada insight bisnis dan perbandingan antar kecamatan.
7. Sertakan confidence score atau confidence level.
8. Jika mode fast aktif, tetap kembalikan JSON schema yang sama tetapi isi secara lebih ringkas dan fokus pada area paling prioritas.
`.trim();
}
