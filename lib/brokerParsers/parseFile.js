import * as XLSX from 'xlsx';
import { norm, findCol, parseDate, parseNum, detectAction } from './normalize.js';

/** Parse one file buffer → array of transaction objects (with optional orderId). */
export function parseFileBuffer(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (raw.length < 2) throw new Error(`${filename}: file appears to be empty`);

  const headers  = raw[0];
  const dataRows = raw.slice(1);

  let dateCol    = findCol(headers, ['datum', 'date', 'transactiedatum', 'trade date', 'transaction date', 'trade_date']);
  let symbolCol  = findCol(headers, ['symbool/isin', 'instrumentsymbool', 'symbool', 'symbol', 'ticker', 'isin']);
  let productCol = findCol(headers, ['product', 'description', 'name', 'instrument', 'security', 'omschrijving']);
  let actionCol  = findCol(headers, ['acties', 'action', 'type', 'transaction type', 'buy/sell', 'side']);
  let sharesCol  = findCol(headers, ['aantal', 'quantity', 'shares', 'qty', 'units', 'hoeveelheid']);
  let priceCol   = findCol(headers, ['koers', 'price', 'unit price', 'prijs', 'execution price', 'koers eur']);
  let totalCol   = findCol(headers, ['totaal', 'total', 'boekingsbedrag', 'amount', 'net amount', 'waarde', 'consideration']);
  let orderIdCol = findCol(headers, ['order id', 'orderid', 'order_id', 'order-id', 'reference', 'ref', 'trade id', 'tradeid']);
  let actiesCol         = findCol(headers, ['acties']);
  let boekingsbedragCol = findCol(headers, ['boekingsbedrag']);
  let typeCol           = findCol(headers, ['type']);

  // Exact-match fallback: DeGiro Dutch headers may have encoding quirks that trip norm()
  headers.forEach((h, i) => {
    const lh = String(h ?? '').toLowerCase().trim();
    if (lh === 'transactiedatum'  && dateCol           === -1) dateCol           = i;
    if (lh === 'instrumentsymbool'&& symbolCol         === -1) symbolCol         = i;
    if (lh === 'acties'           && actiesCol         === -1) actiesCol         = i;
    if (lh === 'boekingsbedrag'   && boekingsbedragCol === -1) boekingsbedragCol = i;
    if ((lh === 'order-id' || lh === 'orderid') && orderIdCol === -1) orderIdCol = i;
    if (lh === 'type'             && typeCol           === -1) typeCol           = i;
  });

  // DeGiro account statement format: shares are embedded in "Acties" text ("Koop 10 @ 150,00 USD")
  const isDeGiroAccount = actiesCol !== -1 && boekingsbedragCol !== -1;

  if (isDeGiroAccount ? dateCol === -1 : (dateCol === -1 || sharesCol === -1)) {
    throw new Error(
      `${filename}: could not detect required columns. Headers found: ${headers.filter(Boolean).join(', ')}`
    );
  }

  const transactions = [];
  const deposits     = [];
  const dividends    = [];
  const fees         = [];

  for (const row of dataRows) {
    if (!row.some(v => v !== '')) continue;

    if (isDeGiroAccount) {
      const rowType   = typeCol   !== -1 ? String(row[typeCol]   ?? '').trim().toLowerCase() : '';
      const actiesRaw = actiesCol !== -1 ? String(row[actiesCol] ?? '').trim()               : '';
      const actiesLow = actiesRaw.toLowerCase();

      // Non-trade rows: deposits, dividends, fees
      if (rowType !== 'transactie') {
        const amount = boekingsbedragCol !== -1 ? parseNum(row[boekingsbedragCol]) : null;
        const date   = dateCol !== -1 ? parseDate(row[dateCol]) : null;

        if (rowType === 'geldoverboeking' && actiesLow === 'storting') {
          if (amount != null && amount > 0) deposits.push({ date, amountEur: amount });
        } else if (rowType === 'corporate action') {
          if (amount != null && amount > 0) dividends.push({ date, amountEur: amount });
        } else if (actiesLow.includes('service fee') || actiesLow.includes('factureringsbedragen')) {
          if (amount != null) fees.push({ date, amountEur: Math.abs(amount) });
        }
        continue;
      }

      const rawActies = actiesRaw;
      if (!rawActies) continue;

      // Parse "Koop 1800 @ 17.30 USD" or "Verkoop -1800 @ 17.36 USD"
      const actiesMatch = rawActies.match(/^(koop|verkoop)\s+(-?[\d.,]+)/i);
      if (!actiesMatch) continue;

      const action = actiesMatch[1].toLowerCase() === 'koop' ? 'buy' : 'sell';
      const shares = Math.abs(parseNum(actiesMatch[2]));
      if (!shares || shares === 0) continue;

      const rawSymbol  = symbolCol  !== -1 ? String(row[symbolCol]  ?? '').trim() : '';
      const rawProduct = productCol !== -1 ? String(row[productCol] ?? '').trim() : '';

      // Skip options/derivatives (symbol contains "/")
      if (rawSymbol.includes('/')) continue;

      // Extract ticker before ":" (e.g. "SOFI:xnas" → "SOFI")
      const symbol = rawSymbol
        ? rawSymbol.split(':')[0].trim()
        : rawProduct || 'UNKNOWN';

      if (!symbol) continue;

      const rawTotal = parseNum(row[boekingsbedragCol]);
      if (rawTotal == null) continue;
      const price = Math.abs(rawTotal) / shares;
      if (!price) continue;

      const rawOrderId = orderIdCol !== -1 ? String(row[orderIdCol] ?? '').trim() : null;

      transactions.push({
        date:    parseDate(row[dateCol]),
        symbol,
        action,
        shares,
        price,
        orderId: rawOrderId || null,
      });

    } else {
      // Generic / DeGiro transactions export format
      const rawShares = parseNum(row[sharesCol]);
      if (!rawShares || rawShares === 0) continue;

      const rawDate    = row[dateCol];
      const rawPrice   = priceCol   !== -1 ? parseNum(row[priceCol])             : null;
      const rawTotal   = totalCol   !== -1 ? parseNum(row[totalCol])             : null;
      const rawAction  = actionCol  !== -1 ? row[actionCol]                      : null;
      const rawSymbol  = symbolCol  !== -1 ? String(row[symbolCol]  ?? '').trim(): null;
      const rawProduct = productCol !== -1 ? String(row[productCol] ?? '').trim(): null;
      const rawOrderId = orderIdCol !== -1 ? String(row[orderIdCol] ?? '').trim(): null;

      const symbol = (rawSymbol && rawSymbol.length >= 1 && rawSymbol.length <= 20 && !/^\d{12}$/.test(rawSymbol))
        ? rawSymbol
        : rawProduct ?? 'UNKNOWN';

      let price = rawPrice != null && rawPrice > 0 ? rawPrice : null;
      if (price == null && rawTotal != null && rawShares !== 0) {
        price = Math.abs(rawTotal) / Math.abs(rawShares);
      }
      if (!price) continue;

      const action = detectAction(rawAction, rawShares);
      if (!action) continue;

      transactions.push({
        date:    parseDate(rawDate),
        symbol,
        action,
        shares:  rawShares,
        price,
        orderId: rawOrderId || null,
      });
    }
  }

  return { transactions, deposits, dividends, fees };
}
