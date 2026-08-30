import type { Holder, TraderPosition, TraderProfile } from './types';

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

export async function getMarketHolders(conditionId: string): Promise<Holder[]> {
  const params = new URLSearchParams({ market: conditionId, limit: '8', minBalance: '1' });
  const response = await fetch(`${DATA_API}/holders?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load market holders');
  const groups = (await response.json()) as Array<{ holders?: Array<Record<string, unknown>> }>;
  return groups.flatMap((group) => group.holders ?? []).map((raw) => ({
    wallet: textValue(raw.proxyWallet),
    name: textValue(raw.name),
    pseudonym: textValue(raw.pseudonym),
    bio: textValue(raw.bio),
    image: textValue(raw.profileImageOptimized) || textValue(raw.profileImage),
    amount: numeric(raw.amount),
    outcomeIndex: numeric(raw.outcomeIndex),
    verified: Boolean(raw.verified),
  })).filter((holder) => holder.wallet);
}

function normalizePosition(raw: Record<string, unknown>, closed: boolean): TraderPosition {
  return {
    conditionId: textValue(raw.conditionId),
    title: textValue(raw.title, 'Untitled market'),
    outcome: textValue(raw.outcome),
    icon: textValue(raw.icon),
    size: numeric(raw.size ?? raw.totalBought),
    avgPrice: numeric(raw.avgPrice),
    currentPrice: numeric(raw.curPrice),
    currentValue: numeric(raw.currentValue),
    pnl: numeric(closed ? raw.realizedPnl : raw.cashPnl),
    pnlPercent: numeric(raw.percentPnl ?? raw.percentRealizedPnl),
    closed,
  };
}

export async function getTraderProfile(wallet: string): Promise<TraderProfile> {
  const positionsParams = new URLSearchParams({
    user: wallet, limit: '12', sortBy: 'CURRENT', sortDirection: 'DESC',
  });
  const historyParams = new URLSearchParams({
    user: wallet, limit: '8', sortBy: 'REALIZEDPNL', sortDirection: 'DESC',
  });
  const profileParams = new URLSearchParams({ address: wallet });
  const [profileResponse, positionsResponse, historyResponse] = await Promise.all([
    fetch(`${GAMMA_API}/public-profile?${profileParams}`, { cache: 'no-store' }),
    fetch(`${DATA_API}/positions?${positionsParams}`, { cache: 'no-store' }),
    fetch(`${DATA_API}/closed-positions?${historyParams}`, { cache: 'no-store' }),
  ]);
  if (!positionsResponse.ok || !historyResponse.ok) throw new Error('Unable to load trader intelligence');
  const profile = profileResponse.ok ? await profileResponse.json() as Record<string, unknown> : {};
  const positionsRaw = await positionsResponse.json() as Array<Record<string, unknown>>;
  const historyRaw = await historyResponse.json() as Array<Record<string, unknown>>;
  const positions = positionsRaw.map((position) => normalizePosition(position, false));
  const history = historyRaw.map((position) => normalizePosition(position, true));
  return {
    wallet,
    name: textValue(profile.name),
    pseudonym: textValue(profile.pseudonym),
    bio: textValue(profile.bio),
    image: textValue(profile.profileImageOptimized) || textValue(profile.profileImage),
    verified: Boolean(profile.verifiedBadge),
    portfolioValue: positions.reduce((sum, position) => sum + position.currentValue, 0),
    totalPnl: positions.reduce((sum, position) => sum + position.pnl, 0) + history.reduce((sum, position) => sum + position.pnl, 0),
    positions,
    history,
  };
}
