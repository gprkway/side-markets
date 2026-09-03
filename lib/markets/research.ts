import type { Market } from './types';

type ResearchMarket = Pick<Market,
  'id' | 'conditionId' | 'eventId' | 'eventTitle' | 'groupItemTitle' | 'question' | 'endDate' |
  'outcomes' | 'priceChange24h' | 'volume24h' | 'liquidity'>;

export function compactResearchCandidates(marketIds: string[], markets: ResearchMarket[]) {
  const byId = new Map(markets.map((market) => [market.id, market]));
  return marketIds.flatMap((id) => {
    const market = byId.get(id);
    if (!market) return [];
    return [{
      market_id: market.id,
      condition_id: market.conditionId,
      event_id: market.eventId,
      event_title: market.eventTitle,
      contract_label: market.groupItemTitle,
      title: market.question,
      deadline: market.endDate,
      probability: market.outcomes[0]?.probability ?? 0,
      movement_24h: market.priceChange24h,
      volume_24h: market.volume24h,
      liquidity: market.liquidity,
    }];
  });
}

export function resolveComparisonConditionIds({
  conditionIds,
  marketIds,
  selectedMarketIds,
  markets,
}: {
  conditionIds: string[];
  marketIds: string[];
  selectedMarketIds: string[];
  markets: Pick<Market, 'id' | 'conditionId'>[];
}) {
  const explicitConditions = [...new Set(conditionIds.filter(Boolean))];
  if (explicitConditions.length) return { conditionIds: explicitConditions.slice(0, 6), source: 'explicit_condition_ids' as const };
  const byId = new Map(markets.map((market) => [market.id, market.conditionId]));
  const explicitMarkets = [...new Set(marketIds)].flatMap((id) => byId.get(id) ?? []).slice(0, 6);
  if (explicitMarkets.length) return { conditionIds: explicitMarkets, source: 'explicit_market_ids' as const };
  const manual = [...new Set(selectedMarketIds)].flatMap((id) => byId.get(id) ?? []).slice(0, 6);
  return { conditionIds: manual, source: 'manual_selection' as const };
}
