export const HOLDINGS = [];

/**
 * Parse ?tickers=AMD,AMZN,SOFI into [{ t, n }] objects.
 * Name defaults to ticker if not provided.
 */
export function parseTickers(searchParams) {
  const raw = searchParams?.get?.('tickers') ?? '';
  if (!raw.trim()) return [];
  return raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).map(t => ({ t, n: t }));
}

/**
 * Parse ?holdings=AMD:100:50.00,AMZN:10:180.00 into full holding objects.
 * Format: TICKER:shares:avgCost
 */
export function parseHoldings(searchParams) {
  const raw = searchParams?.get?.('holdings') ?? '';
  if (!raw.trim()) return [];
  return raw.split(',').map(entry => {
    const [t, s, c] = entry.trim().split(':');
    if (!t) return null;
    return { t: t.toUpperCase(), n: t.toUpperCase(), s: parseFloat(s) || 0, c: parseFloat(c) || 0 };
  }).filter(Boolean);
}
