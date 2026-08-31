import type { TraderProfile } from '@/lib/traders/types';
import type {
  TraderWatch,
  WatchMatch,
  WatchMatchPosition,
  WatchPositionSnapshot,
} from './types';

function positionKey(position: Pick<WatchPositionSnapshot, 'wallet' | 'conditionId' | 'outcome'>) {
  return `${position.wallet.toLowerCase()}:${position.conditionId}:${position.outcome.toLowerCase()}`;
}

function looksLikeSports(title: string) {
  return /\b(sports?|fc|cf|afc|nba|wnba|nfl|nhl|mlb|kbo|ncaa|uefa|atp|wta|formula 1|esports?|counter-strike|soccer|football|tennis|cricket|league|tournament|match|game \d|vs\.?\b|championship)\b/i.test(title);
}

export function evaluateTraderWatch(
  watch: TraderWatch,
  profiles: TraderProfile[],
  traderNames: Record<string, string>,
  now = new Date().toISOString(),
): TraderWatch {
  const previousSnapshots = new Map(watch.snapshots.map((snapshot) => [positionKey(snapshot), snapshot]));
  const currentSnapshots: WatchPositionSnapshot[] = [];

  profiles.forEach((profile) => {
    profile.positions.forEach((position) => {
      const candidate = {
        wallet: profile.wallet,
        conditionId: position.conditionId,
        title: position.title,
        outcome: position.outcome,
        currentValue: position.currentValue,
      };
      const previous = previousSnapshots.get(positionKey(candidate));
      currentSnapshots.push({
        ...candidate,
        firstSeenAt: previous?.firstSeenAt ?? now,
        lastSeenAt: now,
      });
    });
  });

  const positionsByMarket = new Map<string, WatchPositionSnapshot[]>();
  currentSnapshots.forEach((snapshot) => {
    if (snapshot.currentValue < watch.minimumPositionValue) return;
    if (watch.excludeSports && looksLikeSports(snapshot.title)) return;
    const group = positionsByMarket.get(snapshot.conditionId) ?? [];
    group.push(snapshot);
    positionsByMarket.set(snapshot.conditionId, group);
  });

  const previousMatches = new Map(watch.matches.map((match) => [match.id, match]));
  const matches: WatchMatch[] = [];
  positionsByMarket.forEach((positions, conditionId) => {
    const uniqueWallets = new Set(positions.map((position) => position.wallet.toLowerCase()));
    const outcomeGroups = new Map<string, WatchPositionSnapshot[]>();
    positions.forEach((position) => {
      const key = position.outcome.toLowerCase();
      const group = outcomeGroups.get(key) ?? [];
      group.push(position);
      outcomeGroups.set(key, group);
    });

    let matchingPositions: WatchPositionSnapshot[] = [];
    if (watch.relationship === 'same_side') {
      matchingPositions = [...outcomeGroups.values()]
        .filter((group) => new Set(group.map((position) => position.wallet.toLowerCase())).size >= watch.minimumTraderOverlap)
        .flat();
    } else if (watch.relationship === 'opposite_sides') {
      if (uniqueWallets.size >= watch.minimumTraderOverlap && outcomeGroups.size >= 2) matchingPositions = positions;
    } else if (watch.snapshots.length > 0) {
      matchingPositions = positions.filter((position) => !previousSnapshots.has(positionKey(position)));
    }

    if (!matchingPositions.length) return;
    const matchId = `${watch.relationship}:${conditionId}`;
    const matchPositions: WatchMatchPosition[] = matchingPositions.map((position) => ({
      wallet: position.wallet,
      traderName: traderNames[position.wallet.toLowerCase()] ?? `${position.wallet.slice(0, 8)}…`,
      outcome: position.outcome,
      currentValue: position.currentValue,
    }));
    matches.push({
      id: matchId,
      conditionId,
      title: positions[0]?.title ?? 'Untitled market',
      relationship: watch.relationship,
      positions: matchPositions,
      firstMatchedAt: previousMatches.get(matchId)?.firstMatchedAt ?? now,
    });
  });

  return {
    ...watch,
    updatedAt: now,
    lastEvaluatedAt: now,
    snapshots: currentSnapshots,
    matches: matches.sort((a, b) =>
      b.positions.reduce((sum, position) => sum + position.currentValue, 0)
      - a.positions.reduce((sum, position) => sum + position.currentValue, 0)),
  };
}
