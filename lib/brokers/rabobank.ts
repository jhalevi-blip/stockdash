import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';
import { resolveBatchIsins } from './isinResolver';

/** Parse dd-mm-yyyy → ISO yyyy-mm-dd. Returns '' if unrecognised. */
function parseDate(raw: unknown): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const ddmm = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (ddmm) {
    return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`;
  }
  return '';
}

/** Parse Dutch decimal-comma number, e.g. "84,2637" → 84.2637. */
function parseDutchNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  return parseFloat(String(raw ?? '').replace(',', '.'));
}

export async function parseRabobank(wb: XLSX.WorkBook): Promise<{
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
  unresolvedIsins: string[];
  fallbackUsedTickers: string[];
}> {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw: false → return formatted text (cell.w) instead of auto-coerced
  // numeric values (cell.v). SheetJS treats Dutch decimal-comma as a
  // US thousands separator otherwise, turning "1,8726" into 18726.
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (rows.length < 2) {
    return {
      trades: [],
      skipSummary: { parseErrors: 0 },
      unresolvedIsins: [],
      fallbackUsedTickers: [],
    };
  }

  // Header row at index 0; trim + lowercase
  const rawHeaders = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const col = (name: string) => rawHeaders.indexOf(name);

  const naamCol       = col('naam');
  const datumCol      = col('datum');
  const typeMutatieCol = col('type mutatie');
  const valutaCol     = col('valuta mutatie');
  const volumeCol     = col('volume');
  const koersCol      = col('koers');
  const isinCol       = col('isin code');

  const skip: SkipSummary = {
    dividendsSkipped:     0,
    cashTransfersSkipped: 0,
    parseErrors:          0,
  };

  // ── Pass 1: collect unique ISINs from trade rows only ─────────────────────
  const allIsins = new Set<string>();
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;
    const typeLower = String(row[typeMutatieCol] ?? '').trim().toLowerCase();
    if (typeLower === 'koop fondsen' || typeLower === 'verkoop fondsen') {
      const isin = String(row[isinCol] ?? '').trim();
      if (isin) allIsins.add(isin);
    }
  }

  // ── Batch-resolve ISINs via existing OpenFIGI proxy ───────────────────────
  const isinMap = await resolveBatchIsins([...allIsins]);

  // ── Pass 2: build trades ───────────────────────────────────────────────────
  const trades: BrokerTrade[] = [];
  const unresolvedIsins: string[] = [];
  const seenUnresolved = new Set<string>();
  const fallbackUsedTickers: string[] = [];
  const seenFallback = new Set<string>();

  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;

    const actionRaw  = String(row[typeMutatieCol] ?? '').trim();
    const actionLower = actionRaw.toLowerCase();

    // ── Classify row type ────────────────────────────────────────────────────
    if (actionLower.includes('dividend')) {
      skip.dividendsSkipped = (skip.dividendsSkipped ?? 0) + 1;
      continue;
    }
    if (
      actionLower.includes('storting') ||
      actionLower.includes('opname')  ||
      actionLower.includes('tarieven') ||
      actionLower.includes('rente')
    ) {
      skip.cashTransfersSkipped = (skip.cashTransfersSkipped ?? 0) + 1;
      continue;
    }
    if (actionLower !== 'koop fondsen' && actionLower !== 'verkoop fondsen') {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // ── Resolve ticker ───────────────────────────────────────────────────────
    const isin = String(row[isinCol] ?? '').trim();
    let ticker: string;

    if (isinMap.has(isin)) {
      ticker = isinMap.get(isin)!;
    } else {
      // Fallback: use fund name (Naam) as ticker
      const naam = String(row[naamCol] ?? '').trim();
      if (!naam) {
        if (isin && !seenUnresolved.has(isin)) {
          unresolvedIsins.push(isin);
          seenUnresolved.add(isin);
        }
        continue;
      }
      ticker = naam.toUpperCase();
      if (!seenFallback.has(naam)) {
        fallbackUsedTickers.push(naam);
        seenFallback.add(naam);
      }
    }

    // ── Parse volume and price ───────────────────────────────────────────────
    const volume = parseDutchNumber(row[volumeCol]);
    const koers  = parseDutchNumber(row[koersCol]);

    if (isNaN(volume) || isNaN(koers)) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // ── Currency, date, action ───────────────────────────────────────────────
    const currency = String(row[valutaCol] ?? '').trim() || 'EUR';
    const date     = parseDate(row[datumCol]);
    // Volume is already signed (negative = sell); action follows sign
    const action: 'buy' | 'sell' = volume < 0 ? 'sell' : 'buy';

    trades.push({ ticker, shares: volume, price: koers, currency, date, action });
  }

  return { trades, skipSummary: skip, unresolvedIsins, fallbackUsedTickers };
}
