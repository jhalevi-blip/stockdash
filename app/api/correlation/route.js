import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { computeHoldingsFingerprint } from '@/lib/holdingsFingerprint';
import { getMostRecentCorrelation, saveCorrelation, isStale } from '@/lib/correlationStore';
import { calculateCorrelationMatrix } from '@/lib/correlation';

export const dynamic = 'force-dynamic';

const NO_CACHE = { headers: { 'Cache-Control': 'private, no-store, max-age=0' } };

export async function GET(request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401, ...NO_CACHE });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return Response.json({ error: 'Database not configured' }, { status: 500, ...NO_CACHE });
  }

  // ── Load portfolio ────────────────────────────────────────────────────────
  const { data: portfolioData, error: portfolioError } = await sb
    .from('portfolios')
    .select('holdings')
    .eq('user_id', userId)
    .single();

  if (portfolioError && portfolioError.code !== 'PGRST116') {
    return Response.json({ error: portfolioError.message }, { status: 500, ...NO_CACHE });
  }

  const allHoldings = Array.isArray(portfolioData?.holdings) ? portfolioData.holdings : [];
  const holdings    = allHoldings.filter(h => h?.t && h.t !== '__CASH__');

  if (holdings.length < 2) {
    return Response.json({ error: 'Need at least 2 holdings for correlation' }, { status: 400, ...NO_CACHE });
  }

  // ── Fingerprint + cache check ─────────────────────────────────────────────
  const fingerprint = computeHoldingsFingerprint(holdings);

  let cached = null;
  try {
    cached = await getMostRecentCorrelation(userId);
  } catch (err) {
    console.error('[correlation] getMostRecentCorrelation failed:', err);
    // Continue — treat as stale
  }

  if (!isStale(cached, fingerprint)) {
    return Response.json({ cached: true, ...cached }, NO_CACHE);
  }

  // ── Stale: fetch prices and recompute ─────────────────────────────────────
  const tickers = holdings.map(h => h.t);
  const origin  = request.nextUrl.origin;

  let historicalData;
  try {
    const priceRes = await fetch(
      `${origin}/api/historical-prices?tickers=${tickers.join(',')}`,
      // Skip Next.js fetch cache here — we want a fresh upstream check when recomputing
      { cache: 'no-store' }
    );
    if (!priceRes.ok) {
      const text = await priceRes.text();
      throw new Error(`historical-prices ${priceRes.status}: ${text.slice(0, 200)}`);
    }
    historicalData = await priceRes.json();
  } catch (err) {
    console.error('[correlation] historical-prices fetch failed:', err);
    return Response.json({ error: 'Failed to fetch historical price data' }, { status: 500, ...NO_CACHE });
  }

  const priceData    = historicalData.data ?? [];
  const failedTickers = historicalData.failedTickers ?? [];

  if (priceData.length < 2) {
    return Response.json(
      { error: 'Insufficient price data for correlation', failedTickers },
      { status: 500, ...NO_CACHE }
    );
  }

  const matrixResult = calculateCorrelationMatrix(priceData);
  if (!matrixResult) {
    return Response.json(
      { error: 'Insufficient aligned trading days for stable correlation (<30)' },
      { status: 500, ...NO_CACHE }
    );
  }

  const correlationData = {
    holdings_fingerprint: fingerprint,
    tickers:              matrixResult.tickers,
    matrix:               matrixResult.matrix,
    aligned_date_start:   matrixResult.alignedDateRange.start,
    aligned_date_end:     matrixResult.alignedDateRange.end,
    trading_days_used:    matrixResult.alignedDateRange.count,
    failed_tickers:       failedTickers,
  };

  // ── Persist ───────────────────────────────────────────────────────────────
  let newRow;
  try {
    newRow = await saveCorrelation(userId, correlationData);
  } catch (err) {
    console.error('[correlation] saveCorrelation failed:', err);
    // Return the result anyway — don't fail the user because of a save failure
    return Response.json({ cached: false, ...correlationData }, NO_CACHE);
  }

  return Response.json({ cached: false, ...newRow }, NO_CACHE);
}
