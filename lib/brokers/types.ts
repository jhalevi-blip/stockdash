export type BrokerFormat = 'saxo' | 'degiro' | 'trading212' | 'ibkr' | 'rabobank' | 'schwab' | 'generic';

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
  unresolvedIsins?: number;
  unresolvedIsinsList?: string[];
  transfersOutSkipped?: number;
  splitsCounted?: number;
  distributionsCounted?: number;
  fxConversionsSkipped?: number;
  fallbackTickers?: number;
  fallbackTickersList?: string[];
  corporateActionsSkipped?: number;
  corporateActionsHeld?: number;
  corporateActionsHeldTypes?: string[];
}

export type FileIntent = 'transactions' | 'holdings';

export interface DetectResult {
  format: BrokerFormat;
  intent: FileIntent;
  /** certain = named broker (always transactions); inferred = column heuristic matched;
   *  ambiguous = heuristic inconclusive, UI should prompt user */
  intentConfidence: 'certain' | 'inferred' | 'ambiguous';
}
