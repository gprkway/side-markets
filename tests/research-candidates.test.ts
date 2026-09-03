import assert from 'node:assert/strict';
import test from 'node:test';
import { compactResearchCandidates, resolveComparisonConditionIds } from '../lib/markets/research.ts';

const markets = [
  { id: 'm1', conditionId: 'c1' },
  { id: 'm2', conditionId: 'c2' },
  { id: 'm3', conditionId: 'c3' },
];

test('explicit workspace market IDs enable a no-click comparison', () => {
  assert.deepEqual(resolveComparisonConditionIds({ conditionIds: [], marketIds: ['m2', 'm1'], selectedMarketIds: [], markets }), {
    conditionIds: ['c2', 'c1'], source: 'explicit_market_ids',
  });
});

test('manual selection remains the fallback', () => {
  assert.deepEqual(resolveComparisonConditionIds({ conditionIds: [], marketIds: [], selectedMarketIds: ['m1', 'm3'], markets }), {
    conditionIds: ['c1', 'c3'], source: 'manual_selection',
  });
});

test('compact candidates preserve exact research identity and observed facts', () => {
  const candidate = compactResearchCandidates(['m1'], [{
    id: 'm1', conditionId: 'c1', eventId: 'e1', eventTitle: 'Event', groupItemTitle: 'Outcome', question: 'Question?',
    endDate: '2027-01-01', outcomes: [{ label: 'Yes', probability: .42 }], priceChange24h: .03, volume24h: 10, liquidity: 20,
  }])[0];
  assert.equal(candidate.condition_id, 'c1');
  assert.equal(candidate.event_id, 'e1');
  assert.equal(candidate.probability, .42);
});
