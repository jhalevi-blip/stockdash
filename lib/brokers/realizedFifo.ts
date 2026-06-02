import type { BrokerTrade } from './types';
import { STOCK_SPLITS } from './splits';

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
    // Same tiebreaker as aggregateFIFO: buys before sells on the same day.
    txs.sort((a, b) => {
      const da = new Date(a.date).getTime(), db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      if (a.action === 'buy'  && b.action === 'sell') return -1;
      if (a.action === 'sell' && b.action === 'buy')  return  1;
      return 0;
    });

    const lots: Array<{ shares: number; costPerShare: number }> = [];
    let totalBoughtEur = 0, totalSoldEur = 0, realizedPnl = 0;
    let firstBuy: string | null = null, lastSell: string | null = null, closedShares = 0;

    // Stock splits for this symbol — apply each once, to the lots open at the time
    // the split's effective date is reached. Brokers that book pre-split buys and
    // post-split sells (e.g. Saxo AVGO: buy 3 then sell 30) otherwise orphan shares.
    const symbolSplits = STOCK_SPLITS[symbol] ?? [];
    const appliedSplits = new Set<string>();

    for (const tx of txs) {
      // Before processing this trade, fire any not-yet-applied split whose effective
      // date is on/before the trade's date, scaling the CURRENT open lots:
      // shares × ratio, costPerShare ÷ ratio (total cost basis preserved).
      for (const sp of symbolSplits) {
        const key = `${sp.date}__${sp.ratio}`;
        if (!appliedSplits.has(key) && tx.date && sp.date <= tx.date) {
          for (const lot of lots) {
            lot.shares      *= sp.ratio;
            lot.costPerShare /= sp.ratio;
          }
          appliedSplits.add(key);
        }
      }

      const shares = Math.abs(tx.shares);
      // EUR per share: prefer the trade's absolute EUR cash value (Saxo Boekingsbedrag,
      // DeGiro native ÷ FX); fall back to native price so other brokers are unchanged.
      const eurPerShare = (tx.amountEur != null && shares > 0)
        ? tx.amountEur / shares
        : Math.abs(tx.price ?? 0);

      if (tx.action === 'buy') {
        lots.push({ shares, costPerShare: eurPerShare });
        if (!firstBuy) firstBuy = tx.date || null;
      } else if (tx.action === 'sell') {
        lastSell = tx.date || null;
        let remaining = shares;

        // Accumulate proceeds AND cost ONLY for shares matched against a buy lot.
        // Orphan (unmatched) sell shares — e.g. a pre-window or split-inflated sell
        // with no buy — contribute nothing to proceeds, cost, or pnl.
        while (remaining > 1e-9 && lots.length > 0) {
          const lot    = lots[0];
          const filled = Math.min(lot.shares, remaining);
          totalSoldEur   += filled * eurPerShare;
          totalBoughtEur += filled * lot.costPerShare;
          realizedPnl    += filled * (eurPerShare - lot.costPerShare);
          closedShares   += filled;
          lot.shares     -= filled;
          remaining      -= filled;
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
