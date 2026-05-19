export type BrokerFormat = 'saxo' | 'degiro' | 'generic';

export interface BrokerTrade {
  ticker: string;
  /** Positive = buy, negative = sell */
  shares: number;
  price: number;
  currency: string;
  date: string; // ISO YYYY-MM-DD, empty string if unknown
  action: 'buy' | 'sell';
}

export interface NormalizedPosition {
  t: string;
  s: number;
  c: number;
  d?: string;
  currency: string;
  broker: BrokerFormat;
}

export interface SkipSummary {
  // Generic parser keys (kept so PortfolioModal ?? 0 fallback keeps working)
  missingTicker?: number;
  tickerTooLong?: number;
  invalidShares?: number;
  invalidCost?: number;
  // Broker-specific
  optionsSkipped?: number;
  expirySkipped?: number;
  netZero?: number;
  dividendsSkipped?: number;
  cashTransfersSkipped?: number;
  parseErrors?: number;
  sellsWithoutBuys?: number;
  sellsWithoutBuysTickers?: string[];
}
