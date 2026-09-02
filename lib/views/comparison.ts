import type { TraderPosition, TraderProfile } from '@/lib/traders/types';

export type ComparisonCell = {
  wallet: string;
  outcome: string;
  currentValue: number;
  currentPrice: number;
};

export type ComparisonRow = {
  conditionId: string;
  title: string;
  cells: Record<string, ComparisonCell>;
  combinedValue: number;
  walletCount: number;
  outcomeCount: number;
  kind: 'disagreement' | 'overlap' | 'unique';
};

function looksLikeSports(title: string) {
  return /\b(sports?|fc|cf|afc|nba|wnba|nfl|nhl|mlb|kbo|ncaa|uefa|atp|wta|formula 1|esports?|counter-strike|soccer|football|tennis|cricket|league|tournament|match|game \d|vs\.?\b|championship|ballon d'or|world cup|super bowl|stanley cup|mvp|cy young|grand slam)\b/i.test(title);
}

function strongestPosition(existing: TraderPosition | undefined, candidate: TraderPosition) {
  return !existing || candidate.currentValue > existing.currentValue ? candidate : existing;
}

export function buildTraderComparisonRows(
  profiles: TraderProfile[],
  minimumPositionValue: number,
  excludeSports: boolean,
): ComparisonRow[] {
  const grouped = new Map<string, { title: string; byWallet: Map<string, TraderPosition> }>();

  profiles.forEach((profile) => {
    profile.positions.forEach((position) => {
      if (!position.conditionId || position.currentValue < minimumPositionValue) return;
      if (excludeSports && looksLikeSports(position.title)) return;
      const group = grouped.get(position.conditionId) ?? { title: position.title, byWallet: new Map() };
      const wallet = profile.wallet.toLowerCase();
      group.byWallet.set(wallet, strongestPosition(group.byWallet.get(wallet), position));
      grouped.set(position.conditionId, group);
    });
  });

  return [...grouped.entries()].map(([conditionId, group]) => {
    const positions = [...group.byWallet.entries()];
    const outcomes = new Set(positions.map(([, position]) => position.outcome.toLowerCase()));
    const cells = Object.fromEntries(positions.map(([wallet, position]) => [wallet, {
      wallet,
      outcome: position.outcome,
      currentValue: position.currentValue,
      currentPrice: position.currentPrice,
    }]));
    return {
      conditionId,
      title: group.title,
      cells,
      combinedValue: positions.reduce((sum, [, position]) => sum + position.currentValue, 0),
      walletCount: positions.length,
      outcomeCount: outcomes.size,
      kind: positions.length >= 2
        ? outcomes.size >= 2 ? 'disagreement' as const : 'overlap' as const
        : 'unique' as const,
    };
  }).sort((a, b) => b.combinedValue - a.combinedValue);
}
