import { MarketBrowser } from '@/components/market-browser';
import { getMarkets } from '@/lib/markets/polymarket';

export default async function Home() {
  const markets = await getMarkets();

  return <MarketBrowser initialMarkets={markets} />;
}
