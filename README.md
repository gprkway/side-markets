# Side

Side is a WebMCP-native prediction-market browser designed for a human and their existing agent to use together. It renders live Polymarket data in a focused trading interface and exposes page tools that visibly manipulate the same UI state.

## Working vertical slice

- Live Polymarket discovery feed normalized behind a provider adapter
- Exact Polymarket event identity, human-readable contract labels, and event-aware feed cards
- Real CLOB price history and exact event siblings in the market drawer
- Market-relationship research using exact condition/event IDs, live metrics, deadlines, and resolution rules
- Search and category filtering
- Large market detail drawer
- Real notable holders split by outcome
- Trader profiles with non-redeemable open positions and resolved trade history
- Trusted-value normalization: shares stay shares, USD stays USD, and ambiguous aggregates are hidden
- Last-known-good real market cache with visible freshness state
- Live 24-hour probability movement when Polymarket provides it
- Device-local Saved markets and paper-trade ledger
- Device-local trader follows and followed-position research views
- Device-local programmable Watches for trader consensus, disagreement, and newly observed positions
- Snapshot-backed Watch evaluation on Side load, refresh, or explicit “Check now” — no fake background monitoring
- Automatically saved composed research workspaces that human clicks and WebMCP can refine together
- Exact trader-position cell selection shared between the human, Codex, and the live desk
- Bounded relationship research with factual lane progress, revision checks, and cancellation
- Provenance-backed Codex findings that Side validates against live market/position IDs
- Human Pin/Reject controls for agent-created research objects
- Selection-aware Watch handoff that keeps the research desk mounted
- Registry-driven “With Codex” guide with current and unlockable capabilities
- Root capability discovery plus compact capability snapshots in existing contextual read tools
- Real Polymarket event comments with exact outcome-token and visible-holder matching when supported
- Evidence-backed YES/NO argument rendering that preserves original comment IDs
- Human-confirmed paper-trade preparation; no real execution
- Context-sensitive WebMCP tools for discovery, markets, traders, watchlists, and paper trades
- Restrained, reduced-motion-aware transitions and an ephemeral agent-action cue for every mutating Site Tool
- Responsive dark trading interface

## WebMCP tools

The always-available tools include `search_markets`, `compose_market_view`, and `open_market`. At the root, `get_side_capabilities` returns a compact registry-backed summary of what Side can do now and what one clear human action can unlock. In every other context, the same capability snapshot is included in the existing context-reading tool, preserving the tested maximum of 11 registrations. Side adds refinement tools while a composed view is active, market and discussion tools while a market drawer is open, holder/follow tools after trader intelligence is loaded, and trader context only while a trader profile is visible. `open_trader_position` can load a trader's real market by condition ID even when it was never in the discovery grid.

Inside a trader comparison, `get_current_research_set` exposes compact semantic state for exact human-selected cells. When a selection exists, the bounded contextual group swaps comparison composition for `research_current_selection` and `render_research_findings`. Research calls validate the research-set ID and revision, show only real request/cache progress, and reject stale work. Findings accept no submitted observations: every entity/evidence reference must resolve against the factual run, and Side renders the observed values itself. Baseline plus contextual tools remain capped at 11 registrations.

When visible or followed trader IDs are available, Codex can call `create_trader_watch` with explicit wallets and deterministic rule primitives. Saved Watches can be reopened, updated in place, paused, checked, and converted into a visible set of matching real markets. Side never interprets fuzzy phrases such as “these traders”; Codex resolves those references from current page context and passes explicit IDs. All mutating tools update the same React state shown to the human.

### Suggested Site Tools demo

1. Start in a three-holder comparison and manually select two opposing position cells.
2. Ask: “Explain this.” Codex reads the exact selection, runs bounded live research, and writes a validated interpretation into the desk.
3. Pin the strongest finding and reject another directly in Side.
4. Ask: “Keep an eye on this.” Codex maps the retained relationship into Side's existing deterministic Watch without leaving the desk.
5. Optionally open the largest current match and prepare a $100 YES paper trade. The human must confirm in Side.

The current browser API is feature-detected at `document.modelContext`, with a compatibility fallback for `navigator.modelContext`.

## Architecture

- Vinext/Vite + React 19 + TypeScript
- Provider-neutral normalized market and trader types
- Polymarket Gamma and Data API adapters
- Server routes keep provider response shapes out of UI components
- A warm server cache plus device-local last-known-good market results soften temporary provider failures
- `localStorage` is used for device-local cached real feeds, Saved markets, simulated trades, trader follows, views, and structured Watch definitions/snapshots

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the development server in a WebMCP-capable browser. The site registers tools through `document.modelContext` and includes the deprecated `navigator.modelContext` compatibility fallback.

## Product boundaries

Side does not provide real-money execution, custody, authentication, a custom chatbot, or investment advice. Market data is sourced from Polymarket's public APIs.

The Agent Guide is intentionally documentation-only. Event and market normalization, feed-card structure, charts, price history, order-book presentation, sports presentation, and Polymarket event grouping remain reserved for a separate market-fidelity pass.

Following and Watches are research-only local state. Watches are evaluated when Side loads, refreshes, or the human requests a check; Side does not claim autonomous push notifications or continuous background monitoring. Comments are read-only; Side does not post, moderate, or infer identities. A commenter is labeled as positioned only when Polymarket supplies a token that exactly matches an outcome token for the current event.

Trader totals are deliberately scoped. Side excludes redeemable claims from current positions, deduplicates positions by market and outcome, and labels the displayed sum as visible open value rather than claiming it is a wallet-wide portfolio or lifetime P&L.

## License

[MIT](./LICENSE)
