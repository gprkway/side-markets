export type Holder = {
  wallet: string;
  name: string;
  pseudonym: string;
  bio: string;
  image: string;
  amount: number;
  outcomeIndex: number;
  verified: boolean;
};

export type TraderPosition = {
  conditionId: string;
  title: string;
  outcome: string;
  icon: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  closed: boolean;
};

export type TraderProfile = {
  wallet: string;
  name: string;
  pseudonym: string;
  bio: string;
  image: string;
  verified: boolean;
  portfolioValue: number;
  totalPnl: number;
  positions: TraderPosition[];
  history: TraderPosition[];
};
