// Map an FMP/Finnhub exchange label to the currency its quotes are denominated in.
//
// FMP's /stable/quote has no `currency` field — only `exchange`. On the Starter
// plan only US-listed lines resolve (NASDAQ/NYSE/…), so quotes are effectively
// always USD; this map makes that explicit and lets the dashboard refuse to value
// a non-USD holding against a USD quote (no ADR substitution).
//
// Unknown exchange → null: the caller treats "unknown quote currency" as a
// mismatch (shows "no price"), never as an assumed USD — failing safe.

const EXCHANGE_CURRENCY = {
  // United States → USD
  NASDAQ: 'USD', 'NASDAQ GLOBAL MARKET': 'USD', 'NASDAQ GLOBAL SELECT': 'USD',
  'NASDAQ CAPITAL MARKET': 'USD', NMS: 'USD', NGS: 'USD', NCM: 'USD',
  NYSE: 'USD', 'NEW YORK STOCK EXCHANGE': 'USD', 'NYSE AMERICAN': 'USD',
  AMEX: 'USD', 'NYSE ARCA': 'USD', ARCA: 'USD', BATS: 'USD', CBOE: 'USD',
  OTC: 'USD', 'PINK SHEETS': 'USD', PNK: 'USD', 'US': 'USD',
  // Europe
  'LSE': 'GBX', 'LONDON STOCK EXCHANGE': 'GBX', 'LON': 'GBX', // LSE quotes in pence
  'EURONEXT': 'EUR', 'EURONEXT AMSTERDAM': 'EUR', 'EURONEXT PARIS': 'EUR',
  'EURONEXT BRUSSELS': 'EUR', 'EURONEXT LISBON': 'EUR', 'AMS': 'EUR', 'PAR': 'EUR',
  'XETRA': 'EUR', 'FRANKFURT': 'EUR', 'DEUTSCHE BORSE': 'EUR', 'FWB': 'EUR', 'GER': 'EUR',
  'BORSA ITALIANA': 'EUR', 'MILAN': 'EUR', 'BME': 'EUR', 'MADRID': 'EUR',
  // Other
  'TSX': 'CAD', 'TORONTO': 'CAD', 'SIX': 'CHF', 'SWISS': 'CHF',
  'TSE': 'JPY', 'TOKYO': 'JPY', 'JPX': 'JPY',
};

/** @returns {string|null} ISO/quasi currency code for the exchange, or null if unknown. */
export function exchangeCurrency(exchange) {
  if (!exchange) return null;
  const key = String(exchange).trim().toUpperCase();
  return EXCHANGE_CURRENCY[key] ?? null;
}
