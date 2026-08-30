import { getMarketComments } from '@/lib/comments/polymarket';

const eventPattern = /^\d+$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const tokenIds = params.getAll('token');
  const outcomes = params.getAll('outcome');
  if (!eventPattern.test(eventId)) {
    return Response.json({ error: 'A valid Polymarket event is required.' }, { status: 400 });
  }
  try {
    const comments = await getMarketComments(eventId, tokenIds, outcomes);
    return Response.json({ comments, fetchedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: 'Market discussion is temporarily unavailable.' }, { status: 502 });
  }
}
