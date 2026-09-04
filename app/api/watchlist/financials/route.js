// GET /api/watchlist/financials?symbol=X — financials history for one symbol, for
// the watchlist detail panel's stacked Revenue / Margins / Leverage charts (and,
// later, the research page). Reads ONLY our own fundamentals_annual +
// fundamentals_quarterly tables — no FMP call. The three period series (annual /
// quarterly / ttm) are all computed here and returned together, so the client switches
// period + range without a refetch. Optional &peers=A,B,C returns each peer's series
// too — trimmed to the median/CAGR fields (base stays full) so the client can draw the
// peer-median lines and the stats strip. hasData reflects fundamentals_quarterly rows.
//
// Auth-gated only — NOT watchlist-gated. These are shared fundamentals tables and the
// screen loads symbols outside the caller's watchlist. A watchlist row, when present, is
// used to map display→provider symbol and to honor the unresolved case; otherwise the
// symbol is treated as an already-resolved provider ticker.

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildFinancialsSeries } from '@/lib/financials/series';
import { pickPeerPeriods } from '@/lib/financials/stats';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const SYM = /^[A-Z0-9.\-]{1,20}$/;
const MAX_PEERS = 8;
const FLOW_BS = 'report_date, revenue, gross_profit, operating_income, net_income, ebitda, total_debt, operating_lease_liability, cash_and_equivalents';
const ANNUAL_COLS = `${FLOW_BS}, fiscal_year`;
const QUARTERLY_COLS = `${FLOW_BS}, fiscal_year, fiscal_quarter, calendar_year, calendar_quarter`;

// Read one symbol's annual + quarterly fundamentals and build its period series.
// Throws on a DB error so callers can decide (base -> 500, peer -> treated as no data).
async function readSeries(sb, sym) {
  const [{ data: annualRows, error: aErr }, { data: quarterlyRows, error: qErr }] = await Promise.all([
    sb.from('fundamentals_annual').select(ANNUAL_COLS).eq('symbol', sym).order('fiscal_year', { ascending: true }),
    sb.from('fundamentals_quarterly').select(QUARTERLY_COLS).eq('symbol', sym).order('report_date', { ascending: true }),
  ]);
  if (aErr || qErr) throw new Error(aErr?.message || qErr?.message);
  return { periods: buildFinancialsSeries(annualRows || [], quarterlyRows || []), quarterlyCount: (quarterlyRows || []).length };
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });

  const symbolParam = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbolParam) return Response.json({ error: 'Missing symbol' }, { status: 400, headers: NO_STORE });
  // Strict enough to keep the PostgREST .or() filter below injection-safe while
  // allowing real symbols (BRK.B, digit tickers like 6479).
  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbolParam)) {
    return Response.json({ error: 'Invalid symbol' }, { status: 400, headers: NO_STORE });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  // Resolve the provider symbol. Auth-only (no watchlist-membership gate): this reads
  // shared fundamentals tables, and the screen loads symbols outside the watchlist. If
  // the symbol IS one of the caller's watchlist rows we use its provider/display mapping
  // (and honor the unresolved case); otherwise the symbol is already a resolved provider
  // ticker (screen names come from fundamentals_snapshot).
  const { data: rows, error: ownErr } = await sb
    .from('watchlist_items')
    .select('provider_symbol, display_symbol, resolved')
    .eq('user_id', userId)
    .or(`provider_symbol.eq.${symbolParam},display_symbol.eq.${symbolParam}`)
    .order('resolved', { ascending: false })
    .limit(1);

  if (ownErr) {
    console.error(`[watchlist/financials] symbol lookup failed for ${symbolParam}: ${ownErr.message}`);
    return Response.json({ error: 'Failed to resolve symbol' }, { status: 500, headers: NO_STORE });
  }

  const row = rows?.[0];
  // Unresolved watchlist row (e.g. 6479): a clean empty-series shape, not an error.
  if (row && (!row.resolved || !row.provider_symbol)) {
    return Response.json(
      { symbol: row.display_symbol || symbolParam, resolved: false, periods: { annual: [], quarterly: [], ttm: [] } },
      { headers: NO_STORE },
    );
  }

  const provider = (row?.provider_symbol || symbolParam).toUpperCase();

  // Optional peer list: base + up to MAX_PEERS distinct, valid tickers (base excluded).
  const peerSyms = [];
  {
    const seen = new Set([provider]);
    for (const t of (new URL(request.url).searchParams.get('peers') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) {
      if (SYM.test(t) && !seen.has(t)) { seen.add(t); peerSyms.push(t); }
      if (peerSyms.length >= MAX_PEERS) break;
    }
  }

  try {
    // Base + peers read in parallel. A peer read failure degrades to no-data (never
    // fails the request); the base read failure throws to the 500 below.
    const [base, ...peerResults] = await Promise.all([
      readSeries(sb, provider),
      ...peerSyms.map(async s => {
        try { return { ticker: s, ...(await readSeries(sb, s)) }; }
        catch { return { ticker: s, periods: null, quarterlyCount: 0 }; }
      }),
    ]);

    // Peer series trimmed to the median/CAGR fields; hasData = has quarterly rows.
    const peers = peerResults.map(p => ({
      ticker: p.ticker,
      hasData: p.quarterlyCount > 0,
      periods: p.periods ? pickPeerPeriods(p.periods) : { annual: [], quarterly: [], ttm: [] },
    }));

    return Response.json(
      { symbol: provider, displaySymbol: row?.display_symbol ?? null, resolved: true, periods: base.periods, peers },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error(`[watchlist/financials] unexpected failure for ${provider}:`, err);
    return Response.json({ error: 'Failed to load financials' }, { status: 500, headers: NO_STORE });
  }
}
