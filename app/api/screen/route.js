// GET /api/screen — the quality-compounder-at-drawdown screen. The first page that
// reads fundamentals_snapshot for its intended purpose.
//
// Pipeline (all in-route; the evaluable set is ~1,776 rows — trivial in memory, and
// the industry->sector fallback below is awkward as a SQL window function against a
// hand-migrated DB):
//   1. Evaluable universe  : symbol_universe rows with exclusion_reason IS NULL,
//                            intersected with fundamentals_snapshot on symbol.
//   2. Exclusions          : drop roic_thin_base = true and market_cap_divergence > 0.2
//                            (a null divergence is NOT > 0.2, so it's kept).
//   3. ROIC gate           : roic (ex-goodwill) >= 0.13.
//   4. Stability quintile  : percentile-rank gross_margin_stdev ASCENDING (lowest =
//                            best) within industry; where an industry has < 15 members
//                            in the filtered set, rank within sector instead and record
//                            which basis was used. Keep the top quintile (rank <= 0.20).
//
// Drawdown is deliberately NOT applied here: the quintile is drawdown-independent, so
// the page filters drawdown client-side over the returned rows (loosening the threshold
// never needs names outside this set). The funnel counts through step 4 are returned so
// an empty table reconciles: evaluable -> afterExclusions -> passRoic -> topQuintile,
// with the final "N at X% drawdown" computed on the client.
//
// Auth-gated (auth() in-handler, per the app convention); reads shared reference data,
// no per-user rows. NOTE: drawdown_pct / roic / gross_margin / goodwill_share are all
// FRACTIONS in the DB (drawdown_pct 0.35 == 35% down).

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const ROIC_MIN = 0.13;
const DIVERGENCE_MAX = 0.2;
const QUINTILE = 0.2;
const INDUSTRY_MIN = 15;   // below this, rank within sector instead of industry

const SNAP_COLS = 'symbol, sector, industry, price, drawdown_pct, roic, roic_reported, goodwill_share, gross_margin, gross_margin_stdev, roic_thin_base, market_cap_divergence';

const finite = v => typeof v === 'number' && Number.isFinite(v);

// Page through PostgREST's 1000-row cap (the snapshot is ~1,776 rows).
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

// Percentile rank of v within a cohort sorted ascending: (#strictly-less)/(n-1), so the
// lowest stdev in the cohort is 0 (best) and the highest is 1. Ties share the lower rank.
function pctRank(sorted, v) {
  const n = sorted.length;
  if (n <= 1) return 0;
  let less = 0;
  while (less < n && sorted[less] < v) less++;
  return less / (n - 1);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  try {
    // 1. Evaluable universe ∩ snapshot.
    const universe = await fetchAll(sb, 'symbol_universe', 'symbol', q => q.is('exclusion_reason', null));
    const evaluableSet = new Set(universe.map(r => r.symbol));
    const snap = await fetchAll(sb, 'fundamentals_snapshot', SNAP_COLS);
    const evaluable = snap.filter(r => evaluableSet.has(r.symbol));

    // 2. Thin-base + divergence exclusions (null divergence is not > 0.2, so kept).
    const afterExclusions = evaluable.filter(r =>
      r.roic_thin_base !== true &&
      (!finite(r.market_cap_divergence) || r.market_cap_divergence <= DIVERGENCE_MAX),
    );

    // 3. ROIC gate (ex-goodwill figure).
    const passRoic = afterExclusions.filter(r => finite(r.roic) && r.roic >= ROIC_MIN);

    // 4. Stability quintile. Names without a stdev can't be ranked → they can't be
    // top-quintile, so they simply don't survive (part of passRoic, not topQuintile).
    const rankable = passRoic.filter(r => finite(r.gross_margin_stdev));

    const industrySize = new Map();
    for (const r of rankable) industrySize.set(r.industry, (industrySize.get(r.industry) || 0) + 1);

    // Sorted-stdev cohorts by industry and by sector (a fallback name ranks against its
    // whole sector, not just other fallbacks).
    const byIndustry = new Map(), bySector = new Map();
    const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
    for (const r of rankable) { push(byIndustry, r.industry, r.gross_margin_stdev); push(bySector, r.sector, r.gross_margin_stdev); }
    for (const a of byIndustry.values()) a.sort((x, y) => x - y);
    for (const a of bySector.values()) a.sort((x, y) => x - y);

    const ranked = rankable.map(r => {
      const useIndustry = (industrySize.get(r.industry) || 0) >= INDUSTRY_MIN;
      const cohort = useIndustry ? byIndustry.get(r.industry) : bySector.get(r.sector);
      return { r, rankPct: pctRank(cohort, r.gross_margin_stdev), rankBasis: useIndustry ? 'industry' : 'sector' };
    });

    const topQuintile = ranked.filter(x => x.rankPct <= QUINTILE);

    // Default order: most drawn-down first (the client re-sorts on header click).
    const rows = topQuintile
      .map(({ r, rankPct, rankBasis }) => ({
        symbol: r.symbol,
        name: null,               // no company-name column on these tables
        sector: r.sector,
        industry: r.industry,
        price: r.price,
        drawdownPct: r.drawdown_pct,          // fraction (0.35 == 35% down)
        roic: r.roic,
        roicReported: r.roic_reported,
        goodwillShare: r.goodwill_share,
        grossMargin: r.gross_margin,
        grossMarginStdev: r.gross_margin_stdev,
        rankPct,
        rankBasis,
      }))
      .sort((a, b) => (b.drawdownPct ?? -Infinity) - (a.drawdownPct ?? -Infinity));

    return Response.json({
      funnel: {
        evaluable: evaluable.length,
        afterExclusions: afterExclusions.length,
        passRoic: passRoic.length,
        topQuintile: topQuintile.length,
      },
      rows,
    }, { headers: NO_STORE });
  } catch (err) {
    console.error('[screen] failed:', err);
    return Response.json({ error: 'Failed to run screen' }, { status: 500, headers: NO_STORE });
  }
}
