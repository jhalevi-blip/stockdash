@AGENTS.md

# AI model IDs

All Claude model IDs live in `lib/aiModels.js` (`CLAUDE_MODELS`). Import from there — never hardcode a model string in a route (a retired ID returns a hard 404 and silently breaks the feature; that is how the /research quick-action chips broke).

Tiers:
- `flagship` — deep analysis (theses, portfolio/stock summaries, theme classification).
- `quick` — the /research quick-action chips (`app/api/stock-quick-action`). **Deliberately Sonnet, not Opus, for cost:** these are short (`max_tokens ~400`), highest-volume, and fireable by anonymous visitors, so Opus here is the single biggest cost exposure on the site.
- `fast` — cheap classification / preview tasks.

⚠️ A blanket "upgrade everything to the newest Opus" must NOT touch `quick`. Bumping `flagship` is fine; re-inflating `quick` to an Opus tier is a deliberate cost decision that needs sign-off.
