// TinyFish API integration utilities
// Based on official documentation: https://docs.tinyfish.ai/

const SEARCH_API = 'https://api.search.tinyfish.ai';
const FETCH_API = 'https://api.fetch.tinyfish.ai';
const AGENT_API = 'https://agent.tinyfish.ai';

const API_KEY = process.env.TINYFISH_API_KEY || '';
const DEFAULT_TIMEOUT_MS = 15000;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain?: string;
  position?: number;
  site_name?: string;
}

export interface FetchResult {
  url: string;
  content: string;
  title?: string;
  description?: string;
  final_url?: string;
}

export interface AgentRunResult {
  result: string;
  data?: unknown;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────
// SEARCH API — find live web results
// GET https://api.search.tinyfish.ai
// ────────────────────────────────────────────────────────────
export async function tinyfishSearch(
  query: string,
  numResults: number = 5,
  options?: {
    location?: string;
    language?: string;
    purpose?: string;
    recency_minutes?: number;
    domain_type?: 'web' | 'news' | 'research_paper';
  }
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    query,
    num_results: String(numResults),
  });

  if (options?.location) params.set('location', options.location);
  if (options?.language) params.set('language', options.language);
  if (options?.purpose) params.set('purpose', options.purpose);
  if (options?.recency_minutes) params.set('recency_minutes', String(options.recency_minutes));
  if (options?.domain_type) params.set('domain_type', options.domain_type);

  const url = `${SEARCH_API}?${params.toString()}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      'X-API-Key': API_KEY,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`TinyFish Search failed: ${response.status} ${response.statusText} — ${errorText}`);
  }

  const data = await response.json();

  // Official format: { results: [{ position, site_name, title, snippet, url }], total_results, page }
  const results = data.results || data.organic_results || (Array.isArray(data) ? data : []);

  return results.map((item: Record<string, unknown>) => ({
    title: String(item.title || ''),
    url: String(item.url || item.link || ''),
    snippet: String(item.snippet || item.description || ''),
    domain: String(item.site_name || extractDomain(String(item.url || item.link || ''))),
    position: Number(item.position) || undefined,
    site_name: String(item.site_name || ''),
  }));
}

// ────────────────────────────────────────────────────────────
// FETCH API — extract clean content from URLs
// POST https://api.fetch.tinyfish.ai
// ────────────────────────────────────────────────────────────
export async function tinyfishFetch(
  urls: string[],
  options?: {
    format?: 'markdown' | 'html' | 'json';
    purpose?: string;
    ttl?: number;
  }
): Promise<FetchResult[]> {
  const body: Record<string, unknown> = { urls };
  if (options?.format) body.format = options.format;
  if (options?.purpose) body.purpose = options.purpose;
  if (typeof options?.ttl === 'number') body.ttl = options.ttl;

  const response = await fetchWithTimeout(FETCH_API, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, 20000);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`TinyFish Fetch failed: ${response.status} ${response.statusText} — ${errorText}`);
  }

  const data = await response.json();
  const pages = data.results || data.pages || (Array.isArray(data) ? data : []);

  return pages.map((item: Record<string, unknown>, i: number) => ({
    url: String(item.url || item.final_url || urls[i] || ''),
    content: String(item.text || item.content || item.markdown || ''),
    title: String(item.title || ''),
    description: String(item.description || ''),
    final_url: String(item.final_url || ''),
  }));
}

// ────────────────────────────────────────────────────────────
// AGENT API — run autonomous browser tasks (streaming SSE)
// POST https://agent.tinyfish.ai/v1/automation/run-sse
// ────────────────────────────────────────────────────────────
export async function tinyfishAgent(
  url: string,
  goal: string,
  onProgress?: (text: string) => void
): Promise<AgentRunResult> {
  const response = await fetchWithTimeout(`${AGENT_API}/v1/automation/run-sse`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, goal }),
  }, 30000);

  if (!response.ok) {
    throw new Error(`TinyFish Agent failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullResult = '';
  let finalData: unknown = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === 'PROGRESS' || event.type === 'TEXT' || event.type === 'text' || event.type === 'chunk') {
            const text = event.purpose || event.text || event.content || '';
            fullResult += text;
            onProgress?.(text);
          } else if (event.type === 'COMPLETE' || event.type === 'DONE' || event.type === 'done') {
            fullResult = event.result || event.text || fullResult;
            finalData = event.data || null;
          } else if (event.result) {
            fullResult = event.result;
            finalData = event.data || null;
          }
        } catch {
          // not JSON, skip
        }
      }
    }
  }

  return { result: fullResult, data: finalData };
}

// ────────────────────────────────────────────────────────────
// AGENT API — non-streaming (blocking)
// POST https://agent.tinyfish.ai/v1/automation/run
// ────────────────────────────────────────────────────────────
export async function tinyfishAgentSync(url: string, goal: string): Promise<AgentRunResult> {
  const response = await fetchWithTimeout(`${AGENT_API}/v1/automation/run`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, goal }),
  }, 30000);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`TinyFish Agent Sync failed: ${response.status} ${response.statusText} — ${errorText}`);
  }

  const data = await response.json();
  return {
    result: data.result || data.text || JSON.stringify(data),
    data: data.data || data,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// Calculate distance between two coordinates in km (Haversine)
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number) {
  return deg * (Math.PI / 180);
}

// Generate nearby coordinates within radius
export function generateNearbyCoord(
  lat: number,
  lng: number,
  radiusKm: number
): { lat: number; lng: number } {
  const r = radiusKm / 111;
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(Math.random()) * r;
  return {
    lat: lat + dist * Math.cos(angle),
    lng: lng + dist * Math.sin(angle),
  };
}
