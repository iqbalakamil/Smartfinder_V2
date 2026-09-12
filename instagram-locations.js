/**
 * Instagram Location Search - Google Browser Search Approach
 *
 * Uses the project's existing Playwright-based Google Search to find
 * Instagram accounts/pages near a location. No Instagram login needed.
 *
 * Flow:
 *   1. Search Google: site:instagram.com [keyword] [location]
 *   2. Extract Instagram profile/location URLs from results
 *   3. Return as social media POI data
 */

/**
 * Parse Instagram URL to extract profile or location info.
 */
function parseInstagramUrl(url) {
  const str = String(url || "");
  if (!str.includes("instagram.com")) return null;

  // Location page: /explore/locations/{id}/
  const locationMatch = str.match(/instagram\.com\/explore\/locations\/(\d+)/);
  if (locationMatch) {
    return { type: "location", id: locationMatch[1], url: str };
  }

  // Profile page: /{username}/
  const profileMatch = str.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?$/);
  if (profileMatch) {
    const username = profileMatch[1];
    const skip = [
      "p", "reel", "explore", "accounts", "stories", "direct",
      "about", "legal", "privacy", "terms", "directory",
    ];
    if (skip.includes(username.toLowerCase())) return null;
    return { type: "profile", username, url: `https://www.instagram.com/${username}/` };
  }

  return null;
}

/**
 * Build search queries for Instagram near a location.
 */
function buildInstagramSearchQueries(location = {}, keywords = []) {
  const district = location.subdistrict || location.district || "";
  const city = location.city || "";
  const province = location.province || "";
  const areaLabel = [district, city].filter(Boolean).join(" ");
  const areaLabelFull = [district, city, province].filter(Boolean).join(", ");

  const defaultKeywords = [
    "paud",
    "tk",
    "daycare",
    "playground",
    "anak",
    "kids",
    "les anak",
    "komunitas parenting",
  ];

  const extraQueries = [
    `site:instagram.com "Jakarta Selatan" paud tk daycare`,
    `site:instagram.com/explore/locations "Jakarta Selatan"`,
    `site:instagram.com "Jakarta" paud tk daycare playground`,
  ];

  const searchKeywords = keywords.length ? keywords : defaultKeywords;
  const queries = [];

  for (const keyword of searchKeywords.slice(0, 5)) {
    queries.push(`site:instagram.com "${keyword}" "${areaLabel}"`);
  }

  // Also search for Instagram location pages
  queries.push(`site:instagram.com/explore/locations "${city}"`);
  queries.push(`site:instagram.com "${areaLabel}" paud tk`);
  if (areaLabelFull) {
    queries.push(`site:instagram.com "${areaLabelFull}" paud tk daycare playground`);
  }

  const combined = [...queries, ...extraQueries];
  return combined.slice(0, 6);
}

/**
 * Search for Instagram accounts/locations near a specific area.
 * This function is meant to be called with the existing searchExternalResults
 * from server.js.
 *
 * @param {Function} searchFn - The search function (searchExternalResults or similar)
 * @param {Object} location - Location context
 * @param {Array} [keywords] - Custom keywords to search
 * @returns {Promise<Array>} Instagram results
 */
async function searchInstagramNearLocation(searchFn, location = {}, keywords = []) {
  const queries = buildInstagramSearchQueries(location, keywords);
  const allResults = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const results = await searchFn(query, {
        hostFilter: (url) => url.includes("instagram.com"),
      }).catch(() => []);

      for (const result of results) {
        const url = result.url || result.link || "";
        if (seen.has(url)) continue;
        seen.add(url);

        const parsed = parseInstagramUrl(url);
        if (parsed) {
          allResults.push({
            ...parsed,
            url,
            title: result.title || "",
            snippet: result.snippet || "",
          });
        }
      }
    } catch (e) {
      console.error(`INSTAGRAM_SEARCH: Error for "${query}": ${e.message}`);
    }
  }

  console.log(`INSTAGRAM_SEARCH: Found ${allResults.length} Instagram results`);
  if (allResults.length === 0) {
    console.log(`INSTAGRAM_SEARCH: queries=[${queries.map(q => JSON.stringify(q)).join(', ')}]`);
  }
  return allResults;
}

/**
 * Search for Instagram profiles related to specific POIs.
 */
async function searchInstagramForPois(searchFn, pois = [], location = {}) {
  const district = location.subdistrict || location.district || "";
  const city = location.city || "";
  const areaLabel = [district, city].filter(Boolean).join(" ");

  const relevantPois = pois.filter((poi) => {
    const category = poi.category || "";
    const name = (poi.name || "").toLowerCase();
    return (
      category === "education" ||
      category === "family-services" ||
      category === "child-friendly" ||
      /paud|tk|daycare|playground|anak|kids|les|bimbel/i.test(name)
    );
  }).slice(0, 6);

  const allResults = [];
  const seen = new Set();

  for (const poi of relevantPois) {
    const poiName = poi.name || "";
    if (!poiName) continue;

    const query = `site:instagram.com "${poiName}" "${areaLabel}"`;
    try {
      const results = await searchFn(query, {
        hostFilter: (url) => url.includes("instagram.com"),
      }).catch(() => []);

      for (const result of results) {
        const url = result.url || result.link || "";
        if (seen.has(url)) continue;
        seen.add(url);

        const parsed = parseInstagramUrl(url);
        if (parsed) {
          allResults.push({
            ...parsed,
            url,
            title: result.title || "",
            snippet: result.snippet || "",
            poiName,
            poiCategory: poi.category,
          });
        }
      }
    } catch (e) {
      console.error(`INSTAGRAM_POI: Error for "${poiName}": ${e.message}`);
    }
  }

  console.log(`INSTAGRAM_POI: Found ${allResults.length} Instagram results for ${relevantPois.length} POIs`);
  return allResults;
}

/**
 * Normalize Instagram result to POI format compatible with SmartKidz.
 */
function normalizeInstagramPoi(result, location = {}) {
  const district = location.subdistrict || location.district || "";
  const city = location.city || "";

  if (result.type === "location") {
    return {
      name: result.title || `Instagram Location ${result.id}`,
      lat: null,
      lng: null,
      tags: {
        instagram_id: result.id,
        instagram_url: `https://www.instagram.com/explore/locations/${result.id}/`,
        address: [district, city].filter(Boolean).join(", "),
        coord_source: "instagram-google-search",
        source_query: result.poiName || "",
      },
      signal: "social",
      category: "social-media",
      categoryLabel: "Instagram Location",
      source: "instagram-google-search",
    };
  }

  if (result.type === "profile") {
    return {
      name: `@${result.username}`,
      lat: null,
      lng: null,
      tags: {
        instagram_username: result.username,
        instagram_url: `https://www.instagram.com/${result.username}/`,
        address: [district, city].filter(Boolean).join(", "),
        coord_source: "instagram-google-search",
        source_query: result.poiName || "",
        poi_related: result.poiName || "",
        snippet: result.snippet || "",
      },
      signal: "social",
      category: "social-media",
      categoryLabel: "Instagram Profile",
      source: "instagram-google-search",
    };
  }

  return null;
}

module.exports = {
  searchInstagramNearLocation,
  searchInstagramForPois,
  parseInstagramUrl,
  normalizeInstagramPoi,
  buildInstagramSearchQueries,
};
