import { getMarketFeed } from '@/lib/markets/feed';
import { getMarketByConditionId, getMarketsByEventId } from '@/lib/markets/polymarket';

const conditionPattern = /^0x[a-fA-F0-9]{64}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const conditionId = params.get('condition')?.trim() ?? '';
  const query = params.get('q')?.trim() ?? '';
  const eventId = params.get('event')?.trim() ?? '';
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
    if (eventId) {
      if (!/^\d+$/.test(eventId)) {
        return Response.json({ error: 'A valid event ID is required.' }, { status: 400 });
      }
      return Response.json({ markets: await getMarketsByEventId(eventId) });
    }
    return Response.json(await getMarketFeed(query));
  } catch {
    return Response.json({ error: 'Market data is temporarily unavailable.' }, { status: 502 });
  }
}
