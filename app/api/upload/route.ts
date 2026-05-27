import * as XLSX from 'xlsx';
import { auth } from '@clerk/nextjs/server';
import { detectFile } from '@/lib/brokers/detectFormat';
import { parseSaxo } from '@/lib/brokers/saxo';
import { parseDeGiro } from '@/lib/brokers/degiro';
import { parseTrading212 } from '@/lib/brokers/trading212';
import { parseIBKR } from '@/lib/brokers/ibkr';
import { parseRabobank } from '@/lib/brokers/rabobank';
import { parseSchwab } from '@/lib/brokers/schwab';
import { aggregateFIFO } from '@/lib/brokers/fifo';
import { calcFIFO } from '@/lib/brokers/realizedFifo';
import type { BrokerTrade, BrokerFormat, NormalizedPosition, SkipSummary } from '@/lib/brokers/types';

export const runtime = 'nodejs';

// ── Generic holdings column detection ────────────────────────────────────────
// Mirrors UploadPanel.autoDetect exactly: same patterns, same normalisation.
function normCol(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function findCol(headers: string[], patterns: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = normCol(headers[i]);
    if (patterns.some((p) => h.includes(p))) return i;
  }
  return -1;
}

/**
 * Parse a generic holdings snapshot WorkBook → NormalizedPosition[].
 * Column matching and row validation mirror UploadPanel's import handler.
 */
function parseGenericHoldings(wb: XLSX.WorkBook): {
  holdings: NormalizedPosition[];
  skipped: SkipSummary;
} {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  // Find first non-empty row as header row (same logic as UploadPanel)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    if ((raw[i] as unknown[]).some((c) => String(c).trim() !== '')) { headerIdx = i; break; }
  }
  const headers  = (raw[headerIdx] as unknown[]).map((h) => String(h ?? '').trim());
  const dataRows = raw
    .slice(headerIdx + 1)
    .filter((r) => (r as unknown[]).some((c) => String(c).trim() !== '')) as unknown[][];

  const tickerCol = findCol(headers, ['ticker', 'symbol', 'instrument', 'isin', 'security', 'naam']);
  const sharesCol = findCol(headers, ['shares', 'quantity', 'qty', 'aantal', 'positie', 'units']);
  const costCol   = findCol(headers, ['avgcost', 'costbasis', 'price', 'koers', 'gemkoers', 'avgprice', 'unitprice']);
  const dateCol   = findCol(headers, ['datebought', 'purchasedate', 'transactiedatum', 'datum', 'date', 'tradedate']);

  // Required columns missing — distinct failure mode from row-level skips
  if (tickerCol < 0 || sharesCol < 0 || costCol < 0) {
    return { holdings: [], skipped: { columnMappingFailed: true } };
  }

  const skipped: SkipSummary = { missingTicker: 0, tickerTooLong: 0, invalidShares: 0, invalidCost: 0 };
  const holdings: NormalizedPosition[] = [];

  for (const row of dataRows) {
    const r    = row as unknown[];
    const t    = String(r[tickerCol] ?? '').trim().toUpperCase();
    const sNum = parseFloat(String(r[sharesCol] ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
    const cNum = parseFloat(String(r[costCol]   ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'));
    let d = '';
    if (dateCol >= 0 && r[dateCol]) {
      const pd = new Date(String(r[dateCol]));
      if (!isNaN(pd.getTime())) d = pd.toISOString().slice(0, 10);
    }

    if (!t)                       { skipped.missingTicker!++; continue; }
    if (t.length > 10)            { skipped.tickerTooLong!++;  continue; }
    if (isNaN(sNum) || sNum <= 0) { skipped.invalidShares!++;  continue; }
    if (isNaN(cNum) || cNum < 0)  { skipped.invalidCost!++;    continue; }
    holdings.push({ t, s: sNum, c: cNum, d, currency: 'USD', broker: 'generic' });
  }

  return { holdings, skipped };
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface FileStat {
  name:             string;
  txCount:          number;
  format:           string;
  intent:           string;
  intentConfidence: string;
  // Stable shape for every entry regardless of intent.
  // Holdings files always have netZero: 0, sellsWithoutBuys: 0, sellsWithoutBuysTickers: [].
  skipped:          SkipSummary;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData     = await request.formData();
    const files        = formData.getAll('file') as File[];
    const reqStartDate = (formData.get('startDate') as string | null) ?? null;

    if (!files.length) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }

    const allTrades:          BrokerTrade[]       = [];
    // Holdings snapshots (generic intent files) are pushed during the loop.
    // Broker open positions are derived after the loop via a single cross-broker
    // aggregateFIFO — see comment below.
    const allHoldings:        NormalizedPosition[] = [];
    const allUnresolvedIsins: string[]             = [];
    const fileStats:          FileStat[]           = [];

    for (const file of files) {
      const ext = file.name?.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext ?? '')) {
        return Response.json(
          { error: `Unsupported file type "${file.name}". Use CSV or XLSX.` },
          { status: 400 }
        );
      }

      // TODO Stage 2: collect per-file errors into an array and return all
      // failures at once instead of returning at the first file that fails.

      const rawBytes = new Uint8Array(await file.arrayBuffer());
      // Read once for format detection. Rabobank and Schwab parsers re-read
      // rawBytes internally with cellDates:false / raw:true — pass rawBytes to
      // those parsers, not this WorkBook.
      const wb = XLSX.read(rawBytes, { type: 'array', cellDates: true });
      const { format, intent, intentConfidence } = detectFile(wb);

      if (format !== 'generic') {
        // ── Named broker → always transactions/certain ────────────────────
        let trades:  BrokerTrade[] = [];
        let skipped: SkipSummary   = {};

        try {
          switch (format as BrokerFormat) {
            case 'saxo': {
              const r = parseSaxo(wb);
              trades = r.trades; skipped = r.skipSummary;
              break;
            }
            case 'degiro': {
              const r = await parseDeGiro(wb);
              trades = r.trades; skipped = r.skipSummary;
              allUnresolvedIsins.push(...r.unresolvedIsins);
              break;
            }
            case 'trading212': {
              const r = parseTrading212(wb);
              trades = r.trades; skipped = r.skipSummary;
              break;
            }
            case 'ibkr': {
              const r = await parseIBKR(wb);
              trades = r.trades; skipped = r.skipSummary;
              allUnresolvedIsins.push(...r.unresolvedIsins);
              break;
            }
            case 'rabobank': {
              // Needs rawBytes — parser uses cellDates:false to preserve Dutch date strings
              const r = await parseRabobank(rawBytes);
              trades = r.trades; skipped = r.skipSummary;
              allUnresolvedIsins.push(...r.unresolvedIsins);
              break;
            }
            case 'schwab': {
              // Needs rawBytes — parser uses raw:true to preserve MM/DD/YYYY strings
              const r = parseSchwab(rawBytes);
              trades = r.trades; skipped = r.skipSummary;
              break;
            }
            default: {
              return Response.json(
                { error: `No parser available for detected format "${format}".` },
                { status: 400 }
              );
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Parse error';
          return Response.json({ error: `${file.name}: ${msg}` }, { status: 400 });
        }

        // Per-file aggregateFIFO for skip diagnostics only (netZero, sellsWithoutBuys).
        // Do NOT push positions to allHoldings here — the cross-broker pass after the
        // loop merges all trades together so a ticker held across multiple brokers
        // (e.g. Saxo + DeGiro both holding AMD) produces one position, not two.
        const { netZeroTickers, sellsWithoutBuysTickers } =
          aggregateFIFO(trades, format as BrokerFormat);
        allTrades.push(...trades);

        fileStats.push({
          name:             file.name,
          txCount:          trades.length,
          format,
          intent:           'transactions',
          intentConfidence: 'certain',
          skipped: {
            ...skipped,
            netZero:                netZeroTickers.length,
            sellsWithoutBuys:       sellsWithoutBuysTickers.length,
            sellsWithoutBuysTickers,
          },
        });

      } else if (intent === 'holdings') {
        // ── Generic holdings snapshot → parse columns directly ────────────
        const { holdings, skipped } = parseGenericHoldings(wb);
        allHoldings.push(...holdings);
        fileStats.push({
          name: file.name,
          txCount: 0,
          format: 'generic',
          intent: 'holdings',
          intentConfidence,
          // Stable skipped shape: holdings files have no aggregateFIFO diagnostics
          skipped: { ...skipped, netZero: 0, sellsWithoutBuys: 0, sellsWithoutBuysTickers: [] },
        });

      } else {
        // ── Generic transaction file — no inline parser in this route ─────
        // TODO Stage 2: port generic transaction parser from /api/transactions/route.js
        // into lib/brokers/generic.ts so this becomes a real parser path instead of a 400.
        return Response.json(
          {
            error:
              `"${file.name}" appears to be a transaction history, but it doesn't match a ` +
              `supported broker format (Saxo, DeGiro, Trading 212, IBKR, Rabobank, Schwab). ` +
              `Either export the file from one of those brokers, or upload a holdings snapshot ` +
              `with columns: ticker, shares, cost.`,
          },
          { status: 400 }
        );
      }
    }

    // ── Cross-broker open position merge ──────────────────────────────────
    // Single aggregateFIFO pass across all merged trades so positions in the same
    // ticker across different brokers are correctly netted into one entry.
    // broker: 'generic' is used as the merged-output sentinel — BrokerFormat has no
    // 'multi' value, and the alternative (per-position broker provenance) would require
    // extending NormalizedPosition. 'generic' is the correct read: the combined result
    // does not belong to any single broker.
    if (allTrades.length > 0) {
      const { positions: openPositions } = aggregateFIFO(allTrades, 'generic');
      allHoldings.push(...openPositions);
    }

    // ── Realized P&L (across all transaction files) ───────────────────────
    const allPositions     = calcFIFO(allTrades);
    const positions        = allPositions.filter((p) => p.status === 'closed');
    const partialPositions = allPositions.filter((p) => p.status === 'partial');
    const totalPnl         = Math.round(positions.reduce((s, p) => s + p.pnl, 0) * 100) / 100;

    const positionsSinceStart = reqStartDate
      ? positions.filter((p) => p.firstBuy != null && p.firstBuy >= reqStartDate)
      : null;
    const totalPnlSinceStart  = positionsSinceStart != null
      ? Math.round(positionsSinceStart.reduce((s, p) => s + p.pnl, 0) * 100) / 100
      : null;

    return Response.json(
      {
        // Realized P&L — mirrors /api/transactions response shape
        positions,
        partialPositions,
        totalPnl,
        totalPnlSinceStart,
        txCount: allTrades.length,
        files:   fileStats,

        // Open holdings derived from transaction parsers (cross-broker aggregateFIFO)
        // or parsed directly from holdings-snapshot files.
        // Used by UnifiedUpload to save the portfolio to Supabase after upload.
        holdings: allHoldings,

        // ISIN resolution failures across all parsers that use OpenFIGI
        unresolvedIsins: [...new Set(allUnresolvedIsins)],

        // TODO Gap C: deposit/dividend/fee tracking not yet implemented.
        // Stage 2 will port extraction logic from /api/transactions/route.js
        // into the lib/brokers parsers and aggregate them here.
        cashFlows:      [],   // TODO Gap C — needed for capitalAtStart calculation
        capitalAtStart: null, // TODO Gap C — derived from cashFlows in old route
        deposits:       [],   // TODO Gap C
        dividends:      [],   // TODO Gap C
        fees:           [],   // TODO Gap C
        totalDeposited: 0,    // TODO Gap C
        totalDividends: 0,    // TODO Gap C
        totalFees:      0,    // TODO Gap C
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );

  } catch (e: unknown) {
    console.error('[upload] error:', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
