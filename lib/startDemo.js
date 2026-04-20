export const WELCOME_TICKERS = {
  tickers: ['NVDA', 'TSLA', 'AAPL', 'AMZN', 'AMD'],
  shares:  [50, 30, 20, 15, 10],
};

// Aliases so existing importers (analyst pages etc.) don't need updating
export const DEMO_FALLBACK = WELCOME_TICKERS.tickers;
export const DEMO_SHARES   = WELCOME_TICKERS.shares;

/**
 * Sets the demo flag, builds demo holdings from /api/most-traded (or fallback),
 * writes them to localStorage, then reloads or redirects.
 *
 * @param {string|null} redirectTo — if provided, navigates there instead of reloading
 */
export async function startDemo(redirectTo = null) {
  localStorage.setItem('stockdash_demo', 'true');

  try {
    const res  = await fetch('/api/most-traded');
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      const h = data.slice(0, 5).map((e, i) => ({
        t: e.symbol,
        s: WELCOME_TICKERS.shares[i],
        c: e.price ?? 0,
      }));
      localStorage.setItem('stockdash_holdings', JSON.stringify(h));
      localStorage.setItem('stockdash_holdings_owner', 'demo');
      window.location.href = redirectTo ?? window.location.href;
      return;
    }
  } catch {}

  // Fallback: fetch live prices so cost basis = current price → $0 P&L
  try {
    const res    = await fetch(`/api/prices?tickers=${WELCOME_TICKERS.tickers.join(',')}`);
    const prices = await res.json();
    const pm     = {};
    if (Array.isArray(prices)) prices.forEach(p => { pm[p.ticker] = p.price ?? 0; });
    const h = WELCOME_TICKERS.tickers.map((t, i) => ({ t, s: WELCOME_TICKERS.shares[i], c: pm[t] ?? 0 }));
    localStorage.setItem('stockdash_holdings', JSON.stringify(h));
    localStorage.setItem('stockdash_holdings_owner', 'demo');
  } catch {
    const h = WELCOME_TICKERS.tickers.map((t, i) => ({ t, s: WELCOME_TICKERS.shares[i], c: 0 }));
    localStorage.setItem('stockdash_holdings', JSON.stringify(h));
    localStorage.setItem('stockdash_holdings_owner', 'demo');
  }

  window.location.href = redirectTo ?? window.location.href;
}

/**
 * Returns tickers from localStorage holdings, or WELCOME_TICKERS.tickers if in demo
 * mode with empty holdings (e.g. navigated directly before startDemo completed).
 */
export function getDemoTickers() {
  try {
    // Only consume the shared cache when demo mode wrote it.
    // A null, 'anonymous', or userId-owned cache may be stale or polluted.
    const owner = localStorage.getItem('stockdash_holdings_owner');
    if (owner === 'demo') {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      if (holdings.length) return holdings.map(h => h.t);
    }
  } catch {}
  return WELCOME_TICKERS.tickers;
}
