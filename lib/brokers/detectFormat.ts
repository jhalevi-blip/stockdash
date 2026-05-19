import * as XLSX from 'xlsx';
import type { BrokerFormat } from './types';

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

export function detectBrokerFormat(wb: XLSX.WorkBook): BrokerFormat {
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

  // ── Saxo / DeGiro: Dutch Excel with a "Transacties" sheet ────────────────
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
