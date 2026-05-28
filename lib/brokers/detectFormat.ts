import * as XLSX from 'xlsx';
import type { BrokerFormat, DetectResult } from './types';

/** Extract lowercased, trimmed headers from a sheet's first non-empty row. */
function getSheetHeaders(sheet: XLSX.WorkSheet, maxRows = 10): string[] {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as string[][];
  for (const row of rows.slice(0, maxRows)) {
    if (row.some((c) => String(c).trim() !== '')) {
      return row.map((h) => String(h ?? '').trim().toLowerCase());
    }
  }
  return [];
}

/** Private: resolve the BrokerFormat from a workbook. Used by both exports. */
function resolveFormat(wb: XLSX.WorkBook): BrokerFormat {
  // ── Trading 212: check every sheet for the T212 header signature ─────────
  // T212 is CSV → SheetJS parses it as a single sheet with a generic name
  // (e.g. "Sheet1"). Check before the "Transacties" lookup so a Saxo/DeGiro
  // file that happens to have a stray sheet named differently still works.
  for (const sn of wb.SheetNames) {
    const headers = getSheetHeaders(wb.Sheets[sn], 5);
    if (
      headers.includes('action') &&
      headers.includes('isin') &&
      headers.includes('ticker') &&
      headers.includes('no. of shares') &&
      headers.includes('currency (price / share)')
    ) {
      return 'trading212';
    }
  }

  // ── IBKR Trades Flex Query: 9-column CSV ─────────────────────────────────
  for (const sn of wb.SheetNames) {
    const headers = getSheetHeaders(wb.Sheets[sn], 5);
    if (
      headers.includes('buy/sell') &&
      headers.includes('tradedate') &&
      headers.includes('isin') &&
      headers.includes('quantity') &&
      headers.includes('tradeprice') &&
      headers.includes('currencyprimary')
    ) {
      return 'ibkr';
    }
  }

  // ── Rabobank: semicolon-delimited CSV with Dutch fund headers ────────────
  for (const sn of wb.SheetNames) {
    const headers = getSheetHeaders(wb.Sheets[sn], 5);
    if (
      headers.includes('portefeuille') &&
      headers.includes('naam') &&
      headers.includes('type mutatie') &&
      headers.includes('isin code')
    ) {
      return 'rabobank';
    }
  }

  // ── Charles Schwab: US comma-delimited CSV with $ and MM/DD/YYYY dates ───
  for (const sn of wb.SheetNames) {
    const headers = getSheetHeaders(wb.Sheets[sn], 5);
    if (
      headers.includes('date') &&
      headers.includes('action') &&
      headers.includes('symbol') &&
      headers.includes('quantity') &&
      headers.includes('price') &&
      headers.includes('fees & comm') &&
      headers.includes('amount')
    ) {
      return 'schwab';
    }
  }

  // ── Saxo / DeGiro: Dutch Excel ────────────────────────────────────────────
  // DeGiro account statement — check before the Transacties gate so it isn't
  // short-circuited by the missing-Transacties-sheet early return below.
  if (wb.SheetNames.some((n) => n.trim().toLowerCase() === 'rekeningoverzicht')) {
    return 'degiro';
  }

  const transactiesName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'transacties'
  );
  if (!transactiesName) return 'generic';

  const headers = getSheetHeaders(wb.Sheets[transactiesName]);
  const has = (name: string) => headers.includes(name);

  // Saxo: Dutch transaction export — "Instrumentsymbool", "Acties", "Type"
  if (has('instrumentsymbool') && has('acties') && has('type')) return 'saxo';

  // DeGiro: Dutch transaction export — "ISIN", "Aantal", "Product"
  if (has('isin') && has('aantal') && has('product')) return 'degiro';

  return 'generic';
}

/**
 * Returns the BrokerFormat for a workbook.
 * Existing call sites (UploadPanel, etc.) are unaffected.
 */
export function detectBrokerFormat(wb: XLSX.WorkBook): BrokerFormat {
  return resolveFormat(wb);
}

/**
 * Returns a DetectResult with format, intent ('transactions' | 'holdings'),
 * and intentConfidence ('certain' | 'inferred' | 'ambiguous').
 *
 * Named broker formats are always 'transactions' with 'certain' confidence.
 * Generic files use column-cluster heuristics to infer intent.
 */
export function detectFile(wb: XLSX.WorkBook): DetectResult {
  const format = resolveFormat(wb);

  if (format !== 'generic') {
    return { format, intent: 'transactions', intentConfidence: 'certain' };
  }

  // ── Generic file: run column-cluster heuristic on the first sheet ────────
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const headers = firstSheet ? getSheetHeaders(firstSheet) : [];

  // Partial substring match (case already lowercased by getSheetHeaders)
  const any = (terms: string[]) =>
    terms.some((term) => headers.some((h) => h.includes(term)));

  const hasA = any(['date', 'datum', 'transactiedatum', 'trade date']);
  const hasB = any(['action', 'type', 'acties', 'buy/sell', 'side']);
  const hasC = any(['quantity', 'shares', 'aantal', 'qty', 'units']);

  // ≥2 of 3 transaction clusters present → transaction history
  if ([hasA, hasB, hasC].filter(Boolean).length >= 2) {
    return { format: 'generic', intent: 'transactions', intentConfidence: 'inferred' };
  }

  // No action cluster, but has ticker + shares + cost → holdings snapshot
  if (!hasB) {
    const hasTicker = any(['ticker', 'symbol', 'instrument']);
    const hasShares = any(['shares', 'quantity', 'aantal']);
    const hasCost   = any(['cost', 'price', 'koers']);
    if (hasTicker && hasShares && hasCost) {
      return { format: 'generic', intent: 'holdings', intentConfidence: 'inferred' };
    }
  }

  // Inconclusive — default to transactions (safer: most uploads are broker exports)
  return { format: 'generic', intent: 'transactions', intentConfidence: 'ambiguous' };
}
