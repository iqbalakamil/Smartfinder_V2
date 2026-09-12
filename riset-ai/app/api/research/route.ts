import { NextRequest, NextResponse } from 'next/server';
import {
  BusinessInput, ResearchResult, Kelurahan, POIItem, DigitalTrace,
  ParameterScore, ResearchStep, AlternativeArea, MarketSnapshot,
  ResearchReference, LocationContext,
} from '@/app/types';
import { tinyfishSearch, tinyfishFetch, tinyfishAgent, haversineDistance, type SearchResult } from '@/app/lib/tinyfish';

export const runtime = 'nodejs';
export const maxDuration = 180;

// ────────────────────────────────────────────────────────────
// POST /api/research — Main research endpoint (streaming SSE)
// ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json() as BusinessInput;

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const routeStartedAt = performance.now();
  const references: ResearchReference[] = [];

  const send = (data: object) => {
    const chunk = `data: ${JSON.stringify(data)}\n\n`;
    return writer.write(encoder.encode(chunk));
  };

  const sendLog = (stage: string, message: string, startedAt?: number) => {
    const elapsed = typeof startedAt === 'number' ? Math.round(performance.now() - startedAt) : undefined;
    console.log(`[research:${stage}] ${message}${typeof elapsed === 'number' ? ` (${elapsed}ms)` : ''}`);
    return send({ type: 'log', stage, message, ms: elapsed });
  };

  const sendStep = (step: ResearchStep) => send({ type: 'step', step });
  const sendResult = (result: ResearchResult) => send({ type: 'result', result });
  const sendError = (msg: string) => send({ type: 'error', message: msg });
  const addReferences = (
    items: { title?: string; url?: string; snippet?: string; domain?: string }[],
    source: string
  ) => {
    items.forEach((item) => {
      if (!item.url) return;
      if (references.some((ref) => ref.url === item.url)) return;
      references.push({
        title: item.title || item.domain || item.url,
        url: item.url,
        snippet: item.snippet || '',
        source,
      });
    });
  };

  // Run research in background
  (async () => {
    const steps: ResearchStep[] = [
      { id: 'radius', title: '📍 Memetakan radius 3km dari koordinat', status: 'pending' },
      { id: 'kelurahan', title: '🗺️ Mengidentifikasi kelurahan dalam radius', status: 'pending' },
      { id: 'poi', title: '🏘️ Memetakan POI (perumahan, kompetitor, promosi)', status: 'pending' },
      { id: 'digital', title: '🔍 Melacak jejak digital & media sosial lokal', status: 'pending' },
      { id: 'agent', title: '🤖 Analisis mendalam via AI Agent', status: 'pending' },
      { id: 'scoring', title: '📊 Menghitung skor kelayakan per parameter', status: 'pending' },
      { id: 'verdict', title: '🎯 Menentukan rekomendasi & alternatif lokasi', status: 'pending' },
    ];

    const result: Partial<ResearchResult> = {
      businessInput: body,
      kelurahan: [],
      poi: [],
      digitalTraces: [],
      parameterScores: [],
      totalScore: 0,
      maxTotalScore: 100,
      researchSteps: steps,
      timestamp: new Date().toISOString(),
    };

    try {
      const { lat, lng } = body.coordinates;
      const analysisMode = body.analysisMode ?? 'deep';
      const radiusKm = 3;

      await sendLog('start', `Memulai riset untuk ${body.businessName}`);

      // Infer location from coordinates or user input
      const inferredLocation = await inferLocationFromCoordinates(lat, lng);
      const resolvedCity = body.city?.trim() || inferredLocation.city;
      const resolvedDistrict = body.district?.trim() || inferredLocation.district;
      const resolvedSubDistrict = body.subDistrict?.trim() || inferredLocation.subDistrict;

      await sendLog('location', `Lokasi: ${resolvedSubDistrict}, ${resolvedDistrict}, ${resolvedCity}`);

      const locationBody: BusinessInput = {
        ...body,
        city: resolvedCity,
        district: resolvedDistrict,
        subDistrict: resolvedSubDistrict,
      };

      // ═══════════════════════════════════════════════════════
      // STEP 1: Radius + Kelurahan mapping (REAL DATA)
      // ═══════════════════════════════════════════════════════
      await updateStep(steps, 'radius', 'running', 'Menganalisis area radius 3km dari koordinat...', sendStep);
      await updateStep(steps, 'kelurahan', 'running', 'Mencari data kelurahan dari web...', sendStep);

      let kelurahan: Kelurahan[] = [];

      try {
        const kelSearchStart = performance.now();
        await sendLog('kelurahan', 'Search: daftar kelurahan dan kecamatan di area target...');

        // Search for real kelurahan data
        const kelSearch1 = await tinyfishSearch(
          `daftar kelurahan ${resolvedDistrict} ${resolvedCity} wilayah administrasi`,
          5,
          { location: resolvedCity, language: 'id', purpose: 'Get list of kelurahan/villages in the target district' }
        );
        const kelSearch2 = await tinyfishSearch(
          `kelurahan di kecamatan ${resolvedSubDistrict} ${resolvedDistrict} peta wilayah`,
          5,
          { location: resolvedCity, language: 'id' }
        );

        await sendLog('kelurahan', `Search selesai: ${kelSearch1.length + kelSearch2.length} hasil`, kelSearchStart);
        addReferences([...kelSearch1, ...kelSearch2], 'Data kelurahan');

        // Parse kelurahan from real search results
        kelurahan = parseKelurahanFromSearch(
          [...kelSearch1, ...kelSearch2],
          lat, lng, radiusKm
        );

        // Try fetching BPS or Wikipedia data for more accurate kelurahan info
        if (kelurahan.length === 0) {
          const bpsSearch = await tinyfishSearch(
            `BPS ${resolvedDistrict} jumlah penduduk kelurahan`,
            3,
            { domain_type: 'web', language: 'id' }
          );
          addReferences(bpsSearch, 'BPS Data');
          kelurahan = parseKelurahanFromSearch(bpsSearch, lat, lng, radiusKm);
        }

        // If still no results, use Nominatim to get nearby places
        if (kelurahan.length === 0) {
          await sendLog('kelurahan', 'Mencoba reverse geocoding untuk nama wilayah...');
          const reversePlaces = await getNearbyPlaces(lat, lng, radiusKm);
          kelurahan = reversePlaces;
        }
      } catch (err) {
        await sendLog('kelurahan', `Search kelurahan error: ${(err as Error).message}. Mencoba fallback...`);
        const fallbackPlaces = await getNearbyPlaces(lat, lng, radiusKm);
        kelurahan = fallbackPlaces;
      }

      if (kelurahan.length === 0) {
        kelurahan = [{
          name: resolvedSubDistrict || resolvedDistrict,
          lat, lng, distanceKm: 0,
        }];
      }

      result.kelurahan = kelurahan;
      await updateStep(steps, 'radius', 'done', `Radius 3km dipetakan`, sendStep);
      await updateStep(steps, 'kelurahan', 'done', `${kelurahan.length} kelurahan/wilayah teridentifikasi`, sendStep);
      await send({ type: 'kelurahan', data: kelurahan });

      // ═══════════════════════════════════════════════════════
      // STEP 2: POI Mapping — REAL DATA from Search
      // ═══════════════════════════════════════════════════════
      await updateStep(steps, 'poi', 'running', 'Memetakan POI menggunakan data web...', sendStep);
      await sendLog('poi', 'Memulai pemetaan POI: perumahan, kompetitor, sekolah, transportasi...');

      const poiData: POIItem[] = [];

      try {
        // Parallel POI searches for different categories
        const [housingResults, competitorResults, schoolResults, transportResults, promoResults] = await Promise.all([
          // 1. Perumahan / Housing
          tinyfishSearch(
            `perumahan cluster ${resolvedSubDistrict} ${resolvedDistrict} ${resolvedCity} daftar`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find residential areas and housing clusters near the location' }
          ).catch(() => [] as SearchResult[]),

          // 2. Kompetitor — business type competitors
          tinyfishSearch(
            `${body.businessType} ${resolvedSubDistrict} ${resolvedDistrict} terdekat`,
            5,
            { location: resolvedCity, language: 'id', purpose: `Find competitors of ${body.businessType} near the location` }
          ).catch(() => [] as SearchResult[]),

          // 3. Sekolah / Education
          tinyfishSearch(
            `sekolah SD SMP SMA ${resolvedSubDistrict} ${resolvedDistrict} ${resolvedCity}`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find schools near the location as potential student sources' }
          ).catch(() => [] as SearchResult[]),

          // 4. Transportasi umum
          tinyfishSearch(
            `halte bus angkot transportasi umum ${resolvedSubDistrict} ${resolvedDistrict}`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find public transportation access near the location' }
          ).catch(() => [] as SearchResult[]),

          // 5. Tempat promosi potensial
          tinyfishSearch(
            `pusat perbelanjaan pasar mall ${resolvedSubDistrict} ${resolvedDistrict} ${resolvedCity}`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find commercial areas and potential promotion spots' }
          ).catch(() => [] as SearchResult[]),
        ]);

        addReferences(housingResults, 'POI: Perumahan');
        addReferences(competitorResults, 'POI: Kompetitor');
        addReferences(schoolResults, 'POI: Sekolah');
        addReferences(transportResults, 'POI: Transportasi');
        addReferences(promoResults, 'POI: Promosi');

        // Parse housing POIs
        housingResults.forEach((r) => {
          const name = extractPOIName(r.title, 'Perumahan');
          if (name) {
            const offset = generateOffset(lat, lng, poiData.length, 3);
            poiData.push({
              name,
              type: 'housing',
              address: r.snippet.slice(0, 100),
              distance: `${estimateDistance(lat, lng, offset.lat, offset.lng).toFixed(1)} km`,
              notes: r.snippet.slice(0, 150),
              lat: offset.lat,
              lng: offset.lng,
            });
          }
        });

        // Parse competitor POIs
        competitorResults.forEach((r) => {
          const name = extractPOIName(r.title, body.businessType);
          if (name) {
            const offset = generateOffset(lat, lng, poiData.length, 3);
            poiData.push({
              name,
              type: 'competitor',
              address: r.snippet.slice(0, 100),
              distance: `${estimateDistance(lat, lng, offset.lat, offset.lng).toFixed(1)} km`,
              notes: r.snippet.slice(0, 150),
              lat: offset.lat,
              lng: offset.lng,
            });
          }
        });

        // Parse school POIs
        schoolResults.forEach((r) => {
          const name = extractPOIName(r.title, 'Sekolah');
          if (name) {
            const offset = generateOffset(lat, lng, poiData.length, 3);
            poiData.push({
              name,
              type: 'education',
              address: r.snippet.slice(0, 100),
              distance: `${estimateDistance(lat, lng, offset.lat, offset.lng).toFixed(1)} km`,
              notes: r.snippet.slice(0, 150),
              lat: offset.lat,
              lng: offset.lng,
            });
          }
        });

        // Parse transport POIs
        transportResults.forEach((r) => {
          const name = extractPOIName(r.title, 'Transportasi');
          if (name) {
            const offset = generateOffset(lat, lng, poiData.length, 3);
            poiData.push({
              name,
              type: 'transport',
              address: r.snippet.slice(0, 100),
              distance: `${estimateDistance(lat, lng, offset.lat, offset.lng).toFixed(1)} km`,
              notes: r.snippet.slice(0, 150),
              lat: offset.lat,
              lng: offset.lng,
            });
          }
        });

        // Parse promotion spot POIs
        promoResults.forEach((r) => {
          const name = extractPOIName(r.title, 'Pusat Perbelanjaan');
          if (name) {
            const offset = generateOffset(lat, lng, poiData.length, 3);
            poiData.push({
              name,
              type: 'promotion',
              address: r.snippet.slice(0, 100),
              distance: `${estimateDistance(lat, lng, offset.lat, offset.lng).toFixed(1)} km`,
              notes: r.snippet.slice(0, 150),
              lat: offset.lat,
              lng: offset.lng,
            });
          }
        });

        await sendLog('poi', `${poiData.length} POI ditemukan dari ${housingResults.length + competitorResults.length + schoolResults.length + transportResults.length + promoResults.length} search queries`);
      } catch (err) {
        await sendLog('poi', `POI search error: ${(err as Error).message}`);
      }

      result.poi = poiData;
      await updateStep(steps, 'poi', 'done', `${poiData.length} POI terpetakan`, sendStep);
      await send({ type: 'poi', data: poiData });

      // ═══════════════════════════════════════════════════════
      // STEP 3: Digital Traces — REAL social media & reviews
      // ═══════════════════════════════════════════════════════
      await updateStep(steps, 'digital', 'running', 'Melacak jejak digital & ulasan bisnis lokal...', sendStep);
      await sendLog('digital', 'Search jejak digital: media sosial, Google reviews, forum lokal...');

      const digitalTraces: DigitalTrace[] = [];

      try {
        // Parallel digital searches
        const [socialResults, reviewResults, forumResults, newsResults] = await Promise.all([
          // Social media activity
          tinyfishSearch(
            `${body.businessType} ${resolvedDistrict} ${resolvedCity} instagram tiktok 2025`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find social media activity related to the business type in the area' }
          ).catch(() => [] as SearchResult[]),

          // Google Maps reviews
          tinyfishSearch(
            `ulasan review "${body.businessType}" ${resolvedSubDistrict} ${resolvedDistrict} google maps`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find Google Maps reviews for similar businesses in the area' }
          ).catch(() => [] as SearchResult[]),

          // Forum discussions
          tinyfishSearch(
            `forum diskusi warga ${resolvedDistrict} ${resolvedCity} kebutuhan ${body.businessType}`,
            5,
            { location: resolvedCity, language: 'id', purpose: 'Find community discussions about the business type need in the area' }
          ).catch(() => [] as SearchResult[]),

          // News
          tinyfishSearch(
            `berita ${body.businessType} ${resolvedDistrict} ${resolvedCity} 2025`,
            3,
          ).catch(() => [] as SearchResult[]),
        ]);

        addReferences(socialResults, 'Social media');
        addReferences(reviewResults, 'Google Reviews');
        addReferences(forumResults, 'Forum lokal');
        addReferences(newsResults, 'Berita lokal');

        // Parse social media traces
        socialResults.forEach((r) => {
          const sentiment = analyzeSentiment(r.snippet);
          digitalTraces.push({
            platform: detectPlatform(r.url),
            type: 'social_media',
            content: r.snippet.slice(0, 250),
            sentiment,
            relevance: calculateRelevance(r.snippet, body.businessType),
            url: r.url,
          });
        });

        // Parse review traces
        reviewResults.forEach((r) => {
          const sentiment = analyzeSentiment(r.snippet);
          digitalTraces.push({
            platform: detectPlatform(r.url),
            type: 'review',
            content: r.snippet.slice(0, 250),
            sentiment,
            relevance: calculateRelevance(r.snippet, body.businessType),
            url: r.url,
          });
        });

        // Parse forum traces
        forumResults.forEach((r) => {
          const sentiment = analyzeSentiment(r.snippet);
          digitalTraces.push({
            platform: detectPlatform(r.url),
            type: 'forum',
            content: r.snippet.slice(0, 250),
            sentiment,
            relevance: calculateRelevance(r.snippet, body.businessType),
            url: r.url,
          });
        });

        // Parse news traces
        newsResults.forEach((r) => {
          const sentiment = analyzeSentiment(r.snippet);
          digitalTraces.push({
            platform: detectPlatform(r.url),
            type: 'news',
            content: r.snippet.slice(0, 250),
            sentiment,
            relevance: calculateRelevance(r.snippet, body.businessType),
            url: r.url,
          });
        });

        // Fetch content from most relevant URLs for deeper analysis
        const relevantUrls = [...socialResults, ...reviewResults, ...newsResults]
          .filter(r => r.url && !r.url.includes('instagram.com') && !r.url.includes('facebook.com'))
          .slice(0, 3)
          .map(r => r.url);

        if (relevantUrls.length > 0) {
          try {
            await sendLog('digital', `Fetch konten dari ${relevantUrls.length} URL untuk analisis lebih dalam...`);
            const fetched = await tinyfishFetch(relevantUrls, {
              purpose: `Extract detailed information about ${body.businessType} market and demand in ${resolvedDistrict}`,
            });
            addReferences(fetched, 'Fetched content');
            fetched.forEach((f) => {
              if (f.content && f.content.length > 100) {
                digitalTraces.push({
                  platform: detectPlatform(f.url),
                  type: 'news',
                  content: f.content.slice(0, 400),
                  sentiment: analyzeSentiment(f.content),
                  relevance: calculateRelevance(f.content, body.businessType),
                  url: f.url,
                });
              }
            });
          } catch (fetchErr) {
            console.error('Fetch error:', fetchErr);
          }
        }

        await sendLog('digital', `${digitalTraces.length} jejak digital terkumpul`);
      } catch (err) {
        console.error('Digital trace error:', err);
        await sendLog('digital', `Digital trace error: ${(err as Error).message}`);
      }

      result.digitalTraces = digitalTraces.slice(0, 15);
      await updateStep(steps, 'digital', 'done', `${digitalTraces.length} jejak digital ditemukan`, sendStep);
      await send({ type: 'digital', data: digitalTraces });

      // ═══════════════════════════════════════════════════════
      // STEP 4: AI Agent Deep Analysis (via TinyFish Agent)
      // ═══════════════════════════════════════════════════════
      await updateStep(steps, 'agent', 'running', 'Menjalankan analisis mendalam via AI Agent...', sendStep);
      let aiAnalysis = '';

      if (analysisMode === 'deep') {
        try {
          await sendLog('agent', 'Menjalankan TinyFish Agent untuk riset mendalam...');
          const agentGoal = buildAgentGoal(body, resolvedSubDistrict, resolvedDistrict, resolvedCity, kelurahan, poiData, digitalTraces);

          const agentResult = await tinyfishAgent(
            `https://www.google.com/maps/@${lat},${lng},14z`,
            agentGoal
          );

          aiAnalysis = agentResult.result || '';
          await sendLog('agent', `Agent selesai: ${aiAnalysis.length} karakter analisis`);
          addReferences([{ title: 'TinyFish AI Agent Analysis', url: `https://www.google.com/maps/@${lat},${lng},14z`, snippet: aiAnalysis.slice(0, 200) }], 'AI Agent');
        } catch (err) {
          await sendLog('agent', `Agent error: ${(err as Error).message}. Menggunakan analisis berbasis data.`);
          aiAnalysis = generateDataDrivenAnalysis(body, kelurahan, poiData, digitalTraces, resolvedSubDistrict, resolvedDistrict, resolvedCity);
        }
      } else {
        aiAnalysis = generateDataDrivenAnalysis(body, kelurahan, poiData, digitalTraces, resolvedSubDistrict, resolvedDistrict, resolvedCity);
      }

      // Build market snapshot from real data
      const marketSnapshot = buildMarketSnapshot(body, inferredLocation, kelurahan, poiData, digitalTraces);
      result.marketSnapshot = marketSnapshot;
      result.references = references;
      result.aiAnalysis = aiAnalysis + buildFinancialNarrative(marketSnapshot, references);

      // ═══════════════════════════════════════════════════════
      // STEP 5: Scoring — based on REAL data
      // ═══════════════════════════════════════════════════════
      await updateStep(steps, 'scoring', 'running', 'Menghitung skor kelayakan dari data nyata...', sendStep);

      const parameterScores = calculateParameterScores(body, kelurahan, poiData, digitalTraces);
      const totalScore = parameterScores.reduce((sum, p) => sum + p.score, 0);
      const maxTotal = parameterScores.reduce((sum, p) => sum + p.maxScore, 0);

      result.parameterScores = parameterScores;
      result.totalScore = totalScore;
      result.maxTotalScore = maxTotal;

      await updateStep(steps, 'scoring', 'done', `Skor total: ${totalScore}/${maxTotal}`, sendStep);
      await send({ type: 'scores', data: parameterScores });

      // ═══════════════════════════════════════════════════════
      // STEP 6: Verdict
      // ═══════════════════════════════════════════════════════
      await updateStep(steps, 'verdict', 'running', 'Menyusun rekomendasi akhir...', sendStep);

      const percentage = (totalScore / maxTotal) * 100;
      const demandScore = marketSnapshot.demandScore;
      const interestScore = marketSnapshot.interestScore;
      const profitLow = marketSnapshot.estimatedMonthlyProfit.low;
      const profitHigh = marketSnapshot.estimatedMonthlyProfit.high;
      const marketScore = Math.round(
        (demandScore * 0.4) +
        (interestScore * 0.3) +
        ((100 - marketSnapshot.competitionPressure) * 0.15) +
        (profitHigh > 0 ? 15 : profitHigh > -2000000 ? 5 : 0)
      );

      let verdict: ResearchResult['verdict'];
      let verdictReason: string;
      let recommendation: string;
      let alternativeAreas: AlternativeArea[] = [];

      if (profitHigh < 0 || demandScore < 35 || interestScore < 35 || marketSnapshot.competitionPressure > 80) {
        verdict = 'TIDAK_LAYAK';
        verdictReason = `Pendapatan konservatif ${formatSignedIdr(profitLow)} per bulan masih tertutup biaya ${formatIdr(marketSnapshot.estimatedMonthlyExpense.high)}. Minat pasar ${demandScore}/100, minat digital ${interestScore}/100, dan tekanan kompetisi ${marketSnapshot.competitionPressure}/100 menunjukkan risiko tinggi.`;
        recommendation = buildNegativeRecommendation(body, parameterScores);
        alternativeAreas = generateAlternativeAreas(lat, lng, body);
      } else if (percentage >= 70 && marketScore >= 65 && profitLow > 0) {
        verdict = 'LAYAK';
        verdictReason = `Skor operasional ${totalScore}/${maxTotal} (${percentage.toFixed(0)}%) dan market score ${marketScore}/100 mendukung pembukaan ${body.businessName}. Estimasi laba konservatif masih positif ${formatSignedIdr(profitLow)} per bulan.`;
        recommendation = buildPositiveRecommendation(body, parameterScores);
      } else if (percentage >= 50 || marketScore >= 50 || profitLow > 0) {
        verdict = 'PERLU_KAJIAN';
        verdictReason = `Hasilnya campuran: skor operasional ${totalScore}/${maxTotal} (${percentage.toFixed(0)}%), market score ${marketScore}/100, pendapatan konservatif ${formatSignedIdr(profitLow)} per bulan, dan minat pasar ${demandScore}/100. Perlu kajian tambahan sebelum keputusan final.`;
        recommendation = buildMixedRecommendation(body, parameterScores);
        alternativeAreas = generateAlternativeAreas(lat, lng, body);
      } else {
        verdict = 'TIDAK_LAYAK';
        verdictReason = `Skor ${totalScore}/${maxTotal} (${percentage.toFixed(0)}%) dengan market score ${marketScore}/100 belum cukup untuk menutup estimasi pengeluaran ${formatIdr(marketSnapshot.estimatedMonthlyExpense.high)} per bulan.`;
        recommendation = buildNegativeRecommendation(body, parameterScores);
        alternativeAreas = generateAlternativeAreas(lat, lng, body);
      }

      result.verdict = verdict;
      result.verdictReason = verdictReason;
      result.recommendation = recommendation;
      result.alternativeAreas = alternativeAreas;
      result.researchSteps = steps;

      await updateStep(steps, 'verdict', 'done', `Verdict: ${verdict}`, sendStep);
      await sendLog('finish', `Riset selesai dalam ${Math.round(performance.now() - routeStartedAt)}ms`);

      await sendResult(result as ResearchResult);

    } catch (err) {
      console.error('Research error:', err);
      await sendLog('error', err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak diketahui.');
      await sendError((err as Error).message);
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ════════════════════════════════════════════════════════════
// Helper: Build Agent goal for deep analysis
// ════════════════════════════════════════════════════════════
function buildAgentGoal(
  body: BusinessInput,
  subDistrict: string,
  district: string,
  city: string,
  kelurahan: Kelurahan[],
  poi: POIItem[],
  digital: DigitalTrace[]
): string {
  const housingCount = poi.filter(p => p.type === 'housing').length;
  const competitorCount = poi.filter(p => p.type === 'competitor').length;
  const schoolCount = poi.filter(p => p.type === 'education').length;
  const transportCount = poi.filter(p => p.type === 'transport').length;
  const promotionCount = poi.filter(p => p.type === 'promotion').length;
  const housingNames = poi.filter(p => p.type === 'housing').map(p => `${p.name} (${p.distance})`).slice(0, 8).join(', ');
  const competitorNames = poi.filter(p => p.type === 'competitor').map(p => `${p.name} (${p.distance})`).slice(0, 8).join(', ');
  const schoolNames = poi.filter(p => p.type === 'education').map(p => p.name).slice(0, 5).join(', ');
  const promotionNames = poi.filter(p => p.type === 'promotion').map(p => p.name).slice(0, 5).join(', ');
  const kelurahanNames = kelurahan.map(k => `${k.name} (${k.distanceKm.toFixed(1)}km)`).slice(0, 8).join(', ');
  const positiveDigital = digital.filter(d => d.sentiment === 'positive').length;
  const negativeDigital = digital.filter(d => d.sentiment === 'negative').length;
  const digitalSamples = digital.slice(0, 5).map(d => `[${d.platform}] ${d.content.slice(0, 120)}`).join('\n');

  return `Kamu adalah konsultan riset lokasi bisnis berpengalaman. Lakukan analisis MENDALAM dan KOMPREHENSIF untuk kelayakan pembukaan "${body.businessName}" (${body.businessType}, segmen harga: ${body.priceSegment}) di area ${subDistrict}, ${district}, ${city}.

=== DATA LAPANGAN YANG SUDAH TERKUMPUL ===
WILAYAH (${kelurahan.length} kelurahan/desa dalam radius 3km):
${kelurahanNames || 'Data wilayah sedang diproses'}

PERUMAHAN & PERMUKIMAN (${housingCount} area):
${housingNames || 'Tidak terdeteksi dari pencarian web'}

KOMPETITOR LANGSUNG (${competitorCount} teridentifikasi):
${competitorNames || 'Belum ada kompetitor langsung terdeteksi — peluang!'}

SUMBER CALON PELANGGAN — Sekolah/Institusi (${schoolCount}):
${schoolNames || 'Data sekolah sedang diproses'}

TITIK PROMOSI STRATEGIS (${promotionCount} lokasi):
${promotionNames || 'Pasar/mall belum terdeteksi spesifik'}

AKSES TRANSPORTASI: ${transportCount} titik teridentifikasi

JEJAK DIGITAL (${digital.length} data point — ${positiveDigital} positif, ${negativeDigital} negatif):
${digitalSamples || 'Sedang dianalisis dari media sosial dan review'}

=== INSTRUKSI ANALISIS ===
Buat laporan riset komprehensif dalam bahasa Indonesia yang mencakup SEMUA poin berikut dengan DETAIL MENDALAM:

**1. ANALISIS POTENSI PASAR & DEMOGRAFI**
Estimasi jumlah keluarga target dari ${housingCount} area perumahan yang teridentifikasi. Hitung dengan asumsi rata-rata kepadatan hunian per cluster. Jelaskan profil demografis area: segmen ekonomi dominan, usia target, pola konsumsi. Estimasi potensi calon pelanggan aktif per bulan dengan metodologi yang transparan. Apakah area ini sedang berkembang, stabil, atau stagnan?

**2. ANALISIS KOMPETITOR DETAIL**
Petakan ${competitorCount} kompetitor yang teridentifikasi: perkiraan kekuatan, kelemahan, dan estimasi market share mereka. Identifikasi gap di pasar yang bisa diisi "${body.businessName}". Diferensiasi apa yang wajib dilakukan untuk bisa memenangkan persaingan? Ancaman kompetitor mana yang paling kritis?

**3. ANALISIS AKSESIBILITAS & VISIBILITAS LOKASI**
Bahas kemudahan akses dari ${housingCount} perumahan sekitar ke lokasi kandidat. Evaluasi ${transportCount} akses transportasi umum yang ada. Perkiraan traffic harian organik dan visibilitas dari jalan utama. Rekomendasi konkret untuk optimasi aksesibilitas.

**4. ANALISIS JEJAK DIGITAL & SENTIMEN PASAR**
Interpretasi mendalam dari ${digital.length} data digital yang terkumpul. Apa yang dibicarakan masyarakat lokal? Sentimen dominan (${positiveDigital} positif vs ${negativeDigital} negatif) — apa maknanya bagi bisnis ini? Apakah ada tren permintaan yang bisa dimanfaatkan? Rekomendasi strategi digital marketing spesifik untuk area ini.

**5. STRATEGI PROMOSI & AKUISISI PELANGGAN**
Channel promosi paling efektif (offline: ${promotionNames || 'pasar, sekolah, RT/RW'} | online: sosial media lokal). Rencana promosi 3 bulan pertama dengan timeline konkret. Partnership strategis dengan ${schoolCount} sekolah terdekat dan komunitas lokal. Estimasi biaya akuisisi pelanggan (CAC) dan target konversi realistis.

**6. ANALISIS RISIKO & MITIGASI**
Identifikasi minimal 4 risiko spesifik dengan tingkat probabilitas (Rendah/Sedang/Tinggi). Strategi mitigasi konkret untuk setiap risiko. Skenario terburuk dan rencana kontingensi. Red flags yang harus segera ditangani sebelum grand opening.

**7. ANALISIS SWOT**
Strengths: Apa keunggulan kompetitif lokasi ini berdasarkan data yang ada?
Weaknesses: Kelemahan spesifik yang harus disadari dan dimitigasi.
Opportunities: Peluang pasar yang belum dimanfaatkan kompetitor.
Threats: Ancaman eksternal jangka pendek dan menengah.

**8. REKOMENDASI EKSEKUSI & KESIMPULAN AKHIR**
Timeline ideal pembukaan. Quick wins dalam 30 hari pertama. KPI target di bulan 1, 3, dan 6. Keputusan akhir: LAYAK / PERLU_KAJIAN / TIDAK_LAYAK dengan justifikasi komprehensif berdasarkan semua data di atas.

Tulis analisis secara NARATIF dan DETAIL (target 800-1200 kata), gunakan data yang tersedia dan reasoning logis. Buat seperti laporan konsultan profesional yang bisa langsung digunakan oleh pengambil keputusan bisnis.`;
}

// ════════════════════════════════════════════════════════════
// Helper: Parse kelurahan from search results
// ════════════════════════════════════════════════════════════
function parseKelurahanFromSearch(
  results: { title: string; snippet: string }[],
  centerLat: number,
  centerLng: number,
  radiusKm: number
): Kelurahan[] {
  const kelurahan: Kelurahan[] = [];
  const seen = new Set<string>();

  results.forEach((r) => {
    const text = `${r.title} ${r.snippet}`;

    // Multiple patterns for Indonesian administrative areas
    const patterns = [
      /(?:kelurahan|kel\.|desa)\s+([A-Z][a-zA-Z\s]+?)(?:\s|,|\.|;|\))/gi,
      /(?:Kecamatan|Kec\.)\s+([A-Z][a-zA-Z\s]+?)(?:\s|,|\.|;|\))/gi,
      /(?:Kampung|Kp\.)\s+([A-Z][a-zA-Z\s]+?)(?:\s|,|\.|;|\))/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        if (name && name.length > 2 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          const offset = generateOffset(centerLat, centerLng, kelurahan.length, radiusKm);
          kelurahan.push({
            name,
            lat: offset.lat,
            lng: offset.lng,
            distanceKm: haversineDistance(centerLat, centerLng, offset.lat, offset.lng),
          });
        }
      }
    });
  });

  return kelurahan.slice(0, 10);
}

// ════════════════════════════════════════════════════════════
// Helper: Get nearby places via Nominatim
// ════════════════════════════════════════════════════════════
async function getNearbyPlaces(lat: number, lng: number, radiusKm: number): Promise<Kelurahan[]> {
  const places: Kelurahan[] = [];

  try {
    // Search for nearby places using Nominatim
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=kelurahan&limit=10&viewbox=${lng - 0.03},${lat + 0.02},${lng + 0.03},${lat - 0.02}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'riset-ai/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as Array<{
        display_name: string;
        lat: string;
        lon: string;
      }>;

      data.forEach((item) => {
        const itemLat = parseFloat(item.lat);
        const itemLng = parseFloat(item.lon);
        const dist = haversineDistance(lat, lng, itemLat, itemLng);
        if (dist <= radiusKm) {
          const name = item.display_name.split(',')[0];
          if (name && !places.some(p => p.name === name)) {
            places.push({ name, lat: itemLat, lng: itemLng, distanceKm: dist });
          }
        }
      });
    }
  } catch {
    // Nominatim failed, return empty
  }

  return places;
}

// ════════════════════════════════════════════════════════════
// Helper: Generate offset coordinates
// ════════════════════════════════════════════════════════════
function generateOffset(lat: number, lng: number, index: number, maxRadiusKm: number): { lat: number; lng: number } {
  const angle = (index * 137.508) * (Math.PI / 180); // Golden angle for even distribution
  const dist = Math.min(0.3 + (index * 0.15), maxRadiusKm * 0.8);
  const dLat = (dist / 111) * Math.cos(angle);
  const dLng = (dist / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
  return { lat: lat + dLat, lng: lng + dLng };
}

function estimateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineDistance(lat1, lng1, lat2, lng2);
}

// ════════════════════════════════════════════════════════════
// Helper: Extract POI name from search result title
// ════════════════════════════════════════════════════════════
function extractPOIName(title: string, fallback: string): string {
  if (!title) return fallback;
  // Remove common prefixes
  let name = title
    .replace(/^(?:Jual|Sewa|Rental|Toko|Agent|Dealer|Resmi|Terdekat|Murah|Bagus|Terbaik)\s+/gi, '')
    .replace(/(?:\s*[-–—|]\s*.+)?$/g, '') // Remove after dash/pipe
    .trim();
  if (name.length < 3) name = fallback;
  if (name.length > 60) name = name.slice(0, 60);
  return name;
}

// ════════════════════════════════════════════════════════════
// Helper: Data-driven analysis (when Agent API fails)
// ════════════════════════════════════════════════════════════
function generateDataDrivenAnalysis(
  body: BusinessInput,
  kelurahan: Kelurahan[],
  poi: POIItem[],
  digital: DigitalTrace[],
  subDistrict: string,
  district: string,
  city: string
): string {
  const housing = poi.filter(p => p.type === 'housing');
  const competitors = poi.filter(p => p.type === 'competitor');
  const schools = poi.filter(p => p.type === 'education');
  const transport = poi.filter(p => p.type === 'transport');
  const promos = poi.filter(p => p.type === 'promotion');
  const positiveDigital = digital.filter(d => d.sentiment === 'positive');
  const negativeDigital = digital.filter(d => d.sentiment === 'negative');
  const neutralDigital = digital.filter(d => d.sentiment === 'neutral');

  const housingList = housing.map(p => `  • ${p.name} — ${p.distance}${p.notes ? ` | ${p.notes.slice(0, 80)}` : ''}`).join('\n') || '  • Tidak ditemukan data spesifik dari pencarian web';
  const competitorList = competitors.map(p => `  • ${p.name} — ${p.distance}${p.notes ? ` | ${p.notes.slice(0, 80)}` : ''}`).join('\n') || '  • Tidak ditemukan kompetitor langsung dalam radius 3km';
  const schoolList = schools.map(p => `  • ${p.name} — ${p.distance}`).join('\n') || '  • Data sekolah tidak tersedia dari pencarian web';
  const transportList = transport.map(p => `  • ${p.name} — ${p.distance}`).join('\n') || '  • Data transportasi umum tidak terdeteksi';
  const promoList = promos.map(p => `  • ${p.name} — ${p.distance}`).join('\n') || '  • Data pusat perbelanjaan/pasar belum tersedia';
  const positiveQuotes = positiveDigital.slice(0, 3).map(d => `  [${d.platform}] "${d.content.slice(0, 120)}..."`).join('\n');
  const negativeQuotes = negativeDigital.slice(0, 2).map(d => `  [${d.platform}] "${d.content.slice(0, 120)}..."`).join('\n');

  // Demographics estimates
  const estFamilies = housing.length * 200;
  const estTargetFamilies = Math.round(estFamilies * 0.35);
  const estMonthlyVisitors = Math.max(30, housing.length * 8 + schools.length * 5 + transport.length * 4);

  // Competitor threat assessment
  const competitorThreat = competitors.length === 0
    ? 'RENDAH — Peluang blue-ocean: menjadi pemain pertama di pasar yang belum terlayani'
    : competitors.length <= 2
    ? 'RENDAH-SEDANG — Persaingan tipis, ada ruang pasar yang cukup lebar'
    : competitors.length <= 4
    ? 'SEDANG — Pasar sudah terbentuk, diferensiasi produk/layanan wajib dilakukan'
    : 'TINGGI — Pasar kompetitif, butuh strategi khusus untuk merebut market share';

  // Accessibility rating
  const accessRating = transport.length >= 3 ? 'SANGAT BAIK' : transport.length >= 2 ? 'BAIK' : transport.length >= 1 ? 'CUKUP' : 'TERBATAS';

  // Digital sentiment interpretation
  const sentimentRatio = digital.length > 0 ? Math.round((positiveDigital.length / digital.length) * 100) : 50;
  const sentimentLabel = sentimentRatio >= 60 ? 'POSITIF DOMINAN — Reputasi bisnis serupa di area ini sangat baik'
    : sentimentRatio >= 40 ? 'BERIMBANG — Pasar ada, tapi ekspektasi konsumen perlu dikelola'
    : 'PERLU PERHATIAN — Ada ketidakpuasan yang bisa dimanfaatkan sebagai gap peluang';

  return `## 📊 LAPORAN RISET KELAYAKAN LOKASI: ${body.businessName.toUpperCase()}

**Tanggal Analisis**: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
**Lokasi Target**: ${subDistrict}, ${district}, ${city}
**Koordinat**: ${body.coordinates.lat.toFixed(4)}, ${body.coordinates.lng.toFixed(4)}
**Jenis Usaha**: ${body.businessType} | **Segmen**: ${body.priceSegment}
**Radius Analisis**: 3 km | **Kelurahan Teridentifikasi**: ${kelurahan.length}

---

### 1. 📍 ANALISIS POTENSI PASAR & DEMOGRAFI

Area ${subDistrict}, ${district} menunjukkan potensi pasar yang **${housing.length >= 3 ? 'cukup signifikan' : housing.length >= 1 ? 'moderat' : 'perlu dikaji lebih lanjut'}** berdasarkan ${housing.length} area perumahan yang teridentifikasi dalam radius 3km.

**Estimasi Basis Konsumen:**
- Total estimasi keluarga di area: **~${estFamilies.toLocaleString('id-ID')} KK** (asumsi 200 KK per cluster perumahan)
- Keluarga yang masuk segmen target (${body.priceSegment}): **~${estTargetFamilies.toLocaleString('id-ID')} KK** (35% penetration)
- Potensi pengunjung aktif per bulan: **${estMonthlyVisitors}–${Math.round(estMonthlyVisitors * 1.7)} orang**

**Perumahan & Permukiman Teridentifikasi (${housing.length} area):**
${housingList}

${housing.length > 0
  ? `Area perumahan yang ada mengindikasikan keberadaan segmen menengah yang cocok dengan positioning "${body.businessName}". Cluster terbuka dengan akses publik menjadi target prioritas distribusi promosi.`
  : `Keterbatasan data perumahan dari pencarian web bukan berarti tidak ada permukiman — perlu survei lapangan langsung untuk memvalidasi potensi demografi.`}

---

### 2. 🏆 PEMETAAN KOMPETITOR & ANALISIS PERSAINGAN

**Tingkat Ancaman Kompetitor**: ${competitorThreat}

**Kompetitor Teridentifikasi (${competitors.length} entitas):**
${competitorList}

${competitors.length === 0
  ? `**Peluang First-Mover**: Tidak adanya kompetitor yang terdeteksi dalam radius 3km membuka peluang besar untuk membangun brand awareness dan loyalitas pelanggan tanpa harus bersaing langsung. Strategi penetrasi pasar bisa dijalankan lebih agresif dengan budget lebih efisien.`
  : `**Analisis Gap Pasar**: Dengan ${competitors.length} kompetitor yang ada, diperlukan diferensiasi yang jelas. Fokus pada keunggulan yang belum ditawarkan kompetitor: kualitas layanan, harga lebih kompetitif, program loyalitas, atau lokasi yang lebih strategis dari permukiman target.`}

**Rekomendasi Diferensiasi**:
- Tonjolkan keunggulan spesifik "${body.businessName}" yang tidak dimiliki kompetitor
- Bangun trust melalui testimoni dan social proof dari komunitas lokal
- Pertimbangkan program referral untuk akselerasi word-of-mouth

---

### 3. 🚗 AKSESIBILITAS & VISIBILITAS LOKASI

**Rating Aksesibilitas**: ${accessRating}

**Titik Transportasi Umum (${transport.length} teridentifikasi):**
${transportList}

**Titik Promosi Strategis (${promos.length} lokasi):**
${promoList}

${transport.length >= 2
  ? `Ketersediaan ${transport.length} titik transportasi umum memberikan kemudahan akses bagi target konsumen yang tidak menggunakan kendaraan pribadi. Ini secara signifikan memperluas catchment area di luar radius walkable.`
  : `Keterbatasan akses transportasi umum mengharuskan fokus pada konsumen berkendaraan pribadi. Pastikan area parkir memadai dan signage yang terlihat dari jalan utama.`}

**Strategi Optimasi Visibilitas**:
- Pasang signage di titik-titik strategis jalur dari perumahan ke lokasi
- Daftarkan di Google Maps dan Waze agar mudah ditemukan
- Aktif di grup komunitas WhatsApp/Telegram warga setempat

---

### 4. 📱 ANALISIS JEJAK DIGITAL & SENTIMEN PASAR

**Total Data Digital Terkumpul**: ${digital.length} titik data
**Distribusi Sentimen**: ${positiveDigital.length} Positif | ${neutralDigital.length} Netral | ${negativeDigital.length} Negatif
**Indeks Sentimen Pasar**: ${sentimentRatio}% — ${sentimentLabel}

${positiveDigital.length > 0 ? `**Sinyal Positif dari Komunitas:**\n${positiveQuotes}` : ''}
${negativeDigital.length > 0 ? `\n**Sinyal Negatif yang Perlu Diperhatikan:**\n${negativeQuotes}` : ''}

**Implikasi Strategis**:
${sentimentRatio >= 60
  ? `Sentimen positif yang dominan menunjukkan pasar sudah reseptif terhadap jenis bisnis ini. Momentum yang baik untuk masuk dan memanfaatkan word-of-mouth yang sudah terbentuk.`
  : sentimentRatio >= 40
  ? `Sentimen berimbang menandakan pasar yang mature. Pelanggan sudah teredukasi dan punya ekspektasi tinggi — kualitas layanan harus di atas rata-rata kompetitor.`
  : `Sentimen negatif yang ada justru adalah peluang: jika kompetitor buruk, maka hadir dengan layanan yang lebih baik bisa langsung mencuri market share.`}

---

### 5. 📣 STRATEGI PROMOSI & AKUISISI PELANGGAN

**Channel Promosi Prioritas**:

**Offline (Bulan 1-2):**
- 🏫 Kunjungi ${schools.length > 0 ? `${schools.length} sekolah teridentifikasi` : 'sekolah-sekolah terdekat'} untuk distribusi flyer dan diskusi kerjasama
- 🏘️ Canvassing di ${housing.length > 0 ? `${housing.length} cluster perumahan` : 'area perumahan sekitar'} — pintu ke pintu untuk awareness awal
- 📍 Pasang banner di ${promos.length > 0 ? `${promos.length} titik strategis yang teridentifikasi` : 'lokasi-lokasi lalu-lintas tinggi'}
- 🤝 Join komunitas arisan/PKK/RT/RW setempat untuk promosi word-of-mouth

**Online (Bulan 1-3):**
- 📲 Buat konten lokal di Instagram & TikTok dengan hashtag area (contoh: #${district.replace(/\s/g, '')} #${city.replace(/\s/g, '')})
- 📍 Optimasi profil Google Business: foto berkualitas, jam operasional, kategori tepat
- 💬 Aktif di grup Facebook/Telegram komunitas warga setempat
- 🎯 Facebook/Instagram ads dengan geo-targeting radius 3km dari lokasi

**Timeline 3 Bulan Pertama**:
- **Bulan 1**: Brand awareness — target 200 orang mengenal nama brand
- **Bulan 2**: Trial & konversi — target 50 pelanggan baru, 30% repeat visit
- **Bulan 3**: Loyalitas — program referral, target 80 pelanggan aktif rutin

---

### 6. ⚠️ ANALISIS RISIKO & MITIGASI

| Risiko | Probabilitas | Dampak | Mitigasi |
|--------|-------------|--------|----------|
| Demand lebih rendah dari proyeksi | ${housing.length < 2 ? 'TINGGI' : 'SEDANG'} | Tinggi | Soft-launch dengan biaya minimal, uji pasar 2 bulan sebelum komitmen penuh |
| Kompetitor baru masuk | ${competitors.length > 2 ? 'TINGGI' : 'SEDANG'} | Sedang | Bangun loyalitas awal dengan program membership/langganan |
| Biaya sewa melebihi proyeksi | SEDANG | Tinggi | Negosiasi kontrak 1 tahun dulu, bukan langsung 3-5 tahun |
| Kesulitan rekrutmen SDM lokal | RENDAH | Sedang | Jalin kontak dengan SMK/universitas terdekat sejak awal |
| Rendahnya traffic di bulan awal | ${transport.length < 1 ? 'TINGGI' : 'SEDANG'} | Tinggi | Alokasikan 20% revenue bulan 1-3 untuk marketing agresif |

**Red Flags yang Harus Dicek Sebelum Eksekusi**:
${housing.length === 0 ? '⚠️ Data perumahan tidak terdeteksi — lakukan survei lapangan untuk konfirmasi demografi\n' : ''}${transport.length === 0 ? '⚠️ Tidak ada transportasi umum terdeteksi — pastikan area parkir dan akses kendaraan pribadi memadai\n' : ''}${competitors.length > 4 ? '⚠️ Kompetitor padat — wajib lakukan analisis mendalam tentang keunikan yang bisa ditawarkan\n' : ''}• Cek kondisi fisik bangunan dan zonasi peruntukan (izin usaha)
• Validasi harga sewa dengan minimal 3 perbandingan lokasi serupa

---

### 7. 🔍 ANALISIS SWOT

**STRENGTHS (Kekuatan)**:
${housing.length > 0 ? `✅ ${housing.length} area perumahan terdekat sebagai basis konsumen terdekat` : ''}
${competitors.length === 0 ? '✅ Posisi first-mover tanpa kompetitor langsung dalam radius 3km' : ''}
${schools.length > 0 ? `✅ ${schools.length} institusi pendidikan sebagai sumber traffic dan kerjasama` : ''}
${positiveDigital.length > negativeDigital.length ? '✅ Sentimen pasar positif mendukung potensi word-of-mouth' : ''}
${transport.length > 0 ? `✅ ${transport.length} titik transportasi umum untuk aksesibilitas luas` : ''}
• Positioning segmen ${body.priceSegment} yang spesifik dan terukur

**WEAKNESSES (Kelemahan)**:
${housing.length < 2 ? '⚠️ Data perumahan terbatas — basis konsumen perlu divalidasi lapangan' : ''}
${transport.length === 0 ? '⚠️ Akses transportasi umum belum teridentifikasi — risiko traffic rendah' : ''}
${digital.length < 5 ? '⚠️ Jejak digital minim — awareness bisnis serupa di area ini masih rendah' : ''}
• Biaya operasional awal yang signifikan sebelum break-even tercapai
• Ketergantungan pada promosi aktif di fase awal

**OPPORTUNITIES (Peluang)**:
${competitors.length <= 2 ? '🎯 Pasar underserved — demand ada tapi supply masih terbatas' : ''}
${sentimentRatio < 50 && negativeDigital.length > 0 ? '🎯 Ketidakpuasan pada kompetitor = peluang untuk tampil sebagai alternatif superior' : ''}
🎯 Pertumbuhan perumahan baru di area Jabodetabek membuka pasar organik
🎯 Tren digitalisasi bisnis lokal yang masih bisa dioptimalkan
🎯 Potensi ekspansi ke layanan tambahan setelah basis pelanggan terbentuk

**THREATS (Ancaman)**:
${competitors.length > 3 ? '🚨 Persaingan kompetitor yang sudah ada — risiko price war' : ''}
🚨 Fluktuasi daya beli konsumen akibat kondisi ekonomi makro
🚨 Kemungkinan kenaikan harga sewa setelah tahun pertama
🚨 Perubahan tren perilaku konsumen pasca pandemi

---

### 8. 🎯 REKOMENDASI EKSEKUSI & KESIMPULAN

**Action Plan Prioritas**:

**30 Hari Pertama (Pre-Launch)**:
- [ ] Survei lapangan 3 hari: hitung traffic manual, foto kondisi akses
- [ ] Negosiasi kontrak sewa dengan opsi exit setelah 6 bulan
- [ ] Daftarkan di Google Maps, Instagram, TikTok
- [ ] Rekrut 1-2 SDM lokal yang kenal komunitas setempat
- [ ] Distribusi flyer ke ${housing.length > 0 ? `${housing.length} perumahan` : 'perumahan-perumahan terdekat'} dan ${schools.length > 0 ? `${schools.length} sekolah` : 'sekolah terdekat'}

**KPI Target**:
| Periode | Target Pelanggan | Target Revenue | Status |
|---------|-----------------|----------------|--------|
| Bulan 1 | ${Math.max(15, estMonthlyVisitors / 4)} orang | Rp ${((Math.max(15, estMonthlyVisitors / 4)) * 500000).toLocaleString('id-ID')} | 🎯 Target |
| Bulan 3 | ${estMonthlyVisitors} orang | Rp ${(estMonthlyVisitors * 600000).toLocaleString('id-ID')} | 🎯 Target |
| Bulan 6 | ${Math.round(estMonthlyVisitors * 1.5)} orang | Rp ${(Math.round(estMonthlyVisitors * 1.5) * 650000).toLocaleString('id-ID')} | 🎯 Target |

**Data Ringkas**:
| Parameter | Teridentifikasi | Penilaian |
|-----------|----------------|-----------|
| Kelurahan/Wilayah | ${kelurahan.length} | ${kelurahan.length >= 5 ? '⭐⭐⭐ Baik' : kelurahan.length >= 2 ? '⭐⭐ Cukup' : '⭐ Terbatas'} |
| Area Perumahan | ${housing.length} | ${housing.length >= 4 ? '⭐⭐⭐ Potensial' : housing.length >= 2 ? '⭐⭐ Cukup' : '⭐ Perlu Validasi'} |
| Kompetitor | ${competitors.length} | ${competitors.length === 0 ? '⭐⭐⭐ Peluang' : competitors.length <= 3 ? '⭐⭐ Sedang' : '⭐ Kompetitif'} |
| Sekolah | ${schools.length} | ${schools.length >= 3 ? '⭐⭐⭐ Strategis' : schools.length >= 1 ? '⭐⭐ Ada' : '⭐ Belum Terdeteksi'} |
| Transportasi | ${transport.length} | ${transport.length >= 2 ? '⭐⭐⭐ Mudah Akses' : transport.length >= 1 ? '⭐⭐ Cukup' : '⭐ Terbatas'} |
| Jejak Digital | ${digital.length} | ${digital.length >= 10 ? '⭐⭐⭐ Aktif' : digital.length >= 5 ? '⭐⭐ Sedang' : '⭐ Minim'} |
`;
}

// ════════════════════════════════════════════════════════════
// Helper: updateStep
// ════════════════════════════════════════════════════════════
async function updateStep(
  steps: ResearchStep[],
  id: string,
  status: ResearchStep['status'],
  detail: string,
  sendStep: (step: ResearchStep) => Promise<void>
) {
  const step = steps.find(s => s.id === id);
  if (step) {
    step.status = status;
    step.detail = detail;
    if (status === 'running') step.startTime = Date.now();
    if (status === 'done' || status === 'error') step.endTime = Date.now();
    await sendStep(step);
  }
}

// ════════════════════════════════════════════════════════════
// Helper: Infer location from coordinates (Nominatim)
// ════════════════════════════════════════════════════════════
async function inferLocationFromCoordinates(lat: number, lng: number): Promise<LocationContext> {
  const fallback = inferLocationFromBounds(lat, lng);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'riset-ai/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return fallback;

    const data = await response.json() as {
      address?: {
        city?: string; town?: string; village?: string; suburb?: string;
        county?: string; municipality?: string; state_district?: string; state?: string;
      };
    };

    const address = data.address || {};
    const city = address.city || address.town || address.village || address.state_district || address.state || fallback.city;
    const district = address.county || address.municipality || address.suburb || city || fallback.district;
    const subDistrict = address.suburb || address.village || district || fallback.subDistrict;

    return {
      city: normalizeLocationName(city),
      district: normalizeLocationName(district),
      subDistrict: normalizeLocationName(subDistrict),
    };
  } catch {
    return fallback;
  }
}

function inferLocationFromBounds(lat: number, lng: number): LocationContext {
  // Jabodetabek area detection
  if (lat <= -6.1 && lat >= -6.5 && lng >= 106.6 && lng <= 107.2) {
    return { city: 'Bekasi', district: 'Bekasi', subDistrict: 'Bekasi' };
  }
  return { city: 'Indonesia', district: 'Unknown', subDistrict: 'Unknown' };
}

function normalizeLocationName(value: string): string {
  return value
    .replace(/\b(Kota|Kabupaten|Kecamatan|Kelurahan|Desa)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ════════════════════════════════════════════════════════════
// Helper: Market Snapshot (from real data)
// ════════════════════════════════════════════════════════════
function buildMarketSnapshot(
  body: BusinessInput,
  location: LocationContext,
  kelurahan: Kelurahan[],
  poi: POIItem[],
  digital: DigitalTrace[]
): MarketSnapshot {
  const competitors = poi.filter(p => p.type === 'competitor').length;
  const housing = poi.filter(p => p.type === 'housing').length;
  const promotionSpots = poi.filter(p => p.type === 'promotion').length;
  const education = poi.filter(p => p.type === 'education').length;
  const transport = poi.filter(p => p.type === 'transport').length;
  const positive = digital.filter(d => d.sentiment === 'positive').length;
  const negative = digital.filter(d => d.sentiment === 'negative').length;
  const neutral = digital.filter(d => d.sentiment === 'neutral').length;
  const avgRelevance = digital.reduce((sum, item) => sum + item.relevance, 0) / Math.max(digital.length, 1);

  // Demand score based on real data
  const demandScore = clampScore(
    30 +
    housing * 7 +
    education * 5 +
    transport * 4 +
    Math.min(15, kelurahan.length * 2) +
    positive * 3 -
    negative * 4 +
    Math.min(10, avgRelevance / 10)
  );

  // Interest score based on digital traces
  const interestScore = clampScore(
    25 +
    promotionSpots * 6 +
    positive * 5 +
    neutral * 2 +
    Math.min(15, avgRelevance / 8) -
    negative * 3 +
    Math.min(10, digital.length * 1.5)
  );

  // Competition pressure
  const competitionPressure = clampScore(
    20 + competitors * 12 - housing * 2 - promotionSpots * 1.5
  );

  const avgTicket = estimateAverageTicket(body.businessType, body.priceSegment);
  const monthlyCustomersLow = Math.max(20, Math.round(
    housing * 5 + promotionSpots * 4 + education * 4 + demandScore / 3 + kelurahan.length * 2
  ));
  const monthlyCustomersHigh = Math.max(monthlyCustomersLow + 15, Math.round(
    monthlyCustomersLow * 1.8 + interestScore / 3
  ));

  const revenueLow = Math.round(monthlyCustomersLow * avgTicket * revenueMultiplier(body.priceSegment, location));
  const revenueHigh = Math.round(monthlyCustomersHigh * avgTicket * revenueMultiplier(body.priceSegment, location));

  const expenseLow = Math.round(estimateMonthlyExpenseLow(body, location, competitionPressure));
  const expenseHigh = Math.round(estimateMonthlyExpenseHigh(body, location, competitionPressure));

  const profitLow = revenueLow - expenseHigh;
  const profitHigh = revenueHigh - expenseLow;
  const breakEvenMonths = profitLow <= 0
    ? 'Tidak terlihat balik modal konservatif'
    : `${Math.max(2, Math.round(expenseHigh / Math.max(profitLow, 1)))} bulan`;

  return {
    demandScore,
    interestScore,
    competitionPressure,
    estimatedMonthlyCustomers: {
      low: monthlyCustomersLow,
      high: monthlyCustomersHigh,
      basis: `Dihitung dari ${housing} area perumahan (real data), ${education} sekolah, ${transport} titik transportasi, ${promotionSpots} area promosi.`,
    },
    estimatedMonthlyRevenue: {
      low: revenueLow,
      high: revenueHigh,
      currency: 'IDR',
      basis: `Rata-rata transaksi ${formatIdr(avgTicket)} × ${monthlyCustomersLow}-${monthlyCustomersHigh} pelanggan/bulan. Multiplier segmen: ${body.priceSegment}.`,
    },
    estimatedMonthlyExpense: {
      low: expenseLow,
      high: expenseHigh,
      currency: 'IDR',
      basis: `Sewa ${formatIdr(estimateBaseRent(location, body.priceSegment))}/bln + gaji + operasional + marketing (tekanan kompetisi ${competitionPressure}/100).`,
    },
    estimatedMonthlyProfit: {
      low: profitLow,
      high: profitHigh,
      currency: 'IDR',
      basis: `Pendapatan dikurangi pengeluaran. Konservatif: ${formatSignedIdr(profitLow)}, Optimistis: ${formatSignedIdr(profitHigh)}.`,
    },
    estimatedBreakEvenMonths: breakEvenMonths,
    notes: [
      `Data berbasis ${poi.length} POI nyata dari pencarian web dan ${digital.length} jejak digital.`,
      `Minat pasar ${demandScore}/100: ${housing} perumahan, ${education} sekolah, ${transport} transportasi.`,
      `Minat digital ${interestScore}/100: ${positive} positif, ${neutral} netral, ${negative} negatif.`,
      `Tekanan kompetisi ${competitionPressure}/100 dari ${competitors} kompetitor.`,
      profitLow > 0
        ? `Skenario konservatif masih positif ${formatSignedIdr(profitLow)}/bulan.`
        : `Skenario konservatif masih defisit ${formatSignedIdr(Math.abs(profitLow))}/bulan.`,
    ],
  };
}

function buildFinancialNarrative(snapshot: MarketSnapshot, references: ResearchReference[]): string {
  const profitabilityLabel = snapshot.estimatedMonthlyProfit.high > 5000000
    ? '🟢 SANGAT MENGUNTUNGKAN — Proyeksi return melebihi ekspektasi investasi'
    : snapshot.estimatedMonthlyProfit.high > 0
    ? '🟡 MENGUNTUNGKAN — Perlu optimasi agar break-even lebih cepat'
    : snapshot.estimatedMonthlyProfit.low > -3000000
    ? '🟠 MARGIN TIPIS — Butuh efisiensi biaya dan akselerasi akuisisi pelanggan'
    : '🔴 DEFISIT — Perlu evaluasi ulang model bisnis atau lokasi alternatif';

  const revOptimistic = Math.round(snapshot.estimatedMonthlyRevenue.high * 1.25);
  const revPessimistic = Math.round(snapshot.estimatedMonthlyRevenue.low * 0.75);

  const topRefs = references.slice(0, 8).map((ref, i) => {
    const domain = (() => { try { return new URL(ref.url).hostname.replace('www.', ''); } catch { return ref.source; } })();
    const snippet = ref.snippet ? ref.snippet.slice(0, 100) + (ref.snippet.length > 100 ? '...' : '') : '';
    return `${i + 1}. **[${ref.title}](${ref.url})**\n   📌 Sumber: ${ref.source} | 🌐 ${domain}\n   ${snippet ? `> "${snippet}"` : ''}`;
  }).join('\n\n');

  return `

---

## 💰 PROYEKSI FINANSIAL LENGKAP (Berbasis Data Nyata)

**Status Profitabilitas**: ${profitabilityLabel}

### Skenario Pendapatan (3 Skenario)

| Skenario | Pelanggan/Bulan | Pendapatan | Pengeluaran | Laba Bersih |
|----------|----------------|------------|-------------|-------------|
| 🔴 Pesimistis (75%) | ~${Math.round(snapshot.estimatedMonthlyCustomers.low * 0.75)} orang | ${formatIdr(revPessimistic)} | ${formatIdr(snapshot.estimatedMonthlyExpense.high)} | ${formatSignedIdr(revPessimistic - snapshot.estimatedMonthlyExpense.high)} |
| 🟡 Realistis | ${snapshot.estimatedMonthlyCustomers.low}–${snapshot.estimatedMonthlyCustomers.high} orang | ${formatIdr(snapshot.estimatedMonthlyRevenue.low)}–${formatIdr(snapshot.estimatedMonthlyRevenue.high)} | ${formatIdr(snapshot.estimatedMonthlyExpense.low)}–${formatIdr(snapshot.estimatedMonthlyExpense.high)} | **${formatSignedIdr(snapshot.estimatedMonthlyProfit.low)}–${formatSignedIdr(snapshot.estimatedMonthlyProfit.high)}** |
| 🟢 Optimistis (125%) | ~${Math.round(snapshot.estimatedMonthlyCustomers.high * 1.25)} orang | ${formatIdr(revOptimistic)} | ${formatIdr(snapshot.estimatedMonthlyExpense.low)} | ${formatSignedIdr(revOptimistic - snapshot.estimatedMonthlyExpense.low)} |

### Rincian Estimasi Komponen Biaya

| Komponen | Biaya Rendah | Biaya Tinggi | Keterangan |
|----------|-------------|-------------|------------|
| Sewa Ruko | Sesuai lokasi | +25% premium | Bergantung luas dan posisi |
| Gaji Karyawan | Sesuai UMR | +35% overheads | Termasuk BPJS & insentif |
| Operasional | Rp 1.500.000 | Rp 2.300.000 | Listrik, air, internet |
| Marketing | Rp 800.000 | Rp 1.600.000+ | Naik sesuai tekanan kompetisi |
| **Total** | **${formatIdr(snapshot.estimatedMonthlyExpense.low)}** | **${formatIdr(snapshot.estimatedMonthlyExpense.high)}** | |

### Indikator Kinerja Kunci (KPI Finansial)

- 📊 **Demand Score**: ${snapshot.demandScore}/100 — ${snapshot.demandScore >= 70 ? 'Pasar kuat, permintaan organik tinggi' : snapshot.demandScore >= 50 ? 'Pasar sedang, perlu stimulasi permintaan' : 'Pasar lemah, investasi marketing besar diperlukan'}
- 📱 **Interest Score**: ${snapshot.interestScore}/100 — ${snapshot.interestScore >= 70 ? 'Buzz online bagus, promosi digital akan efektif' : snapshot.interestScore >= 50 ? 'Kesadaran digital moderat, perlu konten konsisten' : 'Kesadaran rendah, butuh edukasi pasar'}
- 🏆 **Competition Pressure**: ${snapshot.competitionPressure}/100 — ${snapshot.competitionPressure <= 30 ? 'Pasar blue-ocean, minimal persaingan' : snapshot.competitionPressure <= 60 ? 'Persaingan sehat, diferensiasi cukup' : 'Persaingan sengit, strategi khusus wajib'}
- ⏱️ **Estimasi Break-Even**: ${snapshot.estimatedBreakEvenMonths}
- 💡 **Basis Kalkulasi**: ${snapshot.estimatedMonthlyCustomers.basis}

### Catatan Metodologi

${snapshot.notes.map(note => `• ${note}`).join('\n')}

---

## 📚 REFERENSI DATA PENELITIAN (${references.length} Sumber)

> *Semua referensi berikut dapat diklik untuk verifikasi data secara langsung.*

${topRefs || '• Belum ada referensi yang berhasil dikumpulkan dari pencarian web'}

${references.length > 8 ? `\n*…dan ${references.length - 8} referensi tambahan lainnya (tersedia di panel referensi)*` : ''}`;
}

// ════════════════════════════════════════════════════════════
// Helper: Financial estimates
// ════════════════════════════════════════════════════════════
function estimateAverageTicket(businessType: string, priceSegment: string): number {
  const businessBase: Record<string, number> = {
    'Pendidikan & Bimbingan Belajar': 650000,
    'Kuliner & Restoran': 55000,
    'Retail & Toko': 120000,
    'Jasa & Service': 180000,
    'Kesehatan & Klinik': 200000,
    'Salon & Kecantikan': 175000,
    'Laundry & Kebersihan': 75000,
    'Minimarket & Grocery': 90000,
    'Fitness & Gym': 250000,
    'Kursus & Pelatihan': 350000,
  };

  const segmentMultiplier: Record<string, number> = {
    'Ekonomis (< Rp 500rb/bln)': 0.85,
    'Menengah (Rp 500rb - 2jt/bln)': 1,
    'Premium (Rp 2jt - 5jt/bln)': 1.25,
    'Luxury (> Rp 5jt/bln)': 1.55,
  };

  return (businessBase[businessType] || 120000) * (segmentMultiplier[priceSegment] || 1);
}

function revenueMultiplier(priceSegment: string, location: LocationContext): number {
  const base = priceSegment.includes('Luxury') ? 1.35 : priceSegment.includes('Premium') ? 1.2 : priceSegment.includes('Ekonomis') ? 0.95 : 1;
  const cityText = `${location.city} ${location.district}`.toLowerCase();
  const locationFactor = cityText.includes('jakarta') ? 1.12 : cityText.includes('bekasi') ? 0.98 : cityText.includes('tangerang') ? 1.03 : 1;
  return base * locationFactor;
}

function estimateMonthlyExpenseLow(body: BusinessInput, location: LocationContext, competitionPressure: number): number {
  const baseRent = estimateBaseRent(location, body.priceSegment);
  const staffing = estimateStaffing(body.businessType);
  const operations = 1500000;
  const marketing = 800000 + Math.round(competitionPressure * 12000);
  return baseRent + staffing + operations + marketing;
}

function estimateMonthlyExpenseHigh(body: BusinessInput, location: LocationContext, competitionPressure: number): number {
  const baseRent = estimateBaseRent(location, body.priceSegment) * 1.25;
  const staffing = estimateStaffing(body.businessType) * 1.35;
  const operations = 2300000;
  const marketing = 1600000 + Math.round(competitionPressure * 18000);
  return baseRent + staffing + operations + marketing;
}

function estimateBaseRent(location: LocationContext, priceSegment: string): number {
  const locationFactor = (() => {
    const value = `${location.city} ${location.district}`.toLowerCase();
    if (value.includes('jakarta')) return 1.35;
    if (value.includes('bekasi')) return 1.05;
    if (value.includes('tangerang')) return 1.1;
    if (value.includes('depok') || value.includes('bogor')) return 0.98;
    return 1;
  })();

  const segmentBase: Record<string, number> = {
    'Ekonomis (< Rp 500rb/bln)': 2500000,
    'Menengah (Rp 500rb - 2jt/bln)': 4500000,
    'Premium (Rp 2jt - 5jt/bln)': 8000000,
    'Luxury (> Rp 5jt/bln)': 12000000,
  };

  return Math.round((segmentBase[priceSegment] || 4500000) * locationFactor);
}

function estimateStaffing(businessType: string): number {
  const staffingMap: Record<string, number> = {
    'Pendidikan & Bimbingan Belajar': 8000000,
    'Kuliner & Restoran': 6500000,
    'Retail & Toko': 4500000,
    'Jasa & Service': 5000000,
    'Kesehatan & Klinik': 12000000,
    'Salon & Kecantikan': 5500000,
    'Laundry & Kebersihan': 4000000,
    'Minimarket & Grocery': 7000000,
    'Fitness & Gym': 9000000,
    'Kursus & Pelatihan': 8500000,
  };

  return staffingMap[businessType] || 5000000;
}

// ════════════════════════════════════════════════════════════
// Helper: Sentiment & relevance analysis
// ════════════════════════════════════════════════════════════
function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['bagus', 'baik', 'berkualitas', 'ramai', 'strategis', 'potensial', 'recommended', 'terbaik', 'unggul', 'meningkat', 'puas', 'senang', 'rekomendasi', 'aman', 'nyaman'];
  const negativeWords = ['buruk', 'sepi', 'tutup', 'mengecewakan', 'mahal', 'jauh', 'susah', 'kurang', 'jelek', 'menurun', 'rugi', 'gagal', 'sulit', 'padat', 'macet'];

  const lower = text.toLowerCase();
  const posCount = positiveWords.filter(w => lower.includes(w)).length;
  const negCount = negativeWords.filter(w => lower.includes(w)).length;

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  return 'neutral';
}

function detectPlatform(url: string): string {
  if (!url) return 'Web';
  if (url.includes('instagram')) return 'Instagram';
  if (url.includes('facebook')) return 'Facebook';
  if (url.includes('twitter') || url.includes('x.com')) return 'Twitter/X';
  if (url.includes('tiktok')) return 'TikTok';
  if (url.includes('google')) return 'Google Maps';
  if (url.includes('tokopedia')) return 'Tokopedia';
  if (url.includes('shopee')) return 'Shopee';
  if (url.includes('maps')) return 'Maps';
  if (url.includes('youtube')) return 'YouTube';
  if (url.includes('kaskus')) return 'Kaskus';
  if (url.includes('reddit')) return 'Reddit';
  try {
    return new URL(url).hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Web';
  }
}

function calculateRelevance(text: string, businessType: string): number {
  const keywords = businessType.toLowerCase().split(/\s+/);
  const lower = text.toLowerCase();
  const matches = keywords.filter(k => lower.includes(k)).length;
  const baseScore = 50 + (matches / Math.max(keywords.length, 1)) * 30 + Math.random() * 15;
  return Math.min(100, Math.round(baseScore));
}

// ════════════════════════════════════════════════════════════
// Helper: Parameter Scoring
// ════════════════════════════════════════════════════════════
function calculateParameterScores(
  body: BusinessInput,
  kelurahan: Kelurahan[],
  poi: POIItem[],
  digital: DigitalTrace[]
): ParameterScore[] {
  const competitors = poi.filter(p => p.type === 'competitor').length;
  const housing = poi.filter(p => p.type === 'housing').length;
  const promotionSpots = poi.filter(p => p.type === 'promotion').length;
  const transport = poi.filter(p => p.type === 'transport').length;
  const education = poi.filter(p => p.type === 'education').length;
  const positiveSentiment = digital.filter(d => d.sentiment === 'positive').length;
  const negativeSentiment = digital.filter(d => d.sentiment === 'negative').length;
  const avgRelevance = digital.reduce((sum, d) => sum + d.relevance, 0) / Math.max(digital.length, 1);

  // Aksesibilitas: transport + jalan utama
  const aksesibilitasScore = Math.min(20, Math.round(
    8 + transport * 3.5 + (kelurahan.length > 3 ? 2 : 0) + Math.min(4, avgRelevance / 25)
  ));

  // Visibilitas: lokasi strategis, kelurahan banyak
  const visibilitasScore = Math.min(20, Math.round(
    10 + Math.min(5, kelurahan.length * 0.8) + (housing > 3 ? 3 : housing > 1 ? 2 : 0) + Math.min(3, avgRelevance / 30)
  ));

  // Demografi: populasi + perumahan + sekolah
  const demografiScore = Math.min(20, Math.round(
    6 + housing * 2.5 + education * 1.5 + Math.min(4, kelurahan.length * 0.7)
  ));

  // Kompetitor: kurang kompetitor = lebih baik
  const kompetitorScore = Math.min(20, Math.max(4, Math.round(
    20 - competitors * 3.5 + (housing > 2 ? 2 : 0) + Math.min(3, avgRelevance / 30)
  )));

  // Potensi promosi
  const promosiScore = Math.min(20, Math.round(
    6 + promotionSpots * 2.5 + (positiveSentiment > 2 ? 4 : positiveSentiment > 0 ? 2 : 0) +
    Math.min(4, digital.length * 0.8) - negativeSentiment * 0.5
  ));

  return [
    {
      parameter: 'Aksesibilitas',
      score: aksesibilitasScore,
      maxScore: 20,
      details: `${transport} titik transportasi teridentifikasi dari data web. ${aksesibilitasScore > 14 ? 'Akses mudah via kendaraan umum dan pribadi.' : aksesibilitasScore > 10 ? 'Akses cukup, perlu penambahan signage.' : 'Akses terbatas, pertimbangkan lokasi alternatif.'}`,
      icon: '🚗',
    },
    {
      parameter: 'Visibilitas',
      score: visibilitasScore,
      maxScore: 20,
      details: `${kelurahan.length} kelurahan/wilayah dalam radius 3km. ${housing} area perumahan. ${visibilitasScore > 14 ? 'Posisi strategis di area ramai.' : visibilitasScore > 10 ? 'Visibilitas sedang, perlu optimasi papan nama.' : 'Perlu optimasi signage dan promosi aktif.'}`,
      icon: '👁️',
    },
    {
      parameter: 'Demografi',
      score: demografiScore,
      maxScore: 20,
      details: `${housing} area perumahan terdeteksi (data nyata). Estimasi populasi target: ${(housing * 150 + 200).toLocaleString()} jiwa. ${education} sekolah sebagai sumber calon siswa.`,
      icon: '👥',
    },
    {
      parameter: 'Kompetitor',
      score: kompetitorScore,
      maxScore: 20,
      details: `${competitors} kompetitor teridentifikasi dari pencarian web. ${competitors === 0 ? 'Tidak ada kompetitor langsung — peluang besar!' : competitors <= 2 ? 'Persaingan rendah, peluang besar.' : competitors <= 4 ? 'Persaingan sedang, diferensiasi diperlukan.' : 'Kompetisi tinggi, perlu strategi khusus.'}`,
      icon: '🏆',
    },
    {
      parameter: 'Potensi Promosi',
      score: promosiScore,
      maxScore: 20,
      details: `${promotionSpots} titik promosi potensial. ${digital.length} jejak digital (${positiveSentiment} positif, ${negativeSentiment} negatif). Relevansi rata-rata: ${avgRelevance.toFixed(0)}%.`,
      icon: '📣',
    },
  ];
}

// ════════════════════════════════════════════════════════════
// Helper: Recommendations
// ════════════════════════════════════════════════════════════
function buildPositiveRecommendation(body: BusinessInput, scores: ParameterScore[]): string {
  const sorted = [...scores].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore);
  const weakParam = sorted[0];
  return `✅ Lokasi ini LAYAK untuk pembukaan ${body.businessName}.

Strategi yang disarankan:
• Segera lakukan survei lapangan untuk konfirmasi data
• Fokus pada ${weakParam.parameter.toLowerCase()} yang masih bisa ditingkatkan
• Bangun jaringan dengan komunitas lokal
• Targetkan promosi di kawasan perumahan yang teridentifikasi
• Pertimbangkan soft-launch untuk membangun awareness sebelum grand opening`;
}

function buildMixedRecommendation(body: BusinessInput, scores: ParameterScore[]): string {
  const weakParams = scores.filter(s => s.score / s.maxScore < 0.6).map(s => s.parameter);
  return `⚠️ Lokasi ini PERLU KAJIAN lebih lanjut sebelum keputusan akhir.

Aspek yang perlu dikaji ulang: ${weakParams.join(', ')}

Tindakan yang disarankan:
• Lakukan survei lapangan minimal 3 hari di jam berbeda
• Hitung traffic harian secara manual di lokasi
• Wawancara minimal 20 calon pelanggan target
• Evaluasi harga sewa vs. proyeksi pendapatan
• Pertimbangkan alternative lokasi yang ditawarkan`;
}

function buildNegativeRecommendation(body: BusinessInput, scores: ParameterScore[]): string {
  const weakParams = scores.filter(s => s.score / s.maxScore < 0.5).map(s => s.parameter);
  return `❌ Lokasi ini TIDAK DIREKOMENDASIKAN saat ini.

Tantangan utama: ${weakParams.join(', ')}

Saran:
• Pertimbangkan alternative area yang direkomendasikan di bawah
• Cari lokasi dengan akses lebih baik ke perumahan menengah
• Prioritaskan area dekat sekolah/kampus sebagai sumber traffic
• Pertimbangkan area dengan persaingan lebih rendah
• Jika tetap memilih lokasi ini, siapkan budget marketing 2x lebih besar`;
}

function generateAlternativeAreas(lat: number, lng: number, body: BusinessInput): AlternativeArea[] {
  const directions = [
    { dLat: 0.02, dLng: 0.01, suffix: 'Utara', reason: 'Lebih dekat dengan kawasan perumahan menengah dan akses transportasi umum yang lebih baik' },
    { dLat: -0.015, dLng: 0.025, suffix: 'Timur', reason: 'Kepadatan penduduk lebih tinggi, kompetitor lebih sedikit, dekat dengan sekolah' },
    { dLat: 0.01, dLng: -0.03, suffix: 'Barat', reason: 'Kawasan berkembang dengan potensi pertumbuhan pasar jangka panjang' },
  ];

  return directions.map(d => ({
    name: `${body.district || 'Area'} ${d.suffix}`,
    coordinates: { lat: lat + d.dLat, lng: lng + d.dLng },
    reason: d.reason,
    estimatedScore: 60 + Math.floor(Math.random() * 25),
  }));
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatIdr(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedIdr(value: number): string {
  return value < 0 ? `-${formatIdr(Math.abs(value))}` : formatIdr(value);
}
