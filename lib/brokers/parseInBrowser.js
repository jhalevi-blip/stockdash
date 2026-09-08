// Client-side DEGIRO parse for the logged-out landing demo.
//
// The file is read and parsed entirely in the browser — the bytes never leave
// the device. The one network touch is ISIN → ticker resolution, which
// parseDeGiro delegates to resolveBatchIsins(); in the browser that proxies to
// the (unauthenticated) /api/brokers/resolve-isin route. So only ISIN codes are
// sent out, never the statement itself.
//
// This mirrors the parse half of /api/upload/route.ts (detectFile → parseDeGiro
// → aggregateFIFO) but skips every server-only concern: no Clerk auth, no
// Supabase, no cross-broker merge, no realized-P&L. DEGIRO only, holdings +
// trade legs, which is all the EUR ledger needs for a time-weighted return.
import * as XLSX from 'xlsx';
import { detectFile } from './detectFormat';
import { parseDeGiro } from './degiro';
import { aggregateFIFO } from './fifo';

// Landing demo shows at most this many positions (largest by cost basis). The
// cap keeps the per-visitor historical-prices fan-out small; anything above it
// is reported, never silently dropped.
export const MAX_POSITIONS = 18;

// Browser-only: probe /api/historical-prices for which tickers actually have
// price history. A resolved ticker with no coverage (e.g. Adyen's bare 'ADYEN')
// can't be charted, so it's excluded and counted as unmatched rather than
// plotted as a dead line. Uses a relative URL, so this runs in the browser only.
async function probeCoverage(tickers) {
  const covered = new Set();
  for (let i = 0; i < tickers.length; i += 20) {
    const batch = tickers.slice(i, i + 20);
    if (!batch.length) continue;
    try {
      const res = await fetch(`/api/historical-prices?tickers=${batch.join(',')}&years=1`);
      if (!res.ok) continue;
      const json = await res.json();
      for (const d of json?.data ?? []) if ((d.prices?.length ?? 0) > 0) covered.add(d.ticker);
    } catch { /* leave uncovered → excluded */ }
  }
  return covered;
}

/**
 * Parse a dropped File into the shape the landing result view needs.
 *
 * Returns a discriminated result keyed by `status`:
 *   'ok'                        → { holdings, tradeLegs, deposits, dividends,
 *                                   currentCashEur, matchedCount, totalCount,
 *                                   unresolvedCount, positionsTotal, cappedTo }
 *   'not_degiro'                → { detectedFormat }
 *   'degiro_transactions_export'→ {}                 (wrong DEGIRO export type)
 *   'zero_resolved'             → { totalCount }      (nothing matched a ticker)
 *   'no_positions'             → { matchedCount, totalCount } (parsed, nothing to show)
 *   'parse_error'               → { message }
 */
export async function parseFileInBrowser(file) {
  if (!file) return { status: 'parse_error', message: 'No file provided.' };

  const ext = file.name?.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
    return { status: 'not_degiro', detectedFormat: 'unknown' };
  }

  let wb;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  } catch {
    return { status: 'parse_error', message: 'The file could not be read. Make sure it is a valid CSV or XLSX export.' };
  }

  const { format } = detectFile(wb);
  if (format !== 'degiro') {
    return { status: 'not_degiro', detectedFormat: format };
  }

  // DEGIRO ships two exports that both detect as 'degiro'. Only the Account
  // Statement (sheet "Rekeningoverzicht") carries the full history we want; the
  // Transactions export (sheet "Transacties") is trades-only. Steer the visitor
  // to the right one rather than quietly parsing the thin file.
  const hasRekening    = wb.SheetNames.some((n) => n === 'Rekeningoverzicht');
  const hasTransacties = wb.SheetNames.some((n) => n.trim().toLowerCase() === 'transacties');
  if (!hasRekening) {
    return hasTransacties
      ? { status: 'degiro_transactions_export' }
      : { status: 'not_degiro', detectedFormat: 'degiro' };
  }

  let parsed;
  try {
    parsed = await parseDeGiro(wb);
  } catch {
    return { status: 'parse_error', message: 'The file looked like a DEGIRO statement but could not be parsed.' };
  }

  const trades = parsed.trades ?? [];
  const unresolvedCount = (parsed.unresolvedIsins ?? []).length;
  const matchedTickers = new Set(trades.map((t) => t.ticker));
  const matchedCount = matchedTickers.size;
  // One resolved ISIN ≈ one ticker; unresolved ISINs are the ones we couldn't map.
  const totalCount = matchedCount + unresolvedCount;

  if (trades.length === 0) {
    // Securities were present in the file but none mapped to a ticker.
    if (unresolvedCount > 0) return { status: 'zero_resolved', totalCount: unresolvedCount };
    // No trade rows at all (e.g. a statement with only cash movements).
    return { status: 'no_positions', matchedCount: 0, totalCount: 0 };
  }

  const { positions } = aggregateFIFO(trades, 'degiro');
  if (positions.length === 0) {
    // Trades matched, but everything nets to zero — no open positions to chart.
    return { status: 'no_positions', matchedCount, totalCount };
  }

  // Coverage gate — a resolved ticker with no FMP price history can't be charted,
  // so exclude it (counts as unmatched) rather than plotting a dead series. The
  // resolver already avoids US OTC proxies; this catches names with no priced
  // bare-ticker listing (e.g. Adyen → 'ADYEN', no FMP coverage).
  const openTickers = [...new Set(positions.map((p) => p.t))];
  const covered = await probeCoverage(openTickers);
  const coveredPositions = positions.filter((p) => covered.has(p.t));

  // Counts reflect what we can actually place AND price. total = every distinct
  // security we tried to show (open positions + unresolved ISINs); matched =
  // those we can chart; the gap = no-coverage tickers + unresolved ISINs.
  const finalMatched  = new Set(coveredPositions.map((p) => p.t)).size;
  const finalTotal    = openTickers.length + unresolvedCount;
  const finalExcluded = finalTotal - finalMatched;

  if (coveredPositions.length === 0) {
    // Everything resolved to a ticker we can't price → nothing chartable.
    return { status: 'zero_resolved', totalCount: finalTotal };
  }

  // Rank positions by EUR-equivalent cost basis so the cap keeps the largest.
  // aggregateFIFO returns avgCost in the position's native currency, so convert
  // with a per-ticker native→EUR factor derived from the trades themselves
  // (DEGIRO trades carry amountEur). This factor is for RANKING ONLY — the real
  // return is computed by the EUR ledger downstream, not from this.
  const eurFactor = {};
  for (const tr of trades) {
    if (eurFactor[tr.ticker] != null) continue;
    if (tr.currency === 'EUR') { eurFactor[tr.ticker] = 1; continue; }
    const native = Math.abs(tr.shares) * tr.price;
    if (tr.amountEur != null && native > 0) eurFactor[tr.ticker] = tr.amountEur / native;
  }
  const costBasisEur = (p) => p.s * p.c * (eurFactor[p.t] ?? 1);

  const ranked = [...coveredPositions].sort((a, b) => costBasisEur(b) - costBasisEur(a));
  const capped = ranked.length > MAX_POSITIONS;
  const holdings = capped ? ranked.slice(0, MAX_POSITIONS) : ranked;
  const keptTickers = new Set(holdings.map((h) => h.t));

  // Signed trade legs (+buy / −sell) for the kept tickers only, so the ledger's
  // historical-prices fan-out stays within the capped set. Sign comes from
  // action, matching /api/upload/route.ts's tradeLegs construction.
  const tradeLegs = trades
    .filter((t) => keptTickers.has(t.ticker))
    .map((t) => ({
      t: t.ticker,
      d: t.date,
      s: t.action === 'sell' ? -Math.abs(t.shares) : Math.abs(t.shares),
    }));

  return {
    status: 'ok',
    holdings,
    tradeLegs,
    deposits:  parsed.deposits  ?? [],
    dividends: parsed.dividends ?? [],
    currentCashEur: parsed.currentCashEur ?? null,
    matchedCount:   finalMatched,
    totalCount:     finalTotal,
    excludedCount:  finalExcluded,
    positionsTotal: ranked.length,
    cappedTo: capped ? MAX_POSITIONS : null,
  };
}
