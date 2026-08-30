import { getMarkets, searchMarkets } from './polymarket';
import type { Market } from './types';

export type MarketFeed = {
  markets: Market[];
  query: string;
  fetchedAt: string;
  isStale: boolean;
};

const lastKnownGood = new Map<string, MarketFeed>();

export async function getMarketFeed(query = ''): Promise<MarketFeed> {
  const cleanQuery = query.trim();
  const key = cleanQuery.toLowerCase() || 'trending';
  try {
    const markets = cleanQuery ? await searchMarkets(cleanQuery) : await getMarkets();
    const feed = { markets, query: cleanQuery, fetchedAt: new Date().toISOString(), isStale: false };
    if (markets.length) lastKnownGood.set(key, feed);
    return feed;
  } catch (error) {
    const cached = lastKnownGood.get(key);
    if (cached) return { ...cached, isStale: true };
    throw error;
  }
}
