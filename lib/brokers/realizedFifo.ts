import type { BrokerTrade } from './types';

export interface FIFOResult {
  symbol:          string;
  closedShares:    number;
  totalBoughtEur:  number;
  totalSoldEur:    number;
  pnl:             number;
  firstBuy:        string | null;
  lastSell:        string | null;
  openLots:        number;
  remainingShares: number;
  status:          'closed' | 'partial';
}

/**
 * FIFO realized P&L calculator.
 * Accepts BrokerTrade[] (ticker field) — same logic as calcFIFO in /api/transactions/route.js.
 * Only symbols that have at least one sell are included in output.
 * Results are sorted by |pnl| descending.
 */
export function calcFIFO(trades: BrokerTrade[]): FIFOResult[] {
  const bySymbol: Record<string, BrokerTrade[]> = {};

  for (const tx of trades) {
    if (!tx.ticker || !tx.action || !tx.shares || tx.shares === 0) continue;
    if (!bySymbol[tx.ticker]) bySymbol[tx.ticker] = [];
    bySymbol[tx.ticker].push(tx);
  }

  const results: FIFOResult[] = [];

  for (const [symbol, txs] of Object.entries(bySymbol)) {
    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const lots: Array<{ shares: number; costPerShare: number }> = [];
    let totalBoughtEur = 0, totalSoldEur = 0, realizedPnl = 0;
    let firstBuy: string | null = null, lastSell: string | null = null, closedShares = 0;

    for (const tx of txs) {
      const shares = Math.abs(tx.shares);
      const price  = Math.abs(tx.price ?? 0);

      if (tx.action === 'buy') {
        lots.push({ shares, costPerShare: price });
        totalBoughtEur += shares * price;
        if (!firstBuy) firstBuy = tx.date || null;
      } else if (tx.action === 'sell') {
        lastSell = tx.date || null;
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
