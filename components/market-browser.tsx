'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Command,
  Search,
  LoaderCircle,
  Sparkles,
  Star,
  TrendingUp,
  Users,
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
import type { Holder, TraderProfile } from '@/lib/traders/types';

type PaperTradeDraft = {
  marketId: string;
  question: string;
  outcome: string;
  probability: number;
  amount: number;
};

type PaperTrade = PaperTradeDraft & { id: string; createdAt: string };

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
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function primaryProbability(market: Market) {
  return Math.round((market.outcomes[0]?.probability ?? 0) * 100);
}

function MarketCard({ market, onOpen }: { market: Market; onOpen: (market: Market) => void }) {
  const probability = primaryProbability(market);
  return (
    <button className="market-card" onClick={() => onOpen(market)} aria-label={`Open ${market.question}`}>
      <div className="market-card-topline">
        <div className="market-identity">
          {market.image ? <img src={market.image} alt="" /> : <span className="market-fallback">S</span>}
          <span>{market.category}</span>
        </div>
        <Star className="star-icon" aria-hidden="true" />
      </div>
      <h2>{market.question}</h2>
      <div className="probability-row">
        <strong>{probability}%</strong>
        <span>{market.outcomes[0]?.label ?? 'Yes'}</span>
      </div>
      <div className="split-track" aria-label={`${probability}% probability`}><span style={{ width: `${probability}%` }} /></div>
      <div className="market-card-meta">
        <span>{compactMoney.format(market.volume24h)} today</span>
        <span>{market.endDate ? shortDate.format(new Date(market.endDate)) : 'Open'}</span>
        <ChevronRight aria-hidden="true" />
      </div>
    </button>
  );
}

export function MarketBrowser({ initialMarkets }: { initialMarkets: Market[] }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
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
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setWatchlist(JSON.parse(localStorage.getItem('side.watchlist') ?? '[]'));
        setPaperTrades(JSON.parse(localStorage.getItem('side.paperTrades') ?? '[]'));
      } catch {
        localStorage.removeItem('side.watchlist');
        localStorage.removeItem('side.paperTrades');
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
      const payload = (await response.json()) as { markets: Market[] };
      setMarkets(payload.markets);
      setActiveQuery(cleanQuery);
      setSelectedMarket(null);
      setSelectedTrader(null);
      setHolders([]);
      return {
        visible_market_count: payload.markets.length,
        query: cleanQuery || 'trending',
        visible_markets: payload.markets.slice(0, 8).map((market) => ({
          id: market.id, question: market.question,
          probability: primaryProbability(market), volume_24h: market.volume24h,
        })),
        ui_changed: true,
      };
    } catch {
      setError('Could not refresh the market feed. Try again in a moment.');
      return { error: 'Search failed', ui_changed: false };
    } finally { setLoading(false); }
  }, []);

  const openMarketById = useCallback((id: string) => {
    const market = markets.find((candidate) => candidate.id === id);
    if (!market) return { error: 'Market is not in the visible result set.', ui_changed: false };
    setSelectedMarket(market);
    setSelectedTrader(null);
    setHolders([]);
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
          portfolio_value: payload.trader.portfolioValue,
          total_pnl: payload.trader.totalPnl,
          current_positions: payload.trader.positions.map((position) => ({
            condition_id: position.conditionId,
            title: position.title,
            side: position.outcome,
            value: position.currentValue,
            pnl: position.pnl,
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
  }, [openMarketById, runSearch]);

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
  }, [loadHolders, preparePaperTrade, selectedMarket, toggleWatchlist]);

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
    return () => controller.abort();
  }, [holders, openTrader]);

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
    return () => controller.abort();
  }, [selectedTrader]);

  const visibleMarkets = useMemo(
    () => watchlistOnly ? markets.filter((market) => watchlist.includes(market.id)) : markets,
    [markets, watchlist, watchlistOnly],
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
          <Button variant={watchlistOnly ? 'secondary' : 'ghost'} onClick={() => setWatchlistOnly((current) => !current)}>
            <Star /> Watchlist <span className="nav-count">{watchlist.length}</span>
          </Button>
          <Button variant="outline"><CircleDollarSign /> Paper <span className="paper-balance">{paperTrades.length} trades</span></Button>
        </nav>
      </header>

      <section className="market-surface" id="top">
        <div className="eyebrow-row">
          <div className="live-label"><span /> LIVE MARKET INTELLIGENCE</div>
          <div className={`agent-status ${agentConnected ? 'connected' : ''}`}><Bot /> {agentConnected ? 'AGENT CONNECTED' : 'BROWSER MODE'}</div>
        </div>
        <div className="title-row">
          <div>
            <h1>{watchlistOnly ? 'Your watchlist' : activeQuery ? `Markets for “${activeQuery}”` : 'Markets moving now'}</h1>
            <p>{watchlistOnly ? 'Device-local markets you want to keep close.' : activeQuery ? 'Live matches, ranked by activity.' : 'High-signal markets ranked by 24-hour volume.'}</p>
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
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className={`market-grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          {visibleMarkets.map((market) => <MarketCard key={market.id} market={market} onOpen={(nextMarket) => { setSelectedMarket(nextMarket); setSelectedTrader(null); setHolders([]); }} />)}
        </div>
        {!loading && visibleMarkets.length === 0 && (
          <div className="empty-state"><Search /><h2>{watchlistOnly ? 'Your watchlist is empty' : 'No live markets found'}</h2><p>{watchlistOnly ? 'Open a market and save it from the detail drawer.' : 'Try a broader topic, like politics, crypto, or sports.'}</p><Button onClick={() => watchlistOnly ? setWatchlistOnly(false) : void runSearch('')}>{watchlistOnly ? 'Browse markets' : 'Back to trending'}</Button></div>
        )}
      </section>

      <Sheet open={Boolean(selectedMarket)} onOpenChange={(open) => { if (!open) { setSelectedMarket(null); setSelectedTrader(null); setHolders([]); } }}>
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
                  <div className="drawer-probability">{primaryProbability(selectedMarket)}<small>%</small></div>
                  <div className="split-track large"><span style={{ width: `${primaryProbability(selectedMarket)}%` }} /></div>
                  <div className="outcome-buttons">
                    {selectedMarket.outcomes.slice(0, 2).map((outcome, index) => (
                      <button key={outcome.label} className={index === 0 ? 'yes' : 'no'} onClick={() => preparePaperTrade(outcome.label, 100)}>
                        <span>Paper {outcome.label}</span><strong>{Math.round(outcome.probability * 100)}¢</strong>
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
                {holders.length > 0 && (
                  <section className="holders-section">
                    <div className="section-label"><span>NOTABLE HOLDERS</span><span>{holders.length} FOUND</span></div>
                    <div className="holder-list">
                      {holders.map((holder) => (
                        <button key={`${holder.wallet}-${holder.outcomeIndex}`} onClick={() => void openTrader(holder.wallet)}>
                          <span className="holder-avatar">{holder.image ? <img src={holder.image} alt="" /> : (holder.name || holder.pseudonym || '0').slice(0, 1).toUpperCase()}</span>
                          <span className="holder-name"><strong>{holder.name || holder.pseudonym || `${holder.wallet.slice(0, 6)}…${holder.wallet.slice(-4)}`}</strong><small>{selectedMarket.outcomes[holder.outcomeIndex]?.label ?? `Side ${holder.outcomeIndex + 1}`}</small></span>
                          <span className="holder-amount">{compactMoney.format(holder.amount)}<small>shares</small></span>
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
              </SheetHeader>
              <div className="drawer-body trader-body">
                <div className="trader-stats">
                  <div><span>OPEN VALUE</span><strong>{compactMoney.format(selectedTrader.portfolioValue)}</strong></div>
                  <div><span>EST. TOTAL P&L</span><strong className={selectedTrader.totalPnl >= 0 ? 'positive' : 'negative'}>{selectedTrader.totalPnl >= 0 ? '+' : ''}{compactMoney.format(selectedTrader.totalPnl)}</strong></div>
                  <div><span>POSITIONS</span><strong>{selectedTrader.positions.length}</strong></div>
                </div>

                <section className="positions-section">
                  <div className="section-label"><span>CURRENT POSITIONS</span><span>SORTED BY VALUE</span></div>
                  <div className="position-list">
                    {selectedTrader.positions.map((position) => (
                      <button key={`${position.conditionId}-${position.outcome}`} onClick={() => { const match = markets.find((market) => market.conditionId === position.conditionId); if (match) { setSelectedMarket(match); setSelectedTrader(null); setHolders([]); } }}>
                        <span className="position-icon">{position.icon ? <img src={position.icon} alt="" /> : 'S'}</span>
                        <span className="position-title"><strong>{position.title}</strong><small>{position.outcome} · avg {Math.round(position.avgPrice * 100)}¢ → {Math.round(position.currentPrice * 100)}¢</small></span>
                        <span className="position-value"><strong>{compactMoney.format(position.currentValue)}</strong><small className={position.pnl >= 0 ? 'positive' : 'negative'}>{position.pnl >= 0 ? '+' : ''}{compactMoney.format(position.pnl)}</small></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="positions-section history-section">
                  <div className="section-label"><span>BEST RESOLVED TRADES</span><span>REALIZED P&L</span></div>
                  <div className="position-list">
                    {selectedTrader.history.slice(0, 6).map((position) => (
                      <div className="history-row" key={`${position.conditionId}-${position.outcome}`}>
                        <span className="position-icon">{position.icon ? <img src={position.icon} alt="" /> : 'S'}</span>
                        <span className="position-title"><strong>{position.title}</strong><small>{position.outcome} · resolved</small></span>
                        <span className="position-value"><strong className={position.pnl >= 0 ? 'positive' : 'negative'}>{position.pnl >= 0 ? '+' : ''}{compactMoney.format(position.pnl)}</strong></span>
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
                <div><span>SIDE</span><strong>{tradeDraft.outcome} at {Math.round(tradeDraft.probability * 100)}¢</strong></div>
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
