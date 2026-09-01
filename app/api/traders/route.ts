import { getMarketHolders, getTraderProfile } from '@/lib/traders/polymarket';

const conditionPattern = /^0x[a-fA-F0-9]{64}$/;
const walletPattern = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market') ?? '';
  const wallet = params.get('wallet') ?? '';
  const positionLimitParam = params.get('position_limit');
  const requestedPositionLimit = positionLimitParam === null ? Number.NaN : Number(positionLimitParam);
  const positionLimit = Number.isFinite(requestedPositionLimit)
    ? Math.max(1, Math.min(500, requestedPositionLimit))
    : 12;
  try {
    if (conditionPattern.test(market)) {
      return Response.json({ holders: await getMarketHolders(market) });
    }
    if (walletPattern.test(wallet)) {
      return Response.json({ trader: await getTraderProfile(wallet, positionLimit) });
    }
    return Response.json({ error: 'A valid market or wallet is required.' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Trader data is temporarily unavailable.' }, { status: 502 });
  }
}
