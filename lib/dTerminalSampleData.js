// Hardcoded sample portfolio for the landing dashboard mock.
//
// This is the ONLY hardcoded part of the sample section: tickers, shares, cost
// basis, marks, resulting value and weights — a demo book presented as a demo
// book. Everything that presents as live market data (day change, P/E, beta,
// market cap, dividend yield, next earnings, VIX, benchmark) is fetched
// server-side in lib/landing/sampleMarketData.js and threaded in as props.
//
// EUR-flavoured, recognisable to a Dutch investor, mixing euro-listed names
// (ASML, Shell, ING) with USD-listed ones (NXP, NVDA, MSFT) so the "historical
// FX handled" pitch is visible. Tickers are the providers' primary US/NYSE/NASDAQ
// symbols so the fetched market data resolves cleanly.
export const SAMPLE_PORTFOLIO = {
  // Cost bases picked so the book lands ~+9.5% all-time — believable to a Dutch
  // investor who knows these names, not a fantasy return. Entries sit within each
  // name's plausible range (below the mark), except MSFT, deliberately bought near
  // a high so the book shows a loser alongside the winners.
  rows: [
    { ticker: 'ASML', ccy: 'EUR', shares:  12, price:  985.00, costBasis: 10560.00 }, // entry ~€880   (+11.9%)
    { ticker: 'SHEL', ccy: 'EUR', shares: 300, price:   32.40, costBasis:  8700.00 }, // entry ~€29.00  (+11.7%)
    { ticker: 'ING',  ccy: 'EUR', shares: 500, price:   18.50, costBasis:  8200.00 }, // entry ~€16.40  (+12.8%)
    { ticker: 'NXPI', ccy: 'USD', shares:  30, price:  190.00, costBasis:  5040.00 }, // entry ~€168    (+13.1%)
    { ticker: 'NVDA', ccy: 'USD', shares:  40, price:  163.20, costBasis:  5800.00 }, // entry ~€145    (+12.6%)
    { ticker: 'MSFT', ccy: 'USD', shares:  20, price:  386.50, costBasis:  8040.00 }, // entry ~€402    (−3.9%, the loser)
  ],
  cash: 3250.00, // EUR
};

// Derived book stats. `change` (today's move) is the ONLY per-row field that
// comes from live data (market.perTicker[t].dayChangePct); it's null when not
// fetched, and everything downstream treats null as absent — never zero.
export function computeSampleStats(market) {
  const per = market?.perTicker ?? {};

  const priced = SAMPLE_PORTFOLIO.rows.map((r) => {
    const mktValue = r.shares * r.price;
    const pl = mktValue - r.costBasis;
    const plPct = (pl / r.costBasis) * 100;
    const change = per[r.ticker]?.dayChangePct ?? null;   // fetched, may be null
    return { ...r, mktValue, pl, plPct, change };
  });

  const equity = priced.reduce((s, r) => s + r.mktValue, 0);
  const rows = priced.map((r) => ({
    ...r,
    weight: ((r.mktValue / equity) * 100).toFixed(1) + '%',
  }));

  const total     = equity + SAMPLE_PORTFOLIO.cash;
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const totalPL   = rows.reduce((s, r) => s + r.pl, 0);

  // Day P&L only from rows whose day change actually fetched. If none did, null.
  const dayRows = rows.filter((r) => r.change != null);
  const dayPL = dayRows.length
    ? dayRows.reduce((s, r) => s + (r.mktValue * r.change / 100), 0)
    : null;

  return { rows, total, totalCost, totalPL, dayPL };
}
