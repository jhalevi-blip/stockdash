import { describe, it, expect } from 'vitest';
import { buildFxRates, valuePosition, currencyImpact } from '../positionValue';

// Currency-impact = today's EUR value of each non-EUR position's CURRENT local value
// minus that same local value at the START-date FX. For a EUR investor, USD
// strengthening (EUR/USD falling) makes USD holdings worth more euros → positive.
describe('currencyImpact (EUR investor)', () => {
  const eurUsdStart = 1.10, eurUsdNow = 1.0641;   // EUR/USD −3.27% → USD strengthened
  const gbpUsdStart = 1.25, gbpUsdNow = 1.30;
  const ratesStart = buildFxRates(eurUsdStart, gbpUsdStart);
  const ratesNow   = buildFxRates(eurUsdNow,   gbpUsdNow);

  it('USD position — EUR/USD DOWN (USD strengthened) is a positive tailwind', () => {
    const { impact, available } = currencyImpact(
      [{ nativeCcy: 'USD', mktNative: 1000 }], ratesNow, ratesStart, 'EUR');
    expect(available).toBe(true);
    expect(impact).toBeCloseTo(1000 / eurUsdNow - 1000 / eurUsdStart, 6);
    expect(impact).toBeGreaterThan(0);
  });

  it('USD position — EUR/USD UP (USD weakened) is a negative headwind', () => {
    const upStart = buildFxRates(1.05, gbpUsdStart);
    const upNow   = buildFxRates(1.12, gbpUsdStart);   // EUR/USD rose → USD weakened
    const { impact } = currencyImpact(
      [{ nativeCcy: 'USD', mktNative: 1000 }], upNow, upStart, 'EUR');
    expect(impact).toBeCloseTo(1000 / 1.12 - 1000 / 1.05, 6);
    expect(impact).toBeLessThan(0);
  });

  it('GBX position — pence normalise to GBP, then contribute their GBP/EUR move', () => {
    // 100 shares, quote 500 GBX → valuePosition ÷100 → 5 GBP/sh → 500 GBP market value.
    const v = valuePosition(
      { s: 100, c: 400, currency: 'GBX' },
      { price: 500, currency: 'GBX', exchange: 'LSE' },
      ratesNow, 'EUR');
    expect(v.priced).toBe(true);
    expect(v.nativeCcy).toBe('GBP');
    expect(v.mktNative).toBeCloseTo(500, 6);

    const { impact } = currencyImpact(
      [{ nativeCcy: v.nativeCcy, mktNative: v.mktNative }], ratesNow, ratesStart, 'EUR');
    const now   = 500 * gbpUsdNow   / eurUsdNow;
    const start = 500 * gbpUsdStart / eurUsdStart;
    expect(impact).toBeCloseTo(now - start, 6);
  });

  it('EUR position contributes exactly zero', () => {
    const { impact, available } = currencyImpact(
      [{ nativeCcy: 'EUR', mktNative: 5000 }], ratesNow, ratesStart, 'EUR');
    expect(available).toBe(true);
    expect(impact).toBe(0);
  });

  it('mixed USD + GBP + EUR — sums the foreign legs, EUR adds nothing', () => {
    const { impact } = currencyImpact([
      { nativeCcy: 'USD', mktNative: 1000 },
      { nativeCcy: 'GBP', mktNative: 500 },
      { nativeCcy: 'EUR', mktNative: 5000 },
    ], ratesNow, ratesStart, 'EUR');
    const usd = 1000 / eurUsdNow - 1000 / eurUsdStart;
    const gbp = 500 * gbpUsdNow / eurUsdNow - 500 * gbpUsdStart / eurUsdStart;
    expect(impact).toBeCloseTo(usd + gbp, 6);
    expect(impact).toBeGreaterThan(0);   // both legs tailwinds here
  });

  it('all-EUR portfolio → zero impact, available', () => {
    const { impact, available } = currencyImpact(
      [{ nativeCcy: 'EUR', mktNative: 1234 }], ratesNow, ratesStart, 'EUR');
    expect(available).toBe(true);
    expect(impact).toBe(0);
  });

  it('missing start FX for a foreign leg → not available (null), never NaN', () => {
    const ratesStartNoEur = buildFxRates(null, gbpUsdStart);   // no EUR start rate
    const { impact, available } = currencyImpact(
      [{ nativeCcy: 'USD', mktNative: 1000 }], ratesNow, ratesStartNoEur, 'EUR');
    expect(available).toBe(false);
    expect(impact).toBeNull();
    expect(Number.isNaN(impact)).toBe(false);
  });
});
