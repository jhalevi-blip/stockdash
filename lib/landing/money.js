// Format a position's cost basis in its native currency, exactly as parsed —
// no FX conversion. Amounts are rounded to whole units (toLocaleString, 0 dp).
//
// Extracted from DTResultView so the currency logic can be unit-tested without
// pulling React/recharts into the test runner.
export function money(amount, ccy) {
  const sym = ccy === 'EUR' ? '€' : ccy === 'USD' ? '$' : ccy === 'GBP' ? '£' : '';
  const n = (amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return sym ? `${sym}${n}` : `${n} ${ccy}`;
}
