'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Bookmark,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Command,
  Search,
  LoaderCircle,
  MessageSquare,
  Plus,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { Market } from '@/lib/markets/types';
import type { MarketFeed } from '@/lib/markets/feed';
import type { Holder, TraderProfile } from '@/lib/traders/types';
import type { MarketComment } from '@/lib/comments/types';
import type { ComposedTrader, FollowedTrader, SavedView, TransientTraderProfiles } from '@/lib/views/types';

type PaperTradeDraft = {
  marketId: string;
  question: string;
  outcome: string;
  probability: number;
  amount: number;
};

type PaperTrade = PaperTradeDraft & { id: string; createdAt: string };

type CommentArgument = {
  claim: string;
  evidenceCommentIds: string[];
};

type CommentArguments = {
  yes: CommentArgument[];
  no: CommentArgument[];
};

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (input: Record<string, unknown>) => unknown;
      annotations?: Record<string, boolean>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

declare global {
  interface Document { modelContext?: ModelContext; }
  interface Navigator { modelContext?: ModelContext; }
}

const compactMoney = new Intl.NumberFormat('en-US', {
  notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1,
});
const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact', maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const commentTime = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
});

const MARKET_CACHE_KEY = 'side.marketFeeds.v1';
const SAVED_VIEWS_KEY = 'side.savedViews';
const FOLLOWED_TRADERS_KEY = 'side.followedTraders';

function marketCacheKey(query: string) {
  return query.trim().toLowerCase() || 'trending';
}

function readCachedFeed(query: string): MarketFeed | null {
  try {
    const feeds = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) ?? '{}') as Record<string, MarketFeed>;
    return feeds[marketCacheKey(query)] ?? null;
  } catch {
    localStorage.removeItem(MARKET_CACHE_KEY);
    return null;
  }
}

function writeCachedFeed(feed: MarketFeed) {
  try {
    const feeds = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) ?? '{}') as Record<string, MarketFeed>;
    feeds[marketCacheKey(feed.query)] = feed;
    localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(feeds));
  } catch {
    // A full or unavailable browser store should never block the live feed.
  }
}

function primaryProbability(market: Market) {
  return (market.outcomes[0]?.probability ?? 0) * 100;
}

function formatProbability(probability: number) {
  const percent = Math.max(0, Math.min(100, probability * 100));
  if (percent > 0 && percent < 0.1) return '<0.1%';
  if ((percent > 0 && percent < 1) || (percent > 99 && percent < 100)) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

function formatCents(probability: number) {
  const cents = Math.max(0, Math.min(100, probability * 100));
  if (cents > 0 && cents < 0.1) return '<0.1¢';
  if ((cents > 0 && cents < 1) || (cents > 99 && cents < 100)) return `${cents.toFixed(1)}¢`;
  return `${Math.round(cents)}¢`;
}

function formatMovement(change: number) {
  const points = change * 100;
  if (Math.abs(points) < 0.05) return 'flat 24h';
  return `${points > 0 ? '+' : ''}${points.toFixed(1)} pts`;
}

function isSportsMarket(market: Market) {
  const haystack = `${market.category} ${market.question} ${market.description}`.toLowerCase();
  return /\b(sports?|fc|cf|afc|nba|nfl|nhl|mlb|soccer|football|tennis|cricket|league|tournament|match|game \d|vs\.?\b|championship|upcoming game|match statistics|regular play|stoppage time|governing body or event organizers)\b/.test(haystack);
}

function MarketCard({
  market,
  onOpen,
  selected,
  onToggleSelect,
}: {
  market: Market;
  onOpen: (market: Market) => void;
  selected: boolean;
  onToggleSelect: (marketId: string) => void;
}) {
  const probability = primaryProbability(market);
  return (
    <article className={`market-card ${selected ? 'selected' : ''}`}>
      <button className="market-card-open" onClick={() => onOpen(market)} aria-label={`Open ${market.question}`}>
        <div className="market-card-topline">
          <div className="market-identity">
            {market.image ? <img src={market.image} alt="" /> : <span className="market-fallback">S</span>}
            <span>{market.category}</span>
          </div>
        </div>
        <h2>{market.question}</h2>
        <div className="probability-row">
          <strong>{formatProbability(market.outcomes[0]?.probability ?? 0)}</strong>
          <span>{market.outcomes[0]?.label ?? 'Yes'}</span>
        </div>
        <div className="split-track" aria-label={`${probability}% probability`}><span style={{ width: `${probability}%` }} /></div>
        <div className="market-card-meta">
          <span>{compactMoney.format(market.volume24h)} today</span>
          <span className={market.priceChange24h > 0 ? 'positive' : market.priceChange24h < 0 ? 'negative' : ''}>{formatMovement(market.priceChange24h)}</span>
          <span>{market.endDate ? shortDate.format(new Date(market.endDate)) : 'Open'}</span>
          <ChevronRight aria-hidden="true" />
        </div>
      </button>
      <button className="selection-toggle" onClick={() => onToggleSelect(market.id)} aria-pressed={selected} aria-label={`${selected ? 'Deselect' : 'Select'} ${market.question}`}>
        {selected ? <Check /> : <Plus />}
      </button>
    </article>
  );
}

export function MarketBrowser({ initialFeed }: { initialFeed: MarketFeed }) {
  const [markets, setMarkets] = useState(initialFeed.markets);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState(initialFeed.query);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agentConnected, setAgentConnected] = useState(false);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<TraderProfile | null>(null);
  const [traderLoading, setTraderLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [tradeDraft, setTradeDraft] = useState<PaperTradeDraft | null>(null);
  const [tradeConfirmed, setTradeConfirmed] = useState(false);
  const [feedMeta, setFeedMeta] = useState({ fetchedAt: initialFeed.fetchedAt, isStale: initialFeed.isStale });
  const [freshnessText, setFreshnessText] = useState('updated just now');
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [composedView, setComposedView] = useState<SavedView | null>(null);
  const [composedProfiles, setComposedProfiles] = useState<TransientTraderProfiles>({});
  const [followedTraders, setFollowedTraders] = useState<FollowedTrader[]>([]);
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [positionedCommentsOnly, setPositionedCommentsOnly] = useState(false);
  const [commentArguments, setCommentArguments] = useState<CommentArguments | null>(null);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setWatchlist(JSON.parse(localStorage.getItem('side.watchlist') ?? '[]'));
        setPaperTrades(JSON.parse(localStorage.getItem('side.paperTrades') ?? '[]'));
        setSavedViews(JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]'));
        setFollowedTraders(JSON.parse(localStorage.getItem(FOLLOWED_TRADERS_KEY) ?? '[]'));
      } catch {
        localStorage.removeItem('side.watchlist');
        localStorage.removeItem('side.paperTrades');
        localStorage.removeItem(SAVED_VIEWS_KEY);
        localStorage.removeItem(FOLLOWED_TRADERS_KEY);
      }
    });
  }, []);

  const runSearch = useCallback(async (searchQuery: string) => {
    const cleanQuery = searchQuery.trim();
    setLoading(true);
    setError('');
    setQuery(cleanQuery);
    try {
      const response = await fetch(`/api/markets?q=${encodeURIComponent(cleanQuery)}`);
      if (!response.ok) throw new Error('Search failed');
      const payload = (await response.json()) as MarketFeed;
      setMarkets(payload.markets);
      setActiveQuery(cleanQuery);
      setFeedMeta({ fetchedAt: payload.fetchedAt, isStale: payload.isStale });
      writeCachedFeed(payload);
      if (payload.isStale) setError('Live refresh is unavailable. Showing last-known real market data.');
      setSelectedMarket(null);
      setSelectedTrader(null);
      setHolders([]);
      setComments([]);
      setCommentsOpen(false);
      setCommentArguments(null);
      setComposedView(null);
      return {
        visible_market_count: payload.markets.length,
        query: cleanQuery || 'trending',
        visible_markets: payload.markets.slice(0, 8).map((market) => ({
          id: market.id, question: market.question,
          probability_percent: primaryProbability(market), volume_24h: market.volume24h,
          price_change_24h_points: market.priceChange24h * 100,
        })),
        ui_changed: true,
      };
    } catch {
      const cached = readCachedFeed(cleanQuery);
      if (cached?.markets.length) {
        setMarkets(cached.markets);
        setActiveQuery(cleanQuery);
        setSelectedMarket(null);
        setSelectedTrader(null);
        setHolders([]);
        setComments([]);
        setCommentsOpen(false);
        setCommentArguments(null);
        setComposedView(null);
        setFeedMeta({ fetchedAt: cached.fetchedAt, isStale: true });
        setError('Live refresh is unavailable. Showing last-known real market data.');
        return { visible_market_count: cached.markets.length, query: cleanQuery || 'trending', data_status: 'cached_real_data', ui_changed: true };
      }
      setError('Could not refresh the live market feed. Try again in a moment.');
      return { error: 'Live search failed and no real cached results are available.', ui_changed: false };
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initialFeed.markets.length) {
      writeCachedFeed(initialFeed);
      return;
    }
    const cached = readCachedFeed('');
    if (cached?.markets.length) {
      queueMicrotask(() => {
        setMarkets(cached.markets);
        setFeedMeta({ fetchedAt: cached.fetchedAt, isStale: true });
        setError('Live refresh is unavailable. Showing last-known real market data.');
      });
    } else {
      queueMicrotask(() => void runSearch(''));
    }
  }, [initialFeed, runSearch]);

  useEffect(() => {
    const updateFreshness = () => {
      if (!feedMeta.fetchedAt) return setFreshnessText('waiting for live data');
      const minutes = Math.max(0, Math.floor((Date.now() - new Date(feedMeta.fetchedAt).getTime()) / 60000));
      setFreshnessText(minutes < 1 ? 'updated just now' : `updated ${minutes}m ago`);
    };
    queueMicrotask(updateFreshness);
    const timer = window.setInterval(updateFreshness, 60000);
    return () => window.clearInterval(timer);
  }, [feedMeta.fetchedAt]);

  const openMarketById = useCallback((id: string) => {
    const market = markets.find((candidate) => candidate.id === id);
    if (!market) return { error: 'Market is not in the visible result set.', ui_changed: false };
    setSelectedMarket(market);
    setSelectedTrader(null);
    setHolders([]);
    setComments([]);
    setCommentsOpen(false);
    setCommentArguments(null);
    return {
      market: { id: market.id, question: market.question, outcomes: market.outcomes, volume_24h: market.volume24h, liquidity: market.liquidity },
      drawer_opened: true, ui_changed: true,
    };
  }, [markets]);

  const loadHolders = useCallback(async () => {
    if (!selectedMarket) return { error: 'No market is currently open.', ui_changed: false };
    setHoldersLoading(true);
    try {
      const response = await fetch(`/api/traders?market=${encodeURIComponent(selectedMarket.conditionId)}`);
      if (!response.ok) throw new Error('Holder request failed');
      const payload = await response.json() as { holders: Holder[] };
      setHolders(payload.holders);
      return {
        market_id: selectedMarket.id,
        holders: payload.holders.map((holder) => ({
          wallet: holder.wallet,
          name: holder.name || holder.pseudonym || `${holder.wallet.slice(0, 6)}…${holder.wallet.slice(-4)}`,
          outcome: selectedMarket.outcomes[holder.outcomeIndex]?.label ?? `Outcome ${holder.outcomeIndex + 1}`,
          shares: holder.amount,
        })),
        ui_changed: true,
      };
    } catch {
      return { error: 'Could not load notable holders.', ui_changed: false };
    } finally {
      setHoldersLoading(false);
    }
  }, [selectedMarket]);

  const openTrader = useCallback(async (wallet: string) => {
    setTraderLoading(true);
    try {
      const response = await fetch(`/api/traders?wallet=${encodeURIComponent(wallet)}`);
      if (!response.ok) throw new Error('Trader request failed');
      const payload = await response.json() as { trader: TraderProfile };
      setSelectedTrader(payload.trader);
      return {
        trader: {
          wallet: payload.trader.wallet,
          name: payload.trader.name || payload.trader.pseudonym,
          visible_open_value: payload.trader.visibleOpenValue,
          value_scope: 'Sum of the visible, non-redeemable open positions returned by Polymarket.',
          current_positions: payload.trader.positions.map((position) => ({
            condition_id: position.conditionId,
            title: position.title,
            side: position.outcome,
            value: position.currentValue,
            ...(position.pnl !== null ? { unrealized_pnl: position.pnl } : {}),
          })),
        },
        ui_changed: true,
      };
    } catch {
      return { error: 'Could not load this trader profile.', ui_changed: false };
    } finally {
      setTraderLoading(false);
    }
  }, []);

  const toggleMarketSelection = useCallback((marketId: string) => {
    setSelectedMarketIds((current) => current.includes(marketId)
      ? current.filter((id) => id !== marketId)
      : [...current, marketId]);
  }, []);

  const saveComposedView = useCallback((view: SavedView) => {
    setComposedView(view);
    setSavedViews((current) => {
      const next = [view, ...current.filter((candidate) => candidate.id !== view.id)];
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleTraderFollow = useCallback((wallet: string, name: string, reason?: string) => {
    const exists = followedTraders.some((trader) => trader.wallet.toLowerCase() === wallet.toLowerCase());
    const next = exists
      ? followedTraders.filter((trader) => trader.wallet.toLowerCase() !== wallet.toLowerCase())
      : [...followedTraders, { wallet, name: name || `${wallet.slice(0, 8)}…${wallet.slice(-5)}`, followedAt: new Date().toISOString(), reason }];
    setFollowedTraders(next);
    localStorage.setItem(FOLLOWED_TRADERS_KEY, JSON.stringify(next));
    return { wallet, followed: !exists, ui_changed: true };
  }, [followedTraders]);

  const loadComments = useCallback(async () => {
    if (!selectedMarket?.eventId) {
      return { error: 'This market does not expose a Polymarket event ID for comments.', ui_changed: false };
    }
    setCommentsLoading(true);
    try {
      const params = new URLSearchParams({ event: selectedMarket.eventId });
      selectedMarket.tokenIds.forEach((token) => params.append('token', token));
      selectedMarket.outcomes.forEach((outcome) => params.append('outcome', outcome.label));
      const response = await fetch(`/api/comments?${params}`);
      if (!response.ok) throw new Error('Comments request failed');
      const payload = await response.json() as { comments: MarketComment[]; fetchedAt: string };
      setComments(payload.comments);
      setCommentsOpen(true);
      setPositionedCommentsOnly(false);
      setCommentArguments(null);
      const holderWallets = new Set(holders.map((holder) => holder.wallet.toLowerCase()));
      return {
        market_id: selectedMarket.id,
        comment_count: payload.comments.length,
        comments: payload.comments.slice(0, 16).map((comment) => ({
          id: comment.id,
          text: comment.body.slice(0, 600),
          timestamp: comment.createdAt,
          author: comment.author.name || comment.author.pseudonym || comment.author.wallet,
          author_wallet: comment.author.wallet || null,
          reply_to: comment.parentCommentId,
          reactions: comment.reactionCount,
          positioned_side: comment.position?.side ?? null,
          matched_visible_holder: Boolean(comment.author.wallet && holderWallets.has(comment.author.wallet.toLowerCase())),
        })),
        identity_note: 'A positioned side is included only when Polymarket returned an outcome-token match. Holder matching uses exact proxy-wallet equality.',
        ui_changed: true,
      };
    } catch {
      return { error: 'Could not load real Polymarket comments for this market.', ui_changed: false };
    } finally {
      setCommentsLoading(false);
    }
  }, [holders, selectedMarket]);

  const composeMarketView = useCallback(async (input: Record<string, unknown>) => {
    setLoading(true);
    setError('');
    try {
      const searchQuery = typeof input.query === 'string' ? input.query.trim() : '';
      const response = await fetch(`/api/markets?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Composition search failed');
      const feed = await response.json() as MarketFeed;
      const minimumVolume = Math.max(0, Number(input.min_volume_24h) || 0);
      const excludeSports = input.exclude_sports === true;
      const useSelected = input.use_selected_markets === true && selectedMarketIds.length > 0;
      const limit = Math.max(1, Math.min(18, Number(input.limit) || 8));
      const sort = input.sort === 'movement' ? 'movement' : 'volume';
      let candidates = feed.markets.filter((market) => market.volume24h >= minimumVolume);
      if (excludeSports) candidates = candidates.filter((market) => !isSportsMarket(market));
      if (useSelected) candidates = candidates.filter((market) => selectedMarketIds.includes(market.id));
      candidates = [...candidates]
        .sort(sort === 'movement'
          ? (a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h)
          : (a, b) => b.volume24h - a.volume24h)
        .slice(0, limit);

      const composedTraders: ComposedTrader[] = [];
      if (input.include_traders === true && candidates.length) {
        const holderResponses = await Promise.all(candidates.slice(0, 3).map(async (market) => {
          const holderResponse = await fetch(`/api/traders?market=${encodeURIComponent(market.conditionId)}`);
          if (!holderResponse.ok) return { market, holders: [] as Holder[] };
          const payload = await holderResponse.json() as { holders: Holder[] };
          return { market, holders: payload.holders };
        }));
        const seen = new Set<string>();
        holderResponses.forEach(({ market, holders: marketHolders }) => {
          marketHolders.slice(0, 2).forEach((holder, index) => {
            if (seen.has(holder.wallet.toLowerCase())) return;
            seen.add(holder.wallet.toLowerCase());
            const side = market.outcomes[holder.outcomeIndex]?.label ?? `Outcome ${holder.outcomeIndex + 1}`;
            composedTraders.push({
              wallet: holder.wallet,
              name: holder.name || holder.pseudonym || `${holder.wallet.slice(0, 8)}…${holder.wallet.slice(-5)}`,
              reason: `${index === 0 ? 'Largest' : 'Notable'} visible ${side} holder in “${market.question}”`,
              marketId: market.id,
            });
          });
        });
      }

      const now = new Date().toISOString();
      const viewId = crypto.randomUUID();
      const title = typeof input.title === 'string' && input.title.trim()
        ? input.title.trim()
        : searchQuery ? `${searchQuery} research` : 'Consequential movers today';
      const view: SavedView = {
        id: viewId,
        title,
        intent: typeof input.intent === 'string' ? input.intent : searchQuery,
        timeframe: typeof input.timeframe === 'string' ? input.timeframe : 'today',
        createdAt: now,
        updatedAt: now,
        marketIds: candidates.map((market) => market.id),
        traders: composedTraders.slice(0, 6),
        sections: [
          ...(candidates.length ? [{ id: `${viewId}-markets`, type: 'markets' as const, title: sort === 'movement' ? 'Top movers' : 'Most active', marketIds: candidates.map((market) => market.id) }] : []),
          ...(composedTraders.length ? [{ id: `${viewId}-traders`, type: 'traders' as const, title: 'Notable traders', traderWallets: composedTraders.slice(0, 6).map((trader) => trader.wallet) }] : []),
        ],
        sort,
        selectedMarketIds: useSelected ? [...selectedMarketIds] : [],
      };
      setMarkets(feed.markets);
      setFeedMeta({ fetchedAt: feed.fetchedAt, isStale: feed.isStale });
      setActiveQuery(searchQuery);
      setSelectedMarket(null);
      setSelectedTrader(null);
      setHolders([]);
      setComposedProfiles({});
      saveComposedView(view);
      return { viewId, title, marketCount: candidates.length, traderCount: view.traders.length, saved: true, ui_changed: true };
    } catch {
      setError('Could not assemble this live research view.');
      return { error: 'Live composition failed.', ui_changed: false };
    } finally {
      setLoading(false);
    }
  }, [saveComposedView, selectedMarketIds]);

  const updateMarketView = useCallback((input: Record<string, unknown>) => {
    if (!composedView) return { error: 'No composed research view is currently open.', ui_changed: false };
    const removeIds = Array.isArray(input.remove_market_ids) ? input.remove_market_ids.map(String) : [];
    const keepIds = Array.isArray(input.keep_market_ids) ? input.keep_market_ids.map(String) : [];
    let marketIds = [...composedView.marketIds];
    if (input.remove_sports === true) marketIds = marketIds.filter((id) => {
      const market = markets.find((candidate) => candidate.id === id);
      return market ? !isSportsMarket(market) : false;
    });
    if (removeIds.length) marketIds = marketIds.filter((id) => !removeIds.includes(id));
    if (keepIds.length) marketIds = marketIds.filter((id) => keepIds.includes(id));
    if (input.keep_selected === true && selectedMarketIds.length) marketIds = marketIds.filter((id) => selectedMarketIds.includes(id));
    if (input.add_selected === true) marketIds = [...new Set([...marketIds, ...selectedMarketIds])];
    const updated: SavedView = {
      ...composedView,
      title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : composedView.title,
      updatedAt: new Date().toISOString(),
      marketIds,
      selectedMarketIds: [...selectedMarketIds],
      sections: composedView.sections
        .map((section) => section.type === 'markets' || section.type === 'related_markets' ? { ...section, marketIds } : section)
        .filter((section) => section.type !== 'markets' && section.type !== 'related_markets' || Boolean(section.marketIds?.length)),
    };
    saveComposedView(updated);
    return { viewId: updated.id, title: updated.title, marketCount: marketIds.length, saved: true, ui_changed: true };
  }, [composedView, markets, saveComposedView, selectedMarketIds]);

  const composeFollowedTraderView = useCallback(async () => {
    if (!followedTraders.length) return { error: 'No traders are followed on this device.', ui_changed: false };
    setLoading(true);
    try {
      const results = await Promise.all(followedTraders.slice(0, 6).map(async (followed) => {
        const response = await fetch(`/api/traders?wallet=${encodeURIComponent(followed.wallet)}`);
        if (!response.ok) return null;
        return (await response.json() as { trader: TraderProfile }).trader;
      }));
      const profiles = results.filter(Boolean) as TraderProfile[];
      const profileMap = Object.fromEntries(profiles.map((profile) => [profile.wallet, profile]));
      setComposedProfiles(profileMap);
      const now = new Date().toISOString();
      const viewId = crypto.randomUUID();
      const traders = followedTraders.slice(0, 6).map((trader) => ({ wallet: trader.wallet, name: trader.name, reason: trader.reason || 'Followed on this device' }));
      const view: SavedView = {
        id: viewId,
        title: 'Followed trader positions',
        intent: 'Current real positions held by traders followed on this device.',
        timeframe: 'current',
        createdAt: now,
        updatedAt: now,
        marketIds: [],
        traders,
        sections: [{ id: `${viewId}-positions`, type: 'trader_positions', title: 'Current positions', traderWallets: traders.map((trader) => trader.wallet) }],
        sort: 'value',
        selectedMarketIds: [],
      };
      setComposedView(view);
      setSavedViews((current) => {
        const next = [view, ...current.filter((candidate) => candidate.id !== view.id)];
        localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
        return next;
      });
      return { viewId, title: view.title, traderCount: profiles.length, positionCount: profiles.reduce((sum, profile) => sum + profile.positions.length, 0), saved: true, ui_changed: true };
    } finally {
      setLoading(false);
    }
  }, [followedTraders]);

  const openSavedView = useCallback(async (view: SavedView) => {
    setComposedView(view);
    setSelectedMarketIds(view.selectedMarketIds);
    setSavedViewsOpen(false);
    const needsProfiles = view.sections.some((section) => section.type === 'trader_positions');
    if (!needsProfiles) {
      setComposedProfiles({});
      return;
    }
    const results = await Promise.all(view.traders.map(async (trader) => {
      const response = await fetch(`/api/traders?wallet=${encodeURIComponent(trader.wallet)}`);
      if (!response.ok) return null;
      return (await response.json() as { trader: TraderProfile }).trader;
    }));
    setComposedProfiles(Object.fromEntries(results.filter(Boolean).map((profile) => [(profile as TraderProfile).wallet, profile as TraderProfile])));
  }, []);

  const renderCommentArguments = useCallback((input: Record<string, unknown>) => {
    const normalize = (value: unknown): CommentArgument[] => Array.isArray(value)
      ? value.map((item) => {
        const record = item as Record<string, unknown>;
        return {
          claim: typeof record.claim === 'string' ? record.claim.slice(0, 280) : '',
          evidenceCommentIds: Array.isArray(record.evidence_comment_ids) ? record.evidence_comment_ids.map(String).slice(0, 8) : [],
        };
      }).filter((argument) => argument.claim && argument.evidenceCommentIds.some((id) => comments.some((comment) => comment.id === id)))
      : [];
    const next = { yes: normalize(input.yes_arguments), no: normalize(input.no_arguments) };
    setCommentArguments(next);
    setCommentsOpen(true);
    return { yesArgumentCount: next.yes.length, noArgumentCount: next.no.length, evidencePreserved: true, ui_changed: true };
  }, [comments]);

  const toggleWatchlist = useCallback((marketId: string) => {
    const next = watchlist.includes(marketId)
      ? watchlist.filter((id) => id !== marketId)
      : [...watchlist, marketId];
    const isWatched = next.includes(marketId);
    setWatchlist(next);
    localStorage.setItem('side.watchlist', JSON.stringify(next));
    return { market_id: marketId, watched: isWatched, ui_changed: true };
  }, [watchlist]);

  const preparePaperTrade = useCallback((outcome: string, amount: number) => {
    if (!selectedMarket) return { error: 'No market is currently open.', ui_changed: false };
    const selectedOutcome = selectedMarket.outcomes.find((candidate) => candidate.label.toLowerCase() === outcome.toLowerCase());
    if (!selectedOutcome) return { error: `Outcome must be one of: ${selectedMarket.outcomes.map((item) => item.label).join(', ')}`, ui_changed: false };
    const draft: PaperTradeDraft = {
      marketId: selectedMarket.id,
      question: selectedMarket.question,
      outcome: selectedOutcome.label,
      probability: selectedOutcome.probability,
      amount: Math.max(1, Math.min(10000, Number.isFinite(amount) ? amount : 100)),
    };
    setTradeConfirmed(false);
    setTradeDraft(draft);
    return { draft, awaiting_human_confirmation: true, ui_changed: true };
  }, [selectedMarket]);

  function confirmPaperTrade() {
    if (!tradeDraft) return;
    const trade: PaperTrade = { ...tradeDraft, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const next = [trade, ...paperTrades];
    setPaperTrades(next);
    localStorage.setItem('side.paperTrades', JSON.stringify(next));
    setTradeConfirmed(true);
  }

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext?.registerTool) return;
    const controller = new AbortController();
    queueMicrotask(() => setAgentConnected(true));
    void modelContext.registerTool({
      name: 'search_markets', title: 'Search Side markets',
      description: 'Search live Polymarket markets and replace the visible card grid in Side with matching results.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Natural-language market topic, such as bitcoin, elections, or AI.' } },
        required: ['query'], additionalProperties: false,
      },
      execute: ({ query: toolQuery }) => runSearch(typeof toolQuery === 'string' ? toolQuery : ''),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'compose_market_view', title: 'Compose and save a live research view',
      description: 'Turn live Polymarket results or the markets manually selected in Side into a saved, purpose-built research workspace. Can exclude sports and include factual notable-holder cards.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          intent: { type: 'string', description: 'Short summary of what the human is trying to investigate.' },
          timeframe: { type: 'string', description: 'For example: today, this week, or current.' },
          query: { type: 'string', description: 'Optional Polymarket search topic. Leave empty to use the high-volume live feed.' },
          exclude_sports: { type: 'boolean' },
          min_volume_24h: { type: 'number', minimum: 0 },
          limit: { type: 'number', minimum: 1, maximum: 18 },
          sort: { type: 'string', enum: ['volume', 'movement'] },
          include_traders: { type: 'boolean', description: 'Add notable holders from the top visible markets with factual reasons.' },
          use_selected_markets: { type: 'boolean', description: 'Build around the markets the human manually selected in Side.' },
        },
        required: ['title', 'intent'], additionalProperties: false,
      },
      execute: (input) => composeMarketView(input),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'open_market', title: 'Open a visible market',
      description: 'Open the large market detail drawer for a market currently visible in Side.',
      inputSchema: {
        type: 'object', properties: { market_id: { type: 'string', description: 'ID returned by search_markets.' } },
        required: ['market_id'], additionalProperties: false,
      },
      execute: ({ market_id }) => openMarketById(typeof market_id === 'string' ? market_id : ''),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [composeMarketView, openMarketById, runSearch]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!composedView || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'get_current_workspace_context',
      title: 'Inspect the current shared research workspace',
      description: 'Return the saved view, visible objects, and the market IDs manually selected by the human. Use this to resolve references such as this, these, selected, or current view.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({
        view: composedView,
        selected_market_ids: selectedMarketIds,
        selected_markets: selectedMarketIds.map((id) => markets.find((market) => market.id === id)).filter(Boolean),
        ui_changed: false,
      }),
      annotations: { readOnlyHint: true },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'update_market_view',
      title: 'Refine the current saved research view',
      description: 'Mutate the currently visible composed view in place while preserving its identity and explicit human selections.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          remove_sports: { type: 'boolean' },
          remove_market_ids: { type: 'array', items: { type: 'string', enum: composedView.marketIds } },
          keep_market_ids: { type: 'array', items: { type: 'string', enum: composedView.marketIds } },
          keep_selected: { type: 'boolean', description: 'Keep only markets manually selected by the human.' },
          add_selected: { type: 'boolean', description: 'Add the human’s current manual selections.' },
        },
        additionalProperties: false,
      },
      execute: (input) => updateMarketView(input),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [composedView, markets, selectedMarketIds, updateMarketView]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!followedTraders.length || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'compose_followed_trader_view',
      title: 'Show followed traders’ current positions',
      description: 'Build and save a visible research page from the real current Polymarket positions of traders followed on this device.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => composeFollowedTraderView(),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [composeFollowedTraderView, followedTraders.length]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!selectedMarket || !modelContext?.registerTool) return;
    const controller = new AbortController();
    const register = (tool: Parameters<ModelContext['registerTool']>[0]) =>
      modelContext.registerTool(tool, { signal: controller.signal });

    void register({
      name: 'get_current_market_context',
      title: 'Get the open market context',
      description: 'Return the market currently open in Side, including its live outcomes and visible market statistics.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ ...selectedMarket, ui_changed: false }),
      annotations: { readOnlyHint: true },
    });
    void register({
      name: 'inspect_market_traders',
      title: 'Inspect notable market holders',
      description: 'Load and visibly reveal notable holders on both sides of the market currently open in Side.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => loadHolders(),
      annotations: { readOnlyHint: false },
    });
    if (selectedMarket.eventId) void register({
      name: 'inspect_market_comments',
      title: 'Inspect the current market discussion',
      description: 'Load real Polymarket comments for the current market into its drawer, including exact author-wallet and outcome-token matches when available.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => loadComments(),
      annotations: { readOnlyHint: false },
    });
    void register({
      name: 'toggle_current_market_watchlist',
      title: 'Toggle current market watchlist',
      description: 'Add or remove the market currently open in Side from the device-local watchlist.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => toggleWatchlist(selectedMarket.id),
      annotations: { readOnlyHint: false },
    });
    void register({
      name: 'prepare_paper_trade',
      title: 'Prepare a local paper trade',
      description: 'Prepare a simulated trade for the open market and show a confirmation dialog. This never executes real money and always requires the human to confirm in Side.',
      inputSchema: {
        type: 'object',
        properties: {
          outcome: { type: 'string', enum: selectedMarket.outcomes.map((outcome) => outcome.label) },
          amount: { type: 'number', minimum: 1, maximum: 10000, description: 'Simulated US dollar amount.' },
        },
        required: ['outcome', 'amount'], additionalProperties: false,
      },
      execute: ({ outcome, amount }) => preparePaperTrade(typeof outcome === 'string' ? outcome : '', Number(amount)),
      annotations: { readOnlyHint: false },
    });
    return () => controller.abort();
  }, [loadComments, loadHolders, preparePaperTrade, selectedMarket, toggleWatchlist]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!holders.length || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'open_trader',
      title: 'Open a notable trader',
      description: 'Open a notable holder profile in Side and load their current and historical Polymarket positions.',
      inputSchema: {
        type: 'object',
        properties: {
          wallet: { type: 'string', enum: holders.map((holder) => holder.wallet), description: 'Wallet returned by inspect_market_traders.' },
        },
        required: ['wallet'], additionalProperties: false,
      },
      execute: ({ wallet }) => openTrader(typeof wallet === 'string' ? wallet : ''),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'follow_visible_traders',
      title: 'Follow or unfollow visible market holders',
      description: 'Persist local follow state for one or more traders currently visible in the open market. This never copies or executes trades.',
      inputSchema: {
        type: 'object',
        properties: {
          wallets: { type: 'array', minItems: 1, items: { type: 'string', enum: holders.map((holder) => holder.wallet) } },
          action: { type: 'string', enum: ['follow', 'unfollow'] },
        },
        required: ['wallets', 'action'], additionalProperties: false,
      },
      execute: ({ wallets, action }) => {
        const requested = Array.isArray(wallets) ? wallets.map(String) : [];
        const valid = holders.filter((holder) => requested.includes(holder.wallet));
        let next = [...followedTraders];
        valid.forEach((holder) => {
          const exists = next.some((trader) => trader.wallet.toLowerCase() === holder.wallet.toLowerCase());
          if (action === 'follow' && !exists) next.push({
            wallet: holder.wallet,
            name: holder.name || holder.pseudonym || `${holder.wallet.slice(0, 8)}…${holder.wallet.slice(-5)}`,
            followedAt: new Date().toISOString(),
            reason: selectedMarket ? `Visible holder in “${selectedMarket.question}”` : 'Visible market holder',
          });
          if (action === 'unfollow' && exists) next = next.filter((trader) => trader.wallet.toLowerCase() !== holder.wallet.toLowerCase());
        });
        setFollowedTraders(next);
        localStorage.setItem(FOLLOWED_TRADERS_KEY, JSON.stringify(next));
        return { action, changed: valid.length, followed_trader_count: next.length, ui_changed: true };
      },
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [followedTraders, holders, openTrader, selectedMarket]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!selectedTrader || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'get_current_trader_context',
      title: 'Get the open trader context',
      description: 'Return the trader profile currently open in Side, including current positions and resolved history.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ ...selectedTrader, ui_changed: false }),
      annotations: { readOnlyHint: true },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'set_current_trader_follow',
      title: 'Follow or unfollow the current trader',
      description: 'Persist follow state for the trader currently open in Side. Following surfaces research; it never enables copy trading.',
      inputSchema: {
        type: 'object', properties: { action: { type: 'string', enum: ['follow', 'unfollow'] } }, required: ['action'], additionalProperties: false,
      },
      execute: ({ action }) => {
        const isFollowed = followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase());
        if ((action === 'follow' && isFollowed) || (action === 'unfollow' && !isFollowed)) return { wallet: selectedTrader.wallet, followed: isFollowed, ui_changed: false };
        return toggleTraderFollow(selectedTrader.wallet, selectedTrader.name || selectedTrader.pseudonym, 'Followed from trader intelligence');
      },
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [followedTraders, selectedTrader, toggleTraderFollow]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!comments.length || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'filter_market_comments',
      title: 'Filter the visible market discussion',
      description: 'Show all real comments or only comments with an exact Polymarket outcome-token match for the current event.',
      inputSchema: {
        type: 'object', properties: { positioned_only: { type: 'boolean' } }, required: ['positioned_only'], additionalProperties: false,
      },
      execute: ({ positioned_only }) => {
        const only = positioned_only === true;
        setPositionedCommentsOnly(only);
        setCommentsOpen(true);
        return { positioned_only: only, visible_comment_count: only ? comments.filter((comment) => comment.position).length : comments.length, ui_changed: true };
      },
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'render_market_arguments',
      title: 'Render evidence-backed YES and NO arguments',
      description: 'Render Codex’s argument extraction inside Side while preserving references to the original real Polymarket comment IDs. Claims without valid evidence IDs are dropped.',
      inputSchema: {
        type: 'object',
        properties: {
          yes_arguments: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, evidence_comment_ids: { type: 'array', items: { type: 'string', enum: comments.map((comment) => comment.id) } } }, required: ['claim', 'evidence_comment_ids'], additionalProperties: false } },
          no_arguments: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, evidence_comment_ids: { type: 'array', items: { type: 'string', enum: comments.map((comment) => comment.id) } } }, required: ['claim', 'evidence_comment_ids'], additionalProperties: false } },
        },
        required: ['yes_arguments', 'no_arguments'], additionalProperties: false,
      },
      execute: (input) => renderCommentArguments(input),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [comments, renderCommentArguments]);

  const visibleMarkets = useMemo(
    () => composedView
      ? markets.filter((market) => composedView.marketIds.includes(market.id))
      : watchlistOnly ? markets.filter((market) => watchlist.includes(market.id)) : markets,
    [composedView, markets, watchlist, watchlistOnly],
  );
  const visibleComments = useMemo(
    () => positionedCommentsOnly ? comments.filter((comment) => comment.position) : comments,
    [comments, positionedCommentsOnly],
  );
  const totalVolume = useMemo(() => visibleMarkets.reduce((sum, market) => sum + market.volume24h, 0), [visibleMarkets]);
  function submitSearch(event: { preventDefault: () => void }) { event.preventDefault(); void runSearch(query); }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Side home">
          <span className="brand-mark"><span /></span><span>SIDE</span><Badge className="beta-badge">BETA</Badge>
        </a>
        <form className="global-search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets, topics, outcomes…" aria-label="Search markets" />
          <kbd><Command /> K</kbd>
        </form>
        <nav className="header-actions" aria-label="Primary">
          <Button variant={savedViewsOpen ? 'secondary' : 'ghost'} onClick={() => setSavedViewsOpen((current) => !current)}>
            <Bookmark /> Views <span className="nav-count">{savedViews.length}</span>
          </Button>
          <Button variant="ghost" onClick={() => void composeFollowedTraderView()} disabled={!followedTraders.length}>
            <UserCheck /> Followed <span className="nav-count">{followedTraders.length}</span>
          </Button>
          <Button variant={watchlistOnly ? 'secondary' : 'ghost'} onClick={() => setWatchlistOnly((current) => !current)}>
            <Star /> Watchlist <span className="nav-count">{watchlist.length}</span>
          </Button>
          <Button variant="outline"><CircleDollarSign /> Paper <span className="paper-balance">{paperTrades.length} trades</span></Button>
        </nav>
      </header>

      <section className="market-surface" id="top">
        {savedViewsOpen && (
          <div className="saved-views-panel">
            <div className="saved-views-heading"><span>SAVED RESEARCH VIEWS</span><button onClick={() => setSavedViewsOpen(false)} aria-label="Close saved views"><X /></button></div>
            {savedViews.length ? savedViews.map((view) => (
              <button key={view.id} onClick={() => void openSavedView(view)}>
                <span><strong>{view.title}</strong><small>{view.marketIds.length} markets · {view.traders.length} traders</small></span>
                <ChevronRight />
              </button>
            )) : <p>No saved views yet. Ask your agent to compose one.</p>}
          </div>
        )}
        <div className="eyebrow-row">
          <div className={`live-label ${feedMeta.isStale ? 'cached' : ''}`}><span /> {feedMeta.isStale ? 'CACHED REAL DATA' : 'LIVE MARKET INTELLIGENCE'} <small>{freshnessText}</small></div>
          <div className={`agent-status ${agentConnected ? 'connected' : ''}`}><Bot /> {agentConnected ? 'AGENT CONNECTED' : 'BROWSER MODE'}</div>
        </div>
        <div className="title-row">
          <div>
            <h1>{composedView ? composedView.title : watchlistOnly ? 'Your watchlist' : activeQuery ? `Markets for “${activeQuery}”` : 'Markets moving now'}</h1>
            <p>{composedView ? composedView.intent : watchlistOnly ? 'Device-local markets you want to keep close.' : activeQuery ? 'Live matches, ranked by activity.' : 'High-signal markets ranked by 24-hour volume.'}</p>
          </div>
          <div className="feed-stat"><span>{compactMoney.format(totalVolume)}</span> visible volume</div>
        </div>
        <div className="filter-row">
          {['Trending', 'Politics', 'Tech', 'Economy', 'Crypto', 'Culture', 'Sports'].map((filter) => (
            <button key={filter} className={!activeQuery && filter === 'Trending' ? 'active' : ''} onClick={() => void runSearch(filter === 'Trending' ? '' : filter)}>
              {filter === 'Trending' && <TrendingUp />} {filter}
            </button>
          ))}
          <div className="agent-nudge"><Sparkles /> Try asking your agent: “Find AI markets”</div>
        </div>
        {composedView && <div className="composed-status"><Bookmark /> Saved automatically <span>·</span> Updated {shortDate.format(new Date(composedView.updatedAt))}</div>}
        {selectedMarketIds.length > 0 && (
          <div className="selection-bar"><span>{selectedMarketIds.length} selected</span><small>Ask your agent to “build around these.”</small><button onClick={() => setSelectedMarketIds([])}>Clear</button></div>
        )}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {(!composedView || visibleMarkets.length > 0) && (
          <section className={composedView ? 'composed-section' : undefined}>
            {composedView && <div className="composed-section-heading"><span>{composedView.sections.find((section) => section.type === 'markets')?.title ?? 'Markets'}</span><small>{visibleMarkets.length} LIVE</small></div>}
            <div className={`market-grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
              {visibleMarkets.map((market) => <MarketCard key={market.id} market={market} selected={selectedMarketIds.includes(market.id)} onToggleSelect={toggleMarketSelection} onOpen={(nextMarket) => { setSelectedMarket(nextMarket); setSelectedTrader(null); setHolders([]); setComments([]); setCommentsOpen(false); setCommentArguments(null); }} />)}
            </div>
          </section>
        )}
        {composedView?.traders.length ? (
          <section className="composed-section trader-composition">
            <div className="composed-section-heading"><span>{composedView.sections.find((section) => section.type === 'traders')?.title ?? 'Notable traders'}</span><small>FACTUAL SIGNALS</small></div>
            <div className="composed-trader-grid">
              {composedView.traders.map((trader) => {
                const isFollowed = followedTraders.some((followed) => followed.wallet.toLowerCase() === trader.wallet.toLowerCase());
                return <article key={trader.wallet}>
                  <button className="composed-trader-main" onClick={() => void openTrader(trader.wallet)}>
                    <span className="holder-avatar">{trader.name.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{trader.name}</strong><small>{trader.reason}</small></span><ChevronRight />
                  </button>
                  <button className="follow-mini" onClick={() => toggleTraderFollow(trader.wallet, trader.name, trader.reason)}>{isFollowed ? <UserCheck /> : <UserPlus />}{isFollowed ? 'Following' : 'Follow'}</button>
                </article>;
              })}
            </div>
          </section>
        ) : null}
        {composedView?.sections.some((section) => section.type === 'trader_positions') && (
          <section className="composed-section followed-positions">
            <div className="composed-section-heading"><span>Current positions</span><small>NON-REDEEMABLE · LIVE</small></div>
            {composedView.traders.map((trader) => {
              const profile = composedProfiles[trader.wallet];
              return <article className="followed-profile" key={trader.wallet}>
                <div className="followed-profile-heading"><button onClick={() => void openTrader(trader.wallet)}><strong>{trader.name}</strong><small>{trader.reason}</small></button><span>{profile ? compactMoney.format(profile.visibleOpenValue) : 'Unavailable'}</span></div>
                {profile?.positions.slice(0, 6).map((position) => <div className="followed-position" key={`${position.conditionId}-${position.outcome}`}><span><strong>{position.title}</strong><small>{position.outcome} · {formatCents(position.currentPrice)}</small></span><b>{compactMoney.format(position.currentValue)}</b></div>)}
              </article>;
            })}
          </section>
        )}
        {!loading && visibleMarkets.length === 0 && !composedView?.sections.some((section) => section.type === 'trader_positions') && (
          <div className="empty-state"><Search /><h2>{watchlistOnly ? 'Your watchlist is empty' : 'No live markets found'}</h2><p>{watchlistOnly ? 'Open a market and save it from the detail drawer.' : 'Try a broader topic, like politics, crypto, or sports.'}</p><Button onClick={() => watchlistOnly ? setWatchlistOnly(false) : void runSearch('')}>{watchlistOnly ? 'Browse markets' : 'Back to trending'}</Button></div>
        )}
      </section>

      <Sheet open={Boolean(selectedMarket || selectedTrader)} onOpenChange={(open) => { if (!open) { setSelectedMarket(null); setSelectedTrader(null); setHolders([]); setComments([]); setCommentsOpen(false); setCommentArguments(null); } }}>
        <SheetContent className="market-drawer sm:max-w-[760px]" showCloseButton>
          {selectedMarket && !selectedTrader && (
            <>
              <SheetHeader className="drawer-header">
                <div className="drawer-kicker"><span>{selectedMarket.category}</span><span>•</span><span>POLYMARKET</span><span className="drawer-live">LIVE</span></div>
                <SheetTitle>{selectedMarket.question}</SheetTitle>
                <SheetDescription>{selectedMarket.description || 'Live binary prediction market.'}</SheetDescription>
                <Button className="watch-market-button" variant={watchlist.includes(selectedMarket.id) ? 'secondary' : 'outline'} onClick={() => toggleWatchlist(selectedMarket.id)}>
                  {watchlist.includes(selectedMarket.id) ? <Check /> : <Star />}
                  {watchlist.includes(selectedMarket.id) ? 'Watching' : 'Add to watchlist'}
                </Button>
              </SheetHeader>
              <div className="drawer-body">
                <section className="outcome-panel">
                  <div className="outcome-heading"><span>MARKET PROBABILITY</span><span>24H VOLUME {compactMoney.format(selectedMarket.volume24h)}</span></div>
                  <div className="drawer-probability">{formatProbability(selectedMarket.outcomes[0]?.probability ?? 0)}</div>
                  <div className="split-track large"><span style={{ width: `${primaryProbability(selectedMarket)}%` }} /></div>
                  <div className="outcome-buttons">
                    {selectedMarket.outcomes.slice(0, 2).map((outcome, index) => (
                      <button key={outcome.label} className={index === 0 ? 'yes' : 'no'} onClick={() => preparePaperTrade(outcome.label, 100)}>
                        <span>Paper {outcome.label}</span><strong>{formatCents(outcome.probability)}</strong>
                      </button>
                    ))}
                  </div>
                </section>
                <div className="metric-grid">
                  <div><Clock3 /><span>Closes</span><strong>{selectedMarket.endDate ? shortDate.format(new Date(selectedMarket.endDate)) : 'Open'}</strong></div>
                  <div><CircleDollarSign /><span>Total volume</span><strong>{compactMoney.format(selectedMarket.volume)}</strong></div>
                  <div><TrendingUp /><span>Liquidity</span><strong>{compactMoney.format(selectedMarket.liquidity)}</strong></div>
                </div>
                <button className="trader-preview" onClick={() => void loadHolders()} disabled={holdersLoading}>
                  <span className="trader-icon">{holdersLoading ? <LoaderCircle className="spin" /> : <Users />}</span>
                  <span><strong>See who’s in this trade</strong><small>Notable holders and their other positions</small></span><ArrowUpRight />
                </button>
                {selectedMarket.eventId && (
                  <button className="trader-preview discussion-preview" onClick={() => void loadComments()} disabled={commentsLoading}>
                    <span className="trader-icon">{commentsLoading ? <LoaderCircle className="spin" /> : <MessageSquare />}</span>
                    <span><strong>Read market discussion</strong><small>Real Polymarket comments with position-aware evidence</small></span><ArrowUpRight />
                  </button>
                )}
                {commentsOpen && (
                  <section className="comments-section">
                    <div className="section-label"><span>MARKET DISCUSSION</span><span>{visibleComments.length} SHOWN</span></div>
                    <div className="comment-filter-row">
                      <button className={!positionedCommentsOnly ? 'active' : ''} onClick={() => setPositionedCommentsOnly(false)}>All comments</button>
                      <button className={positionedCommentsOnly ? 'active' : ''} onClick={() => setPositionedCommentsOnly(true)}>Position matched</button>
                    </div>
                    {commentArguments && (commentArguments.yes.length > 0 || commentArguments.no.length > 0) && (
                      <div className="argument-grid">
                        {(['yes', 'no'] as const).map((side) => commentArguments[side].length > 0 && <div className={`argument-column ${side}`} key={side}>
                          <div className="argument-heading">{side.toUpperCase()} CASE</div>
                          {commentArguments[side].map((argument, index) => <article key={`${side}-${index}`}>
                            <strong>{argument.claim}</strong>
                            <small>{argument.evidenceCommentIds.length} cited comment{argument.evidenceCommentIds.length === 1 ? '' : 's'}</small>
                            <div className="argument-evidence">{argument.evidenceCommentIds.map((id) => {
                              const evidence = comments.find((comment) => comment.id === id);
                              return evidence ? <blockquote key={id}>“{evidence.body.slice(0, 180)}{evidence.body.length > 180 ? '…' : ''}” <span>#{id}</span></blockquote> : null;
                            })}</div>
                          </article>)}
                        </div>)}
                      </div>
                    )}
                    <div className="comment-list">
                      {visibleComments.map((comment) => {
                        const matchedHolder = Boolean(comment.author.wallet && holders.some((holder) => holder.wallet.toLowerCase() === comment.author.wallet.toLowerCase()));
                        return <article className={comment.parentCommentId ? 'reply' : ''} key={comment.id}>
                          <div className="comment-meta"><span className="holder-avatar">{(comment.author.name || comment.author.pseudonym || '0').slice(0, 1).toUpperCase()}</span><span><strong>{comment.author.name || comment.author.pseudonym || `${comment.author.wallet.slice(0, 8)}…`}</strong><small>{comment.createdAt ? commentTime.format(new Date(comment.createdAt)) : 'Time unavailable'}</small></span><span className="comment-badges">{comment.position && <b>{comment.position.side} POSITION</b>}{matchedHolder && <b>VISIBLE HOLDER</b>}</span></div>
                          <p>{comment.body}</p>
                          <div className="comment-foot"><span>#{comment.id}</span>{comment.reactionCount > 0 && <span>{comment.reactionCount} reactions</span>}{comment.parentCommentId && <span>reply to #{comment.parentCommentId}</span>}</div>
                        </article>;
                      })}
                    </div>
                    {!visibleComments.length && <div className="position-empty">No comments match this evidence filter.</div>}
                  </section>
                )}
                {holders.length > 0 && (
                  <section className="holders-section">
                    <div className="section-label"><span>NOTABLE HOLDERS</span><span>{holders.length} FOUND</span></div>
                    <div className="holder-list">
                      {holders.map((holder) => (
                        <button key={`${holder.wallet}-${holder.outcomeIndex}`} onClick={() => void openTrader(holder.wallet)}>
                          <span className="holder-avatar">{holder.image ? <img src={holder.image} alt="" /> : (holder.name || holder.pseudonym || '0').slice(0, 1).toUpperCase()}</span>
                          <span className="holder-name"><strong>{holder.name || holder.pseudonym || `${holder.wallet.slice(0, 6)}…${holder.wallet.slice(-4)}`}</strong><small>{selectedMarket.outcomes[holder.outcomeIndex]?.label ?? `Side ${holder.outcomeIndex + 1}`}</small></span>
                          <span className="holder-amount">{compactNumber.format(holder.amount)}<small>shares</small></span>
                          <ChevronRight />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <section className="rules-block"><span>RESOLUTION RULES</span><p>{selectedMarket.description || 'This market resolves according to the linked Polymarket resolution source.'}</p></section>
              </div>
            </>
          )}
          {selectedTrader && (
            <>
              <SheetHeader className="drawer-header trader-header">
                <button className="back-button" onClick={() => setSelectedTrader(null)}><ArrowLeft /> Back to market</button>
                <div className="trader-profile-row">
                  <span className="profile-avatar">{selectedTrader.image ? <img src={selectedTrader.image} alt="" /> : (selectedTrader.name || selectedTrader.pseudonym || '0').slice(0, 1).toUpperCase()}</span>
                  <div>
                    <div className="drawer-kicker"><span>TRADER INTELLIGENCE</span>{selectedTrader.verified && <span className="drawer-live">VERIFIED</span>}</div>
                    <SheetTitle>{selectedTrader.name || selectedTrader.pseudonym || `${selectedTrader.wallet.slice(0, 8)}…${selectedTrader.wallet.slice(-5)}`}</SheetTitle>
                    <SheetDescription>{selectedTrader.bio || `${selectedTrader.wallet.slice(0, 12)}…${selectedTrader.wallet.slice(-8)}`}</SheetDescription>
                  </div>
                </div>
                <Button className="watch-market-button" variant={followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? 'secondary' : 'outline'} onClick={() => toggleTraderFollow(selectedTrader.wallet, selectedTrader.name || selectedTrader.pseudonym, 'Followed from trader intelligence')}>
                  {followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? <UserCheck /> : <UserPlus />}
                  {followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? 'Following' : 'Follow trader'}
                </Button>
              </SheetHeader>
              <div className="drawer-body trader-body">
                <div className="trader-stats">
                  <div><span>VISIBLE OPEN VALUE</span><strong>{compactMoney.format(selectedTrader.visibleOpenValue)}</strong></div>
                  <div><span>OPEN POSITIONS</span><strong>{selectedTrader.positions.length}</strong></div>
                  <div><span>DATA SOURCE</span><strong className="positive">LIVE</strong></div>
                </div>

                <section className="positions-section">
                  <div className="section-label"><span>CURRENT POSITIONS</span><span>SORTED BY VALUE</span></div>
                  <div className="position-list">
                    {selectedTrader.positions.map((position) => (
                      <button key={`${position.conditionId}-${position.outcome}`} onClick={() => { const match = markets.find((market) => market.conditionId === position.conditionId); if (match) { setSelectedMarket(match); setSelectedTrader(null); setHolders([]); } }}>
                        <span className="position-icon">{position.icon ? <img src={position.icon} alt="" /> : 'S'}</span>
                        <span className="position-title"><strong>{position.title}</strong><small>{position.outcome} · avg {Math.round(position.avgPrice * 100)}¢ → {Math.round(position.currentPrice * 100)}¢</small></span>
                        <span className="position-value"><strong>{compactMoney.format(position.currentValue)}</strong>{position.pnl !== null && <small className={position.pnl >= 0 ? 'positive' : 'negative'}>{position.pnl >= 0 ? '+' : ''}{compactMoney.format(position.pnl)}</small>}</span>
                      </button>
                    ))}
                    {selectedTrader.positions.length === 0 && <div className="position-empty">No non-redeemable open positions found.</div>}
                  </div>
                </section>

                <section className="positions-section history-section">
                  <div className="section-label"><span>BEST RESOLVED TRADES</span><span>REALIZED P&L</span></div>
                  <div className="position-list">
                    {selectedTrader.history.slice(0, 6).map((position) => (
                      <div className="history-row" key={`${position.conditionId}-${position.outcome}`}>
                        <span className="position-icon">{position.icon ? <img src={position.icon} alt="" /> : 'S'}</span>
                        <span className="position-title"><strong>{position.title}</strong><small>{position.outcome} · resolved</small></span>
                        <span className="position-value">{position.pnl !== null && <strong className={position.pnl >= 0 ? 'positive' : 'negative'}>{position.pnl >= 0 ? '+' : ''}{compactMoney.format(position.pnl)}</strong>}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
          {traderLoading && !selectedTrader && <div className="drawer-loader"><LoaderCircle className="spin" /><span>Building trader profile…</span></div>}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(tradeDraft)} onOpenChange={(open) => { if (!open) { setTradeDraft(null); setTradeConfirmed(false); } }}>
        <DialogContent className="paper-dialog">
          {tradeDraft && !tradeConfirmed ? (
            <>
              <DialogHeader>
                <div className="paper-kicker"><CircleDollarSign /> LOCAL SIMULATION</div>
                <DialogTitle>Confirm paper trade</DialogTitle>
                <DialogDescription>{tradeDraft.question}</DialogDescription>
              </DialogHeader>
              <div className="trade-summary">
                <div><span>SIDE</span><strong>{tradeDraft.outcome} at {formatCents(tradeDraft.probability)}</strong></div>
                <label htmlFor="paper-trade-amount"><span>SIMULATED AMOUNT</span><span className="amount-input"><b>$</b><Input id="paper-trade-amount" type="number" min={1} max={10000} value={tradeDraft.amount} onChange={(event) => setTradeDraft({ ...tradeDraft, amount: Math.max(1, Number(event.target.value)) })} /></span></label>
                <div><span>EST. SHARES</span><strong>{tradeDraft.probability > 0 ? (tradeDraft.amount / tradeDraft.probability).toFixed(1) : '—'}</strong></div>
              </div>
              <p className="simulation-note">Stored only on this device. No wallet, funds, or real order is involved.</p>
              <DialogFooter className="paper-footer">
                <Button variant="outline" onClick={() => setTradeDraft(null)}>Cancel</Button>
                <Button onClick={confirmPaperTrade}>Confirm paper trade</Button>
              </DialogFooter>
            </>
          ) : tradeDraft ? (
            <div className="trade-success"><span><Check /></span><DialogTitle>Paper trade saved</DialogTitle><DialogDescription>{tradeDraft.outcome} · {compactMoney.format(tradeDraft.amount)} simulated</DialogDescription><Button onClick={() => { setTradeDraft(null); setTradeConfirmed(false); }}>Done</Button></div>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
