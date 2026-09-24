// GET /api/screen — the quality-compounder-at-drawdown screen.
//
// Pipeline (all in-route; the evaluable set is ~1,776 rows — trivial in memory):
//   1. Evaluable universe : symbol_universe rows with exclusion_reason IS NULL,
//                           intersected with fundamentals_snapshot on symbol.
//                           industry/sector come from symbol_universe (the snapshot's
//                           own sector/industry are unpopulated).
//   2. Operating ROIC     : computed from raw snapshot operands via lib/screen/metrics
//                           (NOT the snapshot's `roic`, NEVER FMP's investedCapitalTTM).
//                           roic_reported (goodwill-inclusive base) is kept alongside.
//   3. Flagged review group (rules 6 + 8): invested capital ≤ 0 OR operating ROIC > 200%
//                           (ROIC "n/m"), or market_cap_divergence > 0.2. Diverted out of
//                           the funnel — never gated/highlighted/dropped — returned
//                           separately with their reason(s).
//   4. ROIC gate          : operating ROIC ≥ 13%. Candidates whose ROIC is uncomputable
//                           (a missing input) are counted as "ROIC not computable", NOT
//                           quietly treated as failing.
//   5. Drawdown gate       : read from screen_quotes (refreshed daily post-close by the
//                           GitHub Actions job) — LIVE price vs the quote's own 52-week
//                           high (FMP yearHigh), ≥ 35% below. This is deterministic and
//                           instant; no upstream quote calls on the request path. A ROIC
//                           passer with no stored quote is shown as "no quote", counted,
//                           and never silently dropped. Staleness (> 2 trading days) is
//                           surfaced, never hidden.
//   6. Rejected filter     : names in rejected_candidates for the signed-in user are
//                           hidden unless their revisit condition is met.
//   7. Industry percentiles: gross_margin_stdev (lower = better) and net-debt/EBITDA
//                           (net cash best; EBITDA ≤ 0 worst), percentile-ranked WITHIN
//                           INDUSTRY over the evaluable non-flagged cohort. Composite =
//                           mean of the two. Industries with < 5 such names are "too
//                           small to rank". The best 20% of the composite (rankable
//                           industry, confirmed drawdown) is highlighted.
//
// Auth-gated; reads shared reference data + this user's rejected_candidates.

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  SNAP_COLS, classifyRow, passesRoic, leverageValue, pctRank, fin,
  DRAWDOWN_MIN, INDUSTRY_MIN, HIGHLIGHT_PCTL,
} from '@/lib/screen/metrics';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const STALE_TRADING_DAYS = 2;   // quote older than this many trading days ⇒ "stale"

// Page through PostgREST's 1000-row cap.
async function fetchAll(sb, table, columns, apply) {
  const PAGE = 1000, out = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Trading (week)days strictly between an as-of instant and now. Weekend-aware; does not
// know exchange holidays, so it can over-count by ~1 around a holiday — acceptable for a
// "> 2 trading days" staleness warning (it errs toward warning, never toward hiding).
function tradingDaysOld(asOfMs, nowMs) {
  if (!fin(asOfMs)) return Infinity;
  const d = new Date(asOfMs); d.setUTCHours(0, 0, 0, 0);
  const end = new Date(nowMs); end.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// Evaluate a rejected_candidates revisit rule against the name's current values.
// A rule with no structured metric/op/value never resurfaces (stays hidden).
function revisitMet(rej, ctx) {
  const m = rej.revisit_metric, op = rej.revisit_op, target = rej.revisit_value;
  if (!m || !op || !fin(target)) return false;
  const cur = ctx[m];
  if (!fin(cur)) return false;
  switch (op) {
    case '<':  return cur <  target;
    case '<=': return cur <= target;
    case '>':  return cur >  target;
    case '>=': return cur >= target;
    case '=':
    case '==': return cur === target;
    default:   return false;
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  try {
    const now = Date.now();

    // 1. Evaluable universe ∩ snapshot; industry/sector from the universe row.
    const universe = await fetchAll(sb, 'symbol_universe', 'symbol, industry, sector',
      q => q.is('exclusion_reason', null));
    const uniBy = new Map(universe.map(r => [r.symbol, r]));
    const snap = await fetchAll(sb, 'fundamentals_snapshot', SNAP_COLS);
    const evaluable = snap
      .filter(r => uniBy.has(r.symbol))
      .map(r => ({ ...r, industry: uniBy.get(r.symbol).industry, sector: uniBy.get(r.symbol).sector }));

    // 2 + 3. Operating ROIC, then split the flagged review group from clean candidates.
    const flaggedGroup = [];
    const candidates = [];
    let roicNotComputable = 0;
    for (const r of evaluable) {
      const { ic, roic, roicNm, reasons, flagged } = classifyRow(r);
      if (flagged) {
        flaggedGroup.push({
          symbol: r.symbol, industry: r.industry, sector: r.sector,
          reasons,
          roic: roicNm ? null : roic,
          roicNm,
          roicReported: r.roic_reported,
          marketCapDivergence: r.market_cap_divergence,
        });
      } else {
        if (!fin(roic)) roicNotComputable++;   // clean candidate, ROIC input missing
        candidates.push({
          symbol: r.symbol, industry: r.industry, sector: r.sector,
          ic, roic, roicReported: r.roic_reported,
          grossMarginStdev: r.gross_margin_stdev,
          netDebtEbitda: r.net_debt_ebitda, netCash: r.net_cash, ebitda: r.ebitda,
          // Compute the leverage-rank axis NOW, off the raw snake_case snapshot row —
          // leverageValue reads net_cash / net_debt_ebitda, which this object renames.
          lev: leverageValue(r),
        });
      }
    }

    // 4. ROIC gate (flagged and not-computable names already excluded).
    const passRoic = candidates.filter(r => passesRoic(r.roic));

    // 5. Drawdown gate from screen_quotes (deterministic; no upstream calls). Degrade
    // gracefully if the table isn't there yet (pre-migration / pre-first-refresh): every
    // name becomes "no quote" and the response is flagged stale, never a 500.
    let quoteRows = [];
    try {
      quoteRows = await fetchAll(sb, 'screen_quotes', 'symbol, price, year_high, as_of');
    } catch (e) {
      console.error('[screen] screen_quotes unavailable — treating all as no-quote:', e.message);
    }
    const quoteBy = new Map(quoteRows.map(q => [q.symbol, q]));
    let dataAsOfMs = null;
    for (const q of quoteRows) {
      const t = q.as_of ? Date.parse(q.as_of) : null;
      if (fin(t) && (dataAsOfMs === null || t > dataAsOfMs)) dataAsOfMs = t;
    }

    const withQuote = passRoic.map(r => {
      const q = quoteBy.get(r.symbol);
      const price = q && fin(q.price) ? q.price : null;
      const yearHigh = q && fin(q.year_high) ? q.year_high : null;
      const hasQuote = fin(price) && fin(yearHigh) && yearHigh > 0;
      const asOfMs = q && q.as_of ? Date.parse(q.as_of) : null;
      const drawdown = hasQuote ? (yearHigh - price) / yearHigh : null;
      return {
        ...r,
        price, asOf: fin(asOfMs) ? asOfMs : null,
        stale: hasQuote ? tradingDaysOld(asOfMs, now) > STALE_TRADING_DAYS : false,
        noQuote: !hasQuote,
        drawdown,
        passDrawdown: hasQuote && drawdown >= DRAWDOWN_MIN,
      };
    });
    const passDrawdown = withQuote.filter(r => r.passDrawdown);
    const noQuote = withQuote.filter(r => r.noQuote);
    // Shown = confirmed drawdown-passers + no-quote names (surfaced, never dropped).
    // Names with a quote whose drawdown is < 35% are legitimately filtered out here.
    const shown = withQuote.filter(r => r.passDrawdown || r.noQuote);

    // 6. Rejected-candidates filter (this user). Hidden unless the revisit rule is met.
    const rejected = await fetchAll(sb, 'rejected_candidates',
      'symbol, reason, revisit_if, revisit_metric, revisit_op, revisit_value',
      q => q.eq('user_id', userId));
    const rejBy = new Map(rejected.map(r => [r.symbol, r]));
    const afterRejected = shown.filter(r => {
      const rej = rejBy.get(r.symbol);
      if (!rej) return true;
      return revisitMet(rej, { drawdown_pct: r.drawdown, roic: r.roic, price: r.price, net_debt_ebitda: r.netDebtEbitda });
    });

    // 7. Industry percentiles over the evaluable non-flagged cohort (candidates).
    const cohortSize = new Map();
    const gmByInd = new Map();
    const levByInd = new Map();
    const push = (mp, k, v) => { const a = mp.get(k); if (a) a.push(v); else mp.set(k, [v]); };
    for (const r of candidates) {
      cohortSize.set(r.industry, (cohortSize.get(r.industry) || 0) + 1);
      if (fin(r.grossMarginStdev)) push(gmByInd, r.industry, r.grossMarginStdev);
      if (r.lev !== null) push(levByInd, r.industry, r.lev);
    }
    for (const a of gmByInd.values()) a.sort((x, y) => x - y);
    for (const a of levByInd.values()) a.sort((x, y) => x - y);

    let highlightedCount = 0;
    const rows = afterRejected.map(r => {
      const rankable = (cohortSize.get(r.industry) || 0) >= INDUSTRY_MIN;
      let gmPct = null, levPct = null, composite = null, highlighted = false;
      if (rankable) {
        const gmArr = gmByInd.get(r.industry);
        const levArr = levByInd.get(r.industry);
        if (gmArr && fin(r.grossMarginStdev)) gmPct = pctRank(gmArr, r.grossMarginStdev);
        if (levArr && r.lev !== null) levPct = pctRank(levArr, r.lev);
        if (fin(gmPct) && fin(levPct)) {
          composite = (gmPct + levPct) / 2;
          // Only a confirmed drawdown-passer can be highlighted (a no-quote name isn't).
          highlighted = r.passDrawdown && composite <= HIGHLIGHT_PCTL;
        }
      }
      if (highlighted) highlightedCount++;
      return {
        symbol: r.symbol, industry: r.industry, sector: r.sector,
        price: r.price, asOf: r.asOf ? new Date(r.asOf).toISOString() : null, stale: r.stale,
        noQuote: r.noQuote,
        drawdownPct: r.drawdown,          // fraction; null when no quote
        roic: r.roic,                     // operating ROIC
        roicReported: r.roicReported,     // goodwill-inclusive base, kept alongside
        grossMarginStdev: r.grossMarginStdev,
        netDebtEbitda: r.netDebtEbitda, netCash: r.netCash,
        gmPercentile: gmPct,
        levPercentile: levPct,
        composite,
        rankable,
        highlighted,
      };
    }).sort((a, b) => (b.drawdownPct ?? -Infinity) - (a.drawdownPct ?? -Infinity));

    const flaggedReasons = {
      nmRoic: flaggedGroup.filter(f => f.roicNm).length,
      divergence: flaggedGroup.filter(f => f.reasons.includes('market-cap divergence > 0.2')).length,
    };

    const dataAsOf = fin(dataAsOfMs) ? new Date(dataAsOfMs).toISOString() : null;
    const stale = !fin(dataAsOfMs) || tradingDaysOld(dataAsOfMs, now) > STALE_TRADING_DAYS;

    return Response.json({
      funnel: {
        evaluable: evaluable.length,
        roicNotComputable,
        passRoic: passRoic.length,
        noQuote: noQuote.length,
        passDrawdown: passDrawdown.length,
        afterRejected: afterRejected.length,
        highlighted: highlightedCount,
        flaggedGroup: flaggedGroup.length,
        flaggedReasons,
      },
      dataAsOf,
      stale,
      rows,
      flaggedGroup: flaggedGroup.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }, { headers: NO_STORE });
  } catch (err) {
    console.error('[screen] failed:', err);
    return Response.json({ error: 'Failed to run screen' }, { status: 500, headers: NO_STORE });
  }
}
