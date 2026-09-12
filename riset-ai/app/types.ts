// Types for the Research Dashboard
export interface BusinessInput {
  businessName: string;
  businessType: string;
  priceSegment: string;
  analysisMode: 'standard' | 'deep';
  locationStandard: string;
  researchParams: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  city: string;
  district: string;
  subDistrict: string;
}

export interface Kelurahan {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

export interface POIItem {
  name: string;
  type: 'competitor' | 'housing' | 'promotion' | 'education' | 'transport';
  address?: string;
  distance?: string;
  rating?: number;
  notes?: string;
  lat?: number;
  lng?: number;
}

export interface DigitalTrace {
  platform: string;
  type: 'social_media' | 'review' | 'news' | 'forum';
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  relevance: number;
  url?: string;
  date?: string;
}

export interface ParameterScore {
  parameter: string;
  score: number;
  maxScore: number;
  details: string;
  icon: string;
}

export interface ResearchResult {
  businessInput: BusinessInput;
  kelurahan: Kelurahan[];
  poi: POIItem[];
  digitalTraces: DigitalTrace[];
  parameterScores: ParameterScore[];
  marketSnapshot: MarketSnapshot;
  references: ResearchReference[];
  totalScore: number;
  maxTotalScore: number;
  verdict: 'LAYAK' | 'TIDAK_LAYAK' | 'PERLU_KAJIAN';
  verdictReason: string;
  recommendation: string;
  alternativeAreas?: AlternativeArea[];
  aiAnalysis: string;
  researchSteps: ResearchStep[];
  timestamp: string;
}

export interface ResearchReference {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface LocationContext {
  city: string;
  district: string;
  subDistrict: string;
}

export interface MarketSnapshot {
  demandScore: number;
  interestScore: number;
  competitionPressure: number;
  estimatedMonthlyCustomers: {
    low: number;
    high: number;
    basis: string;
  };
  estimatedMonthlyRevenue: {
    low: number;
    high: number;
    currency: string;
    basis: string;
  };
  estimatedMonthlyExpense: {
    low: number;
    high: number;
    currency: string;
    basis: string;
  };
  estimatedMonthlyProfit: {
    low: number;
    high: number;
    currency: string;
    basis: string;
  };
  estimatedBreakEvenMonths: string;
  notes: string[];
}

export interface AlternativeArea {
  name: string;
  coordinates: { lat: number; lng: number };
  reason: string;
  estimatedScore: number;
}

export interface ResearchStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  data?: unknown;
  startTime?: number;
  endTime?: number;
}

export interface TinyfishSearchResult {
  title: string;
  url: string;
  snippet: string;
  domain?: string;
}

export interface TinyfishFetchResult {
  url: string;
  content: string;
  title?: string;
}

export interface TinyfishAgentResult {
  result: string;
  data?: unknown;
}

// Indonesian cities and areas data
export const INDONESIA_CITIES = [
  'Jakarta Selatan', 'Jakarta Utara', 'Jakarta Barat', 'Jakarta Timur', 'Jakarta Pusat',
  'Surabaya', 'Bandung', 'Bekasi', 'Tangerang', 'Depok',
  'Semarang', 'Medan', 'Makassar', 'Palembang', 'Bogor',
  'Tangerang Selatan', 'Malang', 'Batam', 'Pekanbaru', 'Denpasar',
  'Yogyakarta', 'Solo', 'Manado', 'Balikpapan', 'Pontianak'
];

export const BUSINESS_TYPES = [
  'Pendidikan & Bimbingan Belajar',
  'Kuliner & Restoran',
  'Retail & Toko',
  'Jasa & Service',
  'Kesehatan & Klinik',
  'Salon & Kecantikan',
  'Laundry & Kebersihan',
  'Minimarket & Grocery',
  'Fitness & Gym',
  'Kursus & Pelatihan'
];

export const PRICE_SEGMENTS = [
  'Ekonomis (< Rp 500rb/bln)',
  'Menengah (Rp 500rb - 2jt/bln)',
  'Premium (Rp 2jt - 5jt/bln)',
  'Luxury (> Rp 5jt/bln)'
];

export const RESEARCH_PARAMS = [
  'aksesibilitas',
  'visibilitas',
  'demografi',
  'kompetitor',
  'potensi_promosi'
];
