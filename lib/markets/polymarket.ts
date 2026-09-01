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
  clobTokenIds?: string;
  commentCount?: number;
  events?: RawEvent[];
  outcomes?: string;
  outcomePrices?: string;
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  oneDayPriceChange?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
};

type RawEvent = {
  id?: string;
  title?: string;
  category?: string;
  commentCount?: number;
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
  if (!raw.id || !raw.conditionId || raw.active === false || raw.closed === true) return null;
  const labels = parseList(raw.outcomes);
  const prices = parseList(raw.outcomePrices);
  const outcomes = labels.map((label, index) => ({
    label,
    probability: Math.max(0, Math.min(1, numeric(prices[index]))),
  }));

  return {
    id: raw.id,
    conditionId: raw.conditionId,
    eventId: event?.id ?? raw.events?.[0]?.id ?? null,
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
    tokenIds: parseList(raw.clobTokenIds),
    commentCount: numeric(event?.commentCount ?? raw.commentCount),
    outcomes,
    source: 'polymarket',
  };
}

const searchStopWords = new Set([
  'a', 'after', 'an', 'and', 'at', 'be', 'before', 'by', 'for', 'from', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'will', 'with',
]);

function searchTokens(value: string) {
  return value.toLowerCase()
    .replace(/\bfederal reserve\b/g, 'fed')
    .replace(/\bartificial intelligence\b/g, 'ai')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 1 && !searchStopWords.has(token));
}

function searchScore(market: Market, query: string) {
  const queryTokens = [...new Set(searchTokens(query))];
  const questionTokens = new Set(searchTokens(market.question));
  const supportingTokens = new Set(searchTokens(`${market.category} ${market.description}`));
  const questionMatches = queryTokens.filter((token) => questionTokens.has(token)).length;
  const supportingMatches = queryTokens.filter((token) => supportingTokens.has(token)).length;
  const matchedTokens = queryTokens.filter((token) => questionTokens.has(token) || supportingTokens.has(token)).length;
  const exactPhrase = market.question.toLowerCase().includes(query.toLowerCase()) ? 4 : 0;
  const lexical = exactPhrase + questionMatches * 3 + supportingMatches;
  const activity = Math.log10(Math.max(1, market.volume24h + market.liquidity)) / 10;
  return {
    lexical,
    matchedTokens,
    requiredMatches: Math.min(queryTokens.length, Math.max(1, Math.ceil(queryTokens.length * 0.6))),
    total: lexical + activity,
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

  const canonicalQuery = searchTokens(cleanQuery).join(' ');
  const queries = [...new Set([cleanQuery, canonicalQuery].filter(Boolean))];
  const payloads = await Promise.all(queries.map(async (searchQuery) => {
    const params = new URLSearchParams({
      q: searchQuery,
      limit_per_type: String(Math.min(limit, 20)),
    });
    const response = await fetch(`${GAMMA_API}/public-search?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to search Polymarket markets');
    return (await response.json()) as { events?: RawEvent[]; markets?: RawMarket[] };
  }));
  const eventMarkets = payloads.flatMap((payload) => (payload.events ?? []).flatMap((event) =>
    (event.markets ?? []).map((market) => normalizeMarket(market, event)),
  ));
  const directMarkets = payloads.flatMap((payload) => (payload.markets ?? []).map((market) => normalizeMarket(market)));
  const unique = new Map<string, Market>();
  [...directMarkets, ...eventMarkets].forEach((market) => {
    if (market && market.outcomes.length >= 2) unique.set(market.id, market);
  });
  const scored = [...unique.values()].map((market) => ({ market, score: searchScore(market, cleanQuery) }));
  const relevant = scored.filter(({ score }) => score.matchedTokens >= score.requiredMatches);
  return relevant
    .sort((a, b) => b.score.total - a.score.total || b.market.volume24h - a.market.volume24h)
    .map(({ market }) => market)
    .slice(0, limit);
}

export async function getMarketByConditionId(conditionId: string): Promise<Market | null> {
  const params = new URLSearchParams({ condition_ids: conditionId, limit: '1' });
  const response = await fetch(`${GAMMA_API}/markets?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load Polymarket market');
  const raw = (await response.json()) as RawMarket[];
  return raw.length ? normalizeMarket(raw[0], raw[0].events?.[0]) : null;
}
