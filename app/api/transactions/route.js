import { parseFileBuffer, calcFIFO } from '@/lib/brokerParsers';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const formData   = await request.formData();
    const files      = formData.getAll('file');
    const reqStartDate = formData.get('startDate') || null;

    if (!files.length) {
      return Response.json({ error: 'No files provided' }, { status: 400 });
    }

    const fileStats    = [];  // { name, txCount } per file
    const allTxs       = [];  // merged across all files
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
      let txs, fileDeps, fileDivs, fileFees;
      try {
        ({ transactions: txs, deposits: fileDeps, dividends: fileDivs, fees: fileFees } = parseFileBuffer(buffer, file.name));
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }

      allDeposits.push(...fileDeps);
      allDividends.push(...fileDivs);
      allFees.push(...fileFees);

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
    });

  } catch (e) {
    console.error('[transactions] error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
