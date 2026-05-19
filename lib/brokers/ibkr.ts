import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';
import { resolveBatchIsins } from './isinResolver';

/** Parse YYYYMMDD string → ISO YYYY-MM-DD. Returns empty string if invalid. */
function parseDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!/^\d{8}$/.test(s)) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export async function parseIBKR(wb: XLSX.WorkBook): Promise<{
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
  unresolvedIsins: string[];
  fxConversionsSkipped: number;
}> {
  // IBKR Trades Flex Query → CSV, always a single sheet
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
      fxConversionsSkipped: 0,
    };
  }

  // Find header row — first non-empty row in first 5
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some((c) => String(c).trim() !== '')) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = rows[headerIdx].map((h) =>
    String(h ?? '').trim().toLowerCase()
  );
  const col = (name: string) => rawHeaders.indexOf(name);

  const buySellCol    = col('buy/sell');
  const tradeDateCol  = col('tradedate');
  const isinCol       = col('isin');
  const quantityCol   = col('quantity');
  const tradePriceCol = col('tradeprice');
  const currencyCol   = col('currencyprimary');

  const skip: SkipSummary = { parseErrors: 0 };
  let fxConversionsSkipped = 0;

  // ── Pass 1: collect unique non-empty ISINs ─────────────────────────────────
  const allIsins = new Set<string>();
  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;
    const isin = String(row[isinCol] ?? '').trim();
    if (isin) allIsins.add(isin);
  }

  // ── Batch-resolve ISINs via existing OpenFIGI proxy ───────────────────────
  const isinMap = await resolveBatchIsins([...allIsins]);

  // ── Pass 2: build trades ───────────────────────────────────────────────────
  const trades: BrokerTrade[] = [];
  const unresolvedIsins: string[] = [];
  const seenUnresolved = new Set<string>();

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row.some((c) => String(c).trim() !== '')) continue;

    const isin = String(row[isinCol] ?? '').trim();

    // Empty ISIN → FX conversion or non-equity event
    if (!isin) {
      fxConversionsSkipped++;
      continue;
    }

    // ISIN not resolved → separate unresolved bucket, not parseErrors
    if (!isinMap.has(isin)) {
      if (!seenUnresolved.has(isin)) {
        unresolvedIsins.push(isin);
        seenUnresolved.add(isin);
      }
      continue;
    }

    const ticker = isinMap.get(isin)!;

    // Buy/Sell — normalize to lowercase, then classify
    const buySellRaw = String(row[buySellCol] ?? '').trim().toLowerCase();
    const action: 'buy' | 'sell' = buySellRaw === 'sell' ? 'sell' : 'buy';

    // Quantity — already signed (negative for sells); preserve as-is
    const quantityRaw = row[quantityCol];
    const quantity =
      typeof quantityRaw === 'number'
        ? quantityRaw
        : parseFloat(String(quantityRaw ?? '').replace(',', '.'));
    if (isNaN(quantity)) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // Price per share
    const priceRaw = row[tradePriceCol];
    const price =
      typeof priceRaw === 'number'
        ? priceRaw
        : parseFloat(String(priceRaw ?? '').replace(',', '.'));
    if (isNaN(price)) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // Currency — pass through (including GBX)
    const currency = String(row[currencyCol] ?? '').trim() || 'USD';

    // Date — YYYYMMDD → YYYY-MM-DD; invalid → empty string (row still included)
    const date = parseDate(row[tradeDateCol]);

    trades.push({ ticker, shares: quantity, price, currency, date, action });
  }

  return { trades, skipSummary: skip, unresolvedIsins, fxConversionsSkipped };
}
