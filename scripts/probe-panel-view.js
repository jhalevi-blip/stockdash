// Show the EXACT payload /api/watchlist/fundamentals returns for a symbol, by
// calling the same lib path the route uses (fetchPanelFundamentals + computePanelView)
// against live FMP. READ-ONLY. The route wraps this with auth + ownership + a 12h
// cache; the data body is what this prints. Run: node scripts/probe-panel-view.js
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
process.env.FMP_API_KEY = env.FMP_API_KEY;

(async () => {
  // Import the ESM lib from CommonJS.
  const lib = await import('../lib/watchlist/fundamentals.js');
  for (const sym of ['MSFT', 'AAPL', 'NVDA']) {
    const raw = await lib.fetchPanelFundamentals(sym);
    const view = lib.computePanelView(raw);
    console.log(`\n===== ${sym} =====`);
    console.log(JSON.stringify(view, null, 2));
  }
})();
