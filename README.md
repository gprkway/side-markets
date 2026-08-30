# Side

Side is a WebMCP-native prediction-market browser designed for a human and their existing agent to use together. It renders live Polymarket data in a focused trading interface and exposes page tools that visibly manipulate the same UI state.

## Working vertical slice

- Live Polymarket discovery feed normalized behind a provider adapter
- Search and category filtering
- Large market detail drawer
- Real notable holders split by outcome
- Trader profiles with non-redeemable open positions and resolved trade history
- Trusted-value normalization: shares stay shares, USD stays USD, and ambiguous aggregates are hidden
- Last-known-good real market cache with visible freshness state
- Live 24-hour probability movement when Polymarket provides it
- Device-local watchlist and paper-trade ledger
- Device-local trader follows and followed-position research views
- Automatically saved composed research workspaces that human clicks and WebMCP can refine together
- Real Polymarket event comments with exact outcome-token and visible-holder matching when supported
- Evidence-backed YES/NO argument rendering that preserves original comment IDs
- Human-confirmed paper-trade preparation; no real execution
- Context-sensitive WebMCP tools for discovery, markets, traders, watchlists, and paper trades
- Responsive dark trading interface

## WebMCP tools

The always-available tools include `search_markets`, `compose_market_view`, and `open_market`. Side adds refinement tools while a composed view is active, market and discussion tools while a market drawer is open, holder/follow tools after trader intelligence is loaded, and trader context only while a trader profile is visible. All mutating tools update the same React state shown to the human.

The current browser API is feature-detected at `document.modelContext`, with a compatibility fallback for `navigator.modelContext`.

## Architecture

- Vinext/Vite + React 19 + TypeScript
- Provider-neutral normalized market and trader types
- Polymarket Gamma and Data API adapters
- Server routes keep provider response shapes out of UI components
- A warm server cache plus device-local last-known-good market results soften temporary provider failures
- `localStorage` is used only for cached real feeds, the watchlist, and simulated trades

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the development server in a WebMCP-capable browser. The site registers tools through `document.modelContext` and includes the deprecated `navigator.modelContext` compatibility fallback.

## Product boundaries

Side does not provide real-money execution, custody, authentication, a custom chatbot, or investment advice. Market data is sourced from Polymarket's public APIs.

Following is research-only local state. Comments are read-only; Side does not post, moderate, or infer identities. A commenter is labeled as positioned only when Polymarket supplies a token that exactly matches an outcome token for the current event.

Trader totals are deliberately scoped. Side excludes redeemable claims from current positions, deduplicates positions by market and outcome, and labels the displayed sum as visible open value rather than claiming it is a wallet-wide portfolio or lifetime P&L.

## License

[MIT](./LICENSE)
