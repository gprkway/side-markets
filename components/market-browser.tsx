'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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
  Radar,
  RefreshCw,
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
import { evaluateTraderWatch } from '@/lib/watches/evaluate';
import type { TraderWatch, WatchRelationship } from '@/lib/watches/types';

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

type AgentAction = { id: number; message: string };
type DrawerMode = 'market' | 'holders' | 'comments' | 'trader';
type MutationResult = Record<string, unknown> & { ui_changed?: boolean };

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
const TRADER_WATCHES_KEY = 'side.traderWatches.v1';

const watchRelationshipLabel: Record<WatchRelationship, string> = {
  same_side: 'Consensus',
  opposite_sides: 'Disagreement',
  new_position: 'New position',
};

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

function formatWatchCheckedAt(value: string | null) {
  if (!value) return 'Baseline not checked';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Checked just now';
  if (minutes < 60) return `Checked ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `Checked ${hours}h ago`;
}

function isSportsMarket(market: Market) {
  const haystack = `${market.category} ${market.question} ${market.description}`.toLowerCase();
  return /\b(sports?|fc|cf|afc|nba|wnba|nfl|nhl|mlb|kbo|ncaa|uefa|atp|wta|formula 1|esports?|counter-strike|soccer|football|tennis|cricket|league|tournament|match|game \d|vs\.?\b|championship|upcoming game|match statistics|regular play|stoppage time|governing body or event organizers)\b/.test(haystack);
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
    <article
      className={`market-card ${selected ? 'selected' : ''}`}
      style={{ viewTransitionName: `side-market-${market.id}` }}
    >
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
  const [watches, setWatches] = useState<TraderWatch[]>([]);
  const [watchesOpen, setWatchesOpen] = useState(false);
  const [currentWatchId, setCurrentWatchId] = useState<string | null>(null);
  const [watchLoadingId, setWatchLoadingId] = useState<string | null>(null);
  const [watchesHydrated, setWatchesHydrated] = useState(false);
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
  const [agentAction, setAgentAction] = useState<AgentAction | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('market');
  const [drawerDirection, setDrawerDirection] = useState<'forward' | 'back'>('forward');
  const agentActionTimer = useRef<number | null>(null);
  const watchRefreshStarted = useRef(false);
  const watchesRef = useRef<TraderWatch[]>([]);
  const returnDrawerMode = useRef<Exclude<DrawerMode, 'trader'>>('market');

  const commitMotion = useCallback((kind: string, update: () => void) => {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    if (prefersReducedMotion || !transitionDocument.startViewTransition) {
      update();
      return;
    }
    root.dataset.sideMotion = kind;
    const transition = transitionDocument.startViewTransition(() => flushSync(update));
    void transition.finished.finally(() => {
      if (root.dataset.sideMotion === kind) delete root.dataset.sideMotion;
    });
  }, []);

  const reportAgentAction = useCallback((message: string) => {
    if (agentActionTimer.current !== null) window.clearTimeout(agentActionTimer.current);
    setAgentAction({ id: Date.now(), message });
    agentActionTimer.current = window.setTimeout(() => setAgentAction(null), 1800);
  }, []);

  const runAgentMutation = useCallback(async (
    action: () => MutationResult | Promise<MutationResult>,
    message: string | ((result: MutationResult) => string),
  ) => {
    const result = await action();
    if (result.ui_changed) reportAgentAction(typeof message === 'function' ? message(result) : message);
    return result;
  }, [reportAgentAction]);

  const availableWatchTraders = useMemo(() => {
    const unique = new Map<string, { wallet: string; name: string }>();
    followedTraders.forEach((trader) => unique.set(trader.wallet.toLowerCase(), { wallet: trader.wallet, name: trader.name }));
    holders.forEach((holder) => unique.set(holder.wallet.toLowerCase(), {
      wallet: holder.wallet,
      name: holder.name || holder.pseudonym || `${holder.wallet.slice(0, 8)}…`,
    }));
    if (selectedTrader) unique.set(selectedTrader.wallet.toLowerCase(), {
      wallet: selectedTrader.wallet,
      name: selectedTrader.name || selectedTrader.pseudonym || `${selectedTrader.wallet.slice(0, 8)}…`,
    });
    return [...unique.values()];
  }, [followedTraders, holders, selectedTrader]);
  const currentWatch = useMemo(
    () => watches.find((watch) => watch.id === currentWatchId) ?? null,
    [currentWatchId, watches],
  );

  const persistWatches = useCallback((next: TraderWatch[]) => {
    watchesRef.current = next;
    setWatches(next);
    localStorage.setItem(TRADER_WATCHES_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => () => {
    if (agentActionTimer.current !== null) window.clearTimeout(agentActionTimer.current);
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setWatchlist(JSON.parse(localStorage.getItem('side.watchlist') ?? '[]'));
        setPaperTrades(JSON.parse(localStorage.getItem('side.paperTrades') ?? '[]'));
        setSavedViews(JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]'));
        setFollowedTraders(JSON.parse(localStorage.getItem(FOLLOWED_TRADERS_KEY) ?? '[]'));
        const storedWatches = JSON.parse(localStorage.getItem(TRADER_WATCHES_KEY) ?? '[]') as TraderWatch[];
        watchesRef.current = storedWatches;
        setWatches(storedWatches);
      } catch {
        localStorage.removeItem('side.watchlist');
        localStorage.removeItem('side.paperTrades');
        localStorage.removeItem(SAVED_VIEWS_KEY);
        localStorage.removeItem(FOLLOWED_TRADERS_KEY);
        localStorage.removeItem(TRADER_WATCHES_KEY);
      } finally {
        setWatchesHydrated(true);
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
      writeCachedFeed(payload);
      commitMotion('grid', () => {
        setMarkets(payload.markets);
        setActiveQuery(cleanQuery);
        setFeedMeta({ fetchedAt: payload.fetchedAt, isStale: payload.isStale });
        if (payload.isStale) setError('Live refresh is unavailable. Showing last-known real market data.');
        setSelectedMarket(null);
        setSelectedTrader(null);
        setHolders([]);
        setComments([]);
        setCommentsOpen(false);
        setCommentArguments(null);
        setComposedView(null);
        setDrawerMode('market');
      });
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
        const cachedMarkets = cached.markets;
        const cachedFetchedAt = cached.fetchedAt;
        commitMotion('grid', () => {
          setMarkets(cachedMarkets);
          setActiveQuery(cleanQuery);
          setSelectedMarket(null);
          setSelectedTrader(null);
          setHolders([]);
          setComments([]);
          setCommentsOpen(false);
          setCommentArguments(null);
          setComposedView(null);
          setFeedMeta({ fetchedAt: cachedFetchedAt, isStale: true });
          setError('Live refresh is unavailable. Showing last-known real market data.');
          setDrawerMode('market');
        });
        return { visible_market_count: cachedMarkets.length, query: cleanQuery || 'trending', data_status: 'cached_real_data', ui_changed: true };
      }
      setError('Could not refresh the live market feed. Try again in a moment.');
      return { error: 'Live search failed and no real cached results are available.', ui_changed: false };
    } finally { setLoading(false); }
  }, [commitMotion]);

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
    commitMotion('drawer-open', () => {
      setSelectedMarket(market);
      setSelectedTrader(null);
      setHolders([]);
      setComments([]);
      setCommentsOpen(false);
      setCommentArguments(null);
      setDrawerMode('market');
      setDrawerDirection('forward');
      returnDrawerMode.current = 'market';
    });
    return {
      market: { id: market.id, question: market.question, outcomes: market.outcomes, volume_24h: market.volume24h, liquidity: market.liquidity },
      drawer_opened: true, ui_changed: true,
    };
  }, [commitMotion, markets]);

  const openMarketByConditionId = useCallback(async (conditionId: string) => {
    const existing = markets.find((market) => market.conditionId === conditionId);
    let market = existing;
    if (!market) {
      const response = await fetch(`/api/markets?condition=${encodeURIComponent(conditionId)}`);
      if (!response.ok) return { error: 'Could not load this live market.', ui_changed: false };
      const payload = await response.json() as { market: Market };
      market = payload.market;
    }
    const openedMarket = market;
    commitMotion('drawer-back', () => {
      if (!existing) setMarkets((current) => [openedMarket, ...current]);
      setSelectedMarket(openedMarket);
      setSelectedTrader(null);
      setHolders([]);
      setComments([]);
      setCommentsOpen(false);
      setCommentArguments(null);
      setDrawerMode('market');
      setDrawerDirection('back');
      returnDrawerMode.current = 'market';
    });
    return {
      market: { id: openedMarket.id, condition_id: openedMarket.conditionId, question: openedMarket.question },
      drawer_opened: true,
      ui_changed: true,
    };
  }, [commitMotion, markets]);

  const loadHolders = useCallback(async () => {
    if (!selectedMarket) return { error: 'No market is currently open.', ui_changed: false };
    setHoldersLoading(true);
    try {
      const response = await fetch(`/api/traders?market=${encodeURIComponent(selectedMarket.conditionId)}`);
      if (!response.ok) throw new Error('Holder request failed');
      const payload = await response.json() as { holders: Holder[] };
      commitMotion('drawer-mode', () => {
        setSelectedTrader(null);
        setHolders(payload.holders);
        setCommentsOpen(false);
        setDrawerMode('holders');
        setDrawerDirection('forward');
        returnDrawerMode.current = 'holders';
      });
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
  }, [commitMotion, selectedMarket]);

  const openTrader = useCallback(async (wallet: string) => {
    setTraderLoading(true);
    try {
      const response = await fetch(`/api/traders?wallet=${encodeURIComponent(wallet)}`);
      if (!response.ok) throw new Error('Trader request failed');
      const payload = await response.json() as { trader: TraderProfile };
      if (drawerMode !== 'trader') returnDrawerMode.current = drawerMode;
      commitMotion('drawer-forward', () => {
        setSelectedTrader(payload.trader);
        setDrawerMode('trader');
        setDrawerDirection('forward');
      });
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
  }, [commitMotion, drawerMode]);

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
    commitMotion('state-pop', () => setFollowedTraders(next));
    localStorage.setItem(FOLLOWED_TRADERS_KEY, JSON.stringify(next));
    return { wallet, followed: !exists, ui_changed: true };
  }, [commitMotion, followedTraders]);

  const evaluateWatchDefinition = useCallback(async (watch: TraderWatch) => {
    setWatchLoadingId(watch.id);
    try {
      const profiles = (await Promise.all(watch.traderWallets.map(async (wallet) => {
        const response = await fetch(`/api/traders?wallet=${encodeURIComponent(wallet)}`);
        if (!response.ok) return null;
        return (await response.json() as { trader: TraderProfile }).trader;
      }))).filter(Boolean) as TraderProfile[];
      if (!profiles.length) throw new Error('No trader profiles were available.');
      const names: Record<string, string> = {};
      profiles.forEach((profile) => {
        names[profile.wallet.toLowerCase()] = profile.name || profile.pseudonym || `${profile.wallet.slice(0, 8)}…`;
      });
      return evaluateTraderWatch(watch, profiles, names);
    } finally {
      setWatchLoadingId(null);
    }
  }, []);

  const createTraderWatch = useCallback(async (input: Record<string, unknown>) => {
    const available = new Map(availableWatchTraders.map((trader) => [trader.wallet.toLowerCase(), trader]));
    const requestedWallets = Array.isArray(input.trader_wallets) ? input.trader_wallets.map(String) : [];
    const traderWallets = [...new Set(requestedWallets
      .map((wallet) => available.get(wallet.toLowerCase())?.wallet)
      .filter(Boolean) as string[])];
    const relationship = ['same_side', 'opposite_sides', 'new_position'].includes(String(input.relationship))
      ? input.relationship as WatchRelationship
      : 'same_side';
    const requiredTraders = relationship === 'new_position' ? 1 : 2;
    if (traderWallets.length < requiredTraders) {
      return { error: `${watchRelationshipLabel[relationship]} watches require at least ${requiredTraders} visible or followed trader${requiredTraders === 1 ? '' : 's'}.`, ui_changed: false };
    }
    const now = new Date().toISOString();
    const minimumTraderOverlap = relationship === 'new_position'
      ? 1
      : Math.max(2, Math.min(traderWallets.length, Number(input.minimum_trader_overlap) || 2));
    const watch: TraderWatch = {
      id: crypto.randomUUID(),
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : `${watchRelationshipLabel[relationship]} watch`,
      traderWallets,
      relationship,
      minimumTraderOverlap,
      minimumPositionValue: Math.max(0, Number(input.minimum_position_value) || 0),
      excludeSports: input.exclude_sports !== false,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastEvaluatedAt: null,
      snapshots: [],
      matches: [],
    };
    try {
      const evaluated = await evaluateWatchDefinition(watch);
      const next = [evaluated, ...watchesRef.current];
      commitMotion('compose', () => {
        persistWatches(next);
        setCurrentWatchId(evaluated.id);
        setWatchesOpen(true);
        setSavedViewsOpen(false);
      });
      return {
        watch: {
          id: evaluated.id,
          name: evaluated.name,
          relationship: evaluated.relationship,
          trader_wallets: evaluated.traderWallets,
          minimum_trader_overlap: evaluated.minimumTraderOverlap,
          minimum_position_value: evaluated.minimumPositionValue,
          exclude_sports: evaluated.excludeSports,
          status: evaluated.status,
        },
        match_count: evaluated.matches.length,
        baseline_created: relationship === 'new_position',
        evaluation_mode: 'Checked when Side loads, refreshes, or the human requests Check now.',
        ui_changed: true,
      };
    } catch {
      return { error: 'Could not evaluate real trader positions for this Watch.', ui_changed: false };
    }
  }, [availableWatchTraders, commitMotion, evaluateWatchDefinition, persistWatches]);

  const updateCurrentWatch = useCallback(async (input: Record<string, unknown>) => {
    if (!currentWatch) return { error: 'No Watch is currently open.', ui_changed: false };
    const available = new Map(availableWatchTraders.map((trader) => [trader.wallet.toLowerCase(), trader]));
    currentWatch.traderWallets.forEach((wallet) => {
      if (!available.has(wallet.toLowerCase())) available.set(wallet.toLowerCase(), { wallet, name: `${wallet.slice(0, 8)}…` });
    });
    const requestedWallets = Array.isArray(input.trader_wallets) ? input.trader_wallets.map(String) : null;
    const traderWallets = requestedWallets
      ? [...new Set(requestedWallets.map((wallet) => available.get(wallet.toLowerCase())?.wallet).filter(Boolean) as string[])]
      : currentWatch.traderWallets;
    const relationship = ['same_side', 'opposite_sides', 'new_position'].includes(String(input.relationship))
      ? input.relationship as WatchRelationship
      : currentWatch.relationship;
    const requiredTraders = relationship === 'new_position' ? 1 : 2;
    if (traderWallets.length < requiredTraders) {
      return { error: `${watchRelationshipLabel[relationship]} watches require at least ${requiredTraders} traders.`, ui_changed: false };
    }
    const status = input.status === 'paused' || input.status === 'active' ? input.status : currentWatch.status;
    const updated: TraderWatch = {
      ...currentWatch,
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : currentWatch.name,
      traderWallets,
      relationship,
      minimumTraderOverlap: relationship === 'new_position'
        ? 1
        : Math.max(2, Math.min(traderWallets.length, Number(input.minimum_trader_overlap) || currentWatch.minimumTraderOverlap)),
      minimumPositionValue: input.minimum_position_value === undefined
        ? currentWatch.minimumPositionValue
        : Math.max(0, Number(input.minimum_position_value) || 0),
      excludeSports: typeof input.exclude_sports === 'boolean' ? input.exclude_sports : currentWatch.excludeSports,
      status,
      updatedAt: new Date().toISOString(),
    };
    try {
      const evaluated = status === 'active' ? await evaluateWatchDefinition(updated) : updated;
      const next = watchesRef.current.map((watch) => watch.id === evaluated.id ? evaluated : watch);
      commitMotion('refine', () => {
        persistWatches(next);
        setWatchesOpen(true);
      });
      return {
        watch_id: evaluated.id,
        name: evaluated.name,
        relationship: evaluated.relationship,
        trader_count: evaluated.traderWallets.length,
        minimum_trader_overlap: evaluated.minimumTraderOverlap,
        minimum_position_value: evaluated.minimumPositionValue,
        exclude_sports: evaluated.excludeSports,
        status: evaluated.status,
        match_count: evaluated.matches.length,
        ui_changed: true,
      };
    } catch {
      return { error: 'The Watch was not changed because live trader data could not be checked.', ui_changed: false };
    }
  }, [availableWatchTraders, commitMotion, currentWatch, evaluateWatchDefinition, persistWatches]);

  const checkWatchNow = useCallback(async (watchId: string) => {
    const watch = watchesRef.current.find((candidate) => candidate.id === watchId);
    if (!watch) return { error: 'Watch not found.', ui_changed: false };
    if (watch.status === 'paused') {
      setCurrentWatchId(watch.id);
      setWatchesOpen(true);
      return { watch_id: watch.id, status: 'paused', match_count: watch.matches.length, ui_changed: true };
    }
    try {
      const evaluated = await evaluateWatchDefinition(watch);
      const next = watchesRef.current.map((candidate) => candidate.id === watch.id ? evaluated : candidate);
      commitMotion('refine', () => {
        persistWatches(next);
        setCurrentWatchId(watch.id);
        setWatchesOpen(true);
        setSavedViewsOpen(false);
      });
      return {
        watch_id: evaluated.id,
        checked_at: evaluated.lastEvaluatedAt,
        match_count: evaluated.matches.length,
        matches: evaluated.matches.slice(0, 12),
        ui_changed: true,
      };
    } catch {
      return { error: 'Could not refresh this Watch from live trader positions.', ui_changed: false };
    }
  }, [commitMotion, evaluateWatchDefinition, persistWatches]);

  useEffect(() => {
    if (!watchesHydrated || watchRefreshStarted.current) return;
    watchRefreshStarted.current = true;
    const active = watches.filter((watch) => watch.status === 'active');
    if (!active.length) return;
    void Promise.all(active.map(async (watch) => {
      try { return await evaluateWatchDefinition(watch); } catch { return watch; }
    })).then((evaluated) => persistWatches(watches.map((watch) =>
      evaluated.find((candidate) => candidate.id === watch.id) ?? watch)));
  }, [evaluateWatchDefinition, persistWatches, watches, watchesHydrated]);

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
      commitMotion('drawer-mode', () => {
        setSelectedTrader(null);
        setComments(payload.comments);
        setCommentsOpen(true);
        setPositionedCommentsOnly(false);
        setCommentArguments(null);
        setDrawerMode('comments');
        setDrawerDirection('forward');
        returnDrawerMode.current = 'comments';
      });
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
  }, [commitMotion, holders, selectedMarket]);

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
      commitMotion('compose', () => {
        setMarkets(feed.markets);
        setFeedMeta({ fetchedAt: feed.fetchedAt, isStale: feed.isStale });
        setActiveQuery(searchQuery);
        setSelectedMarket(null);
        setSelectedTrader(null);
        setHolders([]);
        setComposedProfiles({});
        setDrawerMode('market');
        saveComposedView(view);
      });
      return { viewId, title, marketCount: candidates.length, traderCount: view.traders.length, saved: true, ui_changed: true };
    } catch {
      setError('Could not assemble this live research view.');
      return { error: 'Live composition failed.', ui_changed: false };
    } finally {
      setLoading(false);
    }
  }, [commitMotion, saveComposedView, selectedMarketIds]);

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
    commitMotion('refine', () => saveComposedView(updated));
    return { viewId: updated.id, title: updated.title, marketCount: marketIds.length, saved: true, ui_changed: true };
  }, [commitMotion, composedView, markets, saveComposedView, selectedMarketIds]);

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
      setComposedProfiles(profileMap);
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
    commitMotion('compose', () => {
      setComposedView(view);
      setSelectedMarketIds(view.selectedMarketIds);
      setSavedViewsOpen(false);
    });
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
  }, [commitMotion]);

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
    commitMotion('arguments', () => {
      setCommentArguments(next);
      setCommentsOpen(true);
      setDrawerMode('comments');
    });
    return { yesArgumentCount: next.yes.length, noArgumentCount: next.no.length, evidencePreserved: true, ui_changed: true };
  }, [comments, commitMotion]);

  const toggleWatchlist = useCallback((marketId: string) => {
    const next = watchlist.includes(marketId)
      ? watchlist.filter((id) => id !== marketId)
      : [...watchlist, marketId];
    const isWatched = next.includes(marketId);
    commitMotion('state-pop', () => setWatchlist(next));
    localStorage.setItem('side.watchlist', JSON.stringify(next));
    return { market_id: marketId, watched: isWatched, ui_changed: true };
  }, [commitMotion, watchlist]);

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
    commitMotion('paper', () => {
      setTradeConfirmed(false);
      setTradeDraft(draft);
    });
    return { draft, awaiting_human_confirmation: true, ui_changed: true };
  }, [commitMotion, selectedMarket]);

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
      execute: ({ query: toolQuery }) => runAgentMutation(
        () => runSearch(typeof toolQuery === 'string' ? toolQuery : ''),
        (result) => `${Number(result.visible_market_count) || 0} markets found`,
      ),
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
      execute: (input) => runAgentMutation(
        () => composeMarketView(input),
        (result) => `${Number(result.marketCount) || 0} markets composed · saved`,
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'open_market', title: 'Open a visible market',
      description: 'Open the large market detail drawer for a market currently visible in Side.',
      inputSchema: {
        type: 'object', properties: { market_id: { type: 'string', description: 'ID returned by search_markets.' } },
        required: ['market_id'], additionalProperties: false,
      },
      execute: ({ market_id }) => runAgentMutation(
        () => openMarketById(typeof market_id === 'string' ? market_id : ''),
        'Market opened',
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [composeMarketView, openMarketById, runAgentMutation, runSearch]);

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
      execute: (input) => runAgentMutation(
        () => updateMarketView(input),
        (result) => `Saved view updated · ${Number(result.marketCount) || 0} markets`,
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [composedView, markets, runAgentMutation, selectedMarketIds, updateMarketView]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!followedTraders.length || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'compose_followed_trader_view',
      title: 'Show followed traders’ current positions',
      description: 'Build and save a visible research page from the real current Polymarket positions of traders followed on this device.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => runAgentMutation(
        () => composeFollowedTraderView(),
        (result) => `${Number(result.positionCount) || 0} followed positions assembled`,
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [composeFollowedTraderView, followedTraders.length, runAgentMutation]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!modelContext?.registerTool || (!availableWatchTraders.length && !watches.length)) return;
    const controller = new AbortController();
    if (availableWatchTraders.length) void modelContext.registerTool({
      name: 'create_trader_watch',
      title: 'Create a persistent trader Watch',
      description: 'Create a deterministic, device-local Watch from explicit visible or followed trader wallets. Side stores and evaluates structured rules; Codex resolves language such as “these traders” before calling this tool.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short human-readable Watch name.' },
          trader_wallets: { type: 'array', minItems: 1, items: { type: 'string', description: 'Exact wallet from current holder, trader, or followed-trader context.' } },
          relationship: { type: 'string', enum: ['same_side', 'opposite_sides', 'new_position'] },
          minimum_trader_overlap: { type: 'number', minimum: 1, maximum: 32 },
          minimum_position_value: { type: 'number', minimum: 0, description: 'Minimum visible current value in USD.' },
          exclude_sports: { type: 'boolean' },
        },
        required: ['name', 'trader_wallets', 'relationship'],
        additionalProperties: false,
      },
      execute: (input) => runAgentMutation(
        () => createTraderWatch(input),
        (result) => `Watch created · ${Number(result.match_count) || 0} current matches`,
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    if (watches.length) void modelContext.registerTool({
      name: 'list_watches',
      title: 'List Side Watches',
      description: 'Return the deterministic Watches saved on this device so Codex can choose one to inspect or edit.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({
        watches: watchesRef.current.map((watch) => ({
          id: watch.id,
          name: watch.name,
          relationship: watch.relationship,
          trader_wallets: watch.traderWallets,
          status: watch.status,
          match_count: watch.matches.length,
          last_checked_at: watch.lastEvaluatedAt,
        })),
        ui_changed: false,
      }),
      annotations: { readOnlyHint: true },
    }, { signal: controller.signal });
    if (watches.length) void modelContext.registerTool({
      name: 'open_watch',
      title: 'Open a saved Watch',
      description: 'Open one device-local Watch in Side so its rule, status, current matches, and context-sensitive editing tools become visible.',
      inputSchema: {
        type: 'object',
        properties: { watch_id: { type: 'string', description: 'Exact Watch ID returned by list_watches.' } },
        required: ['watch_id'],
        additionalProperties: false,
      },
      execute: ({ watch_id }) => runAgentMutation(() => {
        const watch = watchesRef.current.find((candidate) => candidate.id === String(watch_id));
        if (!watch) return { error: 'Watch not found.', ui_changed: false };
        commitMotion('drawer-open', () => {
          setCurrentWatchId(watch.id);
          setWatchesOpen(true);
          setSavedViewsOpen(false);
        });
        return { watch_id: watch.id, name: watch.name, status: watch.status, match_count: watch.matches.length, ui_changed: true };
      }, 'Watch opened'),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [availableWatchTraders, commitMotion, createTraderWatch, runAgentMutation, watches.length]);

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
      execute: () => runAgentMutation(
        () => loadHolders(),
        (result) => `${Array.isArray(result.holders) ? result.holders.length : 0} holders loaded`,
      ),
      annotations: { readOnlyHint: false },
    });
    if (selectedMarket.eventId) void register({
      name: 'inspect_market_comments',
      title: 'Inspect the current market discussion',
      description: 'Load real Polymarket comments for the current market into its drawer, including exact author-wallet and outcome-token matches when available.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => runAgentMutation(
        () => loadComments(),
        (result) => `${Number(result.comment_count) || 0} comments loaded`,
      ),
      annotations: { readOnlyHint: false },
    });
    void register({
      name: 'toggle_current_market_saved',
      title: 'Save or unsave the current market',
      description: 'Add or remove the market currently open in Side from device-local Saved markets. Saved markets are bookmarks, distinct from programmable Watches.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => runAgentMutation(
        () => toggleWatchlist(selectedMarket.id),
        (result) => result.watched ? 'Market saved' : 'Market removed from Saved',
      ),
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
      execute: ({ outcome, amount }) => runAgentMutation(
        () => preparePaperTrade(typeof outcome === 'string' ? outcome : '', Number(amount)),
        'Paper trade ready for review',
      ),
      annotations: { readOnlyHint: false },
    });
    return () => controller.abort();
  }, [loadComments, loadHolders, preparePaperTrade, runAgentMutation, selectedMarket, toggleWatchlist]);

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
      execute: ({ wallet }) => runAgentMutation(
        () => openTrader(typeof wallet === 'string' ? wallet : ''),
        'Trader profile opened',
      ),
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
      execute: ({ wallets, action }) => runAgentMutation(() => {
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
          commitMotion('state-pop', () => setFollowedTraders(next));
          localStorage.setItem(FOLLOWED_TRADERS_KEY, JSON.stringify(next));
          return { action, changed: valid.length, followed_trader_count: next.length, ui_changed: true };
        }, (result) => `${Number(result.followed_trader_count) || 0} traders followed`),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [commitMotion, followedTraders, holders, openTrader, runAgentMutation, selectedMarket]);

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
        return runAgentMutation(
          () => toggleTraderFollow(selectedTrader.wallet, selectedTrader.name || selectedTrader.pseudonym, 'Followed from trader intelligence'),
          action === 'follow' ? 'Trader followed' : 'Trader unfollowed',
        );
      },
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    if (selectedTrader.positions.length) void modelContext.registerTool({
      name: 'open_trader_position',
      title: 'Open one of this trader’s markets',
      description: 'Load a real market from the current trader’s position by Polymarket condition ID and open it in the same Side drawer, even when it was not in the discovery grid.',
      inputSchema: {
        type: 'object',
        properties: {
          condition_id: { type: 'string', enum: selectedTrader.positions.map((position) => position.conditionId) },
        },
        required: ['condition_id'],
        additionalProperties: false,
      },
      execute: ({ condition_id }) => runAgentMutation(
        () => openMarketByConditionId(typeof condition_id === 'string' ? condition_id : ''),
        'Trader position opened',
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [followedTraders, openMarketByConditionId, runAgentMutation, selectedTrader, toggleTraderFollow]);

  useEffect(() => {
    const modelContext = document.modelContext ?? navigator.modelContext;
    if (!currentWatch || !modelContext?.registerTool) return;
    const controller = new AbortController();
    void modelContext.registerTool({
      name: 'get_current_watch_context',
      title: 'Inspect the open Watch',
      description: 'Return the structured rule, snapshots, current matches, status, and last evaluation time for the Watch open in Side.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => ({ ...currentWatch, ui_changed: false }),
      annotations: { readOnlyHint: true },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'update_current_watch',
      title: 'Edit the open Watch in place',
      description: 'Update the same persistent Watch using explicit supported rule primitives. Side reevaluates active Watches from real current positions.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          trader_wallets: { type: 'array', minItems: 1, items: { type: 'string', description: 'Exact wallet already in this Watch or available from current Side context.' } },
          relationship: { type: 'string', enum: ['same_side', 'opposite_sides', 'new_position'] },
          minimum_trader_overlap: { type: 'number', minimum: 1, maximum: 32 },
          minimum_position_value: { type: 'number', minimum: 0 },
          exclude_sports: { type: 'boolean' },
          status: { type: 'string', enum: ['active', 'paused'] },
        },
        additionalProperties: false,
      },
      execute: (input) => runAgentMutation(
        () => updateCurrentWatch(input),
        (result) => `${String(result.status)} · ${Number(result.trader_count) || 0} traders · ${compactMoney.format(Number(result.minimum_position_value) || 0)} minimum`,
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'show_current_watch_matches',
      title: 'Check and show Watch matches',
      description: 'Evaluate the open active Watch against live current positions and visibly render its matches. Paused Watches show saved matches without refreshing.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => runAgentMutation(
        () => checkWatchNow(currentWatch.id),
        (result) => `${Number(result.match_count) || 0} Watch matches`,
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    if (currentWatch.matches.length) void modelContext.registerTool({
      name: 'open_watch_match',
      title: 'Open a matching market',
      description: 'Open one of the real markets currently matched by the Watch in the standard Side market drawer.',
      inputSchema: {
        type: 'object',
        properties: { condition_id: { type: 'string', enum: currentWatch.matches.map((match) => match.conditionId) } },
        required: ['condition_id'],
        additionalProperties: false,
      },
      execute: ({ condition_id }) => runAgentMutation(
        () => openMarketByConditionId(typeof condition_id === 'string' ? condition_id : ''),
        'Watch match opened',
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [availableWatchTraders, checkWatchNow, currentWatch, openMarketByConditionId, runAgentMutation, updateCurrentWatch]);

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
      execute: ({ positioned_only }) => runAgentMutation(() => {
          const only = positioned_only === true;
          commitMotion('comments', () => {
            setPositionedCommentsOnly(only);
            setCommentsOpen(true);
            setDrawerMode('comments');
          });
          return { positioned_only: only, visible_comment_count: only ? comments.filter((comment) => comment.position).length : comments.length, ui_changed: true };
        }, (result) => `${Number(result.visible_comment_count) || 0} comments shown`),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    void modelContext.registerTool({
      name: 'render_market_arguments',
      title: 'Render evidence-backed YES and NO arguments',
      description: 'Render Codex’s argument extraction inside Side while preserving references to the original real Polymarket comment IDs. Claims without valid evidence IDs are dropped.',
      inputSchema: {
        type: 'object',
        properties: {
          yes_arguments: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, evidence_comment_ids: { type: 'array', items: { type: 'string', description: 'Exact comment ID returned by inspect_market_comments.' } } }, required: ['claim', 'evidence_comment_ids'], additionalProperties: false } },
          no_arguments: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, evidence_comment_ids: { type: 'array', items: { type: 'string', description: 'Exact comment ID returned by inspect_market_comments.' } } }, required: ['claim', 'evidence_comment_ids'], additionalProperties: false } },
        },
        required: ['yes_arguments', 'no_arguments'], additionalProperties: false,
      },
      execute: (input) => runAgentMutation(
        () => renderCommentArguments(input),
        'YES / NO evidence rendered',
      ),
      annotations: { readOnlyHint: false },
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [comments, commitMotion, renderCommentArguments, runAgentMutation]);

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
          <Button variant={savedViewsOpen ? 'secondary' : 'ghost'} onClick={() => { setSavedViewsOpen((current) => !current); setWatchesOpen(false); }}>
            <Bookmark /> Views <span key={savedViews.length} className="nav-count count-pop">{savedViews.length}</span>
          </Button>
          <Button variant="ghost" onClick={() => void composeFollowedTraderView()} disabled={!followedTraders.length}>
            <UserCheck /> Followed <span key={followedTraders.length} className="nav-count count-pop">{followedTraders.length}</span>
          </Button>
          <Button variant={watchlistOnly ? 'secondary' : 'ghost'} onClick={() => setWatchlistOnly((current) => !current)}>
            <Star /> Saved <span key={watchlist.length} className="nav-count count-pop">{watchlist.length}</span>
          </Button>
          <Button variant={watchesOpen ? 'secondary' : 'ghost'} onClick={() => { setWatchesOpen((current) => !current); setSavedViewsOpen(false); if (!currentWatchId && watches[0]) setCurrentWatchId(watches[0].id); }}>
            <Radar /> Watches <span key={watches.length} className="nav-count count-pop">{watches.length}</span>
          </Button>
          <Button variant="outline"><CircleDollarSign /> Paper <span className="paper-balance">{paperTrades.length} trades</span></Button>
        </nav>
      </header>

      {agentAction && (
        <output key={agentAction.id} className="agent-action-toast" aria-live="polite">
          <Bot /><span>Updated by agent</span><strong>{agentAction.message}</strong>
        </output>
      )}

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
        {watchesOpen && (
          <div className="watches-panel" aria-label="Saved Watches">
            <div className="saved-views-heading"><span>PROGRAMMABLE WATCHES</span><button onClick={() => setWatchesOpen(false)} aria-label="Close Watches"><X /></button></div>
            <div className="watch-list">
              {watches.length ? watches.map((watch) => (
                <article key={watch.id} className={`watch-card ${currentWatchId === watch.id ? 'is-current' : ''}`}>
                  <button className="watch-card-main" aria-label={`Open Watch ${watch.name}`} onClick={() => setCurrentWatchId(watch.id)}>
                    <span className={`watch-process-dot ${watch.status}`} />
                    <span>
                      <small>{watchRelationshipLabel[watch.relationship].toUpperCase()} WATCH</small>
                      <strong>{watch.name}</strong>
                      <b>{watch.traderWallets.length} traders · {watch.relationship === 'new_position' ? 'New entries' : `${watch.minimumTraderOverlap}+ required`} · {watch.excludeSports ? 'No sports' : 'All categories'}</b>
                    </span>
                    <span className="watch-match-count"><strong>{watch.matches.length}</strong><small>matches</small></span>
                  </button>
                  <button className="watch-check" onClick={() => void checkWatchNow(watch.id)} disabled={watchLoadingId === watch.id || watch.status === 'paused'}>
                    <RefreshCw className={watchLoadingId === watch.id ? 'spin' : ''} /> {watch.status === 'paused' ? 'Paused' : 'Check now'}
                  </button>
                </article>
              )) : <div className="watch-empty"><Radar /><strong>No Watches yet</strong><p>Follow or inspect traders, then ask your agent to create a consensus, disagreement, or new-position Watch.</p></div>}
            </div>
            {currentWatch && (
              <section key={`${currentWatch.id}-${currentWatch.updatedAt}`} className="watch-detail">
                <div className="watch-detail-head">
                  <span><b className={currentWatch.status}>{currentWatch.status}</b>{formatWatchCheckedAt(currentWatch.lastEvaluatedAt)}</span>
                  <small>CHECKED ON SIDE REFRESH</small>
                </div>
                <div className="watch-rule-grid">
                  <div><span>TRADERS</span><strong>{currentWatch.traderWallets.length}</strong></div>
                  <div><span>RELATIONSHIP</span><strong>{watchRelationshipLabel[currentWatch.relationship]}</strong></div>
                  <div><span>REQUIRED</span><strong>{currentWatch.relationship === 'new_position' ? 'Any trader' : `${currentWatch.minimumTraderOverlap} traders`}</strong></div>
                  <div><span>MINIMUM</span><strong>{compactMoney.format(currentWatch.minimumPositionValue)}</strong></div>
                </div>
                <div className="watch-matches">
                  <div className="watch-matches-label"><span>CURRENT MATCHES</span><span>{currentWatch.matches.length}</span></div>
                  {currentWatch.matches.slice(0, 8).map((match) => (
                    <button key={match.id} onClick={() => void openMarketByConditionId(match.conditionId)}>
                      <span><strong>{match.title}</strong><small>{match.positions.map((position) => `${position.traderName} · ${position.outcome}`).join(' / ')}</small></span>
                      <ChevronRight />
                    </button>
                  ))}
                  {!currentWatch.matches.length && <p>{currentWatch.relationship === 'new_position' && currentWatch.snapshots.length ? 'Baseline saved. A match appears when a watched trader enters a position not seen in the previous snapshot.' : 'No current positions satisfy this Watch.'}</p>}
                </div>
              </section>
            )}
          </div>
        )}
        <div className="eyebrow-row">
          <div className={`live-label ${feedMeta.isStale ? 'cached' : ''}`}><span /> {feedMeta.isStale ? 'CACHED REAL DATA' : 'LIVE MARKET INTELLIGENCE'} <small>{freshnessText}</small></div>
          <div className={`agent-status ${agentConnected ? 'connected' : ''}`}><Bot /> {agentConnected ? 'AGENT CONNECTED' : 'BROWSER MODE'}</div>
        </div>
        <div className="title-row">
          <div
            key={composedView ? `${composedView.id}-${composedView.updatedAt}` : `${activeQuery}-${watchlistOnly}`}
            className="title-copy"
            style={{ viewTransitionName: 'side-page-title' }}
          >
            <h1>{composedView ? composedView.title : watchlistOnly ? 'Saved markets' : activeQuery ? `Markets for “${activeQuery}”` : 'Markets moving now'}</h1>
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
        {composedView && <div key={composedView.updatedAt} className="composed-status saved-pulse"><Bookmark /> Saved automatically <span>·</span> Updated {shortDate.format(new Date(composedView.updatedAt))}</div>}
        {selectedMarketIds.length > 0 && (
          <div className="selection-bar"><span>{selectedMarketIds.length} selected</span><small>Ask your agent to “build around these.”</small><button onClick={() => setSelectedMarketIds([])}>Clear</button></div>
        )}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {(!composedView || visibleMarkets.length > 0) && (
          <section key={composedView ? `${composedView.id}-markets-${composedView.updatedAt}` : `feed-${activeQuery}`} className={composedView ? 'composed-section composed-section-markets' : undefined}>
            {composedView && <div className="composed-section-heading"><span>{composedView.sections.find((section) => section.type === 'markets')?.title ?? 'Markets'}</span><small>{visibleMarkets.length} LIVE</small></div>}
            <div className={`market-grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
              {visibleMarkets.map((market) => <MarketCard key={market.id} market={market} selected={selectedMarketIds.includes(market.id)} onToggleSelect={toggleMarketSelection} onOpen={(nextMarket) => { void openMarketById(nextMarket.id); }} />)}
            </div>
          </section>
        )}
        {composedView?.traders.length ? (
          <section key={`${composedView.id}-traders-${composedView.updatedAt}`} className="composed-section trader-composition">
            <div className="composed-section-heading"><span>{composedView.sections.find((section) => section.type === 'traders')?.title ?? 'Notable traders'}</span><small>FACTUAL SIGNALS</small></div>
            <div className="composed-trader-grid">
              {composedView.traders.map((trader) => {
                const isFollowed = followedTraders.some((followed) => followed.wallet.toLowerCase() === trader.wallet.toLowerCase());
                return <article key={trader.wallet} style={{ viewTransitionName: `side-trader-${trader.wallet.slice(2)}` }}>
                  <button className="composed-trader-main" onClick={() => void openTrader(trader.wallet)}>
                    <span className="holder-avatar">{trader.name.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{trader.name}</strong><small>{trader.reason}</small></span><ChevronRight />
                  </button>
                  <button className={`follow-mini ${isFollowed ? 'is-active' : ''}`} onClick={() => toggleTraderFollow(trader.wallet, trader.name, trader.reason)}><span key={String(isFollowed)} className="state-pop">{isFollowed ? <UserCheck /> : <UserPlus />}{isFollowed ? 'Following' : 'Follow'}</span></button>
                </article>;
              })}
            </div>
          </section>
        ) : null}
        {composedView?.sections.some((section) => section.type === 'trader_positions') && (
          <section key={`${composedView.id}-positions-${composedView.updatedAt}`} className="composed-section followed-positions">
            <div className="composed-section-heading"><span>Current positions</span><small>NON-REDEEMABLE · LIVE</small></div>
            {composedView.traders.map((trader) => {
              const profile = composedProfiles[trader.wallet];
              return <article className="followed-profile" key={trader.wallet}>
                <div className="followed-profile-heading"><button onClick={() => void openTrader(trader.wallet)}><strong>{trader.name}</strong><small>{trader.reason}</small></button><span>{profile ? compactMoney.format(profile.visibleOpenValue) : 'Unavailable'}</span></div>
                {profile?.positions.slice(0, 6).map((position) => <button className="followed-position" onClick={() => void openMarketByConditionId(position.conditionId)} key={`${position.conditionId}-${position.outcome}`}><span><strong>{position.title}</strong><small>{position.outcome} · {formatCents(position.currentPrice)}</small></span><b>{compactMoney.format(position.currentValue)}</b></button>)}
              </article>;
            })}
          </section>
        )}
        {!loading && visibleMarkets.length === 0 && !composedView?.sections.some((section) => section.type === 'trader_positions') && (
          <div className="empty-state"><Search /><h2>{watchlistOnly ? 'No saved markets yet' : 'No live markets found'}</h2><p>{watchlistOnly ? 'Open a market and save it from the detail drawer.' : 'Try a broader topic, like politics, crypto, or sports.'}</p><Button onClick={() => watchlistOnly ? setWatchlistOnly(false) : void runSearch('')}>{watchlistOnly ? 'Browse markets' : 'Back to trending'}</Button></div>
        )}
      </section>

      <Sheet open={Boolean(selectedMarket || selectedTrader)} onOpenChange={(open) => { if (!open) { setSelectedMarket(null); setSelectedTrader(null); setHolders([]); setComments([]); setCommentsOpen(false); setCommentArguments(null); setDrawerMode('market'); } }}>
        <SheetContent className="market-drawer sm:max-w-[760px]" showCloseButton>
          {selectedMarket && !selectedTrader && (
            <div key={`${selectedMarket.id}-${drawerMode}-${drawerDirection}`} className={`drawer-stage drawer-stage-${drawerMode} drawer-${drawerDirection}`}>
              <SheetHeader className="drawer-header">
                <div className="drawer-kicker"><span>{selectedMarket.category}</span><span>•</span><span>POLYMARKET</span><span className="drawer-live">LIVE</span></div>
                <SheetTitle>{selectedMarket.question}</SheetTitle>
                <SheetDescription>{selectedMarket.description || 'Live binary prediction market.'}</SheetDescription>
                <Button className={`watch-market-button state-button ${watchlist.includes(selectedMarket.id) ? 'is-active' : ''}`} variant={watchlist.includes(selectedMarket.id) ? 'secondary' : 'outline'} onClick={() => toggleWatchlist(selectedMarket.id)}>
                  <span key={String(watchlist.includes(selectedMarket.id))} className="state-pop">
                    {watchlist.includes(selectedMarket.id) ? <Check /> : <Star />}
                    {watchlist.includes(selectedMarket.id) ? 'Saved' : 'Save market'}
                  </span>
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
                {commentsOpen && drawerMode === 'comments' && (
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
                          {commentArguments[side].map((argument, index) => <article key={`${side}-${index}`} style={{ animationDelay: `${Math.min(index * 35, 105)}ms` }}>
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
                      {visibleComments.map((comment, index) => {
                        const matchedHolder = Boolean(comment.author.wallet && holders.some((holder) => holder.wallet.toLowerCase() === comment.author.wallet.toLowerCase()));
                        return <article className={`comment-row ${comment.parentCommentId ? 'reply' : ''}`} style={{ animationDelay: `${Math.min(index * 18, 126)}ms` }} key={comment.id}>
                          <div className="comment-meta"><span className="holder-avatar">{(comment.author.name || comment.author.pseudonym || '0').slice(0, 1).toUpperCase()}</span><span><strong>{comment.author.name || comment.author.pseudonym || `${comment.author.wallet.slice(0, 8)}…`}</strong><small>{comment.createdAt ? commentTime.format(new Date(comment.createdAt)) : 'Time unavailable'}</small></span><span className="comment-badges">{comment.position && <b>{comment.position.side} POSITION</b>}{matchedHolder && <b>VISIBLE HOLDER</b>}</span></div>
                          <p>{comment.body}</p>
                          <div className="comment-foot"><span>#{comment.id}</span>{comment.reactionCount > 0 && <span>{comment.reactionCount} reactions</span>}{comment.parentCommentId && <span>reply to #{comment.parentCommentId}</span>}</div>
                        </article>;
                      })}
                    </div>
                    {!visibleComments.length && <div className="position-empty">No comments match this evidence filter.</div>}
                  </section>
                )}
                {holders.length > 0 && drawerMode === 'holders' && (
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
            </div>
          )}
          {selectedTrader && (
            <div key={`${selectedTrader.wallet}-${drawerDirection}`} className={`drawer-stage drawer-stage-trader drawer-${drawerDirection}`}>
              <SheetHeader className="drawer-header trader-header">
                <button className="back-button" onClick={() => commitMotion('drawer-back', () => { setSelectedTrader(null); setDrawerMode(returnDrawerMode.current); setDrawerDirection('back'); })}><ArrowLeft /> Back to market</button>
                <div className="trader-profile-row">
                  <span className="profile-avatar">{selectedTrader.image ? <img src={selectedTrader.image} alt="" /> : (selectedTrader.name || selectedTrader.pseudonym || '0').slice(0, 1).toUpperCase()}</span>
                  <div>
                    <div className="drawer-kicker"><span>TRADER INTELLIGENCE</span>{selectedTrader.verified && <span className="drawer-live">VERIFIED</span>}</div>
                    <SheetTitle>{selectedTrader.name || selectedTrader.pseudonym || `${selectedTrader.wallet.slice(0, 8)}…${selectedTrader.wallet.slice(-5)}`}</SheetTitle>
                    <SheetDescription>{selectedTrader.bio || `${selectedTrader.wallet.slice(0, 12)}…${selectedTrader.wallet.slice(-8)}`}</SheetDescription>
                  </div>
                </div>
                <Button className={`watch-market-button state-button ${followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? 'is-active' : ''}`} variant={followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? 'secondary' : 'outline'} onClick={() => toggleTraderFollow(selectedTrader.wallet, selectedTrader.name || selectedTrader.pseudonym, 'Followed from trader intelligence')}>
                  <span key={String(followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()))} className="state-pop">
                    {followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? <UserCheck /> : <UserPlus />}
                    {followedTraders.some((trader) => trader.wallet.toLowerCase() === selectedTrader.wallet.toLowerCase()) ? 'Following' : 'Follow trader'}
                  </span>
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
                      <button key={`${position.conditionId}-${position.outcome}`} onClick={() => void openMarketByConditionId(position.conditionId)}>
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
            </div>
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
