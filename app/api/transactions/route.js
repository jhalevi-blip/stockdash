import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

function norm(h) {
  return String(h ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function findCol(headers, candidates) {
  const nh = headers.map(norm);
  for (const c of candidates) {
    const i = nh.indexOf(norm(c));
    if (i !== -1) return i;
  }
  return -1;
}

function parseDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  return isNaN(dt) ? s : dt.toISOString().slice(0, 10);
}

function parseNum(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[€$£\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function detectAction(rawAction, rawShares) {
  if (rawAction != null) {
    const s = String(rawAction).toLowerCase().trim();
    if (s.includes('koop') || s.includes('buy') || s.includes('purchase') || s === 'b') return 'buy';
    if (s.includes('verkoop') || s.includes('sell') || s.includes('sale') || s === 's') return 'sell';
  }
  if (rawShares != null) return rawShares > 0 ? 'buy' : 'sell';
  return null;
}

/** Resolve ISINs → tickers via OpenFIGI. Server-safe (direct fetch, no relative URL). */
async function resolveIsinsServerSide(isins) {
  if (!isins.length) return new Map();
  const unique   = [...new Set(isins)];
  const resolved = new Map();
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    try {
      const res = await fetch('https://api.openfigi.com/v3/mapping', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(batch.map(isin => ({ idType: 'ID_ISIN', idValue: isin }))),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (let j = 0; j < batch.length; j++) {
        const entry = data[j];
        if (!entry || entry.error || !entry.data?.length) continue;
        const preferred = entry.data.find(d => d.exchCode === 'US') ?? entry.data[0];
        if (preferred?.ticker) resolved.set(batch[j], preferred.ticker);
      }
    } catch { /* skip failed batch */ }
  }
  return resolved;
}

/** Parse DeGiro Rekeningoverzicht (account statement) sheet. */
async function parseDeGiroRekeningoverzicht(workbook, filename) {
  const sheetName = workbook.SheetNames.find(n => n === 'Rekeningoverzicht');
  const sheet = workbook.Sheets[sheetName];
  const raw   = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (raw.length < 2) return { transactions: [], deposits: [], dividends: [], fees: [], unresolvedIsins: [] };

  const headers  = raw[0];
  const dataRows = raw.slice(1);

  const datumCol   = findCol(headers, ['datum']);
  const productCol = findCol(headers, ['product']);
  const isinCol    = findCol(headers, ['isin']);
  const omschrCol  = findCol(headers, ['omschrijving']);
  const mutatieCol = findCol(headers, ['mutatie']);
  const amountCol  = mutatieCol >= 0 ? mutatieCol + 1 : -1;
  const orderIdCol = findCol(headers, ['order id', 'orderid', 'order-id']);

  const transactions = [];
  const deposits     = [];
  const dividends    = [];
  const fees         = [];

  // Pass 1: bucket rows by Order Id; collect ISINs from trade rows
  const groups      = new Map(); // orderId -> rows[]
  const noOrderRows = [];
  const tradeIsins  = new Set();

  for (const row of dataRows) {
    if (!row.some(v => v !== '')) continue;
    const orderId = orderIdCol !== -1 ? String(row[orderIdCol] ?? '').trim() : '';
    const omschr  = omschrCol  !== -1 ? String(row[omschrCol]  ?? '').trim() : '';
    if (orderId) {
      if (!groups.has(orderId)) groups.set(orderId, []);
      groups.get(orderId).push(row);
      if (/^(koop|verkoop)\s/i.test(omschr)) {
        const isin = isinCol !== -1 ? String(row[isinCol] ?? '').trim() : '';
        if (isin) tradeIsins.add(isin);
      }
    } else {
      noOrderRows.push(row);
    }
  }

  // Pass 2: batch-resolve all ISINs via OpenFIGI
  const isinMap = await resolveIsinsServerSide([...tradeIsins]);

  // Pass 3: process each Order Id group → transactions + fees
  const unresolvedIsins = [];
  const seenUnresolved  = new Set();

  for (const [orderId, rows] of groups) {
    let action = null, totalShares = 0, totalEurAmt = 0;
    let date = null, isin = '', product = '';
    let hasTrade = false;

    for (const row of rows) {
      const omschr    = omschrCol  !== -1 ? String(row[omschrCol]  ?? '').trim() : '';
      const omschrLow = omschr.toLowerCase();
      const mutatie   = mutatieCol !== -1 ? String(row[mutatieCol] ?? '').trim().toUpperCase() : '';
      const amount    = amountCol  >= 0   ? parseNum(row[amountCol]) : null;

      // Fee rows (DEGIRO Transactiekosten)
      if (omschrLow.includes('transactiekosten')) {
        const feeDate = datumCol !== -1 ? parseDate(row[datumCol]) : null;
        if (amount != null) fees.push({ date: feeDate, amountEur: Math.abs(amount) });
        continue;
      }

      // Trade rows: extract action, shares, ISIN; capture EUR amount if EUR-denominated trade
      const tradeMatch = omschr.match(/^(koop|verkoop)\s+([\d.,]+)/i);
      if (tradeMatch) {
        if (!date)    date    = datumCol   !== -1 ? parseDate(row[datumCol])             : null;
        if (!action)  action  = tradeMatch[1].toLowerCase() === 'koop' ? 'buy' : 'sell';
        if (!isin)    isin    = isinCol    !== -1 ? String(row[isinCol]    ?? '').trim() : '';
        if (!product) product = productCol !== -1 ? String(row[productCol] ?? '').trim() : '';
        const s = parseNum(tradeMatch[2]);
        if (s) totalShares += s;
        // EUR-denominated instruments: the trade row itself carries the EUR amount
        if (mutatie === 'EUR' && amount != null) totalEurAmt += amount;
        hasTrade = true;
        continue;
      }

      // All other rows: accumulate EUR legs
      // USD buy → Valuta Debitering EUR row (negative); USD sell → Valuta Creditering EUR row (positive)
      if (mutatie === 'EUR' && amount != null) totalEurAmt += amount;
    }

    if (!hasTrade || totalShares === 0 || totalEurAmt === 0) continue;

    if (!isin || !isinMap.has(isin)) {
      if (isin && !seenUnresolved.has(isin)) {
        unresolvedIsins.push(isin);
        seenUnresolved.add(isin);
      }
      continue;
    }

    const ticker = isinMap.get(isin);
    const price  = Math.abs(totalEurAmt) / totalShares;
    transactions.push({ date, symbol: ticker, action, shares: totalShares, price, orderId });
  }

  // Pass 4: no-Order-Id rows → deposits, dividends, standalone fees
  for (const row of noOrderRows) {
    const omschr    = omschrCol  !== -1 ? String(row[omschrCol]  ?? '').trim() : '';
    const omschrLow = omschr.toLowerCase();
    const mutatie   = mutatieCol !== -1 ? String(row[mutatieCol] ?? '').trim().toUpperCase() : '';
    const amount    = amountCol  >= 0   ? parseNum(row[amountCol]) : null;
    const date      = datumCol   !== -1 ? parseDate(row[datumCol]) : null;
    if (amount == null || mutatie !== 'EUR') continue;

    if (omschrLow === 'ideal deposit') {
      if (amount > 0) deposits.push({ date, amountEur: amount });
    } else if (omschrLow === 'flatex interest income') {
      if (amount > 0) dividends.push({ date, amountEur: amount });
    } else if (omschrLow.startsWith('degiro aansluitingskosten') || omschrLow.startsWith('degiro verbindingskosten') || omschrLow === 'service fee') {
      if (amount < 0) fees.push({ date, amountEur: Math.abs(amount) });
    }
  }

  return { transactions, deposits, dividends, fees, unresolvedIsins };
}

/** Parse one file buffer → array of transaction objects (with optional orderId). */
async function parseFileBuffer(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (workbook.SheetNames.includes('Rekeningoverzicht')) {
    return parseDeGiroRekeningoverzicht(workbook, filename);
  }
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

function calcFIFO(transactions) {
  const bySymbol = {};
  for (const tx of transactions) {
    if (!tx.symbol || !tx.action || !tx.shares || tx.shares === 0) continue;
    if (!bySymbol[tx.symbol]) bySymbol[tx.symbol] = [];
    bySymbol[tx.symbol].push(tx);
  }

  const results = [];

  for (const [symbol, txs] of Object.entries(bySymbol)) {
    txs.sort((a, b) => new Date(a.date) - new Date(b.date));

    const lots = [];
    let totalBoughtEur = 0, totalSoldEur = 0, realizedPnl = 0;
    let firstBuy = null, lastSell = null, closedShares = 0;

    for (const tx of txs) {
      const shares = Math.abs(tx.shares);
      const price  = Math.abs(tx.price ?? 0);

      if (tx.action === 'buy') {
        lots.push({ shares, costPerShare: price });
        totalBoughtEur += shares * price;
        if (!firstBuy) firstBuy = tx.date;
      } else if (tx.action === 'sell') {
        lastSell = tx.date;
        totalSoldEur += shares * price;
        let remaining = shares;

        while (remaining > 1e-9 && lots.length > 0) {
          const lot    = lots[0];
          const filled = Math.min(lot.shares, remaining);
          realizedPnl  += filled * (price - lot.costPerShare);
          closedShares += filled;
          lot.shares   -= filled;
          remaining    -= filled;
          if (lot.shares < 1e-9) lots.shift();
        }
      }
    }

    if (lastSell && closedShares > 0.001) {
      const remainingShares = lots.reduce((s, l) => s + l.shares, 0);
      results.push({
        symbol,
        closedShares:    Math.round(closedShares    * 100) / 100,
        totalBoughtEur:  Math.round(totalBoughtEur  * 100) / 100,
        totalSoldEur:    Math.round(totalSoldEur    * 100) / 100,
        pnl:             Math.round(realizedPnl     * 100) / 100,
        firstBuy,
        lastSell,
        openLots:        lots.length,
        remainingShares: Math.round(remainingShares * 100) / 100,
        status:          remainingShares > 0.001 ? 'partial' : 'closed',
      });
    }
  }

  return results.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

export async function POST(request) {
  try {
    const formData   = await request.formData();
    const files      = formData.getAll('file');
    const reqStartDate = formData.get('startDate') || null;

    if (!files.length) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }

    const fileStats    = [];  // { name, txCount } per file
    const allTxs             = [];  // merged across all files
    const allUnresolvedIsins = [];
    const allDeposits  = [];
    const allDividends = [];
    const allFees      = [];
    const seenOrderIds = new Set();

    for (const file of files) {
      const ext = file.name?.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        return Response.json(
          { error: `Unsupported file type "${file.name}". Use CSV or XLSX.` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      let txs, fileDeps, fileDivs, fileFees, fileUnresolved;
      try {
        ({ transactions: txs, deposits: fileDeps, dividends: fileDivs, fees: fileFees, unresolvedIsins: fileUnresolved = [] } = await parseFileBuffer(buffer, file.name));
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }

      allDeposits.push(...fileDeps);
      allDividends.push(...fileDivs);
      allFees.push(...fileFees);
      allUnresolvedIsins.push(...fileUnresolved);

      // Deduplicate by Order ID across files
      let added = 0;
      for (const tx of txs) {
        if (tx.orderId) {
          if (seenOrderIds.has(tx.orderId)) continue;
          seenOrderIds.add(tx.orderId);
        }
        allTxs.push(tx);
        added++;
      }

      fileStats.push({ name: file.name, txCount: added });
    }

    if (!allTxs.length) {
      return Response.json(
        { error: 'No valid transactions found across uploaded files.' },
        { status: 400 }
      );
    }

    // Cash flows for client-side capitalAtStart recalculation on date changes
    const cashFlows = allTxs.map(tx => ({
      date:   tx.date,
      action: tx.action,
      amount: Math.round(Math.abs(tx.shares) * Math.abs(tx.price) * 100) / 100,
    }));

    // Server-side capitalAtStart when startDate is provided
    let capitalAtStart = null;
    if (reqStartDate) {
      const net = cashFlows
        .filter(cf => cf.date && cf.date <= reqStartDate)
        .reduce((s, cf) => s + (cf.action === 'buy' ? cf.amount : -cf.amount), 0);
      capitalAtStart = Math.round(Math.max(0, net) * 100) / 100;
    }

    const allPositions     = calcFIFO(allTxs);
    const positions        = allPositions.filter(p => p.status === 'closed');
    const partialPositions = allPositions.filter(p => p.status === 'partial');
    const totalPnl         = positions.reduce((s, p) => s + p.pnl, 0);

    const positionsSinceStart = reqStartDate
      ? positions.filter(p => p.firstBuy != null && p.firstBuy >= reqStartDate)
      : null;
    const totalPnlSinceStart = positionsSinceStart != null
      ? Math.round(positionsSinceStart.reduce((s, p) => s + p.pnl, 0) * 100) / 100
      : null;

    const totalDeposited  = Math.round(allDeposits.reduce((s, d)  => s + d.amountEur, 0) * 100) / 100;
    const totalDividends  = Math.round(allDividends.reduce((s, d) => s + d.amountEur, 0) * 100) / 100;
    const totalFees       = Math.round(allFees.reduce((s, d)      => s + d.amountEur, 0) * 100) / 100;

    return Response.json({
      positions,
      partialPositions,
      totalPnl:            Math.round(totalPnl * 100) / 100,
      totalPnlSinceStart,
      txCount:             allTxs.length,
      files:               fileStats,
      cashFlows,
      capitalAtStart,
      deposits:            allDeposits,
      dividends:           allDividends,
      fees:                allFees,
      totalDeposited,
      totalDividends,
      totalFees,
      unresolvedIsins: [...new Set(allUnresolvedIsins)],
    });

  } catch (e) {
    console.error('[transactions] error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
