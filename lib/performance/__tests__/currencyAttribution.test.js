import { describe, it, expect } from 'vitest';
import { computeCurrencyAttribution, brokerRate, eurValue, normCurrency } from '../currencyAttribution';

// FX snapshots — eurUsd = USD per EUR, gbpUsd = USD per GBP.
const FX = {
  '2026-01-01': { eurUsd: 1.10, gbpUsd: 1.27 },   // window start
  '2026-02-01': { eurUsd: 1.11, gbpUsd: 1.27 },
  '2026-03-01': { eurUsd: 1.12, gbpUsd: 1.27 },
  '2026-04-01': { eurUsd: 1.09, gbpUsd: 1.28 },
};
const fxAt = (iso) => FX[iso] ?? FX['2026-01-01'];
const fxNow = { eurUsd: 1.0641, gbpUsd: 1.30 };    // USD & GBP both strengthened vs start
const WIN = '2026-01-01';

const eurPerUsdNow = 1 / fxNow.eurUsd;
const eurPerUsdStart = 1 / 1.10;

describe('currencyAttribution', () => {
  it('open USD lot bought BEFORE the window uses window-start FX (daily), positive when USD strengthened', () => {
    const legs = [{ t: 'AAA', d: '2025-06-01', s: 10, price: 100, currency: 'USD', fx: 1.05 }];
    const r = computeCurrencyAttribution({
      legs, holdings: [{ t: 'AAA', s: 10, currency: 'USD' }],
      quotes: { AAA: { price: 120, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    const expect1 = 1200 * (eurPerUsdNow - eurPerUsdStart);   // t0 clamped to window start
    expect(r.open).toBeCloseTo(expect1, 2);
    expect(r.realised).toBe(0);
    expect(r.total).toBeCloseTo(expect1, 2);
    expect(r.total).toBeGreaterThan(0);                        // tailwind
    expect(r.byLot.find(l => l.kind === 'open').src).toBe('daily');
  });

  it('open USD lot bought MID-window uses the BROKER rate when present (differs from daily)', () => {
    // broker order rate 1.15 USD/EUR (worse than the 1.12 daily close) → distinguishable.
    const brokered = [{ t: 'BBB', d: '2026-03-01', s: 5, price: 200, currency: 'USD', fx: 1.15 }];
    const rB = computeCurrencyAttribution({
      legs: brokered, holdings: [{ t: 'BBB', s: 5, currency: 'USD' }],
      quotes: { BBB: { price: 220, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    expect(rB.byLot[0].src).toBe('broker');
    expect(rB.open).toBeCloseTo(1100 * (eurPerUsdNow - 1 / 1.15), 2);

    // same lot without fx → daily fallback (1.12), different number.
    const daily = [{ t: 'BBB', d: '2026-03-01', s: 5, price: 200, currency: 'USD' }];
    const rD = computeCurrencyAttribution({
      legs: daily, holdings: [{ t: 'BBB', s: 5, currency: 'USD' }],
      quotes: { BBB: { price: 220, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    expect(rD.byLot[0].src).toBe('daily');
    expect(rD.open).toBeCloseTo(1100 * (eurPerUsdNow - 1 / 1.12), 2);
    expect(rD.open).not.toBeCloseTo(rB.open, 2);
  });

  it('partial sale in-window: FIFO splits realised (sold chunk) and open (remainder)', () => {
    const legs = [
      { t: 'AAA', d: '2025-06-01', s: 10, price: 100, currency: 'USD', fx: 1.05 },
      { t: 'AAA', d: '2026-03-01', s: -4, price: 130, currency: 'USD', fx: 1.12 },
    ];
    const r = computeCurrencyAttribution({
      legs, holdings: [{ t: 'AAA', s: 6, currency: 'USD' }],
      quotes: { AAA: { price: 120, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    // sold chunk: proceeds 520, eSale broker 1/1.12, t0 = window start (bought before) → daily 1/1.10
    expect(r.realised).toBeCloseTo(520 * (1 / 1.12 - 1 / 1.10), 2);
    // open remainder: 6 × 120, t0 window start
    expect(r.open).toBeCloseTo(6 * 120 * (eurPerUsdNow - eurPerUsdStart), 2);
    expect(r.byLot.filter(l => l.kind === 'open').length).toBe(1);
    expect(r.byLot.filter(l => l.kind === 'sold').length).toBe(1);
  });

  it('full sale in-window: all realised, no open lot', () => {
    const legs = [
      { t: 'CCC', d: '2026-02-01', s: 10, price: 100, currency: 'USD', fx: 1.11 },
      { t: 'CCC', d: '2026-04-01', s: -10, price: 150, currency: 'USD', fx: 1.09 },
    ];
    const r = computeCurrencyAttribution({
      legs, holdings: [], quotes: { CCC: { price: 150, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    expect(r.open).toBe(0);
    // both mid-window → broker rates: eSale 1/1.09, eT0(buy) 1/1.11
    expect(r.realised).toBeCloseTo(10 * 150 * (1 / 1.09 - 1 / 1.11), 2);
    expect(r.total).toBeCloseTo(r.realised, 2);
  });

  it('GBX lot: pence normalise to GBP and use GBP/EUR FX', () => {
    const buyFx = FX['2026-02-01'];                          // eurUsd 1.11, gbpUsd 1.27
    // DeGiro-style orderFx in GBX per EUR: (GBP per EUR) × 100.
    const fxGbxPerEur = (buyFx.eurUsd / buyFx.gbpUsd) * 100;
    const legs = [{ t: 'SHEL', d: '2026-02-01', s: 100, price: 2900, currency: 'GBX', fx: fxGbxPerEur }];
    const r = computeCurrencyAttribution({
      legs, holdings: [{ t: 'SHEL', s: 100, currency: 'GBX' }],
      quotes: { SHEL: { price: 3000, currency: 'GBX' } }, fxNow, fxAt, windowStart: WIN,
    });
    const lot = r.byLot.find(l => l.kind === 'open');
    expect(lot.ccy).toBe('GBP');
    const eNowGbp = fxNow.gbpUsd / fxNow.eurUsd;
    const eBuyGbp = buyFx.gbpUsd / buyFx.eurUsd;             // t0 = buy date (mid-window) → broker rate
    expect(r.open).toBeCloseTo(3000 * (eNowGbp - eBuyGbp), 2);
    expect(lot.src).toBe('broker');
  });

  it('EUR lot contributes exactly zero', () => {
    const legs = [{ t: 'ASML', d: '2026-02-01', s: 10, price: 850, currency: 'EUR', amountEur: 8500 }];
    const r = computeCurrencyAttribution({
      legs, holdings: [{ t: 'ASML', s: 10, currency: 'EUR' }],
      quotes: { ASML: { price: 900, currency: 'EUR' } }, fxNow, fxAt, windowStart: WIN,
    });
    expect(r.total).toBe(0);
    expect(r.open).toBe(0);
  });

  it('manual position (no legs) → start-date estimate, tracked separately', () => {
    const r = computeCurrencyAttribution({
      legs: [], holdings: [{ t: 'MAN', s: 10, currency: 'USD' }],
      quotes: { MAN: { price: 50, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    const est = 500 * (eurPerUsdNow - eurPerUsdStart);
    expect(r.estimatedEur).toBeCloseTo(est, 2);
    expect(r.total).toBeCloseTo(est, 2);
    expect(r.sources.estimate).toBe(1);
  });

  it('missing FX → not available (null total), never NaN', () => {
    const fxAtNoStart = (iso) => (iso === WIN ? { eurUsd: null } : FX[iso] ?? FX['2026-01-01']);
    const r = computeCurrencyAttribution({
      legs: [{ t: 'AAA', d: '2025-06-01', s: 10, price: 100, currency: 'USD' }],
      holdings: [{ t: 'AAA', s: 10, currency: 'USD' }],
      quotes: { AAA: { price: 120, currency: 'USD' } }, fxNow, fxAt: fxAtNoStart, windowStart: WIN,
    });
    expect(r.available).toBe(false);
    expect(r.total).toBeNull();
    expect(Number.isNaN(r.total)).toBe(false);
  });

  it('fee-inclusive booking is NOT used to derive the rate — a leg with only amountEur (no fx) falls back to daily', () => {
    // Saxo-style: amountEur (Boekingsbedrag) is inflated by €10 commission. If we derived
    // the rate from amountEur/(|s|×price) we'd get ~0.9029 EUR/USD; the honest daily close
    // at the buy date is 1/1.12 = 0.8929. With no explicit fx, we must use daily.
    const feeInclusive = [{ t: 'FEE', d: '2026-03-01', s: 5, price: 200, currency: 'USD', amountEur: (5 * 200 / 1.12) + 10 }];
    const r = computeCurrencyAttribution({
      legs: feeInclusive, holdings: [{ t: 'FEE', s: 5, currency: 'USD' }],
      quotes: { FEE: { price: 220, currency: 'USD' } }, fxNow, fxAt, windowStart: WIN,
    });
    expect(r.byLot[0].src).toBe('daily');
    expect(r.open).toBeCloseTo(1100 * (eurPerUsdNow - 1 / 1.12), 2);            // daily, fee-free
    const contaminated = 1100 * (eurPerUsdNow - 1 / ((5 * 200) / ((5 * 200 / 1.12) + 10)));
    expect(r.open).not.toBeCloseTo(contaminated, 2);                            // proves fees excluded
  });

  it('helper sanity: brokerRate (explicit fx, abs, pence), eurValue, normCurrency', () => {
    expect(normCurrency('GBX')).toBe('GBP');
    expect(brokerRate({ currency: 'USD', fx: 1.10 })).toBeCloseTo(1 / 1.10, 6);
    expect(brokerRate({ currency: 'USD', fx: -1.10 })).toBeCloseTo(1 / 1.10, 6);   // abs guards sign
    expect(brokerRate({ currency: 'GBX', fx: 87.4016 })).toBeCloseTo(100 / 87.4016, 6);
    expect(brokerRate({ currency: 'USD' })).toBeNull();                            // no fx → daily
    expect(eurValue(100, 'EUR', fxNow)).toBe(100);
    expect(eurValue(100, 'USD', fxNow)).toBeCloseTo(100 / fxNow.eurUsd, 6);
  });
});
