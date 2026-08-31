import { getMarketFeed } from '@/lib/markets/feed';
import { getMarketByConditionId } from '@/lib/markets/polymarket';

const conditionPattern = /^0x[a-fA-F0-9]{64}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const conditionId = params.get('condition')?.trim() ?? '';
  const query = params.get('q')?.trim() ?? '';
  try {
    if (conditionId) {
      if (!conditionPattern.test(conditionId)) {
        return Response.json({ error: 'A valid condition ID is required.' }, { status: 400 });
      }
      const market = await getMarketByConditionId(conditionId);
      return market
        ? Response.json({ market })
        : Response.json({ error: 'Market not found.' }, { status: 404 });
    }
    return Response.json(await getMarketFeed(query));
  } catch {
    return Response.json({ error: 'Market data is temporarily unavailable.' }, { status: 502 });
  }
}
