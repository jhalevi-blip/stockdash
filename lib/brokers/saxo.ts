import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';

// Matches: "Koop 30 @ 29.05 USD" | "Verkoop -1000 @ 6.67 USD" | "Expiry -4 @ 0.00 USD"
// Currency code is optional — some Saxo exports omit it; fall back to Instrumentvaluta column.
const ACTIES_RE =
  /^(Koop|Verkoop|Expiry)\s+(-?\d+(?:\.\d+)?)\s*@\s*(-?\d+(?:\.\d+)?)(?:\s+([A-Z]{3}))?$/;

/** Convert an Excel serial date number to an ISO date string (YYYY-MM-DD). */
function excelSerialToISO(serial: number): string {
  // Excel's epoch is Dec 30 1899 (accounts for the 1900 leap-year bug)
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse a raw cell value from a Datum column into an ISO date string. */
function parseDate(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'number') return excelSerialToISO(raw);
  const s = String(raw).trim();
  // Dutch dd-mm-yyyy format
  const ddmm = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (ddmm) {
    return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export function parseSaxo(wb: XLSX.WorkBook): {
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
} {
  const sheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'transacties'
  );
  if (!sheetName) {
    return { trades: [], skipSummary: { parseErrors: 1 } };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  // Find header row (first non-empty row)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i].some((c) => String(c).trim() !== '')) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = rows[headerIdx].map((h) =>
    String(h ?? '').trim().toLowerCase()
  );
  const col = (name: string) => rawHeaders.indexOf(name);

  const typeCol    = col('type');
  const actiesCol  = col('acties');
  const symboolCol = col('instrumentsymbool');
  const datumCol   = col('transactiedatum');
  const valutaCol  = col('instrumentvaluta');

  const trades: BrokerTrade[] = [];
  const skip: SkipSummary = {
    optionsSkipped:       0,
    expirySkipped:        0,
    dividendsSkipped:     0,
    cashTransfersSkipped: 0,
    parseErrors:          0,
  };

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    // Skip blank rows
    if (!row.some((c) => String(c).trim() !== '')) continue;

    const rowType = String(row[typeCol] ?? '').trim().toLowerCase();

    // Filter by row type
    if (rowType === 'corporate action') { skip.dividendsSkipped!++;     continue; }
    if (rowType === 'geldoverboeking')  { skip.cashTransfersSkipped!++;  continue; }
    if (rowType !== 'transactie')       { skip.parseErrors!++;           continue; }

    const symbool = String(row[symboolCol] ?? '').trim();

    // Skip options rows — instrument symbol contains '/'
    if (symbool.includes('/')) { skip.optionsSkipped!++; continue; }

    const actiesRaw = String(row[actiesCol] ?? '').trim();
    const match = ACTIES_RE.exec(actiesRaw);
    if (!match) { skip.parseErrors!++; continue; }

    const [, verb, sharesStr, priceStr, ccyFromActies] = match;

    // Skip options expiry rows
    if (verb === 'Expiry') { skip.expirySkipped!++; continue; }

    // Currency: prefer trailing code in Acties, fall back to Instrumentvaluta column.
    // If neither is populated, the row is uninterpretable — skip with a parse error.
    const currency = ccyFromActies || (valutaCol >= 0 ? String(row[valutaCol] ?? '').trim() : '');
    if (!currency) { skip.parseErrors!++; continue; }

    const sharesRaw = parseFloat(sharesStr);
    const price     = parseFloat(priceStr);
    const action: 'buy' | 'sell' = verb === 'Koop' ? 'buy' : 'sell';
    // abs() so both "Verkoop 25 @ ..." and "Verkoop -25 @ ..." produce a positive
    // share count. Direction is carried by action (Koop/Verkoop), not the sign.
    const shares = Math.abs(sharesRaw);

    // Strip exchange suffix: "CELH:xnas" → "CELH"
    const ticker = symbool.split(':')[0].toUpperCase();

    const date = datumCol >= 0 ? parseDate(row[datumCol]) : '';

    trades.push({ ticker, shares, price, currency, date, action });
  }

  return { trades, skipSummary: skip };
}
