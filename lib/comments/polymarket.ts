import type { MarketComment } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function getMarketComments(
  eventId: string,
  tokenIds: string[],
  outcomes: string[],
): Promise<MarketComment[]> {
  const params = new URLSearchParams({
    limit: '30',
    offset: '0',
    order: 'createdAt',
    ascending: 'false',
    parent_entity_type: 'Event',
    parent_entity_id: eventId,
    get_positions: 'true',
  });
  const response = await fetch(`${GAMMA_API}/comments?${params}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load market comments');
  const rawComments = await response.json() as Array<Record<string, unknown>>;

  return rawComments.map((raw) => {
    const profile = (raw.profile ?? {}) as Record<string, unknown>;
    const positions = Array.isArray(profile.positions)
      ? profile.positions as Array<Record<string, unknown>>
      : [];
    const matchedPosition = positions.find((position) => tokenIds.includes(textValue(position.tokenId)));
    const matchedIndex = matchedPosition
      ? tokenIds.indexOf(textValue(matchedPosition.tokenId))
      : -1;
    const optimizedImage = profile.profileImageOptimized as Record<string, unknown> | undefined;
    return {
      id: textValue(raw.id),
      body: textValue(raw.body),
      createdAt: textValue(raw.createdAt),
      parentCommentId: textValue(raw.parentCommentID) || null,
      reactionCount: numeric(raw.reactionCount),
      author: {
        wallet: textValue(profile.proxyWallet) || textValue(raw.userAddress),
        name: textValue(profile.name),
        pseudonym: textValue(profile.pseudonym),
        image: textValue(optimizedImage?.imageUrlOptimized) || textValue(profile.profileImage),
      },
      position: matchedIndex >= 0
        ? { side: outcomes[matchedIndex] ?? `Outcome ${matchedIndex + 1}`, matchBasis: 'outcome_token' as const }
        : null,
    };
  }).filter((comment) => comment.id && comment.body);
}
