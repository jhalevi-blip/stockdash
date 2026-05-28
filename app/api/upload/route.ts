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

    const allTradesByBroker:  Map<BrokerFormat, BrokerTrade[]>      = new Map();
    const allDeposits:        { date: string; amountEur: number }[] = [];
    const allDividends:       { date: string; amountEur: number }[] = [];
    const allFees:            { date: string; amountEur: number }[] = [];
    let   _debugDegiro:       unknown                               = undefined;
    // Holdings snapshots (generic intent files) are pushed during the loop.
    // Broker open positions are derived after the loop via per-broker aggregateFIFO.
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
              allDeposits.push(...r.deposits);
              allDividends.push(...r.dividends);
              allFees.push(...r.fees);
              if (r._debug) _debugDegiro = r._debug;
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

        // Accumulate trades per broker — FIFO runs per-broker after the loop
        // so Saxo sells never consume DeGiro lots for the same ticker.
        const brokerKey = format as BrokerFormat;
        if (!allTradesByBroker.has(brokerKey)) allTradesByBroker.set(brokerKey, []);
        allTradesByBroker.get(brokerKey)!.push(...trades);

        // Diagnostic placeholders — backfilled with whole-broker FIFO results after loop.
        fileStats.push({
          name:             file.name,
          txCount:          trades.length,
          format,
          intent:           'transactions',
          intentConfidence: 'certain',
          skipped: {
            ...skipped,
            netZero:                 0,
            sellsWithoutBuys:        0,
            sellsWithoutBuysTickers: [],
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

    // ── Per-broker FIFO ───────────────────────────────────────────────────────
    // Run aggregateFIFO independently per broker so sells at one broker never
    // consume lots from another.  After all brokers are processed, merge
    // positions by (ticker, currency):
    //   • same currency across brokers → weighted-average cost, one row
    //   • different currencies         → separate rows (can't net across FX)

    type PerBrokerPos = {
      broker: BrokerFormat; ticker: string; shares: number;
      avgCost: number; currency: string; date: string;
    };
    const perBrokerPositions: PerBrokerPos[] = [];
    const allRealizedTrades:  BrokerTrade[]  = [];
    const brokerDiagnostics = new Map<
      BrokerFormat,
      { netZeroTickers: string[]; sellsWithoutBuysTickers: string[] }
    >();

    for (const [broker, brokerTrades] of allTradesByBroker) {
      const { positions: brokerPos, netZeroTickers, sellsWithoutBuysTickers } =
        aggregateFIFO(brokerTrades, broker);
      brokerDiagnostics.set(broker, { netZeroTickers, sellsWithoutBuysTickers });
      for (const p of brokerPos) {
        perBrokerPositions.push({
          broker, ticker: p.t, shares: p.s, avgCost: p.c, currency: p.currency, date: p.d ?? '',
        });
      }
      allRealizedTrades.push(...brokerTrades);
    }

    // Backfill fileStats with whole-broker FIFO diagnostics (per-broker pass
    // sees all files for that broker together, so multi-file false-flags are gone).
    for (const stat of fileStats) {
      const diag = brokerDiagnostics.get(stat.format as BrokerFormat);
      if (diag) {
        stat.skipped.netZero                 = diag.netZeroTickers.length;
        stat.skipped.sellsWithoutBuys        = diag.sellsWithoutBuysTickers.length;
        stat.skipped.sellsWithoutBuysTickers = diag.sellsWithoutBuysTickers;
      }
    }

    // Merge per-broker positions by (ticker, currency) into allHoldings
    const tickerCurrencyMap = new Map<string, PerBrokerPos[]>();
    for (const p of perBrokerPositions) {
      const key = `${p.ticker}__${p.currency}`;
      if (!tickerCurrencyMap.has(key)) tickerCurrencyMap.set(key, []);
      tickerCurrencyMap.get(key)!.push(p);
    }

    for (const group of tickerCurrencyMap.values()) {
      const totalShares = group.reduce((s, p) => s + p.shares, 0);
      const totalCost   = group.reduce((s, p) => s + p.shares * p.avgCost, 0);
      const avgCost     = totalShares > 0 ? totalCost / totalShares : 0;
      const earliest    = group.map((p) => p.date).filter(Boolean).sort()[0] ?? '';
      allHoldings.push({
        t:        group[0].ticker,
        s:        Math.round(totalShares * 1e8) / 1e8,
        c:        Math.round(avgCost     * 1e6) / 1e6,
        d:        earliest || undefined,
        currency: group[0].currency,
        // Single broker → preserve provenance; multi-broker merge → 'generic'
        broker:   group.length === 1 ? group[0].broker : 'generic',
      });
    }

    // ── Realized P&L (across all transaction files) ───────────────────────
    const allPositions     = calcFIFO(allRealizedTrades);
    const positions        = allPositions.filter((p) => p.status === 'closed');
    const partialPositions = allPositions.filter((p) => p.status === 'partial');
    const totalPnl         = Math.round(positions.reduce((s, p) => s + p.pnl, 0) * 100) / 100;

    const positionsSinceStart = reqStartDate
      ? positions.filter((p) => p.firstBuy != null && p.firstBuy >= reqStartDate)
      : null;
    const totalPnlSinceStart  = positionsSinceStart != null
      ? Math.round(positionsSinceStart.reduce((s, p) => s + p.pnl, 0) * 100) / 100
      : null;

    // ── Temporary diagnostic: per-broker FIFO lot trace for AMD ──────────────
    // Remove before Stage 1 cleanup.
    const _debugTicker = 'AMD';
    const _debugPerBroker: Record<string, {
      trades: unknown[]; lots: unknown[]; avgCost: number;
    }> = {};

    for (const [broker, brokerTrades] of allTradesByBroker) {
      const amdTrades = brokerTrades
        .filter((t) => t.ticker === _debugTicker)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      if (amdTrades.length === 0) continue;

      const survivingLots: { shares: number; price: number; currency: string; date: string }[] = [];
      for (const t of amdTrades) {
        const absShares = Math.abs(t.shares);
        if (t.action === 'buy') {
          survivingLots.push({ shares: absShares, price: t.price, currency: t.currency, date: t.date });
        } else {
          let remaining = absShares;
          while (remaining > 0 && survivingLots.length > 0) {
            const lot = survivingLots[0];
            if (lot.shares <= remaining) { remaining -= lot.shares; survivingLots.shift(); }
            else { lot.shares -= remaining; remaining = 0; }
          }
        }
      }
      const netShares = survivingLots.reduce((s, l) => s + l.shares, 0);
      const totalCost = survivingLots.reduce((s, l) => s + l.shares * l.price, 0);
      _debugPerBroker[broker] = {
        trades:  amdTrades.map((t) => ({ date: t.date, shares: t.shares, price: t.price, currency: t.currency, action: t.action })),
        lots:    survivingLots,
        avgCost: netShares > 0 ? Math.round((totalCost / netShares) * 1e6) / 1e6 : 0,
      };
    }

    // Merged AMD avg cost echo — sourced from the allHoldings merge above.
    const _mergedAmdPos          = allHoldings.find((h) => h.t === _debugTicker);
    const _debugMergedAvgCostEcho = _mergedAmdPos?.c ?? null;

    return Response.json(
      {
        // Realized P&L — mirrors /api/transactions response shape
        positions,
        partialPositions,
        totalPnl,
        totalPnlSinceStart,
        txCount: [...allTradesByBroker.values()].reduce((s, t) => s + t.length, 0),
        files:   fileStats,

        // Open holdings derived from transaction parsers (cross-broker aggregateFIFO)
        // or parsed directly from holdings-snapshot files.
        // Used by UnifiedUpload to save the portfolio to Supabase after upload.
        holdings: allHoldings,

        // ISIN resolution failures across all parsers that use OpenFIGI
        unresolvedIsins: [...new Set(allUnresolvedIsins)],

        // Gap C: deposits/dividends/fees now wired for DeGiro Rekeningoverzicht.
        // Saxo and other parsers do not yet extract cash flows — they contribute 0.
        // cashFlows/capitalAtStart remain deferred (Stage 2 — requires deposit timing logic).
        cashFlows:      [],   // TODO Stage 2 — needed for capitalAtStart calculation
        capitalAtStart: null, // TODO Stage 2 — derived from cashFlows
        deposits:       allDeposits,
        dividends:      allDividends,
        fees:           allFees,
        totalDeposited: Math.round(allDeposits.reduce((s, d)  => s + d.amountEur, 0) * 100) / 100,
        totalDividends: Math.round(allDividends.reduce((s, d) => s + d.amountEur, 0) * 100) / 100,
        totalFees:      Math.round(allFees.reduce((s, d)      => s + d.amountEur, 0) * 100) / 100,

        // Temporary diagnostic — remove before Stage 1 cleanup.
        _debug:                _debugDegiro ?? null,
        _debugTrades:          { ticker: _debugTicker, perBroker: _debugPerBroker },
        _debugMergedAvgCostEcho,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );

  } catch (e: unknown) {
    console.error('[upload] error:', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
