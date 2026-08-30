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
- Human-confirmed paper-trade preparation; no real execution
- Context-sensitive WebMCP tools for discovery, markets, traders, watchlists, and paper trades
- Responsive dark trading interface

## WebMCP tools

The always-available tools are `search_markets` and `open_market`. Side registers market tools only while a market drawer is open, holder tools only after holder intelligence is loaded, and trader context only while a trader profile is visible. All mutating tools update the same React state shown to the human.

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

Trader totals are deliberately scoped. Side excludes redeemable claims from current positions, deduplicates positions by market and outcome, and labels the displayed sum as visible open value rather than claiming it is a wallet-wide portfolio or lifetime P&L.

## License

[MIT](./LICENSE)
