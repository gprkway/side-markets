import type { Holder, TraderPosition, TraderProfile } from './types';

const DATA_API = 'https://data-api.polymarket.com';
const GAMMA_API = 'https://gamma-api.polymarket.com';

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const size = optionalNumber(raw.size ?? raw.totalBought);
  const avgPrice = optionalNumber(raw.avgPrice);
  const currentPrice = optionalNumber(raw.curPrice);
  const currentValue = optionalNumber(raw.currentValue);
  return {
    conditionId: textValue(raw.conditionId),
    title: textValue(raw.title, 'Untitled market'),
    outcome: textValue(raw.outcome),
    icon: textValue(raw.icon),
    size: size !== null && size >= 0 ? size : 0,
    avgPrice: avgPrice !== null && avgPrice >= 0 && avgPrice <= 1 ? avgPrice : 0,
    currentPrice: currentPrice !== null && currentPrice >= 0 && currentPrice <= 1 ? currentPrice : 0,
    currentValue: currentValue !== null && currentValue >= 0 ? currentValue : 0,
    pnl: optionalNumber(closed ? raw.realizedPnl : raw.cashPnl),
    pnlPercent: optionalNumber(raw.percentPnl ?? raw.percentRealizedPnl),
    closed,
  };
}

function dedupePositions(rawPositions: Array<Record<string, unknown>>, closed: boolean) {
  const unique = new Map<string, TraderPosition>();
  rawPositions.forEach((raw) => {
    if (!closed && (raw.redeemable === true || numeric(raw.size) <= 0.01)) return;
    const position = normalizePosition(raw, closed);
    if (!position.conditionId || !position.outcome) return;
    const key = `${position.conditionId}:${position.outcome.toLowerCase()}`;
    const existing = unique.get(key);
    if (!existing || position.currentValue > existing.currentValue) unique.set(key, position);
  });
  return [...unique.values()];
}

export async function getTraderProfile(wallet: string): Promise<TraderProfile> {
  const positionsParams = new URLSearchParams({
    user: wallet, limit: '500', sizeThreshold: '0.01', sortBy: 'CURRENT', sortDirection: 'DESC',
  });
  const historyParams = new URLSearchParams({
    user: wallet, limit: '12', sortBy: 'REALIZEDPNL', sortDirection: 'DESC',
  });
  const profileParams = new URLSearchParams({ address: wallet });
  const [profileResponse, positionsResponse, historyResponse] = await Promise.all([
    fetch(`${GAMMA_API}/public-profile?${profileParams}`, { cache: 'no-store' }),
    fetch(`${DATA_API}/positions?${positionsParams}`, { cache: 'no-store' }),
    fetch(`${DATA_API}/closed-positions?${historyParams}`, { cache: 'no-store' }),
  ]);
  if (!positionsResponse.ok) throw new Error('Unable to load trader intelligence');
  const profile = profileResponse.ok ? await profileResponse.json() as Record<string, unknown> : {};
  const positionsRaw = await positionsResponse.json() as Array<Record<string, unknown>>;
  const historyRaw = historyResponse.ok
    ? await historyResponse.json() as Array<Record<string, unknown>>
    : [];
  const positions = dedupePositions(positionsRaw, false)
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 12);
  const history = dedupePositions(historyRaw, true)
    .filter((position) => position.pnl !== null)
    .sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
    .slice(0, 8);
  return {
    wallet,
    name: textValue(profile.name),
    pseudonym: textValue(profile.pseudonym),
    bio: textValue(profile.bio),
    image: textValue(profile.profileImageOptimized) || textValue(profile.profileImage),
    verified: Boolean(profile.verifiedBadge),
    visibleOpenValue: positions.reduce((sum, position) => sum + position.currentValue, 0),
    positions,
    history,
  };
}
