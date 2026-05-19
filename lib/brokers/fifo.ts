import type { BrokerTrade, BrokerFormat, NormalizedPosition } from './types';

interface Lot {
  shares: number; // always positive, represents remaining shares in this lot
  price: number;
  date: string;
  currency: string;
}

export function aggregateFIFO(
  trades: BrokerTrade[],
  broker: BrokerFormat
): {
  positions: NormalizedPosition[];
  netZeroTickers: string[];
  sellsWithoutBuysTickers: string[];
} {
  // Group trades by ticker
  const byTicker = new Map<string, BrokerTrade[]>();
  for (const trade of trades) {
    if (!byTicker.has(trade.ticker)) byTicker.set(trade.ticker, []);
    byTicker.get(trade.ticker)!.push(trade);
  }

  const positions: NormalizedPosition[] = [];
  const netZeroTickers: string[] = [];
  const sellsWithoutBuysTickers: string[] = [];

  for (const [ticker, tickerTrades] of byTicker) {
    // Sort chronologically so FIFO consumes oldest lots first
    const sorted = [...tickerTrades].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );

    const lots: Lot[] = [];
    let hadBuys = false;
    let hadUnmatchedSell = false;

    for (const trade of sorted) {
      const absShares = Math.abs(trade.shares);

      if (trade.action === 'buy') {
        hadBuys = true;
        lots.push({
          shares: absShares,
          price: trade.price,
          date: trade.date,
          currency: trade.currency,
        });
      } else {
        // Sell: consume from oldest lots first (FIFO)
        let remaining = absShares;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          if (lot.shares <= remaining) {
            remaining -= lot.shares;
            lots.shift();
          } else {
            lot.shares -= remaining;
            remaining = 0;
          }
        }
        // remaining > 0 means the sell exceeded available buy lots
        if (remaining > 1e-9) hadUnmatchedSell = true;
      }
    }

    const netShares = lots.reduce((sum, l) => sum + l.shares, 0);

    if (netShares <= 1e-9) {
      // Distinguish: sell-without-buy vs true round-trip
      if (hadUnmatchedSell || !hadBuys) {
        // Sell exceeded buy history — bought before this export's date range
        sellsWithoutBuysTickers.push(ticker);
      } else {
        // True round-trip: buys fully matched by sells
        netZeroTickers.push(ticker);
      }
      continue;
    }

    // Weighted average cost of remaining lots
    const totalCost = lots.reduce((sum, l) => sum + l.shares * l.price, 0);
    const avgCost   = totalCost / netShares;

    // Date of the oldest remaining lot (when this position was opened/last topped up)
    const oldestDate = lots[0]?.date ?? '';

    // Currency from the first remaining lot (all lots for one ticker share a currency in Saxo)
    const currency = lots[0]?.currency ?? 'USD';

    positions.push({
      t: ticker,
      // Round to avoid floating-point dust in the share count
      s: Math.round(netShares * 1e8) / 1e8,
      c: Math.round(avgCost   * 1e6) / 1e6,
      d: oldestDate || undefined,
      currency,
      broker,
    });
  }

  return { positions, netZeroTickers, sellsWithoutBuysTickers };
}
