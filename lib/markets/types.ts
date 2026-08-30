export type Outcome = {
  label: string;
  probability: number;
};

export type Market = {
  id: string;
  conditionId: string;
  eventId: string | null;
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
  tokenIds: string[];
  commentCount: number;
  outcomes: Outcome[];
  source: 'polymarket';
};
