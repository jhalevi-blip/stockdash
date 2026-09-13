/**
 * resolveResultDisplay() — the single decision that gates BOTH the landing
 * result view's headline stat cards and the chart beneath them.
 *
 * The bug this guards against: DTResultView once gated the stat cards on
 * perf.ready alone while the chart gated on perf.ready && perf.integrity.ok, so
 * a ledger that failed its integrity check suppressed the chart yet still showed
 * a large "+39.4%". These tests assert the coupling — a real number can appear in
 * a stat card ONLY when the chart is the plotted surface.
 *
 * Test runner: Vitest. `npm test` (vitest run) or `npx vitest`.
 */
import { describe, it, expect } from 'vitest';
import { resolveResultDisplay } from '../resultDisplay';

const DASH = '—'; // em dash, U+2014

describe('resolveResultDisplay()', () => {
  it('THE coupling: a failed integrity gate shows em dashes AND no surface, even with a real TWR', () => {
    // ready:true, integrity.ok:false — exactly the shipped bug's shape. The ledger
    // produced a number, but it must never reach a stat card.
    const perf = {
      loading: false,
      ready: true,
      integrity: { ok: false, reason: 'non-positive holdings value on 1 day(s) from 2025-08-01' },
      twrPct: 39.4,
      spyPct: 12.1,
      vsSpyPct: 27.3,
      chartData: [{ date: '2025-08-01', portfolio: 0, spy: 0 }],
      D0: '2025-07-01',
    };
    const d = resolveResultDisplay(perf);

    expect(d.kind).toBe('refuse');
    expect(d.kind).not.toBe('surface');            // chart is NOT the plotted surface

    // No number, in any form, in any stat card.
    expect(d.stats.twr.value).toBe(DASH);
    expect(d.stats.spy.value).toBe(DASH);
    expect(d.stats.vs.value).toBe(DASH);
    for (const s of [d.stats.twr, d.stats.spy, d.stats.vs]) {
      expect(s.value).not.toContain('39.4');
      expect(s.value).not.toMatch(/\d/);
    }

    // The refuse box carries the integrity reason; there is no chart data to plot.
    expect(d.chart.reason).toBe(perf.integrity.reason);
    expect(d.chart.chartData).toBeUndefined();
  });

  it('normal case: ready + integrity ok → surface with signed, coloured numbers', () => {
    const perf = {
      loading: false,
      ready: true,
      integrity: { ok: true, reason: null },
      twrPct: 39.4,
      spyPct: 12.1,
      vsSpyPct: -3.5,
      chartData: Array.from({ length: 11 }, (_, i) => ({ date: `d${i}`, portfolio: i, spy: i })),
      D0: '2025-07-01',
    };
    const d = resolveResultDisplay(perf);

    expect(d.kind).toBe('surface');
    expect(d.stats.twr.value).toBe('+39.4%');
    expect(d.stats.twr.color).toBe('var(--positive)');
    expect(d.stats.spy.value).toBe('+12.1%');
    expect(d.stats.vs.value).toBe('-3.5%');
    expect(d.stats.vs.color).toBe('var(--negative)');

    // Chart plots the data; legend mirrors the headline numbers; xInterval = ⌊(n-1)/5⌋.
    expect(d.chart.chartData).toHaveLength(11);
    expect(d.chart.xInterval).toBe(2);
    expect(d.chart.portfolioPct).toBe('+39.4%');
    expect(d.chart.spyPct).toBe('+12.1%');
    expect(d.chart.D0).toBe('2025-07-01');
  });

  it('loading case: chart spinner, stats show the loading placeholder — never a number', () => {
    const d = resolveResultDisplay({ loading: true, ready: false });
    expect(d.kind).toBe('loading');
    expect(d.stats.twr.value).toBe('…');
    expect(d.stats.spy.value).toBe('…');
    expect(d.stats.vs.value).toBe('…');
    expect(d.stats.twr.color).toBeUndefined();
  });

  it('not-ready case: no prices yet → noprice, stats show the loading placeholder', () => {
    const d = resolveResultDisplay({ loading: false, ready: false });
    expect(d.kind).toBe('noprice');
    expect(d.kind).not.toBe('surface');
    expect(d.stats.twr.value).toBe('…');
    expect(d.stats.spy.value).toBe('…');
    expect(d.stats.vs.value).toBe('…');
  });
});
