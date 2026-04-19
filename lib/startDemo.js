export const DEMO_SHARES   = [50, 30, 20, 15, 10];
export const DEMO_FALLBACK = ['NVDA', 'TSLA', 'AAPL', 'AMZN', 'AMD'];

/**
 * Sets the demo flag, builds demo holdings from /api/most-traded (or fallback),
 * writes them to localStorage, then reloads or redirects.
 *
 * @param {string|null} redirectTo — if provided, navigates there instead of reloading
 */
export async function startDemo(redirectTo = null) {
  console.log('[startDemo] called, current stockdash_demo=' + localStorage.getItem('stockdash_demo'));
  localStorage.setItem('stockdash_demo', 'true');

  try {
    const res  = await fetch('/api/most-traded');
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      const h = data.slice(0, 5).map((e, i) => ({
        t: e.symbol,
        s: DEMO_SHARES[i],
        c: e.price ?? 0,
      }));
      localStorage.setItem('stockdash_holdings', JSON.stringify(h));
      console.log('[startDemo] wrote stockdash_holdings with ' + h.length + ' tickers (most-traded): ' + h.map(x => x.t).join(', '));
      window.location.href = redirectTo ?? window.location.href;
      return;
    }
  } catch {}

  // Fallback: fetch live prices so cost basis = current price → $0 P&L
  try {
    const res    = await fetch(`/api/prices?tickers=${DEMO_FALLBACK.join(',')}`);
    const prices = await res.json();
    const pm     = {};
    if (Array.isArray(prices)) prices.forEach(p => { pm[p.ticker] = p.price ?? 0; });
    const h = DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: pm[t] ?? 0 }));
    localStorage.setItem('stockdash_holdings', JSON.stringify(h));
    console.log('[startDemo] wrote stockdash_holdings with ' + h.length + ' tickers (prices fallback): ' + h.map(x => x.t).join(', '));
  } catch {
    const h = DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: 0 }));
    localStorage.setItem('stockdash_holdings', JSON.stringify(h));
    console.log('[startDemo] wrote stockdash_holdings with ' + h.length + ' tickers (hardcoded fallback): ' + h.map(x => x.t).join(', '));
  }

  window.location.href = redirectTo ?? window.location.href;
}

/**
 * Returns tickers from localStorage holdings, or DEMO_FALLBACK if in demo mode
 * with empty holdings (e.g. navigated directly before startDemo completed).
 */
export function getDemoTickers() {
  try {
    const stored = localStorage.getItem('stockdash_holdings');
    const holdings = stored ? JSON.parse(stored) : [];
    if (holdings.length) return holdings.map(h => h.t);
  } catch {}
  return DEMO_FALLBACK;
}
