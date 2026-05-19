import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';
import { resolveBatchIsins } from './isinResolver';

/** Parse dd-mm-yyyy OR Excel serial → ISO yyyy-mm-dd. Returns '' if unrecognised. */
function parseDate(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return '';

  // Excel serial date (e.g. 45506 for 2024-02-08) — unambiguous.
  // Excel's epoch is Dec 30 1899 (accounts for 1900 leap-year bug).
  if (typeof raw === 'number' && raw > 0 && raw < 100000) {
    const ms = (raw - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return '';

  // Dutch dd-mm-yyyy (the original CSV format for day > 12)
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

/** Read a cell's display text (.w) if available, falling back to .v.
 *  Use this for Dutch-decimal columns so "1,8726" doesn't get
 *  auto-coerced to 18726 by SheetJS's US-thousands assumption.
 */
function getCellText(sheet: XLSX.WorkSheet, rowIdx: number, colIdx: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  const cell = sheet[addr];
  if (!cell) return '';
  // Prefer formatted text for numeric cells; fall back to value for strings
  return cell.w ?? cell.v ?? '';
}

/** Read raw cell value (.v) directly — for date cells where the
 *  numeric serial is unambiguous and the formatted .w may be
 *  locale-ambiguous (e.g. "8/2/24" could be Aug 2 or Feb 8).
 */
function getCellValue(sheet: XLSX.WorkSheet, rowIdx: number, colIdx: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  const cell = sheet[addr];
  if (!cell) return '';
  return cell.v ?? '';
}

export async function parseRabobank(rawBytes: Uint8Array): Promise<{
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
  unresolvedIsins: string[];
  fallbackUsedTickers: string[];
}> {
  // Re-parse the file with cellDates:false to preserve original date strings.
  // SheetJS's default XLSX.read auto-detects strings like "08-02-2024" as
  // dates using US MM-DD-YYYY convention — which is wrong for Dutch CSVs.
  // Disabling auto-detection lets parseDate handle dd-mm-yyyy correctly.
  const wb = XLSX.read(rawBytes, { type: 'array', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
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
    // getCellText reads cell.w (formatted text) to preserve Dutch decimal-comma.
    // sheet_to_json without raw:false coerces "1,8726" → 18726 via US-thousands
    // convention; reading .w directly bypasses that coercion.
    const volume = parseDutchNumber(getCellText(sheet, ri, volumeCol));
    const koers  = parseDutchNumber(getCellText(sheet, ri, koersCol));

    if (isNaN(volume) || isNaN(koers)) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // ── Currency, date, action ───────────────────────────────────────────────
    const currency = String(row[valutaCol] ?? '').trim() || 'EUR';
    const date     = parseDate(getCellValue(sheet, ri, datumCol));
    // Volume is already signed (negative = sell); action follows sign
    const action: 'buy' | 'sell' = volume < 0 ? 'sell' : 'buy';

    trades.push({ ticker, shares: volume, price: koers, currency, date, action });
  }

  return { trades, skipSummary: skip, unresolvedIsins, fallbackUsedTickers };
}
