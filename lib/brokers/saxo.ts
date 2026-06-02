import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';
import type { CashEntry } from './degiro';

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

/**
 * Parse Dutch-formatted numbers: "1.234,56" → 1234.56, "198,16" → 198.16.
 * Mirrors degiro.ts parseNum so Boekingsbedrag values normalise identically.
 * Numeric cells (cellDates:true read) arrive as numbers and pass through unchanged.
 */
function parseNum(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw)
    .replace(/[€$£\s]/g, '')
    .replace(/\./g, '')   // strip thousand-separator dots
    .replace(',', '.');   // decimal comma → dot
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
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
  deposits: CashEntry[];
  dividends: CashEntry[];
  fees: CashEntry[];
  cashEvents: CashEntry[];
  currentCashEur: number | null;
} {
  const sheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'transacties'
  );
  if (!sheetName) {
    return { trades: [], skipSummary: { parseErrors: 1 }, deposits: [], dividends: [], fees: [], cashEvents: [], currentCashEur: null };
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

  const typeCol            = col('type');
  const actiesCol          = col('acties');
  const symboolCol         = col('instrumentsymbool');
  const datumCol           = col('transactiedatum');
  const valutaCol          = col('instrumentvaluta');
  const boekingsbedragCol  = col('boekingsbedrag');
  // Booking-amount currency. Saxo's Boekingsbedrag is in the account currency (EUR
  // for the audited export). If a future export carries a non-EUR booking currency
  // we must NOT convert blindly — skip + flag instead. Absent column → assume EUR.
  const boekingsvalutaCol  = col('boekingsvaluta');

  const trades: BrokerTrade[] = [];
  // Cash-flow buckets — same { date, amountEur } shape as the DeGiro parser, so
  // downstream (totalDeposited/totalDividends/totalFees and the twrDeposits filter
  // `d.date && d.amountEur > 0`) consumes them unchanged.
  const deposits:  CashEntry[] = [];
  const dividends: CashEntry[] = [];
  const fees:      CashEntry[] = [];
  // Raw signed cash track — every row's EUR cash impact (deposits +, buys −,
  // sells +, fees −, dividends +, option premium), captured before any skip so
  // the client can reconstruct the cash balance as of any date. Boekingsbedrag
  // is the account-currency signed booking amount (EUR for the audited export).
  const cashEvents: CashEntry[] = [];
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

    // Raw cash track — record the signed EUR cash impact of every row up front,
    // before any type/option/parse skip drops it. Only rows with a numeric
    // Boekingsbedrag contribute (parseNum returns null for blank/non-numeric).
    const cashImpact = boekingsbedragCol >= 0 ? parseNum(row[boekingsbedragCol]) : null;
    if (cashImpact != null) {
      cashEvents.push({ date: datumCol >= 0 ? parseDate(row[datumCol]) : '', amountEur: cashImpact });
    }

    const rowType = String(row[typeCol] ?? '').trim().toLowerCase();

    // ── Cash movements (Geldoverboeking) → deposit / income / fee ───────────
    if (rowType === 'geldoverboeking') {
      const actiesLow = String(row[actiesCol] ?? '').trim().toLowerCase();
      const amount    = boekingsbedragCol >= 0 ? parseNum(row[boekingsbedragCol]) : null;
      const cashDate  = datumCol >= 0 ? parseDate(row[datumCol]) : '';

      if (actiesLow.startsWith('storting')) {
        // Deposit. Boekingsbedrag is the account-currency booking amount (EUR).
        // Guard against a non-EUR booking currency — do NOT convert, skip + count.
        const ccy = boekingsvalutaCol >= 0 ? String(row[boekingsvalutaCol] ?? '').trim().toUpperCase() : '';
        if (ccy && ccy !== 'EUR') { skip.cashTransfersSkipped!++; continue; }
        if (amount != null && amount > 0) deposits.push({ date: cashDate, amountEur: amount });
      } else if (actiesLow.startsWith('securities lending inkomsten')) {
        // Securities-lending income — classified with dividends (matches DeGiro).
        if (amount != null && amount > 0) dividends.push({ date: cashDate, amountEur: amount });
      } else if (
        actiesLow.startsWith('service fee') ||
        actiesLow.startsWith('factureringsbedragen voor service')
      ) {
        if (amount != null) fees.push({ date: cashDate, amountEur: Math.abs(amount) });
      } else {
        skip.cashTransfersSkipped!++;
      }
      continue;
    }

    // ── Corporate actions → dividend income / non-cash split ────────────────
    if (rowType === 'corporate action') {
      const actiesLow = String(row[actiesCol] ?? '').trim().toLowerCase();
      const amount    = boekingsbedragCol >= 0 ? parseNum(row[boekingsbedragCol]) : null;
      const cashDate  = datumCol >= 0 ? parseDate(row[datumCol]) : '';

      if (actiesLow.startsWith('herbeleggingsdividend') || actiesLow.startsWith('dividend')) {
        // Dividend income — NOT a deposit (never enters external cash flow).
        if (amount != null && amount > 0) dividends.push({ date: cashDate, amountEur: amount });
      } else if (actiesLow.startsWith('stock split')) {
        // Non-cash — ignore entirely (no bucket).
      } else {
        skip.dividendsSkipped!++;
      }
      continue;
    }

    if (rowType !== 'transactie') { skip.parseErrors!++; continue; }

    const symbool = String(row[symboolCol] ?? '').trim();

    // Skip options rows — symbol contains '/' (ASCII U+002F) or Unicode slash variants
    // (∕ U+2215 division slash, ／ U+FF0F fullwidth solidus) used in some Saxo XLSX exports.
    if (/[/\u2215\uFF0F]/.test(symbool)) { skip.optionsSkipped!++; continue; }

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
    // Post-extraction defence: same regex catches any variant that slipped past the
    // primary guard (e.g. if the ':' split introduced a slash in an unexpected position).
    if (/[/\u2215\uFF0F]/.test(ticker)) { skip.optionsSkipped!++; continue; }

    const date = datumCol >= 0 ? parseDate(row[datumCol]) : '';

    // Saxo books every row in EUR (Boekingsbedrag), already read above as cashImpact.
    // Attach its absolute value as the exact per-trade EUR cash value.
    trades.push({
      ticker, shares, price, currency, date, action,
      amountEur: cashImpact != null ? Math.abs(cashImpact) : undefined,
    });
  }

  // Current cash = Σ of every cashEvent's signed Boekingsbedrag (all EUR account
  // currency). This nets deposits + buys − sells + fees + dividends to the live balance.
  const currentCashEur = cashEvents.reduce((sum, e) => sum + e.amountEur, 0);

  return { trades, skipSummary: skip, deposits, dividends, fees, cashEvents, currentCashEur };
}
