import type { TraderProfile } from '@/lib/traders/types';

export type FollowedTrader = {
  wallet: string;
  name: string;
  followedAt: string;
  reason?: string;
  categories?: string[];
};

export type ComposedTrader = {
  wallet: string;
  name: string;
  reason: string;
  marketId?: string;
};

export type ViewSection = {
  id: string;
  type: 'markets' | 'traders' | 'related_markets' | 'trader_positions' | 'overlap' | 'disagreement';
  title: string;
  marketIds?: string[];
  traderWallets?: string[];
};

export type ComparisonFocus = 'all' | 'overlap' | 'disagreement' | 'single_trader';
export type ResearchMode = 'trader_comparison' | 'market_comparison';
export type MarketComparisonBasis = 'exact_event_siblings' | 'selected_comparison_set';

export type ResearchContext = {
  comparisonId: string;
  mode: ResearchMode;
  thesisMarketId: string;
  thesisConditionId: string;
  thesisEventId: string | null;
  thesisQuestion: string;
  thesisProbability: number;
  thesisPriceChange24h: number;
  thesisVolume24h: number;
  traderWallets: string[];
  primaryTraderWallet: string | null;
  minimumPositionValue: number;
  excludeSports: boolean;
  focus: ComparisonFocus;
  marketConditionIds: string[];
  marketComparisonBasis: MarketComparisonBasis | null;
  linkedWatchId: string | null;
  updatedAt: string;
};

export type SavedView = {
  id: string;
  title: string;
  intent: string;
  timeframe: string;
  createdAt: string;
  updatedAt: string;
  marketIds: string[];
  traders: ComposedTrader[];
  sections: ViewSection[];
  sort: string;
  selectedMarketIds: string[];
  researchContext?: ResearchContext;
};

export type TransientTraderProfiles = Record<string, TraderProfile>;
