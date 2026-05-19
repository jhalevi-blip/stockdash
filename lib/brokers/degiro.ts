import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';
import { resolveBatchIsins } from './isinResolver';

/** Parse dd-mm-yyyy string → ISO yyyy-mm-dd. */
function parseDate(raw: unknown): string {
  if (!raw) return '';
  const s = String(raw).trim();
  const ddmm = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (ddmm) {
    return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export async function parseDeGiro(wb: XLSX.WorkBook): Promise<{
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
  unresolvedIsins: string[];
}> {
  const sheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'transacties'
  );
  if (!sheetName) {
    return { trades: [], skipSummary: { parseErrors: 1 }, unresolvedIsins: [] };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  // Find header row — first non-empty row in first 20
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i].some((c) => String(c).trim() !== '')) {
      headerIdx = i;
      break;
    }
  }

  // Trim all headers to lowercase before matching (handles "Koers " trailing space)
  const rawHeaders = rows[headerIdx].map((h) =>
    String(h ?? '').trim().toLowerCase()
  );
  const col = (name: string) => rawHeaders.indexOf(name);

  const datumCol    = col('datum');
  const isinCol     = col('isin');
  const aantalCol   = col('aantal');
  const koersCol    = col('koers');
  // Currency is positional: the cell immediately right of Koers
  // (header may be empty or "Unnamed: 8" — do not rely on its name)
  const currencyCol = koersCol >= 0 ? koersCol + 1 : -1;

  const skip: SkipSummary = { parseErrors: 0 };

  // ── Pass 1: collect unique ISINs across all data rows ──────────────────────
  const allIsins = new Set<string>();
  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;
    const isin = String(row[isinCol] ?? '').trim();
    if (isin) allIsins.add(isin);
  }

  // ── Batch-resolve all ISINs in one call ────────────────────────────────────
  const isinMap = await resolveBatchIsins([...allIsins]);

  // ── Pass 2: iterate rows and build trades ──────────────────────────────────
  const trades: BrokerTrade[] = [];
  // Track unique unresolved ISINs (deduplicated for the summary list)
  const unresolvedIsins: string[] = [];
  const seenUnresolved = new Set<string>();

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;

    const isin = String(row[isinCol] ?? '').trim();

    // Skip rows whose ISIN could not be resolved
    if (!isin || !isinMap.has(isin)) {
      if (isin && !seenUnresolved.has(isin)) {
        unresolvedIsins.push(isin);
        seenUnresolved.add(isin);
      }
      continue; // counted via unresolvedIsins, not parseErrors
    }

    const ticker = isinMap.get(isin)!;

    // Aantal (shares) — already signed: negative = sell
    const aantalRaw = row[aantalCol];
    const aantal =
      typeof aantalRaw === 'number'
        ? aantalRaw
        : parseFloat(String(aantalRaw ?? '').replace(',', '.'));
    if (isNaN(aantal)) { skip.parseErrors = (skip.parseErrors ?? 0) + 1; continue; }

    // Koers (price per share in local currency)
    const koersRaw = row[koersCol];
    const koers =
      typeof koersRaw === 'number'
        ? koersRaw
        : parseFloat(String(koersRaw ?? '').replace(',', '.'));
    if (isNaN(koers)) { skip.parseErrors = (skip.parseErrors ?? 0) + 1; continue; }

    // Currency: positional column, default USD if blank
    const currencyRaw = currencyCol >= 0 ? String(row[currencyCol] ?? '').trim() : '';
    const currency = currencyRaw || 'USD';

    const date   = datumCol >= 0 ? parseDate(row[datumCol]) : '';
    const action: 'buy' | 'sell' = aantal < 0 ? 'sell' : 'buy';

    trades.push({ ticker, shares: aantal, price: koers, currency, date, action });
  }

  return { trades, skipSummary: skip, unresolvedIsins };
}
