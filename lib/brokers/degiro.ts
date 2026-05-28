import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';
import { resolveBatchIsins } from './isinResolver';

// ── Shared types ─────────────────────────────────────────────────────────────

export interface CashEntry {
  date:      string;
  amountEur: number;
}

export interface DeGiroParseResult {
  trades:          BrokerTrade[];
  skipSummary:     SkipSummary;
  unresolvedIsins: string[];
  deposits:        CashEntry[];
  dividends:       CashEntry[];
  fees:            CashEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse dd-mm-yyyy string → ISO yyyy-mm-dd. Handles JS Date objects from cellDates:true. */
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

/**
 * Parse Dutch-formatted numbers: "1.234,56" → 1234.56, "198,16" → 198.16.
 * Removes thousand-separator dots before replacing decimal comma.
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

/**
 * Find column index by trying normalized candidate names in order.
 * Normalisation: lowercase, strip non-alphanumeric.
 */
function findCol(headers: unknown[], candidates: string[]): number {
  const norm = (h: unknown) =>
    String(h ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const normed = headers.map(norm);
  for (const c of candidates) {
    const i = normed.indexOf(norm(c));
    if (i !== -1) return i;
  }
  return -1;
}

// ── Rekeningoverzicht parser ──────────────────────────────────────────────────

// Matches: "Koop 30 @ 198,16 USD" or "Verkoop 100 @ 490,50 EUR"
// Groups:   1=action  2=shares   3=price    4=currency
const TRADE_RE = /^(koop|verkoop)\s+([\d.,]+)\s+@\s+([\d.,]+)\s+([A-Z]{3})/i;

async function parseRekeningoverzicht(wb: XLSX.WorkBook): Promise<DeGiroParseResult> {
  const sheetName = wb.SheetNames.find((n) => n === 'Rekeningoverzicht')!;
  const sheet  = wb.Sheets[sheetName];
  const raw    = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  if (raw.length < 2) {
    return {
      trades: [], skipSummary: {}, unresolvedIsins: [],
      deposits: [], dividends: [], fees: [],
    };
  }

  const headers  = raw[0] as unknown[];
  const dataRows = raw.slice(1);

  const datumCol   = findCol(headers, ['datum']);
  const isinCol    = findCol(headers, ['isin']);
  const omschrCol  = findCol(headers, ['omschrijving']);
  const mutatieCol = findCol(headers, ['mutatie']);
  // Amount column is the unnamed column immediately right of Mutatie
  const amountCol  = mutatieCol >= 0 ? mutatieCol + 1 : -1;
  const orderIdCol = findCol(headers, ['order id', 'orderid', 'order-id']);

  // ── Pass 1: bucket rows by Order Id; collect ISINs for batch resolution ────
  const groups      = new Map<string, unknown[][]>();
  const noOrderRows: unknown[][] = [];
  const tradeIsins  = new Set<string>();

  for (const row of dataRows) {
    const r = row as unknown[];
    if (!r.some((v) => v !== '')) continue; // skip fully blank rows

    const orderId = orderIdCol >= 0 ? String(r[orderIdCol] ?? '').trim() : '';
    const omschr  = omschrCol  >= 0 ? String(r[omschrCol]  ?? '').trim() : '';

    if (orderId) {
      if (!groups.has(orderId)) groups.set(orderId, []);
      groups.get(orderId)!.push(r);
      // Collect ISIN only from trade rows (Koop/Verkoop prefix)
      if (/^(koop|verkoop)\s/i.test(omschr)) {
        const isin = isinCol >= 0 ? String(r[isinCol] ?? '').trim() : '';
        if (isin) tradeIsins.add(isin);
      }
    } else {
      noOrderRows.push(r);
    }
  }

  // ── Pass 2: batch-resolve all ISINs via shared resolver ───────────────────
  const isinMap = await resolveBatchIsins([...tradeIsins]);

  // ── Pass 3: process each Order Id group → trades + per-order fees ─────────
  const trades:          BrokerTrade[] = [];
  const fees:            CashEntry[]   = [];
  const unresolvedIsins: string[]      = [];
  const seenUnresolved   = new Set<string>();
  const skip: SkipSummary = { parseErrors: 0 };

  for (const [, rows] of groups) {
    let action:      'buy' | 'sell' | null = null;
    let totalShares  = 0;
    let totalValue   = 0; // Σ(shares_i × price_i) in native currency — handles partial fills
    let currency     = '';
    let date         = '';
    let isin         = '';
    let hasTrade     = false;

    for (const r of rows) {
      const row     = r as unknown[];
      const omschr  = omschrCol  >= 0 ? String(row[omschrCol]  ?? '').trim() : '';
      const mutatie = mutatieCol >= 0 ? String(row[mutatieCol] ?? '').trim().toUpperCase() : '';
      const amount  = amountCol  >= 0 ? parseNum(row[amountCol]) : null;

      // Fee rows nested inside the order group (DEGIRO Transactiekosten)
      if (omschr.toLowerCase().includes('transactiekosten')) {
        const feeDate = datumCol >= 0 ? parseDate(row[datumCol]) : '';
        if (amount != null) fees.push({ date: feeDate, amountEur: Math.abs(amount) });
        continue;
      }

      // Trade rows: parse shares, native price, currency directly from Omschrijving
      const m = TRADE_RE.exec(omschr);
      if (m) {
        if (!date)     date     = datumCol >= 0 ? parseDate(row[datumCol]) : '';
        if (!action)   action   = m[1].toLowerCase() === 'koop' ? 'buy' : 'sell';
        if (!isin)     isin     = isinCol  >= 0 ? String(row[isinCol] ?? '').trim() : '';
        if (!currency) currency = m[4].toUpperCase();

        const shares = parseNum(m[2]);
        const price  = parseNum(m[3]);
        if (shares != null && price != null && shares > 0 && price > 0) {
          totalShares += shares;
          totalValue  += shares * price; // weighted accumulation for partial fills
        }
        hasTrade = true;
        continue;
      }

      // All other rows in the group (Valuta Debitering/Creditering etc.) are ignored —
      // price comes from Omschrijving directly so EUR legs are not needed.
      void mutatie; void amount;
    }

    if (!hasTrade || totalShares === 0 || totalValue === 0) {
      // Group had no parseable trade rows (e.g. pure-fee order, or malformed Omschrijving).
      // Increment parseErrors so the skip summary reflects the drop rather than silently losing it.
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    if (!isin || !isinMap.has(isin)) {
      if (isin && !seenUnresolved.has(isin)) {
        unresolvedIsins.push(isin);
        seenUnresolved.add(isin);
      }
      continue;
    }

    const ticker   = isinMap.get(isin)!;
    const avgPrice = totalValue / totalShares;
    // BrokerTrade.shares convention: positive = buy, negative = sell
    const signedShares = action === 'sell' ? -totalShares : totalShares;

    trades.push({
      ticker,
      shares:   Math.round(signedShares * 1e8) / 1e8,
      price:    Math.round(avgPrice     * 1e6) / 1e6,
      currency,
      date,
      action: action!,
    });
  }

  // ── Pass 4: no-Order-Id rows → deposits, dividends, account-level fees ────
  // These Omschrijving patterns are matched against values observed in real
  // DeGiro Rekeningoverzicht exports. Any row not matching a known pattern is
  // intentionally ignored — it will not appear in deposits, dividends, or fees.
  // TODO: expand coverage as more DeGiro file variants surface.
  const deposits:  CashEntry[] = [];
  const dividends: CashEntry[] = [];

  for (const r of noOrderRows) {
    const row       = r as unknown[];
    const omschr    = omschrCol  >= 0 ? String(row[omschrCol]  ?? '').trim() : '';
    const omschrLow = omschr.toLowerCase();
    const mutatie   = mutatieCol >= 0 ? String(row[mutatieCol] ?? '').trim().toUpperCase() : '';
    const amount    = amountCol  >= 0 ? parseNum(row[amountCol]) : null;
    const date      = datumCol   >= 0 ? parseDate(row[datumCol]) : '';

    // Only process EUR-denominated cash rows
    if (amount == null || mutatie !== 'EUR') continue;

    if (omschrLow === 'ideal deposit') {
      if (amount > 0) deposits.push({ date, amountEur: amount });
    } else if (
      omschrLow === 'flatex interest income' ||
      omschrLow.startsWith('inkomsten uit securities lending')
    ) {
      if (amount > 0) dividends.push({ date, amountEur: amount });
    } else if (
      omschrLow.startsWith('degiro aansluitingskosten') ||
      omschrLow.startsWith('degiro verbindingskosten') ||
      omschrLow === 'service fee'
    ) {
      if (amount < 0) fees.push({ date, amountEur: Math.abs(amount) });
    }
  }

  return { trades, skipSummary: skip, unresolvedIsins, deposits, dividends, fees };
}

// ── Transacties parser (unchanged logic, extended return shape) ───────────────

async function parseTransacties(wb: XLSX.WorkBook): Promise<DeGiroParseResult> {
  const sheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'transacties'
  )!;

  const sheet = wb.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, {
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
  const currencyCol = koersCol >= 0 ? koersCol + 1 : -1;

  const skip: SkipSummary = { parseErrors: 0 };

  // ── Pass 1: collect unique ISINs ──────────────────────────────────────────
  const allIsins = new Set<string>();
  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;
    const isin = String(row[isinCol] ?? '').trim();
    if (isin) allIsins.add(isin);
  }

  // ── Batch-resolve all ISINs in one call ───────────────────────────────────
  const isinMap = await resolveBatchIsins([...allIsins]);

  // ── Pass 2: build trades ──────────────────────────────────────────────────
  const trades:          BrokerTrade[] = [];
  const unresolvedIsins: string[]      = [];
  const seenUnresolved   = new Set<string>();

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;

    const isin = String(row[isinCol] ?? '').trim();

    if (!isin || !isinMap.has(isin)) {
      if (isin && !seenUnresolved.has(isin)) {
        unresolvedIsins.push(isin);
        seenUnresolved.add(isin);
      }
      continue;
    }

    const ticker = isinMap.get(isin)!;

    // Aantal (shares) — signed: negative = sell
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
    const currency    = currencyRaw || 'USD';

    const date   = datumCol >= 0 ? parseDate(row[datumCol]) : '';
    const action: 'buy' | 'sell' = aantal < 0 ? 'sell' : 'buy';

    trades.push({ ticker, shares: aantal, price: koers, currency, date, action });
  }

  // Transacties format carries no cash-flow data — return empty arrays
  return {
    trades,
    skipSummary:     skip,
    unresolvedIsins,
    deposits:        [],
    dividends:       [],
    fees:            [],
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Parse a DeGiro XLSX workbook.
 * Dispatches to the correct sub-parser based on sheet name:
 *   "Rekeningoverzicht" → account statement format (trades + deposits/dividends/fees)
 *   "Transacties"       → transaction export format (trades only)
 */
export async function parseDeGiro(wb: XLSX.WorkBook): Promise<DeGiroParseResult> {
  if (wb.SheetNames.some((n) => n === 'Rekeningoverzicht')) {
    return parseRekeningoverzicht(wb);
  }
  if (wb.SheetNames.some((n) => n.trim().toLowerCase() === 'transacties')) {
    return parseTransacties(wb);
  }
  return {
    trades:          [],
    skipSummary:     { parseErrors: 1 },
    unresolvedIsins: [],
    deposits:        [],
    dividends:       [],
    fees:            [],
  };
}
