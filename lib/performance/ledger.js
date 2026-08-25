// Single-model /performance — pure daily-ledger core (Phase 0).
//
// Framework-agnostic (no React / no Response), so it is unit-testable and shared
// by the page and the compare harness. Every performance number is derived from
// the ONE ledger built here. See docs: cashEvents does NOT reconcile to a cash
// balance for multi-currency DeGiro — this module never touches cashEvents; it
// uses tradeLegs (shares), the dated dividends array, deposits (external flows),
// and currentCash (terminal balance only).

// ── Date helpers ────────────────────────────────────────────────────────────
export function isoAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Build a carry-forward lookup from a sorted [{date, close}] series:
// close on the latest date <= target, or null if none.
export function carryForwardLookup(series) {
  const rows = (series ?? []).filter(r => r && r.date && r.close != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (date) => {
    let lo = 0, hi = rows.length - 1, ans = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].date <= date) { ans = rows[mid].close; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  };
}

// Net signed shares of ticker t held on date d = Σ legs with leg.d <= d.
//
// RULE — never floor a negative net-share count to zero. A ticker whose Σ legs
// goes negative signals incomplete trade history (a missing opening buy, or a
// position opened before the window). Flooring would silently fabricate a valid
// position out of broken data — exactly the "silently display a number computed
// from partial data" the contract forbids. Let the negative flow through so
// windowIntegrity() detects the resulting H <= 0 and DEGRADES the window with a
// named cause. (Only |s| < 1e-9 float dust is zeroed.)
export function sharesAt(legs, t, d) {
  let s = 0;
  for (const l of legs) if (l && l.t === t && l.d && l.d <= d) s += (l.s ?? 0);
  return Math.abs(s) < 1e-9 ? 0 : s;
}

// ── Completeness gate (shares reconciliation) ───────────────────────────────
// The master switch: every CURRENT holding must equal its reconstructed share
// count as of today, else the ledger is built from partial data → hide chart.
export function sharesGate(legs, holdings, today) {
  const bad = [];
  for (const h of holdings ?? []) {
    if (h.t === '__CASH__') continue;
    const recon = sharesAt(legs, h.t, today);
    if (Math.abs(recon - (h.s ?? 0)) > 1e-6) bad.push({ t: h.t, recon, held: h.s ?? 0 });
  }
  return { ok: bad.length === 0, badTickers: bad };
}

// ── Mid-window integrity gate ───────────────────────────────────────────────
// The today shares-gate proves the CURRENT holdings reconstruct, but says nothing
// about mid-history. A window is only displayable if EVERY day in it has a
// positive, fully-priced holdings value. Two failure modes, both from incomplete
// data (never floored — see the RULE on sharesAt):
//   - H(d) <= 0  → reconstructed net shares went negative (missing opening buy /
//                  position opened before the window / over-counted sells).
//   - unpriced   → a held ticker has no daily close on some in-window day.
// Pass the built ledger rows; get back a verdict + the dates/tickers to name in
// the banner. This is what gates the inception range for accounts with thin
// pre-window history.
export function windowIntegrity(rows, { unpricedTickers = [], negativeTickers = [] } = {}) {
  const nonPositiveHDays = rows.filter(r => r.H == null || r.H <= 0).map(r => r.date);
  const unpricedDays     = rows.filter(r => !r.priced).map(r => r.date);
  const ok = nonPositiveHDays.length === 0 && unpricedDays.length === 0;
  const causes = [];
  if (nonPositiveHDays.length) causes.push(`non-positive holdings value on ${nonPositiveHDays.length} day(s) from ${nonPositiveHDays[0]}${negativeTickers.length ? ` (${negativeTickers.join(', ')})` : ''}`);
  if (unpricedDays.length)     causes.push(`no price for ${unpricedTickers.join(', ') || 'a held ticker'} on ${unpricedDays.length} day(s)`);
  return { ok, nonPositiveHDays, unpricedDays, reason: causes.join('; ') || null };
}

// Tickers that were held on some in-window day but had no daily close (name these
// in the degradation banner).
export function unpricedHeldTickers(dates, tickers, legs, closeOf) {
  const bad = [];
  for (const t of tickers) {
    for (const d of dates) { if (sharesAt(legs, t, d) > 0 && closeOf[t](d) == null) { bad.push(t); break; } }
  }
  return bad;
}

// Tickers whose reconstructed net shares go negative anywhere in-window.
export function negativeShareTickers(dates, tickers, legs) {
  const bad = [];
  for (const t of tickers) {
    for (const d of dates) { if (sharesAt(legs, t, d) < -1e-9) { bad.push(t); break; } }
  }
  return bad;
}

// ── Daily ledger ────────────────────────────────────────────────────────────
// dates: ascending ISO spine (SPY trading days D0..today).
// tickers: every ticker ever traded (incl. positions later sold — they were held
//          mid-window and must be valued).
// closeOf(t): carry-forward USD close lookup for ticker t.
// fxOf: carry-forward lookup EURUSD (USD per 1 EUR); EUR = USD / fx.
// dividends: [{date, amountEur}] — credited as income (decision 1a).
// Returns rows [{ date, H, F_trade, divCr }] in EUR. Cash excluded (decision 2).
export function buildDailyLedger({ dates, tickers, legs, closeOf, fxOf, dividends }) {
  const divByDate = new Map();
  for (const dv of dividends ?? []) {
    if (dv?.date && typeof dv.amountEur === 'number')
      divByDate.set(dv.date, (divByDate.get(dv.date) ?? 0) + dv.amountEur);
  }

  const rows = [];
  let prevShares = new Map(tickers.map(t => [t, 0]));
  for (const d of dates) {
    const fx = fxOf(d);                 // USD per EUR
    const toEur = (usd) => (fx && fx > 0 ? usd / fx : null);

    let H = 0, tradeUsd = 0, priced = true;
    const curShares = new Map();
    for (const t of tickers) {
      const sh = sharesAt(legs, t, d);
      curShares.set(t, sh);
      if (sh === 0 && (prevShares.get(t) ?? 0) === 0) continue; // never held around d
      const c = closeOf[t](d);
      if (c == null) { if (sh !== 0) priced = false; continue; } // held but unpriced → flag
      H += sh * c;
      tradeUsd += (sh - (prevShares.get(t) ?? 0)) * c;           // net trade cost that day
    }
    prevShares = curShares;

    rows.push({
      date: d,
      H: toEur(H),
      F_trade: toEur(tradeUsd),
      divCr: divByDate.get(d) ?? 0,
      priced,
    });
  }
  return rows;
}

// Portfolio TWR series from the ledger. r(d) = (H − F_trade + divCr)/H_prev − 1,
// geometrically linked; starts at exactly 0% on D0. Deposits move it by zero
// because a buy raises H and is removed via F_trade.
export function twrSeries(rows) {
  const out = [];
  let cum = 1, started = false;
  for (let i = 0; i < rows.length; i++) {
    if (i === 0 || !started) { out.push({ date: rows[i].date, twrPct: 0 }); started = true; continue; }
    const prev = rows[i - 1].H, cur = rows[i];
    let r = 0;
    if (prev != null && prev > 1e-6 && cur.H != null) {
      r = (cur.H - (cur.F_trade ?? 0) + (cur.divCr ?? 0)) / prev - 1;
    }
    cum *= (1 + r);
    out.push({ date: cur.date, twrPct: (cum - 1) * 100 });
  }
  return out;
}

// SPY TWR in EUR from dividend-adjusted closes: sClose = adjClose · (1/fx).
export function spyTwrSeries(dates, spyAdjOf, fxOf) {
  const s0raw = spyAdjOf(dates[0]);
  const fx0 = fxOf(dates[0]);
  const base = s0raw != null && fx0 ? s0raw / fx0 : null;
  return dates.map(d => {
    const s = spyAdjOf(d), fx = fxOf(d);
    const val = s != null && fx ? s / fx : null;
    return { date: d, twrPct: base && val != null ? (val / base - 1) * 100 : 0 };
  });
}

// ── XIRR (money-weighted) ───────────────────────────────────────────────────
// cashflows: [{ date: ISO, amount }] investor sign convention
// (contributions negative, distributions + terminal positive). Returns annual rate
// or null if no root in (-0.99, 10).
export function xirr(cashflows) {
  const cf = cashflows.filter(c => c && c.date && Number.isFinite(c.amount))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (cf.length < 2) return null;
  const t0 = new Date(cf[0].date + 'T00:00:00Z').getTime();
  const yr = (d) => (new Date(d + 'T00:00:00Z').getTime() - t0) / (365 * 864e5);
  const npv = (r) => cf.reduce((s, c) => s + c.amount / Math.pow(1 + r, yr(c.date)), 0);
  // Bisection over a safe bracket.
  let lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}
