const DEMO_SHARES   = [50, 30, 20, 15, 10];
const DEMO_FALLBACK = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT'];

/**
 * Sets the demo flag, builds demo holdings from /api/most-traded (or fallback),
 * writes them to localStorage, then reloads the current page.
 */
export async function startDemo() {
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
      window.location.reload();
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
  } catch {
    const h = DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: 0 }));
    localStorage.setItem('stockdash_holdings', JSON.stringify(h));
  }

  window.location.reload();
}
