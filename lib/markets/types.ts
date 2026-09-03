export type Outcome = {
  label: string;
  probability: number;
};

export type Market = {
  id: string;
  conditionId: string;
  eventId: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
  eventImage: string;
  eventVolume: number;
  eventVolume24h: number;
  eventLiquidity: number;
  groupItemTitle: string | null;
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

export type PricePoint = { timestamp: number; price: number };
