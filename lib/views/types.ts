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
};

export type TransientTraderProfiles = Record<string, TraderProfile>;
