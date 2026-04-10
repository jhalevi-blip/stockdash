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
  // XLSX may return a JS Date if cellDates:true
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  // DD-MM-YYYY (DeGiro)
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  // MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // Already YYYY-MM-DD
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

    const lots = []; // { shares, costPerShare }
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
      results.push({
        symbol,
        closedShares:   Math.round(closedShares   * 100) / 100,
        totalBoughtEur: Math.round(totalBoughtEur * 100) / 100,
        totalSoldEur:   Math.round(totalSoldEur   * 100) / 100,
        pnl:            Math.round(realizedPnl    * 100) / 100,
        firstBuy,
        lastSell,
        openLots: lots.length,
      });
    }
  }

  return results.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    const ext = file.name?.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      return Response.json({ error: 'Unsupported file type. Use CSV or XLSX.' }, { status: 400 });
    }

    const buffer   = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (raw.length < 2) {
      return Response.json({ error: 'File appears to be empty' }, { status: 400 });
    }

    const headers  = raw[0];
    const dataRows = raw.slice(1);

    // Detect columns — supports DeGiro and generic formats
    const dateCol    = findCol(headers, ['datum', 'date', 'transactiedatum', 'trade date', 'transaction date', 'trade_date']);
    const symbolCol  = findCol(headers, ['symbool/isin', 'instrumentsymbool', 'symbool', 'symbol', 'ticker', 'isin']);
    const productCol = findCol(headers, ['product', 'description', 'name', 'instrument', 'security', 'omschrijving']);
    const actionCol  = findCol(headers, ['acties', 'action', 'type', 'transaction type', 'buy/sell', 'side']);
    const sharesCol  = findCol(headers, ['aantal', 'quantity', 'shares', 'qty', 'units', 'hoeveelheid', 'acties']);
    const priceCol   = findCol(headers, ['koers', 'price', 'unit price', 'prijs', 'execution price', 'koers eur']);
    const totalCol   = findCol(headers, ['totaal', 'total', 'boekingsbedrag', 'amount', 'net amount', 'waarde', 'consideration']);

    if (dateCol === -1 || sharesCol === -1) {
      return Response.json({
        error: `Could not detect required columns (date, shares). Headers found: ${headers.filter(Boolean).join(', ')}`,
      }, { status: 400 });
    }

    const transactions = [];
    for (const row of dataRows) {
      if (!row.some(v => v !== '')) continue;

      const rawShares  = parseNum(row[sharesCol]);
      if (!rawShares || rawShares === 0) continue;

      const rawDate    = row[dateCol];
      const rawPrice   = priceCol  !== -1 ? parseNum(row[priceCol])            : null;
      const rawTotal   = totalCol  !== -1 ? parseNum(row[totalCol])            : null;
      const rawAction  = actionCol !== -1 ? row[actionCol]                     : null;
      const rawSymbol  = symbolCol !== -1 ? String(row[symbolCol] ?? '').trim(): null;
      const rawProduct = productCol!== -1 ? String(row[productCol]?? '').trim(): null;

      // Use explicit symbol if short (ticker-like), else fall back to product name
      const symbol = (rawSymbol && rawSymbol.length >= 1 && rawSymbol.length <= 20 && !/^\d{12}$/.test(rawSymbol))
        ? rawSymbol
        : rawProduct ?? 'UNKNOWN';

      // Derive price: explicit price col, or |total| / |shares|
      let price = rawPrice != null && rawPrice > 0 ? rawPrice : null;
      if (price == null && rawTotal != null && rawShares !== 0) {
        price = Math.abs(rawTotal) / Math.abs(rawShares);
      }
      if (!price) continue;

      const action = detectAction(rawAction, rawShares);
      if (!action) continue;

      transactions.push({
        date:   parseDate(rawDate),
        symbol,
        action,
        shares: rawShares,
        price,
      });
    }

    if (!transactions.length) {
      return Response.json({
        error: 'No valid transactions found. Check that the file has date, shares, and price data.',
      }, { status: 400 });
    }

    const positions = calcFIFO(transactions);
    const totalPnl  = positions.reduce((s, p) => s + p.pnl, 0);

    console.log(`[transactions] parsed ${transactions.length} txs → ${positions.length} closed positions, total P&L: ${totalPnl.toFixed(2)}`);

    return Response.json({
      positions,
      totalPnl:  Math.round(totalPnl * 100) / 100,
      txCount:   transactions.length,
    });

  } catch (e) {
    console.error('[transactions] error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
