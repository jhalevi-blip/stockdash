// GET /api/watchlist/financials?symbol=X — financials history for one symbol, for
// the watchlist detail panel's stacked Revenue / Margins / Leverage charts (and,
// later, the research page). Reads ONLY our own fundamentals_annual +
// fundamentals_quarterly tables — no FMP call. The three period series (annual /
// quarterly / ttm) are all computed here and returned together, so the client
// switches period + range without a refetch (payload is tiny: <=10 annual + <=40
// quarterly rows).
//
// Auth-gated, and the symbol MUST belong to the caller's own watchlist (ownership
// verified against watchlist_items with user_id in the query filter — never RLS; the
// service role bypasses it). Mirrors /api/watchlist/fundamentals; loosen it when the
// research page actually needs cross-watchlist access.

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildFinancialsSeries } from '@/lib/financials/series';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const FLOW_BS = 'report_date, revenue, gross_profit, operating_income, net_income, ebitda, total_debt, operating_lease_liability, cash_and_equivalents';
const ANNUAL_COLS = `${FLOW_BS}, fiscal_year`;
const QUARTERLY_COLS = `${FLOW_BS}, fiscal_year, fiscal_quarter, calendar_year, calendar_quarter`;

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

  // Ownership: the symbol must be one of THIS user's watchlist rows (user_id is in the
  // filter, not RLS). Match provider or display symbol; prefer a resolved match.
  const { data: rows, error: ownErr } = await sb
    .from('watchlist_items')
    .select('provider_symbol, display_symbol, resolved')
    .eq('user_id', userId)
    .or(`provider_symbol.eq.${symbolParam},display_symbol.eq.${symbolParam}`)
    .order('resolved', { ascending: false })
    .limit(1);

  if (ownErr) {
    console.error(`[watchlist/financials] ownership query failed for ${symbolParam}: ${ownErr.message}`);
    return Response.json({ error: 'Failed to verify watchlist ownership' }, { status: 500, headers: NO_STORE });
  }

  const row = rows?.[0];
  if (!row) {
    // Not in the caller's watchlist — 404, never reveal whether it exists elsewhere.
    return Response.json({ error: 'Symbol not in your watchlist' }, { status: 404, headers: NO_STORE });
  }

  // Unresolved row (e.g. 6479): a clean empty-series shape, not an error.
  if (!row.resolved || !row.provider_symbol) {
    return Response.json(
      { symbol: row.display_symbol || symbolParam, resolved: false, periods: { annual: [], quarterly: [], ttm: [] } },
      { headers: NO_STORE },
    );
  }

  const provider = row.provider_symbol.toUpperCase();

  try {
    // <=10 annual + <=40 quarterly rows per symbol — well under the 1000-row cap.
    const [{ data: annualRows, error: aErr }, { data: quarterlyRows, error: qErr }] = await Promise.all([
      sb.from('fundamentals_annual').select(ANNUAL_COLS).eq('symbol', provider).order('fiscal_year', { ascending: true }),
      sb.from('fundamentals_quarterly').select(QUARTERLY_COLS).eq('symbol', provider).order('report_date', { ascending: true }),
    ]);

    if (aErr || qErr) {
      console.error(`[watchlist/financials] read failed for ${provider}: ${aErr?.message || qErr?.message}`);
      return Response.json({ error: 'Failed to load financials' }, { status: 500, headers: NO_STORE });
    }

    const periods = buildFinancialsSeries(annualRows || [], quarterlyRows || []);
    return Response.json(
      { symbol: provider, displaySymbol: row.display_symbol, resolved: true, periods },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error(`[watchlist/financials] unexpected failure for ${provider}:`, err);
    return Response.json({ error: 'Failed to load financials' }, { status: 500, headers: NO_STORE });
  }
}
