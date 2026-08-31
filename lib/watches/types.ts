export type WatchRelationship = 'same_side' | 'opposite_sides' | 'new_position';
export type WatchStatus = 'active' | 'paused';

export type WatchPositionSnapshot = {
  wallet: string;
  conditionId: string;
  title: string;
  outcome: string;
  currentValue: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type WatchMatchPosition = {
  wallet: string;
  traderName: string;
  outcome: string;
  currentValue: number;
};

export type WatchMatch = {
  id: string;
  conditionId: string;
  title: string;
  relationship: WatchRelationship;
  positions: WatchMatchPosition[];
  firstMatchedAt: string;
};

export type TraderWatch = {
  id: string;
  name: string;
  traderWallets: string[];
  relationship: WatchRelationship;
  minimumTraderOverlap: number;
  minimumPositionValue: number;
  excludeSports: boolean;
  status: WatchStatus;
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt: string | null;
  snapshots: WatchPositionSnapshot[];
  matches: WatchMatch[];
};
