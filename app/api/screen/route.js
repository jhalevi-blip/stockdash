// GET /api/screen — the quality-compounder-at-drawdown screen.
//
// Pipeline (all in-route; the evaluable set is ~1,776 rows — trivial in memory):
//   1. Evaluable universe : symbol_universe rows with exclusion_reason IS NULL,
//                           intersected with fundamentals_snapshot on symbol.
//                           industry/sector come from symbol_universe (the snapshot's
//                           own sector/industry are unpopulated).
//   2. Through-cycle ROIC : per-fiscal-year operating ROIC from fundamentals_annual (up
//                           to the last 10 years), same operating invested-capital
//                           definition as the snapshot, reduced to the MEDIAN (via
//                           lib/screen/metrics throughCycleRoic). The latest-year figure
//                           is kept alongside. roic_reported (goodwill-inclusive base) too.
//   3. Flagged review group (rules 6 + 8): invested capital ≤ 0 OR operating ROIC > 200%
//                           (ROIC "n/m"), or market_cap_divergence > 0.2 — judged on the
//                           LATEST snapshot. Diverted out of the funnel — never
//                           gated/highlighted/dropped — returned separately with reasons.
//   4. ROIC gate          : 10-year MEDIAN operating ROIC ≥ 15%. Names with 0 computable
//                           years are "ROIC not computable"; names with 1..5 computable
//                           years are "short history" — NOT gated as a fail, shown in
//                           their own group when their LATEST-year ROIC ≥ 15% and drawdown
//                           ≥ 40% (never highlighted).
//   5. Drawdown gate       : read from screen_quotes (refreshed daily post-close by the
//                           GitHub Actions job) — LIVE price vs the quote's own 52-week
//                           high (FMP yearHigh), ≥ 40% below. This is deterministic and
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
  throughCycleRoic, MIN_HISTORY_YEARS,
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

    // 1b. Annual statement history for the through-cycle ROIC gate.
    const annual = await fetchAll(sb, 'fundamentals_annual',
      'symbol, fiscal_year, ebit, income_tax_expense, income_before_tax, total_current_assets, cash_and_equivalents, total_current_liabilities, short_term_debt, net_ppe');
    const annualBySym = new Map();
    for (const r of annual) {
      const a = annualBySym.get(r.symbol);
      if (a) a.push(r); else annualBySym.set(r.symbol, [r]);
    }

    // 2. Flagged review group (rules 6 + 8) — still judged on the LATEST snapshot
    //    (IC ≤ 0, ROIC n/m, market-cap divergence). Everything else is a candidate,
    //    carrying its through-cycle operating ROIC (10-yr median) + latest-year ROIC.
    const flaggedGroup = [];
    const candidates = [];
    for (const r of evaluable) {
      const { roic, roicNm, reasons, flagged } = classifyRow(r);
      if (flagged) {
        flaggedGroup.push({
          symbol: r.symbol, industry: r.industry, sector: r.sector,
          reasons,
          roic: roicNm ? null : roic,
          roicNm,
          roicReported: r.roic_reported,
          marketCapDivergence: r.market_cap_divergence,
        });
        continue;
      }
      const tc = throughCycleRoic(annualBySym.get(r.symbol));
      candidates.push({
        symbol: r.symbol, industry: r.industry, sector: r.sector,
        roic10yMedian: tc.median,   // the gated metric
        roicLatest: tc.latest,      // most-recent computable fiscal year
        historyYears: tc.years,
        roicReported: r.roic_reported,
        grossMarginStdev: r.gross_margin_stdev,
        netDebtEbitda: r.net_debt_ebitda, netCash: r.net_cash, ebitda: r.ebitda,
        // leverage-rank axis off the raw snake_case snapshot row.
        lev: leverageValue(r),
      });
    }

    // 3 + 4. Split candidates by history, then gate the through-cycle median.
    //   0 computable years        → ROIC not computable (excluded, counted)
    //   1 .. MIN_HISTORY_YEARS-1  → short history (NOT gated as a fail; its own group)
    //   ≥ MIN_HISTORY_YEARS       → gateable: pass on 10-yr median ≥ ROIC_MIN
    let roicNotComputable = 0;
    const gateable = [];
    const shortHistoryCand = [];
    for (const c of candidates) {
      if (c.historyYears === 0) { roicNotComputable++; continue; }
      if (c.historyYears < MIN_HISTORY_YEARS) { shortHistoryCand.push(c); continue; }
      gateable.push(c);
    }
    const passRoic = gateable.filter(c => passesRoic(c.roic10yMedian));

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

    // 5b. Founder-led badge. Merge the monthly-refreshed founder_flags with the
    // hand-curated founder_overrides — the OVERRIDE ALWAYS WINS (it can flip a name on
    // that the auto job's CEO-only Wikidata check can't see, e.g. an executive-chair
    // founder). Only founder_led rows become a badge, carrying { name, role } for the
    // tooltip. Best-effort: a missing table / failed read leaves founderBy empty, so the
    // screen simply shows no badges — it never 500s or blocks. (Same posture as
    // screen_quotes above.)
    const founderBy = new Map();
    try {
      const flags = await fetchAll(sb, 'founder_flags', 'symbol, founder_led, founder_name, role');
      for (const f of flags) {
        if (f.founder_led) founderBy.set(f.symbol, { name: f.founder_name ?? null, role: f.role ?? null });
      }
      const ovrs = await fetchAll(sb, 'founder_overrides', 'symbol, founder_led, founder_name, role');
      for (const o of ovrs) {
        // Override wins unconditionally: set the badge when led, clear it when not.
        if (o.founder_led) founderBy.set(o.symbol, { name: o.founder_name ?? null, role: o.role ?? null });
        else founderBy.delete(o.symbol);
      }
    } catch (e) {
      console.error('[screen] founder_flags/overrides unavailable — no badges:', e.message);
    }

    const enrichQuote = (r) => {
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
    };

    const withQuote = passRoic.map(enrichQuote);
    const passDrawdown = withQuote.filter(r => r.passDrawdown);
    const noQuote = withQuote.filter(r => r.noQuote);
    // Shown = confirmed drawdown-passers + no-quote names (surfaced, never dropped).
    // Names with a quote whose drawdown is < 40% are legitimately filtered out here.
    const shown = withQuote.filter(r => r.passDrawdown || r.noQuote);

    // Short-history group (< MIN_HISTORY_YEARS): surfaced ONLY when the LATEST-year
    // operating ROIC clears the floor AND drawdown ≥ DRAWDOWN_MIN. Never highlighted,
    // never in the main results — a distinct, counted group.
    const shortHistoryWithQuote = shortHistoryCand
      .filter(c => passesRoic(c.roicLatest))
      .map(enrichQuote)
      .filter(r => r.passDrawdown);

    // 6. Rejected-candidates filter (this user). Hidden unless the revisit rule is met.
    const rejected = await fetchAll(sb, 'rejected_candidates',
      'symbol, reason, revisit_if, revisit_metric, revisit_op, revisit_value',
      q => q.eq('user_id', userId));
    const rejBy = new Map(rejected.map(r => [r.symbol, r]));
    const notRejected = (r, roicVal) => {
      const rej = rejBy.get(r.symbol);
      if (!rej) return true;
      return revisitMet(rej, { drawdown_pct: r.drawdown, roic: roicVal, price: r.price, net_debt_ebitda: r.netDebtEbitda });
    };
    const afterRejected = shown.filter(r => notRejected(r, r.roic10yMedian));
    const shortHistoryAfterRejected = shortHistoryWithQuote.filter(r => notRejected(r, r.roicLatest));

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
        founder: founderBy.get(r.symbol) ?? null,   // { name, role } when founder-led, else null
        price: r.price, asOf: r.asOf ? new Date(r.asOf).toISOString() : null, stale: r.stale,
        noQuote: r.noQuote,
        drawdownPct: r.drawdown,          // fraction; null when no quote
        roic10yMedian: r.roic10yMedian,   // gated metric: median of per-year operating ROIC
        roicLatest: r.roicLatest,         // most-recent fiscal year, same operating definition
        historyYears: r.historyYears,
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

    // Short-history rows: latest-year ROIC ≥ floor AND drawdown ≥ floor, never ranked
    // or highlighted, labelled with their years of history.
    const shortHistoryRows = shortHistoryAfterRejected.map(r => ({
      symbol: r.symbol, industry: r.industry, sector: r.sector,
      founder: founderBy.get(r.symbol) ?? null,
      historyYears: r.historyYears,
      roicLatest: r.roicLatest,
      drawdownPct: r.drawdown,
      price: r.price, asOf: r.asOf ? new Date(r.asOf).toISOString() : null, stale: r.stale,
    })).sort((a, b) => (b.drawdownPct ?? -Infinity) - (a.drawdownPct ?? -Infinity));

    const dataAsOf = fin(dataAsOfMs) ? new Date(dataAsOfMs).toISOString() : null;
    const stale = !fin(dataAsOfMs) || tradingDaysOld(dataAsOfMs, now) > STALE_TRADING_DAYS;

    return Response.json({
      funnel: {
        evaluable: evaluable.length,
        roicNotComputable,
        shortHistory: shortHistoryCand.length,       // 1..MIN_HISTORY_YEARS-1 computable years
        shortHistoryShown: shortHistoryRows.length,  // surfaced (latest ROIC ≥ 15% & drawdown ≥ 40%)
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
      shortHistoryRows,
      flaggedGroup: flaggedGroup.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }, { headers: NO_STORE });
  } catch (err) {
    console.error('[screen] failed:', err);
    return Response.json({ error: 'Failed to run screen' }, { status: 500, headers: NO_STORE });
  }
}
