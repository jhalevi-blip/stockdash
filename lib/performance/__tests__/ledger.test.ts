/**
 * Ledger integrity — the gate that decides whether a window is displayable.
 *
 * windowIntegrity() is what the landing result view keys its refuse-card on: a
 * window is only shown if EVERY in-window day has a positive, fully-priced
 * holdings value. These tests cover the two failure modes directly, then the
 * buildDailyLedger -> windowIntegrity chain end-to-end from raw legs.
 *
 * Test runner: Vitest. `npm test` (vitest run) or `npx vitest`.
 */
import { describe, it, expect } from 'vitest';
import { buildDailyLedger, windowIntegrity, carryForwardLookup } from '../ledger';

describe('windowIntegrity()', () => {
  it('passes a window whose every day is positive and priced', () => {
    const rows = [
      { date: '2025-07-01', H: 500, priced: true },
      { date: '2025-07-02', H: 520, priced: true },
    ];
    const r = windowIntegrity(rows);
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('fails ok:false on a non-positive-H day (net shares went to zero/negative)', () => {
    const rows = [
      { date: '2025-07-01', H: 500,  priced: true },
      { date: '2025-07-02', H: 0,    priced: true }, // holdings value collapsed to nothing
      { date: '2025-07-03', H: null, priced: true }, // and unvaluable the next day
    ];
    const r = windowIntegrity(rows, { negativeTickers: ['AAA'] });
    expect(r.ok).toBe(false);
    expect(r.nonPositiveHDays).toEqual(['2025-07-02', '2025-07-03']);
    expect(r.unpricedDays).toEqual([]);
    expect(r.reason).toContain('non-positive holdings value');
    expect(r.reason).toContain('AAA');
  });

  it('fails ok:false on an unpriced day (a held ticker had no daily close)', () => {
    const rows = [
      { date: '2025-07-01', H: 500, priced: true },
      { date: '2025-07-02', H: 500, priced: false }, // held but no close for some ticker
    ];
    const r = windowIntegrity(rows, { unpricedTickers: ['XYZ'] });
    expect(r.ok).toBe(false);
    expect(r.unpricedDays).toEqual(['2025-07-02']);
    expect(r.nonPositiveHDays).toEqual([]);
    expect(r.reason).toContain('no price for XYZ');
  });
});

describe('buildDailyLedger() -> windowIntegrity() chain', () => {
  it('flags the holding gap left after a position sells out mid-window', () => {
    // AAA is bought on D0 and fully sold on day 3. The window spine runs one day
    // past the sale, so days 3-4 hold nothing: H collapses to 0 and the window is
    // no longer displayable — exactly the "silently show a number from a broken
    // window" case the gate exists to catch.
    const dates = ['2025-07-01', '2025-07-02', '2025-07-03', '2025-07-04'];
    const tickers = ['AAA'];
    const legs = [
      { t: 'AAA', d: '2025-07-01', s: 10 },
      { t: 'AAA', d: '2025-07-03', s: -10 }, // sells out to exactly 0
    ];
    const closeOf = {
      AAA: carryForwardLookup(dates.map((date) => ({ date, close: 100 }))),
    };
    const fxOf = carryForwardLookup([{ date: '2025-07-01', close: 1 }]); // USD per EUR = 1

    const rows = buildDailyLedger({ dates, tickers, legs, closeOf, fxOf, dividends: [] });
    expect(rows.map((r) => r.H)).toEqual([1000, 1000, 0, 0]);

    const integ = windowIntegrity(rows);
    expect(integ.ok).toBe(false);
    expect(integ.nonPositiveHDays).toEqual(['2025-07-03', '2025-07-04']);
    expect(integ.reason).toContain('non-positive holdings value');
    expect(integ.reason).toContain('2025-07-03'); // names the first gap day
  });
});
