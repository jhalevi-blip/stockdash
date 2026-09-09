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

// ── Identity check ────────────────────────────────────────────────────────────
// Coverage says "this ticker has prices"; it never says "this is the right
// company." A short European home ticker can collide with an unrelated US
// listing that DOES have prices (Belgium's 'ABI' is a US ETF in FMP, not AB
// InBev), and FMP coverage shifts over time — so today's empty ticker is
// tomorrow's silent collision. We compare OpenFIGI's company name against FMP's.

const CORP_SUFFIXES = /\b(n\s*v|nv|s\s*a|sa|ag|plc|se|asa|a\s*s|oyj|spa|s\s*p\s*a|inc|incorporated|corp|corporation|co|company|ltd|limited|holding|holdings|group|the)\b/g;

function normName(s) {
  return String(s || '')
    .toLowerCase()
    // Collapse dotted acronyms BEFORE punctuation is stripped, so a legal suffix
    // written 'p.l.c.' / 'N.V.' / 'S.p.A.' becomes one token (plc / nv / spa) and
    // then strips like its undotted form — otherwise it survives as 'p l c' and
    // breaks the match (FMP writes 'BP p.l.c.', OpenFIGI writes 'BP PLC').
    .replace(/[a-z](?:\.[a-z])+\.?/g, (m) => m.replace(/\./g, ''))
    .replace(/[.,/&'"()-]/g, ' ')   // remaining punctuation → space
    .replace(CORP_SUFFIXES, ' ')     // drop corporate suffixes / filler
    .replace(/\s+/g, ' ')
    .trim();
}

// Loose match: after normalising, exact at any length, or a clear substring
// either direction — but only when the shorter name is ≥4 chars, since the
// suffix stripping can reduce a name to 2–3 letters that collide with unrelated
// companies. Exact equality stays allowed at any length.
function nameMatch(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 4) return false;
  return x.includes(y) || y.includes(x);
}

// FMP profile name per ticker (the route fans out because FMP's profile endpoint
// takes a single symbol). Chunked, since identity now runs on every traded ticker.
async function fetchProfiles(tickers) {
  const out = {};
  for (let i = 0; i < tickers.length; i += 20) {
    const batch = tickers.slice(i, i + 20);
    if (!batch.length) continue;
    try {
      const res = await fetch(`/api/company-profile?tickers=${batch.join(',')}`);
      if (!res.ok) continue;
      const json = await res.json();
      Object.assign(out, json?.profiles ?? {});
    } catch { /* skip batch */ }
  }
  return out;
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

  const agg = aggregateFIFO(trades, 'degiro');
  const positions = agg.positions;

  // Partial-export guard — a sell with no matching buy means the file is a windowed
  // export missing the earlier purchase (what you get exporting one year instead of
  // full history). aggregateFIFO already flags these; a return computed from them is
  // survivorship-skewed or outright negative garbage, so bail with a dedicated card
  // rather than show a wrong number.
  const orphanSells = [...new Set(agg.sellsWithoutBuysTickers)];
  if (orphanSells.length > 0) {
    return { status: 'partial_export', tickers: orphanSells };
  }

  if (positions.length === 0) {
    // Trades matched, but everything nets to zero — no open positions to chart.
    return { status: 'no_positions', matchedCount, totalCount };
  }

  // Per-ticker native→EUR factor for ranking (DEGIRO trades carry amountEur).
  const eurFactor = {};
  for (const tr of trades) {
    if (eurFactor[tr.ticker] != null) continue;
    if (tr.currency === 'EUR') { eurFactor[tr.ticker] = 1; continue; }
    const native = Math.abs(tr.shares) * tr.price;
    if (tr.amountEur != null && native > 0) eurFactor[tr.ticker] = tr.amountEur / native;
  }
  const costBasisEur = (p) => p.s * p.c * (eurFactor[p.t] ?? 1);

  // Every ticker traded in the window — open AND closed. The RETURN must count
  // closed positions too (a name bought and sold inside the window contributes to
  // the TWR); only the position LIST stays open-only. Coverage + identity run on
  // all of them, because closed tickers feed the ledger and must be priceable and
  // correctly identified or they'd break windowIntegrity.
  const allTraded = [...new Set(trades.map((t) => t.ticker))];
  const covered = await probeCoverage(allTraded);
  const figiNameByTicker = parsed.namesByTicker ?? {};   // carried through parseDeGiro
  const profiles = await fetchProfiles(allTraded.filter((t) => covered.has(t)));
  const accepted = new Set();
  for (const t of allTraded) {
    if (!covered.has(t)) continue;
    const figiName = figiNameByTicker[t], fmpName = profiles[t]?.name;
    if (figiName && fmpName && nameMatch(figiName, fmpName)) accepted.add(t);
    else console.error(`[parseInBrowser] identity mismatch for ${t}: OpenFIGI="${figiName ?? ''}" vs FMP="${fmpName ?? ''}" — excluding`);
  }

  // Open positions (accepted) drive the list + the matched/total counts.
  const openTickers = [...new Set(positions.map((p) => p.t))];
  const openTickerSet = new Set(openTickers);
  const acceptedOpen = positions.filter((p) => accepted.has(p.t));
  const finalMatched  = new Set(acceptedOpen.map((p) => p.t)).size;
  const finalTotal    = openTickers.length + unresolvedCount;
  const finalExcluded = finalTotal - finalMatched;

  if (acceptedOpen.length === 0) {
    return { status: 'zero_resolved', totalCount: finalTotal };
  }

  // Ledger ticker budget: /api/historical-prices caps at 20, and SPY + EURUSD take
  // two, leaving 18. Fill with open positions by cost basis first, then closed ones
  // by gross amount invested. Anything past 18 is dropped and reported on screen.
  const rankedOpen = [...acceptedOpen].sort((a, b) => costBasisEur(b) - costBasisEur(a));
  const grossEur = {};
  for (const tr of trades) {
    if (tr.action !== 'buy') continue;
    const eur = tr.amountEur ?? Math.abs(tr.shares) * tr.price * (eurFactor[tr.ticker] ?? 1);
    grossEur[tr.ticker] = (grossEur[tr.ticker] ?? 0) + eur;
  }
  const closedTickers = allTraded
    .filter((t) => accepted.has(t) && !openTickerSet.has(t))
    .sort((a, b) => (grossEur[b] ?? 0) - (grossEur[a] ?? 0));

  const orderedTickers = [...rankedOpen.map((p) => p.t), ...closedTickers];
  const LEDGER_BUDGET = 18;
  const legTickers = new Set(orderedTickers.slice(0, LEDGER_BUDGET));
  const droppedTickers = orderedTickers.slice(LEDGER_BUDGET);

  // Position list = open accepted positions that fit the budget (open ranked first).
  const holdings = rankedOpen.filter((p) => legTickers.has(p.t));
  const closedIncluded = closedTickers.filter((t) => legTickers.has(t)).length;

  // Signed legs (+buy / −sell) for EVERY budgeted ticker — open and closed — so the
  // ledger counts round-trips, not just survivors.
  const tradeLegs = trades
    .filter((t) => legTickers.has(t.ticker))
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
    positionsTotal: rankedOpen.length,
    cappedTo: holdings.length < rankedOpen.length ? holdings.length : null,
    closedIncluded,
    droppedTickers,
  };
}
