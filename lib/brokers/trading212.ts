import * as XLSX from 'xlsx';
import type { BrokerTrade, SkipSummary } from './types';

// T212 EXPORTS HAVE A COLUMN-SHIFT QUIRK on Stock distribution and
// Stock split rows: the "No. of shares" cell is blank, the order ID
// sits in "Price / share", and the actual numeric values are pushed
// one column to the right. So for these row types:
//   - shares come from the "Currency (Price / share)" cell (priceCurrCol)
//   - price comes from "Exchange rate" (exchangeRateCol)
//   - currency comes from "Result" (resultCol)
// Market buy/sell rows use the normal column layout.

export function parseTrading212(wb: XLSX.WorkBook): {
  trades: BrokerTrade[];
  skipSummary: SkipSummary;
  splitsCounted: number;
  distributionsCounted: number;
  transfersOutSkipped: number;
} {
  // T212 CSV → always a single sheet (SheetNames[0])
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (rows.length < 2) {
    return {
      trades: [],
      skipSummary: { parseErrors: 0 },
      splitsCounted: 0,
      distributionsCounted: 0,
      transfersOutSkipped: 0,
    };
  }

  // CSV has a single header row at index 0
  const rawHeaders = rows[0].map((h) => String(h ?? '').trim().toLowerCase());
  const col = (name: string) => rawHeaders.indexOf(name);

  const actionCol       = col('action');
  const timeCol         = col('time');
  const tickerCol       = col('ticker');
  const sharesCol       = col('no. of shares');
  const priceCol        = col('price / share');
  const priceCurrCol    = col('currency (price / share)');
  const exchangeRateCol = col('exchange rate');
  const resultCol       = col('result');

  const trades: BrokerTrade[] = [];
  const skip: SkipSummary = {
    dividendsSkipped:     0,
    cashTransfersSkipped: 0,
    parseErrors:          0,
  };
  let splitsCounted      = 0;
  let distributionsCounted = 0;
  let transfersOutSkipped  = 0;

  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];

    // Skip blank rows
    if (!row.some((c) => String(c).trim() !== '')) continue;

    const actionRaw = String(row[actionCol] ?? '').trim();
    const actionLower = actionRaw.toLowerCase();

    // ── Classify action ─────────────────────────────────────────────────────

    // Skip actions first (before the buy/sell includes check, since
    // none of these contain 'buy' or 'sell' — but be explicit for safety)
    if (actionLower.includes('dividend')) {
      skip.dividendsSkipped = (skip.dividendsSkipped ?? 0) + 1;
      continue;
    }
    if (
      actionLower === 'deposit' ||
      actionLower === 'withdraw' ||
      actionLower === 'interest on cash' ||
      actionLower === 'currency conversion'
    ) {
      skip.cashTransfersSkipped = (skip.cashTransfersSkipped ?? 0) + 1;
      continue;
    }
    if (actionLower === 'transfer out') {
      transfersOutSkipped++;
      continue;
    }

    // Determine position-affecting action type
    let actionType: 'buy' | 'sell' | 'distribution' | 'split_open' | 'split_close' | null = null;

    if (actionLower === 'stock distribution') {
      actionType = 'distribution';
    } else if (actionLower === 'stock split open') {
      actionType = 'split_open';
    } else if (actionLower === 'stock split close') {
      actionType = 'split_close';
    } else if (actionLower.includes('buy')) {
      actionType = 'buy';
    } else if (actionLower.includes('sell')) {
      actionType = 'sell';
    } else {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // ── Resolve ticker ───────────────────────────────────────────────────────
    const ticker = String(row[tickerCol] ?? '').trim().toUpperCase();
    if (!ticker) {
      skip.parseErrors = (skip.parseErrors ?? 0) + 1;
      continue;
    }

    // ── Extract date from Time column ────────────────────────────────────────
    // Format: "2023-12-18 14:30:03.613" → take first 10 chars
    const date = String(row[timeCol] ?? '').trim().slice(0, 10);

    // ── Extract shares, price, currency based on action type ─────────────────
    let shares: number;
    let price: number;
    let currency: string;

    if (actionType === 'distribution') {
      // T212 column-shifts these rows: shares in priceCurrCol,
      // price stays in exchangeRateCol, currency in resultCol.
      const sharesRaw = row[priceCurrCol];
      shares = typeof sharesRaw === 'number'
        ? sharesRaw
        : parseFloat(String(sharesRaw ?? '').replace(',', '.'));
      if (isNaN(shares) || shares === 0) {
        skip.parseErrors = (skip.parseErrors ?? 0) + 1;
        continue;
      }
      price    = 0;
      currency = String(row[resultCol] ?? '').trim() || 'USD';
      distributionsCounted++;

    } else if (actionType === 'split_open' || actionType === 'split_close') {
      // Same shift as distribution; price is in exchangeRateCol.
      const sharesRaw       = row[priceCurrCol];
      const exchangeRateRaw = row[exchangeRateCol];
      shares = typeof sharesRaw === 'number'
        ? sharesRaw
        : parseFloat(String(sharesRaw ?? '').replace(',', '.'));
      price  = typeof exchangeRateRaw === 'number'
        ? exchangeRateRaw
        : parseFloat(String(exchangeRateRaw ?? '').replace(',', '.'));
      if (isNaN(shares) || shares === 0) {
        skip.parseErrors = (skip.parseErrors ?? 0) + 1;
        continue;
      }
      if (isNaN(price)) price = 0;
      currency = String(row[resultCol] ?? '').trim() || 'USD';
      splitsCounted++;

    } else {
      // Market buy / Market sell / Limit buy / Limit sell
      const sharesRaw = row[sharesCol];
      const priceRaw  = row[priceCol];
      shares = typeof sharesRaw === 'number'
        ? sharesRaw
        : parseFloat(String(sharesRaw ?? '').replace(',', '.'));
      price  = typeof priceRaw === 'number'
        ? priceRaw
        : parseFloat(String(priceRaw ?? '').replace(',', '.'));
      if (isNaN(shares) || isNaN(price)) {
        skip.parseErrors = (skip.parseErrors ?? 0) + 1;
        continue;
      }
      currency = String(row[priceCurrCol] ?? '').trim() || 'USD';
    }

    // ── Sign shares and map to buy/sell ──────────────────────────────────────
    // T212 stores all quantities as positive — we must apply sign from action.
    // split_close and sell are "out" events → negative shares.
    const isSell = actionType === 'sell' || actionType === 'split_close';
    const signedShares = isSell ? -Math.abs(shares) : Math.abs(shares);
    const finalAction: 'buy' | 'sell' = isSell ? 'sell' : 'buy';

    trades.push({
      ticker,
      shares: signedShares,
      price,
      currency,
      date,
      action: finalAction,
    });
  }

  return {
    trades,
    skipSummary: skip,
    splitsCounted,
    distributionsCounted,
    transfersOutSkipped,
  };
}
