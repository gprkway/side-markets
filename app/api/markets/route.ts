import { getMarketFeed } from '@/lib/markets/feed';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  try {
    return Response.json(await getMarketFeed(query));
  } catch {
    return Response.json({ error: 'Market data is temporarily unavailable.' }, { status: 502 });
  }
}
