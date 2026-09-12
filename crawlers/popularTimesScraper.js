/**
 * Google Popular Times Scraper
 * 
 * Extracts busy hours data from Google Maps place pages.
 * Data format: { day_name: [hour_0, hour_1, ..., hour_23] }
 * Each value = busyness percentage (0-100), null = no data
 */

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Scrape Popular Times from a Google Maps place page.
 */
async function scrapePopularTimes(page, placeUrl, options = {}) {
  const { waitMs = 2500 } = options;

  try {
    // Navigate to place page
    console.log(`POPULAR_TIMES: Navigating to ${placeUrl.substring(0, 80)}...`);
    await page.goto(placeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    
    // Wait for page to fully load
    await page.waitForTimeout(waitMs);
    
    // Try to scroll down to load Popular Times section
    try {
      await page.evaluate(() => {
        const scrollable = document.querySelector('[role="main"]') || document.documentElement;
        scrollable.scrollTop = scrollable.scrollHeight / 2;
      });
      await page.waitForTimeout(1000);
    } catch (e) {
      // ignore scroll errors
    }

    // Extract Popular Times data from DOM
    const data = await page.evaluate(() => {
      const result = {
        available: false,
        currentBusyLevel: null,
        weeklyData: {},
        todayHours: null,
        debugInfo: {
          title: document.title,
          url: window.location.href,
          foundSections: 0,
          foundBars: 0,
          foundAriaLabels: 0,
        },
      };

      // METHOD 1: Look for bar charts in table[role="presentation"]
      // Google Maps renders Popular Times as a table with 7 rows (days) and 24 cells (hours)
      const tables = document.querySelectorAll('table[role="presentation"]');
      result.debugInfo.foundTables = tables.length;

      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        if (rows.length >= 7 && rows.length <= 8) {
          // Check if this looks like a weekly schedule
          let hasTimeLabels = false;
          let hasBars = false;

          rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 12) {
              hasTimeLabels = true;
            }
            cells.forEach((cell) => {
              if (cell.querySelector('div[style*="height"]') || cell.querySelector('div[aria-label]')) {
                hasBars = true;
              }
            });
          });

          if (hasBars) {
            result.available = true;
            result.debugInfo.foundBars = true;

            rows.forEach((row, dayIndex) => {
              if (dayIndex >= 7) return;
              const dayName = DAY_NAMES_EN[dayIndex];
              const cells = row.querySelectorAll('td');
              const hourlyData = [];

              cells.forEach((cell) => {
                let value = null;

                // Try to get from aria-label
                const ariaLabel = cell.getAttribute('aria-label') || '';
                const busyMatch = ariaLabel.match(/(\d+)%/);
                if (busyMatch) {
                  value = parseInt(busyMatch[1], 10);
                }

                // Try to get from bar height
                if (value === null) {
                  const bar = cell.querySelector('div[style*="height"]');
                  if (bar) {
                    const heightStyle = bar.getAttribute('style') || '';
                    const heightMatch = heightStyle.match(/height:\s*(\d+(?:\.\d+)?)/);
                    if (heightMatch) {
                      value = Math.min(100, Math.round(parseFloat(heightMatch[1])));
                    }
                  }
                }

                // Try to get from aria-label of child div
                if (value === null) {
                  const innerDiv = cell.querySelector('div[aria-label]');
                  if (innerDiv) {
                    const innerLabel = innerDiv.getAttribute('aria-label') || '';
                    const innerMatch = innerLabel.match(/(\d+)%/);
                    if (innerMatch) {
                      value = parseInt(innerMatch[1], 10);
                    }
                  }
                }

                hourlyData.push(value);
              });

              if (hourlyData.length > 0) {
                result.weeklyData[dayName] = hourlyData;
              }
            });
          }
        }
      }

      // METHOD 2: Look for "Popular times" or "Jam sibuk" section
      if (!result.available) {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = (el.textContent || '').trim().toLowerCase();
          if (text === 'popular times' || text === 'jam sibuk' || text === 'waktu ramai') {
            result.debugInfo.foundSections++;
            
            // Look for nearby bar chart
            const parent = el.closest('div[role="region"]') || el.parentElement?.parentElement;
            if (parent) {
              const bars = parent.querySelectorAll('div[aria-label*="%"], div[aria-label*="busy"], div[aria-label*="ramai"]');
              result.debugInfo.foundAriaLabels += bars.length;
              
              bars.forEach((bar) => {
                const label = bar.getAttribute('aria-label') || '';
                const dayMatch = label.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
                const hourMatch = label.match(/(\d{1,2}):(\d{2})/);
                const busyMatch = label.match(/(\d+)%/);

                if (dayMatch && hourMatch && busyMatch) {
                  const day = dayMatch[1];
                  const hour = parseInt(hourMatch[1], 10);
                  const busy = parseInt(busyMatch[1], 10);

                  if (!result.weeklyData[day]) {
                    result.weeklyData[day] = new Array(24).fill(null);
                  }
                  result.weeklyData[day][hour] = busy;
                  result.available = true;
                }
              });
            }
            break;
          }
        }
      }

      // Get current busyness if shown
      const busyNow = document.querySelector('[aria-label*="busy right now"], [aria-label*="ramai saat ini"]');
      if (busyNow) {
        const label = busyNow.getAttribute('aria-label') || '';
        const match = label.match(/(\d+)%/);
        if (match) {
          result.currentBusyLevel = parseInt(match[1], 10);
        }
      }

      return result;
    });

    console.log(`POPULAR_TIMES: Result for ${placeUrl.substring(0, 50)}...`, {
      available: data.available,
      daysFound: Object.keys(data.weeklyData).length,
      debug: data.debugInfo,
    });

    return data.available ? data : null;
  } catch (error) {
    console.error("POPULAR_TIMES_SCRAPE_ERROR:", error.message);
    return null;
  }
}

/**
 * Calculate foot traffic score from popular times data.
 * Score: 0-100 where 100 = highest foot traffic potential
 */
function calculateFootTrafficScore(popularTimes, options = {}) {
  if (!popularTimes || !popularTimes.available) {
    return {
      score: null,
      level: "unknown",
      averageBusyness: null,
      peakHour: null,
      peakDay: null,
      businessHourAvg: null,
      reasoning: "Data popular times tidak tersedia.",
    };
  }

  const weeklyData = popularTimes.weeklyData || {};
  const allDays = Object.values(weeklyData).filter(Array.isArray);
  
  if (allDays.length === 0) {
    return {
      score: null,
      level: "unknown",
      averageBusyness: null,
      peakHour: null,
      peakDay: null,
      businessHourAvg: null,
      reasoning: "Data weekly popular times kosong.",
    };
  }

  let totalSum = 0;
  let totalHours = 0;
  let businessHoursSum = 0;
  let businessHoursCount = 0;
  let peakValue = 0;
  let peakHour = 0;
  let peakDay = "";

  for (const [day, hours] of Object.entries(weeklyData)) {
    if (!Array.isArray(hours)) continue;

    hours.forEach((value, hour) => {
      if (value === null || value === undefined) return;

      totalSum += value;
      totalHours += 1;

      // Business hours (8-20)
      if (hour >= 8 && hour <= 20) {
        businessHoursSum += value;
        businessHoursCount += 1;
      }

      // Track peak
      if (value > peakValue) {
        peakValue = value;
        peakHour = hour;
        peakDay = day;
      }
    });
  }

  const averageBusyness = totalHours > 0 ? Math.round(totalSum / totalHours) : 0;
  const businessHourAvg = businessHoursCount > 0 ? Math.round(businessHoursSum / businessHoursCount) : 0;

  // Score is weighted toward business hours
  let score = Math.round((businessHourAvg * 0.7) + (averageBusyness * 0.3));
  score = Math.min(100, Math.max(0, score));

  // Determine level — thresholds tuned so data spreads across all tiers.
  // Google Popular Times values are 0-100 relative to peak crowd.
  // Typical POIs land 20-60; only event/hotspot POIs reach 70+.
  let level = "low";
  if (score >= 65) level = "very_high";
  else if (score >= 45) level = "high";
  else if (score >= 25) level = "medium";

  const peakHourFormatted = `${String(peakHour).padStart(2, "0")}:00`;

  const levelLabels = { very_high: "Sangat Ramai", high: "Ramai", medium: "Sedang", low: "Sepi" };
  return {
    score,
    level,
    averageBusyness,
    peakHour: peakHourFormatted,
    peakDay,
    businessHourAvg,
    reasoning: `Skor: ${score}% (${levelLabels[level] || level}). Rata-rata kepadatan: ${averageBusyness}%. Jam sibuk: ${peakHourFormatted} (${peakDay}). Business hours avg: ${businessHourAvg}%.`,
  };
}

/**
 * Batch scrape popular times for multiple POIs.
 */
async function batchScrapePopularTimes(page, pois, options = {}) {
  const {
    maxPoIs = 15,
    delayBetweenMs = 1500,
  } = options;

  const results = new Map();
  const toScrape = pois
    .filter((poi) => poi.href || poi.tags?.maps_link || poi.tags?.header_link_raw)
    .slice(0, maxPoIs);

  console.log(`POPULAR_TIMES_BATCH: Scraping ${toScrape.length} POIs...`);

  for (let i = 0; i < toScrape.length; i++) {
    const poi = toScrape[i];
    const url = poi.href || poi.tags?.maps_link || poi.tags?.header_link_raw;
    if (!url) continue;

    const key = `${poi.name}|${poi.lat}|${poi.lon}`;
    console.log(`POPULAR_TIMES_BATCH [${i + 1}/${toScrape.length}]: ${poi.name}`);

    try {
      const data = await scrapePopularTimes(page, url);
      if (data && data.available) {
        const footTraffic = calculateFootTrafficScore(data);
        results.set(key, {
          popularTimes: data,
          footTraffic,
        });
        console.log(`POPULAR_TIMES_BATCH: ✅ ${poi.name} -> score: ${footTraffic.score}`);
      } else {
        console.log(`POPULAR_TIMES_BATCH: ⚠️ ${poi.name} -> no data`);
      }
    } catch (error) {
      console.error(`POPULAR_TIMES_BATCH: ❌ ${poi.name} -> ${error.message}`);
    }

    // Rate limiting
    if (i < toScrape.length - 1 && delayBetweenMs > 0) {
      await page.waitForTimeout(delayBetweenMs);
    }
  }

  console.log(`POPULAR_TIMES_BATCH: Done. ${results.size} POIs enriched.`);
  return results;
}

module.exports = {
  scrapePopularTimes,
  calculateFootTrafficScore,
  batchScrapePopularTimes,
  DAY_NAMES_EN,
};
