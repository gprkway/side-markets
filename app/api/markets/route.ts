import { getMarkets, searchMarkets } from '@/lib/markets/polymarket';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  try {
    const markets = query ? await searchMarkets(query) : await getMarkets();
    return Response.json({ markets, query, fetchedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: 'Market data is temporarily unavailable.' }, { status: 502 });
  }
}
