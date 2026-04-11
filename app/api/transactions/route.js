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

/** Parse one file buffer → array of transaction objects (with optional orderId). */
function parseFileBuffer(buffer, filename) {
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

  console.log(`[transactions] ${filename} columns:`, {
    dateCol, symbolCol, productCol, actionCol, sharesCol,
    priceCol, totalCol, orderIdCol, actiesCol, boekingsbedragCol, typeCol,
    isDeGiroAccount,
    headers: headers.map((h, i) => `${i}:${JSON.stringify(h)}`).join(' '),
  });

  if (isDeGiroAccount ? dateCol === -1 : (dateCol === -1 || sharesCol === -1)) {
    throw new Error(
      `${filename}: could not detect required columns. Headers found: ${headers.filter(Boolean).join(', ')}`
    );
  }

  const transactions = [];

  for (const row of dataRows) {
    if (!row.some(v => v !== '')) continue;

    if (isDeGiroAccount) {
      // Only process trade rows (Type = "Transactie")
      const rowType = typeCol !== -1 ? String(row[typeCol] ?? '').trim().toLowerCase() : 'transactie';
      if (rowType && rowType !== 'transactie') continue;

      const rawActies = String(row[actiesCol] ?? '').trim();
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

  return transactions;
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

    const fileStats   = [];  // { name, txCount } per file
    const allTxs      = [];  // merged across all files
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
      let txs;
      try {
        txs = parseFileBuffer(buffer, file.name);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }

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
      console.log(`[transactions] ${file.name}: ${added} txs (${txs.length - added} deduped)`);
    }

    if (!allTxs.length) {
      return Response.json(
        { error: 'No valid transactions found across uploaded files.' },
        { status: 400 }
      );
    }

    console.log('[transactions] parsed sample:', JSON.stringify(
      allTxs.slice(0, 10).map(t => ({
        symbol: t.symbol, action: t.action, shares: t.shares, price: t.price, date: t.date,
      }))
    ));
    // Per-symbol buy/sell summary for FIFO debugging
    const bySymDbg = {};
    for (const t of allTxs) {
      if (!bySymDbg[t.symbol]) bySymDbg[t.symbol] = { buys: 0, sells: 0 };
      if (t.action === 'buy') bySymDbg[t.symbol].buys += t.shares;
      else bySymDbg[t.symbol].sells += t.shares;
    }
    console.log('[transactions] symbol summary:', JSON.stringify(bySymDbg));

    // Cash flows for client-side capitalAtStart recalculation on date changes
    const cashFlows = allTxs.map(tx => ({
      date:   tx.date,
      action: tx.action,
      amount: Math.round(Math.abs(tx.shares) * Math.abs(tx.price) * 100) / 100,
    }));

    // Running cash balance: sells replenish available cash, buys draw it down first.
    // Only the portion of a buy that exceeds available cash is genuinely new capital.
    const sortedFlows = [...cashFlows]
      .filter(cf => cf.date)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.action === 'sell' ? -1 : 1));

    let cashBalance = 0;
    const netFlows = [];
    for (const cf of sortedFlows) {
      if (cf.action === 'sell') {
        cashBalance += cf.amount;
      } else if (cf.action === 'buy') {
        const newCapital = Math.max(0, cf.amount - cashBalance);
        cashBalance = Math.max(0, cashBalance - cf.amount);
        if (newCapital > 0.01) {
          netFlows.push({ date: cf.date, amountEUR: Math.round(newCapital * 100) / 100 });
        }
      }
    }

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

    console.log(`[transactions] total ${allTxs.length} txs → ${positions.length} closed, ${partialPositions.length} partial, P&L: ${totalPnl.toFixed(2)}, capitalAtStart: ${capitalAtStart}`);

    return Response.json({
      positions,
      partialPositions,
      totalPnl:       Math.round(totalPnl * 100) / 100,
      txCount:        allTxs.length,
      files:          fileStats,
      cashFlows,
      netFlows,
      capitalAtStart,
    });

  } catch (e) {
    console.error('[transactions] error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
