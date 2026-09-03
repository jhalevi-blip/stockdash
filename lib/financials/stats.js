// Pure helpers for the financials panel's peer medians and range stats. No I/O — the
// component (or a test) feeds range-sliced series in. Reusable by the research page.

const finite = v => (typeof v === 'number' && Number.isFinite(v));

// The only fields a peer row needs to feed the medians + CAGR. The financials route
// trims peer series to these (base stays full) to keep the payload small — it's
// refetched on every peer edit.
export const PEER_ROW_FIELDS = ['date', 'label', 'revenue', 'grossMargin', 'operatingMargin', 'netMargin', 'netDebtToEbitda'];

// Project a full { annual, quarterly, ttm } series down to PEER_ROW_FIELDS.
export function pickPeerPeriods(periods) {
  const pick = rows => (rows || []).map(r => {
    const o = {};
    for (const f of PEER_ROW_FIELDS) o[f] = r[f] ?? null;
    return o;
  });
  return { annual: pick(periods?.annual), quarterly: pick(periods?.quarterly), ttm: pick(periods?.ttm) };
}

// Median of the finite values (nulls/NaN ignored). null when none.
export function median(values) {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Per-label medians across peer series for `fields`. peerSeriesList = one row-array
// per peer WITH data. Returns Map<label, { field: median }>, for merging the muted
// median lines into the base rows by x-label.
export function peerMedianByLabel(peerSeriesList, fields) {
  const byLabel = new Map();
  for (const rows of peerSeriesList) {
    for (const r of (rows || [])) {
      if (!r || r.label == null) continue;
      let acc = byLabel.get(r.label);
      if (!acc) { acc = {}; for (const f of fields) acc[f] = []; byLabel.set(r.label, acc); }
      for (const f of fields) if (finite(r[f])) acc[f].push(r[f]);
    }
  }
  const out = new Map();
  for (const [label, acc] of byLabel) {
    const m = {};
    for (const f of fields) m[f] = median(acc[f]);
    out.set(label, m);
  }
  return out;
}

// Revenue CAGR across a chronological, range-sliced row array: first vs last finite,
// positive revenue, annualized by the calendar span between them. null when there
// aren't two positive points spanning a positive time.
export function revenueCagr(rows) {
  const pts = (rows || []).filter(r => finite(r.revenue) && r.revenue > 0 && r.date);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const years = (new Date(last.date) - new Date(first.date)) / (365.25 * 864e5);
  if (!(years > 0)) return null;
  return Math.pow(last.revenue / first.revenue, 1 / years) - 1;
}

// Latest finite value of a field, scanning from the end (rows chronological).
function latest(rows, field) {
  for (let i = (rows?.length ?? 0) - 1; i >= 0; i--) if (finite(rows[i][field])) return rows[i][field];
  return null;
}

const STAT_KEYS = ['revenueCagr', 'grossMargin', 'operatingMargin', 'netMargin', 'netDebtToEbitda'];

// The stats-strip metrics for one range-sliced series: revenue CAGR over the range,
// plus the latest-period margins and leverage.
export function computeRangeStats(rows) {
  return {
    revenueCagr: revenueCagr(rows),
    grossMargin: latest(rows, 'grossMargin'),
    operatingMargin: latest(rows, 'operatingMargin'),
    netMargin: latest(rows, 'netMargin'),
    netDebtToEbitda: latest(rows, 'netDebtToEbitda'),
  };
}

// Peer-median of the stats strip: computeRangeStats per peer series (already sliced to
// the range), then median each metric across peers.
export function peerMedianStats(peerSeriesList) {
  const per = (peerSeriesList || []).map(computeRangeStats);
  const out = {};
  for (const k of STAT_KEYS) out[k] = median(per.map(s => s[k]));
  return out;
}
