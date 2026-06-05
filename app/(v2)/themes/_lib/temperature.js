// Temperature math for the /themes engine. Pure functions only — no fetch, no I/O,
// fully unit-testable. Feed it the { SYM: [{date, close}] } map produced by
// lib/fmpHistory.js and the tracker configs from ./trackers.js.

import { OPTIONAL_SYMBOLS } from './trackers';

// ── Tunables ──────────────────────────────────────────────────────────────────
// All knobs live here so the model can be retuned in one place.
export const TEMP_PARAMS = {
  RUN_SCALE: 0.25,                // a +25% trailing-12m move ≈ one unit of run score
  EXT_SCALE: 2.0,                 // 2σ of extension above the 200d MA ≈ one unit of ext score
  CLAMP: 2.0,                     // clamp each normalised component to ±2 before blending
  OFFHIGH_COOL_THRESHOLD: -0.15,  // more than 15% off the high → demote one bucket
  SPLIT_THRESHOLD: 1.5,           // if max−min tracker score exceeds this, the thesis headline reads SPLIT instead of the (misleading) average
  BUCKETS: [                      // ordered hottest → coldest; first whose min ≤ score wins
    { min: 1.2,       label: 'HOT' },
    { min: 0.6,       label: 'WARM' },
    { min: -0.2,      label: 'LUKEWARM' },
    { min: -0.8,      label: 'COOL' },
    { min: -Infinity, label: 'COLD' },
  ],
};

const TRADING_DAYS_YEAR = 252;

// ── Small numeric helpers ───────────────────────────────────────────────────────
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr, mu) {
  if (arr.length < 2) return 0;
  const m = mu == null ? mean(arr) : mu;
  const variance = arr.reduce((a, v) => a + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function clamp(x, limit = TEMP_PARAMS.CLAMP) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-limit, Math.min(limit, x));
}

function round(x, dp = 4) {
  if (x == null || !Number.isFinite(x)) return null;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

function bucketIndex(scoreVal) {
  const { BUCKETS } = TEMP_PARAMS;
  for (let i = 0; i < BUCKETS.length; i++) {
    if (scoreVal >= BUCKETS[i].min) return i;
  }
  return BUCKETS.length - 1;
}

/** Bucket a raw score, no drawdown adjustment. */
export function bucketLabel(scoreVal) {
  return TEMP_PARAMS.BUCKETS[bucketIndex(scoreVal)].label;
}

/** Bucket a score, then demote one step if the series is well off its high. */
function temperatureLabel(scoreVal, offHigh) {
  let idx = bucketIndex(scoreVal);
  if (offHigh != null && offHigh < TEMP_PARAMS.OFFHIGH_COOL_THRESHOLD) {
    idx = Math.min(idx + 1, TEMP_PARAMS.BUCKETS.length - 1); // higher index = cooler
  }
  return TEMP_PARAMS.BUCKETS[idx].label;
}

// ── Series builders ─────────────────────────────────────────────────────────────

/**
 * Intersect a list of raw close-series on their common dates.
 * @param {{date:string,close:number}[][]} list
 * @returns {{ dates: string[], aligned: number[][] }}  aligned ascending by date
 */
export function alignSeries(list) {
  const valid = (list ?? []).filter(s => Array.isArray(s) && s.length);
  if (!valid.length) return { dates: [], aligned: [] };

  let common = new Set(valid[0].map(p => p.date));
  for (let i = 1; i < valid.length; i++) {
    const ds = new Set(valid[i].map(p => p.date));
    common = new Set([...common].filter(d => ds.has(d)));
  }

  const dates = [...common].sort((a, b) => a.localeCompare(b));
  const aligned = valid.map(s => {
    const m = new Map(s.map(p => [p.date, p.close]));
    return dates.map(d => m.get(d));
  });
  return { dates, aligned };
}

/**
 * Equal-weight basket: align the inputs, index each to 1.0 at the first common date,
 * then average per date. Indexing makes the result scale-invariant, so a single-symbol
 * basket is safe too.
 * @returns {{date:string,value:number}[]}
 */
export function basketSeries(seriesList) {
  const { dates, aligned } = alignSeries(seriesList);
  if (!dates.length) return [];

  const indexed = aligned.map(vals => {
    const base = vals[0];
    return vals.map(v => (base ? v / base : v));
  });

  return dates.map((date, k) => {
    let sum = 0;
    for (const series of indexed) sum += series[k];
    return { date, value: sum / indexed.length };
  });
}

/**
 * Ratio of two equal-weight baskets, per common date.
 * @returns {{date:string,value:number}[]}
 */
export function ratioSeries(num, den) {
  const a = basketSeries(num);
  const b = basketSeries(den);
  if (!a.length || !b.length) return [];

  const bMap = new Map(b.map(p => [p.date, p.value]));
  const out = [];
  for (const p of a) {
    const d = bMap.get(p.date);
    if (d != null && d !== 0) out.push({ date: p.date, value: p.value / d });
  }
  return out; // a is ascending, so out is ascending
}

// ── Metrics + scoring ────────────────────────────────────────────────────────────

/**
 * Core stats on a { date, value } series (ascending).
 * @returns {null | {
 *   last:number, run12m:number|null, ma200:number, std200:number,
 *   extensionSigma:number, offHigh:number, points:number, shortHistory:boolean
 * }}
 */
export function metrics(series) {
  const s = (series ?? []).filter(p => p && p.value != null && Number.isFinite(p.value));
  if (!s.length) return null;

  const values = s.map(p => p.value);
  const n = values.length;
  const last = values[n - 1];

  // Trailing 12m: ~252 trading days back, or the earliest available if shorter.
  let baseIdx = n - 1 - TRADING_DAYS_YEAR;
  let shortHistory = false;
  if (baseIdx < 0) { baseIdx = 0; shortHistory = true; }
  const base = values[baseIdx];
  const run12m = base ? last / base - 1 : null;

  // 200-day moving average + std (or the whole series if shorter).
  const window = values.slice(Math.max(0, n - 200));
  const ma200 = mean(window);
  const std200 = std(window, ma200);
  const extensionSigma = std200 ? (last - ma200) / std200 : 0;

  // Drawdown from the highest point in the series.
  const peak = Math.max(...values);
  const offHigh = peak ? last / peak - 1 : 0;

  return { last, run12m, ma200, std200, extensionSigma, offHigh, points: n, shortHistory };
}

/** Blend trailing return and MA-extension into a single score. */
export function score(series) {
  const m = metrics(series);
  if (!m) return null;
  const runComponent = clamp((m.run12m ?? 0) / TEMP_PARAMS.RUN_SCALE);
  const extComponent = clamp(m.extensionSigma / TEMP_PARAMS.EXT_SCALE);
  return 0.5 * runComponent + 0.5 * extComponent;
}

// ── Tracker / thesis temperatures ────────────────────────────────────────────────

function resolveBasket(symbols, seriesBySymbol) {
  const seriesList = [];
  const missingRequired = [];
  const droppedOptional = [];
  for (const sym of symbols ?? []) {
    const s = seriesBySymbol?.[sym];
    if (s && s.length) seriesList.push(s);
    else if (OPTIONAL_SYMBOLS.includes(sym)) droppedOptional.push(sym);
    else missingRequired.push(sym);
  }
  return { seriesList, missingRequired, droppedOptional };
}

/**
 * Temperature for one tracker. Graceful: a missing optional symbol is dropped with a
 * note; a missing required symbol returns an { error } result instead of throwing.
 */
export function trackerTemperature(seriesBySymbol, trackerCfg) {
  const { id, label } = trackerCfg;
  const dropped = [];
  let series;

  if (trackerCfg.single) {
    const s = seriesBySymbol?.[trackerCfg.single];
    if (!s || !s.length) return { id, label, error: 'data unavailable' };
    series = basketSeries([s]);
  } else {
    const num = resolveBasket(trackerCfg.num, seriesBySymbol);
    const den = resolveBasket(trackerCfg.den, seriesBySymbol);
    dropped.push(...num.droppedOptional, ...den.droppedOptional);

    // A ratio needs every required symbol and at least one series on each leg.
    if (num.missingRequired.length || den.missingRequired.length ||
        !num.seriesList.length || !den.seriesList.length) {
      return { id, label, error: 'data unavailable' };
    }
    series = ratioSeries(num.seriesList, den.seriesList);
  }

  if (!series.length) return { id, label, error: 'data unavailable' };

  const m = metrics(series);
  if (!m) return { id, label, error: 'data unavailable' };

  const scoreVal = score(series);
  const result = {
    id,
    label,
    temperature: temperatureLabel(scoreVal, m.offHigh),
    score: round(scoreVal),
    run12m: round(m.run12m),
    extensionSigma: round(m.extensionSigma),
    offHigh: round(m.offHigh),
  };

  const notes = [];
  if (dropped.length) notes.push(`computed without ${dropped.join(', ')}`);
  if (m.shortHistory) notes.push('12m return uses earliest available history (< 252 trading days)');
  if (notes.length) result.note = notes.join('; ');
  return result;
}

/**
 * Roll up a thesis from its tracker results: average the non-error scores → bucket.
 * Keeps the per-tracker results (for k-shaped these are the per-sector chips).
 */
export function thesisTemperature(trackers) {
  const results = trackers ?? [];
  const scored = results.filter(t => t && t.error == null && typeof t.score === 'number');
  if (!scored.length) {
    return { temperature: 'UNKNOWN', score: null, trackers: results };
  }
  const scores = scored.map(t => t.score);
  const avg = scores.reduce((a, s) => a + s, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  // A wide spread between trackers makes the average meaningless — headline it as SPLIT.
  if (scored.length >= 2 && (max - min) > TEMP_PARAMS.SPLIT_THRESHOLD) {
    const maxTracker = scored.reduce((a, t) => (t.score > a.score ? t : a));
    const minTracker = scored.reduce((a, t) => (t.score < a.score ? t : a));
    return {
      temperature: 'SPLIT',
      score: round(avg),
      split: true,
      scoreRange: { min: round(min), max: round(max) },
      splitEnds: {
        high: { id: maxTracker.id, label: maxTracker.label, score: round(maxTracker.score) },
        low:  { id: minTracker.id, label: minTracker.label, score: round(minTracker.score) },
      },
      trackers: results,
    };
  }
  return { temperature: bucketLabel(avg), score: round(avg), trackers: results };
}
