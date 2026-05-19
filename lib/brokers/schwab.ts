import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';

/** Parse MM/DD/YYYY or "MM/DD/YYYY as of MM/DD/YYYY" → ISO yyyy-mm-dd. */
function parseDate(raw: unknown): string {
  if (!raw) return '';
  let s = String(raw).trim();
  // "07/15/2024 as of 07/12/2024" → use the actual trade date (second one)
  const asOfMatch = / as of (\d{2}\/\d{2}\/\d{4})/i.exec(s);
  if (asOfMatch) s = asOfMatch[1];
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return '';
}

/** Strip $ signs and US thousands commas, then parse as float. */
function parseUSNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (raw === undefined || raw === null || raw === '') return NaN;
  const cleaned = String(raw).trim().replace(/[$,]/g, '');
  return parseFloat(cleaned);
}

/** Returns true if the symbol looks like a CUSIP (9-char alphanumeric + special). */
function isCUSIP(symbol: string): boolean {
  return /^[A-Z0-9]{8}[A-Z0-9*@#]$/i.test(symbol);
}

export function parseSchwab(rawBytes: Uint8Array): {
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
} {
  // Re-parse the file with cellDates:false and raw:true to preserve
  // MM/DD/YYYY date strings. SheetJS's default XLSX.read auto-detects
  // dates and converts them to Excel serials — but parseDate only
  // handles MM/DD/YYYY and "as of" patterns, not serials, so every trade
  // would end up with date="" and FIFO ordering would break.
  const wb = XLSX.read(rawBytes, { type: 'array', cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (rows.length < 2) {
    return { trades: [], skipSummary: { parseErrors: 0 } };
  }

  // Header row at index 0; trim + lowercase
  const rawHeaders = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const col = (name: string) => rawHeaders.indexOf(name);

  const dateCol    = col('date');
  const actionCol  = col('action');
  const symbolCol  = col('symbol');
  const quantityCol = col('quantity');
  const priceCol   = col('price');

  const skip: SkipSummary = {
    dividendsSkipped:        0,
    cashTransfersSkipped:    0,
    parseErrors:             0,
    corporateActionsSkipped: 0,
  };

  const trades: BrokerTrade[] = [];

  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];

    // Skip blank rows
    if (!row.some((c) => String(c).trim() !== '')) continue;

    // Skip footer row (first cell starts with "Transactions Total")
    const firstCell = String(row[0] ?? '').trim();
    if (firstCell.toLowerCase().startsWith('transactions total')) continue;

    const actionRaw   = String(row[actionCol] ?? '').trim();
    const actionLower = actionRaw.toLowerCase();

    // ── B8b corporate actions — hold as parseErrors for now ─────────────────
    if (
      actionLower === 'stock split'    ||
      actionLower === 'reverse split'  ||
      actionLower === 'stock div dist' ||
      actionLower === 'spin-off'       ||
      actionLower === 'stock merger'   ||
      actionLower === 'name change'    ||
      actionLower === 'conversion'     ||
      actionLower === 'cash in lieu'
    ) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // ── Dividend skips ───────────────────────────────────────────────────────
    if (
      actionLower.includes('div') ||
      actionLower === 'reinvest dividend' ||
      actionLower === 'qual div reinvest' ||
      actionLower === 'pr yr div reinvest' ||
      actionLower === 'long term cap gain reinvest' ||
      actionLower === 'cash dividend' ||
      actionLower === 'special non qual div' ||
      actionLower === 'pr yr cash div' ||
      actionLower === 'non-qualified div'
    ) {
      skip.dividendsSkipped = (skip.dividendsSkipped ?? 0) + 1;
      continue;
    }

    // ── Cash transfer skips ──────────────────────────────────────────────────
    if (
      actionLower === 'credit interest'    ||
      actionLower === 'advisor fee'        ||
      actionLower === 'adr mgmt fee'       ||
      actionLower === 'foreign tax paid'   ||
      actionLower === 'wire sent'          ||
      actionLower === 'wire funds'         ||
      actionLower === 'moneylink transfer' ||
      actionLower === 'internal transfer'  ||
      actionLower === 'bank transfer'      ||
      actionLower === 'journaled shares'
    ) {
      skip.cashTransfersSkipped = (skip.cashTransfersSkipped ?? 0) + 1;
      continue;
    }

    // ── Trade rows ───────────────────────────────────────────────────────────
    let isBuy: boolean;
    if (actionLower === 'buy' || actionLower === 'reinvest shares') {
      isBuy = true;
    } else if (actionLower === 'sell') {
      isBuy = false;
    } else {
      // Unknown action — treat as parse error
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // Validate symbol — skip CUSIPs (corporate action rows without a real ticker)
    const symbol = String(row[symbolCol] ?? '').trim().toUpperCase();
    if (!symbol || isCUSIP(symbol)) {
      skip.corporateActionsSkipped = (skip.corporateActionsSkipped ?? 0) + 1;
      continue;
    }

    const quantity = parseUSNumber(row[quantityCol]);
    const price    = parseUSNumber(row[priceCol]);

    if (isNaN(quantity) || isNaN(price)) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // Schwab edge case: "Sell" with negative quantity is actually a buy
    let action: 'buy' | 'sell' = isBuy ? 'buy' : 'sell';
    if (action === 'sell' && quantity < 0) {
      action = 'buy';
    }

    // Signed shares convention: buys positive, sells negative
    const shares = action === 'buy' ? Math.abs(quantity) : -Math.abs(quantity);

    const date = parseDate(row[dateCol]);

    trades.push({ ticker: symbol, shares, price, currency: 'USD', date, action });
  }

  return { trades, skipSummary: skip };
}
