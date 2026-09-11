// Format a position's cost basis in its native currency, exactly as parsed —
// no FX conversion. Amounts are rounded to whole units (toLocaleString, 0 dp).
//
// Extracted from DTResultView so the currency logic (especially the pence path)
// can be unit-tested without pulling React/recharts into the test runner.
export function money(amount, ccy) {
  const n = (amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  // GBp/GBX are pence, not pounds. money() rounds to 0 decimals, so converting to £
  // would turn 108p into "£1" — a total loss of precision for sub-£10 London stocks.
  // Label as pence ("108p"), which is what a UK investor sees on their broker screen.
  if (ccy === 'GBp' || ccy === 'GBX') return `${n}p`;
  const sym = ccy === 'EUR' ? '€' : ccy === 'USD' ? '$' : ccy === 'GBP' ? '£'
            : ccy === 'CAD' ? 'C$' : ccy === 'JPY' ? '¥' : '';
  return sym ? `${sym}${n}` : `${n} ${ccy}`;
}
