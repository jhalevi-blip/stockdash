// Single source of truth for mapping a statement period-end date to a CALENDAR
// (year, quarter) key. Imported by BOTH the write path (lib/watchlist/fundamentals.js,
// which stores calendar_year/calendar_quarter) AND the read path (lib/financials/
// valuation.js's calIndex and lib/financials/series.js's qIndex). These MUST agree: if
// storage and lookup ever diverge the failure is SILENT — the 3-year CAGR lookup lands
// on the wrong quarter, or a TTM window straddles a phantom gap. So the rule lives here
// once and is imported everywhere. Never copy it.
//
// Why snapping: many issuers run a 4-4-5 / 52-53-week fiscal calendar whose quarter-ends
// drift a few days off the calendar boundary (AMD's Q1 FY2023 ended 2023-04-01). A naive
// floor(month/3)+1 files that under Q2 and leaves Q1 empty — worse, an end that floors
// into the SAME bucket as the next quarter collides and one quarter is dropped at write.
// Snapping the period-end to the NEAREST calendar boundary (Mar 31 / Jun 30 / Sep 30 /
// Dec 31) fixes both — but only within a tolerance. An issuer whose quarter-ends sit
// ~a month inside the quarter (NVDA, fiscal-Jan; ~26-day drift) must NOT be pulled to a
// boundary, or its already-correct, gapless keys would shift. SNAP_TOLERANCE_DAYS=10
// cleanly separates the two populations (validated against the live universe: near-
// boundary filers drift <=~4 days, the next cluster is ~25+).

export const SNAP_TOLERANCE_DAYS = 10;

const MS_PER_DAY = 86400000;

// The four calendar quarter-end dates (UTC ms) for a year, tagged with their quarter.
function quarterEnds(year) {
  return [
    [Date.UTC(year, 2, 31), 1],   // Mar 31
    [Date.UTC(year, 5, 30), 2],   // Jun 30
    [Date.UTC(year, 8, 30), 3],   // Sep 30
    [Date.UTC(year, 11, 31), 4],  // Dec 31
  ];
}

// Map a period-end ISO date to a calendar { year, quarter }, or null if unparseable.
// Within toleranceDays of a boundary -> snap to that boundary's quarter (fixes 4-4-5
// drift, including across a year edge: a late-Dec or early-Jan end snaps to the correct
// side, since the boundaries of y-1/y/y+1 are all considered). Otherwise fall back to
// the plain containing quarter (floor(month/3)+1) — issuers whose quarters sit well
// inside a calendar quarter are left exactly as they were before this change.
export function snapToCalendarQuarter(reportDate, { toleranceDays = SNAP_TOLERANCE_DAYS } = {}) {
  const t = Date.parse(reportDate);
  if (Number.isNaN(t)) return null;
  const y = new Date(t).getUTCFullYear();
  let best = null;
  for (const yr of [y - 1, y, y + 1]) {
    for (const [end, q] of quarterEnds(yr)) {
      const driftDays = Math.abs(t - end) / MS_PER_DAY;
      if (best === null || driftDays < best.driftDays) best = { driftDays, year: yr, quarter: q };
    }
  }
  if (best.driftDays <= toleranceDays) return { year: best.year, quarter: best.quarter };
  const d = new Date(t);
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

// Monotonic calendar index (year*4 + quarter-1). Consecutive quarters differ by 1;
// exactly N years back is index - 4N. Used to align rows by key, not array offset.
export function calIndex(year, quarter) {
  return year * 4 + (quarter - 1);
}

// Convenience: calendar index straight from a period-end date (snap + index), or null.
// The valuation chart uses this so its lookups are keyed identically to storage.
export function calIndexFromDate(reportDate, opts) {
  const c = snapToCalendarQuarter(reportDate, opts);
  return c === null ? null : calIndex(c.year, c.quarter);
}
