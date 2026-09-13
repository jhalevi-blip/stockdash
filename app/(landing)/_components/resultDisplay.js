// Pure decision layer for the landing result view's headline stats + chart.
//
// THE INVARIANT this file exists to enforce: the three headline percentages and
// the chart are decided in ONE place, from ONE branch. A concrete number in a
// stat card and a chart that isn't the real plotted surface can never co-occur,
// because the stat values and the chart `kind` are derived from the same `kind`
// — not gated independently in JSX.
//
// That independent gating was the bug that shipped: the stat cards keyed on
// perf.ready alone while the chart keyed on perf.ready && perf.integrity.ok, so
// a ledger that failed its integrity check correctly suppressed the chart yet
// still showed "+39.4%" in the largest text on screen. Here the numbers can only
// reach a stat card when kind === 'surface', by construction.
//
// Framework-agnostic: no React, no JSX — unit-testable directly.

const DASH = '—'; // em dash

// Signed, fixed-precision percent; null/undefined → em dash.
export function fmtPct(n, d = 1) {
  return n == null ? DASH : (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
}

// Sign colour for a percent; null/undefined → secondary text.
export function pctColor(n) {
  return n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)';
}

// One decision → both the stat display values and the chart state.
//
// kind:
//   'loading' — ledger still building     → stats '…', chart spinner
//   'noprice' — not ready (no prices yet) → stats '…', chart no-price notice
//   'refuse'  — integrity gate failed     → stats em dash, chart range-error box
//   'surface' — everything checks out     → stats show numbers, chart plots
//
// Returns { kind, stats: { twr, spy, vs }, chart }. Each stat is { value, color }.
// A stat's `value` is a real percentage ONLY when kind === 'surface'; every other
// kind yields a placeholder, chosen here rather than in the view so it cannot
// drift back to a number.
export function resolveResultDisplay(perf) {
  const kind =
    perf.loading        ? 'loading' :
    !perf.ready         ? 'noprice' :
    !perf.integrity?.ok ? 'refuse'  :
                          'surface';

  if (kind === 'surface') {
    const chartData = perf.chartData ?? [];
    const xInterval = chartData.length
      ? Math.max(1, Math.floor((chartData.length - 1) / 5))
      : 1;
    return {
      kind,
      stats: {
        twr: { value: fmtPct(perf.twrPct),    color: pctColor(perf.twrPct) },
        spy: { value: fmtPct(perf.spyPct),    color: pctColor(perf.spyPct) },
        vs:  { value: fmtPct(perf.vsSpyPct),  color: pctColor(perf.vsSpyPct) },
      },
      chart: {
        chartData,
        xInterval,
        D0: perf.D0,
        portfolioPct: fmtPct(perf.twrPct),
        spyPct: fmtPct(perf.spyPct),
      },
    };
  }

  // Non-surface: NO number can reach a stat card. The placeholder is the only
  // value these cards hold, and it's decided here — coupled to the same `kind`
  // that suppresses the chart.
  const placeholder = kind === 'refuse' ? DASH : '…'; // '…' while loading / not ready
  const blank = () => ({ value: placeholder, color: undefined });
  return {
    kind,
    stats: { twr: blank(), spy: blank(), vs: blank() },
    chart: kind === 'refuse' ? { reason: perf.integrity?.reason } : {},
  };
}
