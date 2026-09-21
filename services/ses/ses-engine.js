const config = require("../../config/ses-config");

function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sumFinite(values) {
  const numbers = values.map(numberOrNull).filter((value) => value != null);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
}

function sumFields(properties, keys) {
  const values = keys.map((key) => numberOrNull(properties[key]));
  const available = values.filter((value) => value != null);
  return {
    total: available.length ? available.reduce((sum, value) => sum + value, 0) : null,
    available: available.length,
    expected: keys.length,
  };
}

function percentage(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

const AGE_BANDS = [
  ["0_4", "u0"], ["5_9", "u5"], ["10_14", "u10"], ["15_19", "u15"],
  ["20_24", "u20"], ["25_29", "u25"], ["30_34", "u30"], ["35_39", "u35"],
  ["40_44", "u40"], ["45_49", "u45"], ["50_54", "u50"], ["55_59", "u55"],
  ["60_64", "u60"], ["65_69", "u65"], ["70_74", "u70"], ["75_plus", "u75"],
];

function extractAgeIndicators(properties = {}) {
  const counts = AGE_BANDS.map(([label, key]) => [label, numberOrNull(properties[key])]);
  const availableTotal = counts.reduce((sum, [, value]) => sum + (value == null ? 0 : value), 0);
  const pct = Object.fromEntries(counts.map(([label, value]) => [`pct_age_${label}`, percentage(value, availableTotal)]));
  const sumBand = (labels) => sumFinite(labels.map((label) => counts.find(([name]) => name === label)?.[1]));
  return {
    ...pct,
    pct_children_0_14: percentage(sumBand(["0_4", "5_9", "10_14"]), availableTotal),
    pct_working_age_15_64: percentage(sumBand(["15_19", "20_24", "25_29", "30_34", "35_39", "40_44", "45_49", "50_54", "55_59", "60_64"]), availableTotal),
    pct_elderly_65_plus: percentage(sumBand(["65_69", "70_74", "75_plus"]), availableTotal),
    age_band_count: counts.filter(([, value]) => value != null).length,
    age_band_total: availableTotal || null,
  };
}

function extractSesComponents(properties = {}) {
  const educationKeys = [
    "tidak_blm_sekolah", "belum_tamat_sd", "tamat_sd", "sltp", "slta",
    "d1_dan_d2", "d3", "s1", "s2", "s3", "tidak_tahu",
  ];
  const employmentKeys = [
    "belum_tidak_bekerja", "guru", "nelayan", "pengacara", "pensiunan",
    "perawat", "perdagangan", "pelajar_mahasiswa", "mengurus_rumah_tangga", "wiraswasta",
  ];
  const education = sumFields(properties, educationKeys);
  const employment = sumFields(properties, employmentKeys);
  const educationHigher = sumFinite([
    properties.slta, properties.d1_dan_d2, properties.d3,
    properties.s1, properties.s2, properties.s3,
  ]);
  const educationDiplomaPlus = sumFinite([
    properties.d1_dan_d2, properties.d3, properties.s1, properties.s2, properties.s3,
  ]);
  const educationBachelorPlus = sumFinite([properties.s1, properties.s2, properties.s3]);
  const professionalSkilled = sumFinite([properties.guru, properties.pengacara, properties.perawat]);
  const business = sumFinite([properties.perdagangan, properties.wiraswasta]);

  return {
    indicators: {
      pct_high_school_plus: percentage(educationHigher, education.total),
      pct_diploma_plus: percentage(educationDiplomaPlus, education.total),
      pct_bachelor_plus: percentage(educationBachelorPlus, education.total),
      pct_master_plus: percentage(sumFinite([properties.s2, properties.s3]), education.total),
      pct_doctoral: percentage(numberOrNull(properties.s3), education.total),
      pct_professional_skilled: percentage(professionalSkilled, employment.total),
      pct_business: percentage(business, employment.total),
      pct_unemployed: percentage(numberOrNull(properties.belum_tidak_bekerja), employment.total),
      pct_student: percentage(numberOrNull(properties.pelajar_mahasiswa), employment.total),
      pct_household_work: percentage(numberOrNull(properties.mengurus_rumah_tangga), employment.total),
      pct_retired: percentage(numberOrNull(properties.pensiunan), employment.total),
    },
    raw: {
      education_base: education.total,
      education_fields_available: education.available,
      education_fields_expected: education.expected,
      education_field_coverage: education.expected ? (education.available / education.expected) * 100 : 0,
      employment_base: employment.total,
      employment_fields_available: employment.available,
      employment_fields_expected: employment.expected,
      employment_field_coverage: employment.expected ? (employment.available / employment.expected) * 100 : 0,
    },
  };
}

function latestBirthValue(properties) {
  for (const year of [2024, 2023, 2022, 2021, 2020]) {
    const value = numberOrNull(properties[`lhr_${year}`]);
    if (value != null) return { value, year };
  }
  return { value: null, year: null };
}

function extractIndicators(properties = {}) {
  const population = numberOrNull(properties.jumlah_penduduk);
  const households = numberOrNull(properties.jumlah_kk);
  const childCount = sumFinite([properties.u0, properties.u5, properties.u10]);
  // Dukcapil exposes u0 and u5 as age buckets 0–4 and 5–9. Estimate age 0–5
  // as all of u0 plus one fifth of u5; keep the approximation explicit.
  const targetChildren05 = numberOrNull(properties.u0) != null && numberOrNull(properties.u5) != null
    ? numberOrNull(properties.u0) + (numberOrNull(properties.u5) / 5)
    : null;
  const birth = latestBirthValue(properties);
  const birthCounts = sumFields(properties, ["lhr_2020", "lhr_2021", "lhr_2022", "lhr_2023", "lhr_2024"]);
  const growthValues = ["pertumbuhan_2020", "pertumbuhan_2021", "pertumbuhan_2022", "pertumbuhan_2023", "pertumbuhan_2024"]
    .map((key) => numberOrNull(properties[key])).filter((value) => value != null);
  const components = extractSesComponents(properties);
  const age = extractAgeIndicators(properties);

  return {
    household_size: population != null && households > 0 ? population / households : null,
    per_capita_expenditure: firstNumeric(properties, ["per_capita_expenditure", "pengeluaran_per_kapita", "pengeluaran_perkapita", "bps_pengeluaran_per_kapita"]),
    poverty_rate: firstNumeric(properties, ["poverty_rate", "persentase_kemiskinan", "kemiskinan", "bps_kemiskinan"]),
    average_schooling: firstNumeric(properties, ["average_schooling", "rata_rata_lama_sekolah", "rata-rata_lama_sekolah", "bps_rata_rata_lama_sekolah"]),
    unemployment_rate: firstNumeric(properties, ["unemployment_rate", "tingkat_pengangguran_terbuka", "tpt", "bps_tpt"]),
    home_ownership_share: firstNumeric(properties, ["home_ownership_share", "kepemilikan_rumah", "persen_kepemilikan_rumah"]),
    vehicle_ownership_share: firstNumeric(properties, ["vehicle_ownership_share", "kepemilikan_kendaraan", "persen_kepemilikan_kendaraan"]),
    internet_access_share: firstNumeric(properties, ["internet_access_share", "akses_internet", "persen_akses_internet"]),
    target_children_0_5_proxy: targetChildren05,
    population,
    child_share: population > 0 && childCount != null ? (childCount / population) * 100 : null,
    freehold_share: extractFreeholdShare(properties),
    dense_residential_share: firstNumeric(properties, ["dense_residential_share", "pct_perumahan_padat", "perumahan_padat_share", "persen_perumahan_padat"]),
    bhumi_formal_residential_share: firstNumeric(properties, ["bhumi_formal_residential_share", "bhumi_dense_residential_share"]),
    bhumi_land_value_average: firstNumeric(properties, ["bhumi_land_value_average", "bhumi_land_value_median"]),
    big_slum_presence: firstNumeric(properties, ["big_slum_presence", "slum_presence"]),
    birth_count_2020_2024: birthCounts.total,
    population_growth_average: growthValues.length ? growthValues.reduce((sum, value) => sum + value, 0) / growthValues.length : null,
    birth_rate_proxy: population > 0 && birth.value != null ? (birth.value / population) * 1000 : null,
    ...age,
    ...components.indicators,
    raw: {
      population,
      households,
      child_count_0_14: childCount,
      latest_birth_count: birth.value,
      latest_birth_year: birth.year,
      birth_count_2020_2024: birthCounts.total,
      birth_fields_available: birthCounts.available,
      population_growth_fields_available: growthValues.length,
      ...components.raw,
    },
  };
}

function firstNumeric(properties, keys) {
  for (const key of keys) {
    const value = numberOrNull(properties[key]);
    if (value != null) return value;
  }
  return null;
}

function extractFreeholdShare(properties = {}) {
  const numericShare = firstNumeric(properties, [
    "freehold_share", "bhumi_freehold_share", "pct_hak_milik",
    "hak_milik_share", "persen_hak_milik", "area_freehold_share",
  ]);
  if (numericShare != null) return Math.max(0, Math.min(100, numericShare));

  // ATR/BPN identify responses often provide the right as text instead of a
  // pre-aggregated percentage. Aggregated BHUMI responses use the numeric
  // share above; individual HM/SHM observations become a 100% signal.
  const statusKeys = [
    "tipehak", "TIPEHAK", "jenis_hak", "JENISHAK", "status_kepemilikan",
    "STATUS_KEPEMILIKAN", "statusKepemilikan", "hak", "HAK",
  ];
  const statusKey = statusKeys.find((key) => properties[key] != null && String(properties[key]).trim() !== "");
  if (!statusKey) return null;
  return /hak\s*milik|sertifikat\s*hak\s*milik|\bSHM\b|\bHM\b/i.test(String(properties[statusKey])) ? 100 : 0;
}

function getStats(rows, indicatorId) {
  const values = rows
    .map((row) => row.indicators[indicatorId])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!values.length) return { count: 0, min: null, max: null, p05: null, p95: null };
  const quantile = (position) => {
    const index = (values.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return lower === upper
      ? values[lower]
      : values[lower] + (values[upper] - values[lower]) * (index - lower);
  };
  return {
    count: values.length,
    min: values[0],
    max: values[values.length - 1],
    p05: quantile(0.05),
    p95: quantile(0.95),
  };
}

function normalize(value, stats, direction) {
  if (!Number.isFinite(value) || !stats.count) return null;
  const low = stats.p05 ?? stats.min;
  const high = (stats.p95 != null && stats.p95 > low) ? stats.p95 : stats.max;
  if (high === low) return 50;
  const positive = ((value - low) / (high - low)) * 100;
  const bounded = Math.max(0, Math.min(100, positive));
  return direction === "lower_is_higher_signal" ? 100 - bounded : bounded;
}

function classify(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= config.classes.A.min) return "A";
  if (score >= config.classes.B.min) return "B";
  return "C";
}

function publicConfig() {
  return {
    version: config.version,
    status: config.status,
    label: config.label,
    maxConfidence: config.maxConfidence,
    referencePeriod: config.referencePeriod,
    classes: config.classes,
    domainWeights: config.domainWeights,
    indicators: config.indicators,
    areaPotentialWeights: config.areaPotentialWeights,
    areaPotentialIndicators: config.areaPotentialIndicators,
    limitations: config.limitations,
  };
}

function collectGeometryPoints(geometry) {
  const points = [];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      points.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return points;
}

function pointInRing(lon, lat, ring = []) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if (!current || !prior) continue;
    const currentLon = Number(current[0]);
    const currentLat = Number(current[1]);
    const priorLon = Number(prior[0]);
    const priorLat = Number(prior[1]);
    const crosses = ((currentLat > lat) !== (priorLat > lat)) &&
      (lon < ((priorLon - currentLon) * (lat - currentLat)) / (priorLat - currentLat || Number.EPSILON) + currentLon);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoordinates(lon, lat, coordinates = []) {
  // Even/odd parity handles the outer ring and holes without assuming ring
  // winding order from the upstream ArcGIS service.
  return coordinates.reduce((inside, ring) => pointInRing(lon, lat, ring) ? !inside : inside, false);
}

function pointInGeometry(lon, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygonCoordinates(lon, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(lon, lat, polygon));
  }
  return false;
}

function buildHexagon(centerX, centerY, radiusM, centerLon, centerLat) {
  const latitudeMeters = 111320;
  const longitudeMeters = 111320 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const ring = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index);
    const x = centerX + radiusM * Math.cos(angle);
    const y = centerY + radiusM * Math.sin(angle);
    ring.push([
      centerLon + x / longitudeMeters,
      centerLat + y / latitudeMeters,
    ]);
  }
  ring.push(ring[0]);
  return ring;
}

function buildSourceDescriptors(features = []) {
  return features.map((feature) => {
    const points = collectGeometryPoints(feature?.geometry);
    if (!points.length) return null;
    const longitudes = points.map((point) => point[0]);
    const latitudes = points.map((point) => point[1]);
    return {
      feature,
      points,
      minLon: Math.min(...longitudes),
      maxLon: Math.max(...longitudes),
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
    };
  }).filter(Boolean);
}

function ringBounds(ring = []) {
  const points = ring.filter((point) => Array.isArray(point) && point.length >= 2);
  if (!points.length) return null;
  const longitudes = points.map((point) => Number(point[0]));
  const latitudes = points.map((point) => Number(point[1]));
  return {
    minLon: Math.min(...longitudes),
    maxLon: Math.max(...longitudes),
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
  };
}

function segmentsIntersect(first, second, third, fourth) {
  const orientation = (a, b, c) => {
    const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
    if (Math.abs(value) < 1e-12) return 0;
    return value > 0 ? 1 : 2;
  };
  const onSegment = (a, b, c) => (
    c[0] <= Math.max(a[0], b[0]) + 1e-12 && c[0] >= Math.min(a[0], b[0]) - 1e-12
    && c[1] <= Math.max(a[1], b[1]) + 1e-12 && c[1] >= Math.min(a[1], b[1]) - 1e-12
  );
  const firstOrientation = orientation(first, second, third);
  const secondOrientation = orientation(first, second, fourth);
  const thirdOrientation = orientation(third, fourth, first);
  const fourthOrientation = orientation(third, fourth, second);
  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) return true;
  if (firstOrientation === 0 && onSegment(first, second, third)) return true;
  if (secondOrientation === 0 && onSegment(first, second, fourth)) return true;
  if (thirdOrientation === 0 && onSegment(third, fourth, first)) return true;
  if (fourthOrientation === 0 && onSegment(third, fourth, second)) return true;
  return false;
}

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates || [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flatMap((polygon) => polygon || []);
  return [];
}

function geometryIntersectsPolygon(geometry, polygonRing) {
  if (!geometry || !Array.isArray(polygonRing) || polygonRing.length < 3) return false;
  const polygonCenter = polygonRing.reduce(
    (center, point) => [center[0] + Number(point[0]), center[1] + Number(point[1])],
    [0, 0],
  ).map((value) => value / polygonRing.length);
  if (pointInGeometry(polygonCenter[0], polygonCenter[1], geometry)) return true;
  if (polygonRing.some((point) => pointInGeometry(Number(point[0]), Number(point[1]), geometry))) return true;

  const rings = geometryRings(geometry);
  return rings.some((ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    if (ring.some((point) => pointInRing(Number(point[0]), Number(point[1]), polygonRing))) return true;
    for (let index = 0; index < ring.length; index += 1) {
      const sourceStart = ring[index];
      const sourceEnd = ring[(index + 1) % ring.length];
      for (let polygonIndex = 0; polygonIndex < polygonRing.length; polygonIndex += 1) {
        const polygonStart = polygonRing[polygonIndex];
        const polygonEnd = polygonRing[(polygonIndex + 1) % polygonRing.length];
        if (segmentsIntersect(sourceStart, sourceEnd, polygonStart, polygonEnd)) return true;
      }
    }
    return false;
  });
}

function calculateSesHexagonGrid(inputFeatures = [], options = {}) {
  const sesResult = calculateSesPolygons(inputFeatures);
  let sourceFeatures = sesResult.features || [];
  if (Array.isArray(options.selectedKeys) && options.selectedKeys.length) {
    const selectedKeys = new Set(options.selectedKeys.map((key) => String(key)));
    sourceFeatures = sourceFeatures.filter((feature) => {
      const p = feature.properties || {};
      return selectedKeys.has([p.nama_prop, p.nama_kab, p.nama_kec, p.nama_kel, p.level]
        .map((value) => String(value || ""))
        .join("|"));
    });
  }
  const radiusM = Math.max(100, Math.min(3000, Number(options.cellSizeM) || 1500));
  const coverageRadiusM = Math.max(500, Math.min(3000, Number(options.coverageRadiusM) || 1500));
  const points = sourceFeatures.flatMap((feature) => collectGeometryPoints(feature.geometry));
  if (!points.length) {
    return {
      type: "FeatureCollection",
      features: [],
      meta: {
        ...sesResult.meta,
        grid_shape: "hexagon",
        cell_size_m: radiusM,
        coverage_radius_m: coverageRadiusM,
        error: "Polygon sumber tidak memiliki geometry yang dapat dipakai untuk membangun grid.",
      },
    };
  }

  const minLon = Math.min(...points.map((point) => point[0]));
  const maxLon = Math.max(...points.map((point) => point[0]));
  const minLat = Math.min(...points.map((point) => point[1]));
  const maxLat = Math.max(...points.map((point) => point[1]));
  // The grid belongs to the selected Dukcapil polygons. Always derive its
  // center from those geometries; a stale map/input coordinate can otherwise
  // create a complete ring of cells with no source polygon at all.
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const latitudeMeters = 111320;
  const longitudeMeters = 111320 * Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const toX = (lon) => (lon - centerLon) * longitudeMeters;
  const toY = (lat) => (lat - centerLat) * latitudeMeters;
  const sourceMinX = toX(minLon);
  const sourceMaxX = toX(maxLon);
  const sourceMinY = toY(minLat);
  const sourceMaxY = toY(maxLat);
  // Cover the complete selected source extent. The requested 1.5 km radius is
  // retained as a minimum margin around the source, not as a circle that can
  // cut off the rest of the selected kelurahan/kota.
  const gridPaddingM = Math.max(radiusM, coverageRadiusM);
  const minX = sourceMinX - gridPaddingM;
  const maxX = sourceMaxX + gridPaddingM;
  const minY = sourceMinY - gridPaddingM;
  const maxY = sourceMaxY + gridPaddingM;
  const sourceWidthM = Math.max(0, sourceMaxX - sourceMinX);
  const sourceHeightM = Math.max(0, sourceMaxY - sourceMinY);
  const effectiveCoverageRadiusM = Math.max(coverageRadiusM, Math.hypot(sourceWidthM, sourceHeightM) / 2);
  const verticalStep = Math.sqrt(3) * radiusM;
  const horizontalStep = 1.5 * radiusM;
  const sourceDescriptors = buildSourceDescriptors(sourceFeatures);
  const gridFeatures = [];
  let unmatchedCells = 0;
  let column = 0;

  for (let x = minX; x <= maxX; x += horizontalStep) {
    const offsetY = column % 2 ? verticalStep / 2 : 0;
    let row = 0;
    for (let y = minY + offsetY; y <= maxY; y += verticalStep) {
      const hexagon = buildHexagon(x, y, radiusM, centerLon, centerLat);
      const hexBounds = ringBounds(hexagon);
      const sourceDescriptor = sourceDescriptors.find((descriptor) => (
        hexBounds
        && descriptor.maxLon >= hexBounds.minLon
        && descriptor.minLon <= hexBounds.maxLon
        && descriptor.maxLat >= hexBounds.minLat
        && descriptor.minLat <= hexBounds.maxLat
        && geometryIntersectsPolygon(descriptor.feature.geometry, hexagon)
      ));
      if (sourceDescriptor?.feature) {
        const sourceProperties = sourceDescriptor.feature.properties || {};
        gridFeatures.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [hexagon],
          },
          properties: {
            ...sourceProperties,
            polygon_type: "ses_analysis_hexagon",
            grid_id: `hex-${column}-${row}`,
            grid_cell_size_m: radiusM,
            source_polygon_type: sourceProperties.level || "administrative_source",
            source_polygon_name: sourceProperties.nama_kel || sourceProperties.nama_kec || "-",
            ses_value_method: "intersects_source_polygon",
            ses_note: "Grid hexagon non-administratif; nilai SES diwariskan dari polygon Dukcapil yang beririsan dengan sel.",
          },
        });
      } else {
        unmatchedCells += 1;
      }
      row += 1;
    }
    column += 1;
  }

  return {
    type: "FeatureCollection",
    features: gridFeatures,
    meta: {
      ...sesResult.meta,
      grid_shape: "hexagon",
      cell_size_m: radiusM,
      coverage_radius_m: effectiveCoverageRadiusM,
      coverage_width_m: sourceWidthM,
      coverage_height_m: sourceHeightM,
      coverage_mode: "selected_source_extent",
      coverage_center: { longitude: centerLon, latitude: centerLat },
      grid_features: gridFeatures.length,
      source_features: sourceFeatures.length,
      unmatched_cells: unmatchedCells,
      value_assignment: "intersects_source_polygon",
      note: "Grid mengikuti extent polygon sumber Dukcapil dan hanya menampilkan sel yang benar-benar beririsan; tidak ada nilai yang diisi dari wilayah lain.",
    },
  };
}

function calculateSesPolygons(inputFeatures = []) {
  const features = Array.isArray(inputFeatures) ? inputFeatures : [];
  const rows = features.map((feature, index) => {
    const properties = feature?.properties || {};
    const extracted = extractIndicators(properties);
    return {
      feature,
      index,
      properties,
      indicators: extracted,
    };
  });

  const statsByIndicator = Object.fromEntries(
    config.indicators.map((indicator) => [indicator.id, getStats(rows, indicator.id)])
  );
  const domainWeights = config.domainWeights || {};
  const domains = Object.keys(domainWeights);
  const totalConfiguredDomainWeight = domains.reduce((sum, domain) => sum + Number(domainWeights[domain] || 0), 0);
  const areaIndicators = config.areaPotentialIndicators || [];
  const areaStatsByIndicator = Object.fromEntries(
    areaIndicators.map((indicator) => [indicator.id, getStats(rows, indicator.id)])
  );
  const areaDomainWeights = config.areaPotentialWeights || {};
  const areaDomains = Object.keys(areaDomainWeights);
  const totalAreaDomainWeight = areaDomains.reduce((sum, domain) => sum + Number(areaDomainWeights[domain] || 0), 0);

  const calculatedFeatures = rows.map((row) => {
    const domainScores = {};
    const domainCoverage = {};
    const normalized = {};
    const raw = {};
    const availableIndicators = [];

    config.indicators.forEach((indicator) => {
      const value = row.indicators[indicator.id];
      raw[indicator.id] = value == null ? null : round(value, 4);
      const score = normalize(value, statsByIndicator[indicator.id], indicator.direction);
      normalized[indicator.id] = score == null ? null : round(score, 1);
      if (score != null) availableIndicators.push(indicator.id);
    });

    domains.forEach((domain) => {
      const domainIndicators = config.indicators.filter((indicator) => indicator.domain === domain);
      const configuredIndicatorWeight = domainIndicators.reduce((sum, indicator) => sum + Number(indicator.weight || 0), 0);
      let weightedScore = 0;
      let availableWeight = 0;
      domainIndicators.forEach((indicator) => {
        const score = normalized[indicator.id];
        if (score != null) {
          weightedScore += score * Number(indicator.weight || 0);
          availableWeight += Number(indicator.weight || 0);
        }
      });
      domainScores[domain] = availableWeight > 0 ? weightedScore / availableWeight : null;
      domainCoverage[domain] = configuredIndicatorWeight > 0
        ? (availableWeight / configuredIndicatorWeight) * 100
        : 0;
    });

    const availableDomainWeight = domains.reduce(
      (sum, domain) => domainScores[domain] == null ? sum : sum + Number(domainWeights[domain] || 0),
      0,
    );
    const weightedDomainScore = domains.reduce(
      (sum, domain) => domainScores[domain] == null
        ? sum
        : sum + domainScores[domain] * Number(domainWeights[domain] || 0),
      0,
    );
    const sesIndex = availableDomainWeight > 0 ? weightedDomainScore / availableDomainWeight : null;
    const coverage = totalConfiguredDomainWeight > 0
      ? availableDomainWeight / totalConfiguredDomainWeight
      : 0;
    const weightedContributionTotal = weightedDomainScore || 0;
    const domainDetails = Object.fromEntries(domains.map((domain) => {
      const configuredWeight = Number(domainWeights[domain] || 0);
      const score = domainScores[domain];
      const rawContribution = score == null ? null : score * configuredWeight;
      return [domain, {
        score: score == null ? null : round(score, 1),
        configured_weight_pct: round(configuredWeight * 100, 1),
        effective_weight_pct: score == null || availableDomainWeight <= 0
          ? 0
          : round((configuredWeight / availableDomainWeight) * 100, 1),
        contribution_pct: rawContribution == null || weightedContributionTotal <= 0
          ? null
          : round((rawContribution / weightedContributionTotal) * 100, 1),
        coverage_pct: round(domainCoverage[domain], 1),
      }];
    }));
    const confidence = sesIndex == null
      ? 0
      : Math.round(Math.min(config.maxConfidence, coverage * config.maxConfidence));

    const areaNormalized = {};
    const areaRaw = {};
    const areaAvailableIndicators = [];
    areaIndicators.forEach((indicator) => {
      const value = row.indicators[indicator.id];
      areaRaw[indicator.id] = value == null ? null : round(value, 4);
      const score = normalize(value, areaStatsByIndicator[indicator.id], indicator.direction);
      areaNormalized[indicator.id] = score == null ? null : round(score, 1);
      if (score != null) areaAvailableIndicators.push(indicator.id);
    });
    const areaDomainScores = {};
    const areaDomainCoverage = {};
    areaDomains.forEach((domain) => {
      const domainItems = areaIndicators.filter((indicator) => indicator.domain === domain);
      const configuredWeight = domainItems.reduce((sum, indicator) => sum + Number(indicator.weight || 0), 0);
      let weighted = 0;
      let availableWeight = 0;
      domainItems.forEach((indicator) => {
        const score = areaNormalized[indicator.id];
        if (score != null) {
          weighted += score * Number(indicator.weight || 0);
          availableWeight += Number(indicator.weight || 0);
        }
      });
      areaDomainScores[domain] = availableWeight > 0 ? weighted / availableWeight : null;
      areaDomainCoverage[domain] = configuredWeight > 0 ? (availableWeight / configuredWeight) * 100 : 0;
    });
    const availableAreaWeight = areaDomains.reduce(
      (sum, domain) => areaDomainScores[domain] == null ? sum : sum + Number(areaDomainWeights[domain] || 0), 0,
    );
    const weightedAreaScore = areaDomains.reduce(
      (sum, domain) => areaDomainScores[domain] == null ? sum : sum + areaDomainScores[domain] * Number(areaDomainWeights[domain] || 0), 0,
    );
    const areaIndex = availableAreaWeight > 0 ? weightedAreaScore / availableAreaWeight : null;
    const areaCoverage = totalAreaDomainWeight > 0 ? availableAreaWeight / totalAreaDomainWeight : 0;
    const areaDetails = Object.fromEntries(areaDomains.map((domain) => {
      const configuredWeight = Number(areaDomainWeights[domain] || 0);
      const score = areaDomainScores[domain];
      return [`${domain}`, {
        score: score == null ? null : round(score, 1),
        configured_weight_pct: round(configuredWeight * 100, 1),
        coverage_pct: round(areaDomainCoverage[domain], 1),
      }];
    }));
    const properties = {
      ...(row.properties || {}),
      ses_model: config.version,
      ses_status: config.status,
      ses_label: config.label,
      ses_index: round(sesIndex, 1),
      ses_class: classify(sesIndex),
      ses_class_label: classify(sesIndex) ? config.classes[classify(sesIndex)].label : null,
      ses_confidence: confidence,
      ses_data_coverage: round(coverage * 100, 1),
      ses_available_indicators: availableIndicators.join(","),
      ses_household_size: raw.household_size,
      ses_freehold_share: raw.freehold_share,
      ses_bhumi_land_value_average: raw.bhumi_land_value_average,
      ses_bhumi_formal_residential_share: raw.bhumi_formal_residential_share,
      ses_child_share: raw.child_share,
      ses_birth_rate_proxy: raw.birth_rate_proxy,
      ses_age_band_total: row.indicators.age_band_total,
      ses_age_band_count: row.indicators.age_band_count,
      ...Object.fromEntries(AGE_BANDS.map(([label]) => [`ses_pct_age_${label}`, round(row.indicators[`pct_age_${label}`], 1)])),
      ses_pct_children_0_14: round(row.indicators.pct_children_0_14, 1),
      ses_pct_working_age_15_64: round(row.indicators.pct_working_age_15_64, 1),
      ses_pct_elderly_65_plus: round(row.indicators.pct_elderly_65_plus, 1),
      ses_education_base: row.indicators.raw.education_base,
      ses_employment_base: row.indicators.raw.employment_base,
      ses_education_field_coverage: round(row.indicators.raw.education_field_coverage, 1),
      ses_employment_field_coverage: round(row.indicators.raw.employment_field_coverage, 1),
      ses_pct_high_school_plus: round(row.indicators.pct_high_school_plus, 1),
      ses_pct_diploma_plus: round(row.indicators.pct_diploma_plus, 1),
      ses_pct_bachelor_plus: round(row.indicators.pct_bachelor_plus, 1),
      ses_pct_master_plus: round(row.indicators.pct_master_plus, 1),
      ses_pct_doctoral: round(row.indicators.pct_doctoral, 1),
      ses_pct_professional_skilled: round(row.indicators.pct_professional_skilled, 1),
      ses_pct_business: round(row.indicators.pct_business, 1),
      ses_pct_unemployed: round(row.indicators.pct_unemployed, 1),
      ses_pct_student: round(row.indicators.pct_student, 1),
      ses_pct_household_work: round(row.indicators.pct_household_work, 1),
      ses_pct_retired: round(row.indicators.pct_retired, 1),
      area_potential_index: round(areaIndex, 1),
      area_potential_class: classify(areaIndex),
      area_potential_class_label: classify(areaIndex) ? config.classes[classify(areaIndex)].label : null,
      area_potential_data_coverage: round(areaCoverage * 100, 1),
      area_potential_available_indicators: areaAvailableIndicators.join(","),
      area_target_children_0_5: areaRaw.target_children_0_5_proxy,
      area_child_share: areaRaw.child_share,
      area_population: areaRaw.population,
      area_freehold_share: areaRaw.freehold_share,
      area_dense_residential_share: areaRaw.dense_residential_share,
      area_bhumi_formal_residential_share: areaRaw.bhumi_formal_residential_share,
      area_bhumi_land_value_average: areaRaw.bhumi_land_value_average,
      area_birth_count_2020_2024: areaRaw.birth_count_2020_2024,
      area_population_growth_average: areaRaw.population_growth_average,
      ...Object.fromEntries(areaDomains.flatMap((domain) => {
        const detail = areaDetails[domain];
        return [
          [`area_component_${domain}_score`, detail.score],
          [`area_component_${domain}_weight_pct`, detail.configured_weight_pct],
          [`area_component_${domain}_coverage_pct`, detail.coverage_pct],
        ];
      })),
      ...Object.fromEntries(domains.flatMap((domain) => {
        const detail = domainDetails[domain];
        return [
          [`ses_component_${domain}_score`, detail.score],
          [`ses_component_${domain}_weight_pct`, detail.configured_weight_pct],
          [`ses_component_${domain}_effective_weight_pct`, detail.effective_weight_pct],
          [`ses_component_${domain}_contribution_pct`, detail.contribution_pct],
          [`ses_component_${domain}_coverage_pct`, detail.coverage_pct],
        ];
      })),
      ses_source: "Dukcapil polygon payload",
      ses_note: `SES provisional; domain ekonomi ${domainScores.economic_capacity == null ? "belum terisi" : "terisi"}, konsumsi ${domainScores.consumption == null ? "belum terisi" : "terisi"}, status tanah hak milik ATR/BPN ${row.indicators.freehold_share == null ? "belum tersedia" : "tersedia"}, dan indikator dinormalisasi relatif terhadap wilayah pembanding.`,
      area_potential_note: "Potensi Area memakai indikator permintaan pasar; anak usia 0–5 adalah estimasi dari bucket Dukcapil u0 dan u5, sedangkan hak milik/perumahan padat aktif bila agregat spasial BHUMI tersedia.",
    };

    return {
      ...row.feature,
      properties,
    };
  });

  return {
    type: "FeatureCollection",
    features: calculatedFeatures,
    meta: {
      model: config.version,
      status: config.status,
      label: config.label,
      max_confidence: config.maxConfidence,
      comparison_universe: calculatedFeatures.length,
      domain_weights: config.domainWeights,
      domains,
      indicators: config.indicators.map((indicator) => ({
        ...indicator,
        available: statsByIndicator[indicator.id].count,
        min: statsByIndicator[indicator.id].min,
        max: statsByIndicator[indicator.id].max,
        p05: statsByIndicator[indicator.id].p05,
        p95: statsByIndicator[indicator.id].p95,
      })),
      formula: "Weighted available domain scores; indicators use P5-P95 clipped normalization, missing domains are excluded then reweighted, and ATR/BPN freehold_share contributes to household_housing.",
      limitations: config.limitations,
    },
  };
}

module.exports = {
  calculateSesPolygons,
  calculateSesHexagonGrid,
  extractIndicators,
  publicConfig,
};
