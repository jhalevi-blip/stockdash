import * as XLSX from 'xlsx';
import type { BrokerFormat } from './types';

export function detectBrokerFormat(wb: XLSX.WorkBook): BrokerFormat {
  // Both Saxo and DeGiro exports use a sheet named "Transacties"
  const sheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'transacties'
  );
  if (!sheetName) return 'generic';

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as string[][];

  // Find first non-empty row (the header row)
  let headers: string[] = [];
  for (const row of rows.slice(0, 10)) {
    if (row.some((c) => String(c).trim() !== '')) {
      // Trim each header — both Saxo and DeGiro have trailing-space quirks
      headers = row.map((h) => String(h ?? '').trim().toLowerCase());
      break;
    }
  }

  const has = (name: string) => headers.includes(name);

  // Saxo: Dutch transaction export — "Instrumentsymbool", "Acties", "Type"
  if (has('instrumentsymbool') && has('acties') && has('type')) return 'saxo';

  // DeGiro: Dutch transaction export — "ISIN", "Aantal", "Product"
  if (has('isin') && has('aantal') && has('product')) return 'degiro';

  return 'generic';
}
