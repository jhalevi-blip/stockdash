@AGENTS.md

# AI model IDs

All Claude model IDs live in `lib/aiModels.js` (`CLAUDE_MODELS`). Import from there — never hardcode a model string in a route (a retired ID returns a hard 404 and silently breaks the feature; that is how the /research quick-action chips broke).

Tiers:
- `flagship` — deep analysis (theses, portfolio/stock summaries, theme classification).
- `quick` — the /research quick-action chips (`app/api/stock-quick-action`). **Deliberately Sonnet, not Opus, for cost:** these are short (`max_tokens ~400`), highest-volume, and fireable by anonymous visitors, so Opus here is the single biggest cost exposure on the site.
- `fast` — cheap classification / preview tasks.

⚠️ A blanket "upgrade everything to the newest Opus" must NOT touch `quick`. Bumping `flagship` is fine; re-inflating `quick` to an Opus tier is a deliberate cost decision that needs sign-off.

# Performance page — cashEvents caveat

`cashEvents` (from the broker parsers / `portfolio_transactions.data`) does **NOT** reconcile to a cash balance for multi-currency DeGiro accounts (non-EUR rows are skipped upstream in `lib/brokers/degiro.ts`) — verified Aug 2026, Σ €124,007 vs actual €876. Do **not** use it as a cash-balance source. Use the `deposits` array for external flows and `currentCash` for the terminal balance. The shares ledger (`tradeLegs`) IS exact and reconciles to current holdings; build `/performance` reconstruction on tradeLegs + deposits + currentCash.
