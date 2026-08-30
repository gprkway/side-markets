import type { Market } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';

type RawMarket = Record<string, unknown> & {
  id?: string;
  conditionId?: string;
  slug?: string;
  question?: string;
  title?: string;
  description?: string;
  category?: string;
  image?: string;
  icon?: string;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  oneDayPriceChange?: number;
  liquidity?: string | number;
  liquidityNum?: number;
};

type RawEvent = {
  title?: string;
  category?: string;
  markets?: RawMarket[];
};

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function numeric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMarket(raw: RawMarket, event?: RawEvent): Market | null {
  if (!raw.id || !raw.conditionId) return null;
  const labels = parseList(raw.outcomes);
  const prices = parseList(raw.outcomePrices);
  const outcomes = labels.map((label, index) => ({
    label,
    probability: Math.max(0, Math.min(1, numeric(prices[index]))),
  }));

  return {
    id: raw.id,
    conditionId: raw.conditionId,
    slug: raw.slug ?? '',
    question: raw.question ?? raw.title ?? event?.title ?? 'Untitled market',
    description: raw.description ?? '',
    category: raw.category ?? event?.category ?? 'Market',
    image: raw.icon ?? raw.image ?? '',
    endDate: raw.endDate ?? null,
    volume: numeric(raw.volumeNum ?? raw.volume),
    volume24h: numeric(raw.volume24hr),
    liquidity: numeric(raw.liquidityNum ?? raw.liquidity),
    priceChange24h: numeric(raw.oneDayPriceChange),
    outcomes,
    source: 'polymarket',
  };
}

export async function getMarkets(limit = 18): Promise<Market[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    active: 'true',
    closed: 'false',
    order: 'volume24hr',
    ascending: 'false',
  });
  const response = await fetch(`${GAMMA_API}/markets?${params}`, {
    next: { revalidate: 45 },
  });
  if (!response.ok) throw new Error('Unable to load Polymarket markets');
  const raw = (await response.json()) as RawMarket[];
  return raw.map((market) => normalizeMarket(market)).filter(Boolean) as Market[];
}

export async function searchMarkets(query: string, limit = 18): Promise<Market[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return getMarkets(limit);

  const params = new URLSearchParams({
    q: cleanQuery,
    limit_per_type: String(Math.min(limit, 20)),
  });
  const response = await fetch(`${GAMMA_API}/public-search?${params}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to search Polymarket markets');
  const payload = (await response.json()) as { events?: RawEvent[]; markets?: RawMarket[] };
  const eventMarkets = (payload.events ?? []).flatMap((event) =>
    (event.markets ?? []).map((market) => normalizeMarket(market, event)),
  );
  const directMarkets = (payload.markets ?? []).map((market) => normalizeMarket(market));
  const unique = new Map<string, Market>();
  [...directMarkets, ...eventMarkets].forEach((market) => {
    if (market && market.outcomes.length >= 2) unique.set(market.id, market);
  });
  return [...unique.values()]
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit);
}
