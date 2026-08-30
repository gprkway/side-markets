export type MarketComment = {
  id: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  reactionCount: number;
  author: {
    wallet: string;
    name: string;
    pseudonym: string;
    image: string;
  };
  position: {
    side: string;
    matchBasis: 'outcome_token';
  } | null;
};
