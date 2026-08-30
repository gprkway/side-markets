export type Outcome = {
  label: string;
  probability: number;
};

export type Market = {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description: string;
  category: string;
  image: string;
  endDate: string | null;
  volume: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  outcomes: Outcome[];
  source: 'polymarket';
};
