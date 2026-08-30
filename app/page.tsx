import { MarketBrowser } from '@/components/market-browser';
import { getMarketFeed } from '@/lib/markets/feed';

export default async function Home() {
  let feed;
  try {
    feed = await getMarketFeed();
  } catch {
    feed = { markets: [], query: '', fetchedAt: '', isStale: true };
  }
  return <MarketBrowser initialFeed={feed} />;
}
