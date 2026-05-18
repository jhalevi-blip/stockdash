/**
 * Pure client-side DCF calculator. No API calls — all inputs from page state.
 *
 * Monetary values are absolute USD (e.g. 60_000_000_000 for $60B revenue).
 *
 * @param {object} p
 * @param {number}  p.lastRevenue    - Most recent annual revenue (USD)
 * @param {number}  p.wacc           - WACC % (e.g. 10 for 10 %)
 * @param {number}  p.terminalGrowth - Terminal growth % (e.g. 3 for 3 %)
 * @param {number}  p.revenueCagr    - Projected revenue CAGR % (e.g. 22 for 22 %)
 * @param {number}  p.terminalMargin - Terminal operating margin % (e.g. 60 for 60 %)
 * @param {number}  p.sharesOut      - Shares outstanding (count, not millions)
 * @param {number}  [p.netDebt=0]    - Net debt USD; caller passes 0 if unknown
 * @returns {{ fairValue:number, bear:number, base:number, bull:number, enterpriseValue:number } | null}
 */
export function calcDCF({
  lastRevenue,
  wacc,
  terminalGrowth,
  revenueCagr,
  terminalMargin,
  sharesOut,
  netDebt = 0,
}) {
  if (!lastRevenue || lastRevenue <= 0 || !sharesOut || sharesOut <= 0) return null;
  if (wacc <= terminalGrowth) return null; // Gordon Growth undefined

  const wDec  = wacc           / 100;
  const tgDec = terminalGrowth / 100;
  const cDec  = revenueCagr    / 100;
  const mDec  = terminalMargin / 100;

  // Project 5 years of revenue, discount FCF each year
  let pvFCF  = 0;
  let projRev = lastRevenue;
  for (let i = 1; i <= 5; i++) {
    projRev   *= (1 + cDec);
    const fcf  = projRev * mDec;
    pvFCF     += fcf / Math.pow(1 + wDec, i);
  }

  // Terminal value via Gordon Growth Model (on year-5 FCF grown by tg one more year)
  const termFCF       = projRev * mDec * (1 + tgDec);
  const terminalValue = termFCF / (wDec - tgDec);
  const pvTerminal    = terminalValue / Math.pow(1 + wDec, 5);

  const enterpriseValue = pvFCF + pvTerminal;
  const equityValue     = Math.max(enterpriseValue - netDebt, 0);
  const base            = equityValue / sharesOut;

  return {
    fairValue:      base,
    bear:           base * 0.8,
    base,
    bull:           base * 1.2,
    enterpriseValue,
  };
}
