// Per-lot currency attribution for a EUR-based investor — the engine behind the
// /performance "Currency Impact" card. It isolates the euro effect of FX moves on
// each position's LOCAL-currency value, per lot:
//
//   open lot : currentLocalValue × (eurPerLocal_now  − eurPerLocal_t0)
//   sold lot : saleProceedsLocal × (eurPerLocal_sale − eurPerLocal_t0)
//
// with t0 = later of the window start and the lot's purchase date. EUR legs move
// nothing (eurPerLocal ≡ 1) and contribute exactly zero.
//
// Sells are matched to buys FIFO. FX at a trade date uses the BROKER's recorded rate
// when the (additive) enriched leg carries an explicit `fx` (DeGiro's per-order rate,
// local units per EUR) — NOT amountEur/(|s|×price), because a booking amount can bundle
// commission and would bias the rate. Legs without `fx` (e.g. Saxo, whose Boekingsbedrag
// may include fees) fall back to the DAILY close (previous trading day via carry-forward).
// Held shares the legs don't explain (manual entries / incomplete history) fall back to
// the current-holdings-at-start estimate, tracked separately so the card can disclose it.
//
// Pure + framework-agnostic → unit-tested in __tests__/currencyAttribution.test.js.

export const isPence = (c) => c === 'GBX' || c === 'GBp';
export const normCurrency = (c) => (isPence(c) ? 'GBP' : String(c || 'USD').toUpperCase());

/**
 * EUR value of `local` units of `ccy`, given an FX snapshot {eurUsd, gbpUsd}
 * (USD per EUR, USD per GBP). `local` must already be pence-normalised to GBP.
 * Returns null when a required rate is missing (→ caller treats as unavailable).
 */
export function eurValue(local, ccy, fx) {
  const c = normCurrency(ccy);
  if (c === 'EUR') return local;
  if (!fx || !fx.eurUsd) return null;
  if (c === 'USD') return local / fx.eurUsd;
  if (c === 'GBP') return fx.gbpUsd ? (local * fx.gbpUsd) / fx.eurUsd : null;
  return null; // unknown currency
}

/** EUR per 1 local unit at an FX snapshot (pence pre-normalised to GBP). */
const dailyRate = (ccy, fx) => eurValue(1, ccy, fx);

/** Price per share normalised out of pence (GBX → GBP). */
const priceNorm = (price, ccy) => (price == null ? null : (isPence(ccy) ? price / 100 : price));

/**
 * Broker's recorded rate for a leg as EUR per 1 normalised-local unit, from the
 * explicit per-order `fx` the export carries (DeGiro's orderFx = local units per EUR).
 * We deliberately do NOT derive it from amountEur/(|s|×price): a booking amount can
 * include commission and would bias the rate. abs() guards the sign; pence (GBX) is
 * scaled to GBP so the rate matches the ÷100-normalised local value. Returns null when
 * the leg has no `fx` (→ caller uses the daily close).
 */
export function brokerRate(leg) {
  const fx = leg && leg.fx != null && Number.isFinite(leg.fx) ? Math.abs(leg.fx) : null; // local units per EUR
  if (!fx) return null;
  const perUnit = 1 / fx;                                  // EUR per 1 raw local unit
  return isPence(leg?.currency) ? perUnit * 100 : perUnit; // → EUR per normalised (GBP) unit
}

const isFin = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * @param {object} args
 * @param {{t:string,d:string,s:number,price?:number,currency?:string,amountEur?:number,fx?:number}[]} args.legs
 *   `fx` = broker's per-order rate (local units per EUR); when present it's used for
 *   that leg's trade-date FX, else the daily close.
 * @param {{t:string,s:number,currency?:string}[]} args.holdings  current holdings (estimate fallback)
 * @param {Record<string,{price:number,currency?:string}>} args.quotes  current quotes per ticker
 * @param {{eurUsd:number,gbpUsd?:number}} args.fxNow  current FX snapshot
 * @param {(iso:string)=>{eurUsd:number,gbpUsd?:number}} args.fxAt  daily-close FX snapshot (carry-forward)
 * @param {Record<string,(iso:string)=>number|null>} [args.closeAt]  daily local close per ticker (sold-lot proceeds fallback)
 * @param {string} args.windowStart  D0 (ISO)
 * @returns {{total:number|null, open:number, realised:number, estimatedEur:number,
 *   available:boolean, byLot:Array, sources:{broker:number,daily:number,estimate:number}}}
 */
export function computeCurrencyAttribution({ legs = [], holdings = [], quotes = {}, fxNow, fxAt, closeAt = {}, windowStart }) {
  const byTicker = new Map();
  for (const l of legs) {
    if (!l || !l.t || !l.d || !isFin(l.s)) continue;
    (byTicker.get(l.t) ?? byTicker.set(l.t, []).get(l.t)).push(l);
  }
  for (const arr of byTicker.values()) arr.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  const holdingByT = new Map(holdings.filter(h => h && h.t && h.t !== '__CASH__').map(h => [h.t, h]));
  const tickerCcy = (t) => normCurrency(quotes[t]?.currency ?? holdingByT.get(t)?.currency ?? byTicker.get(t)?.find(l => l.currency)?.currency ?? 'USD');

  const byLot = [];
  const sources = { broker: 0, daily: 0, estimate: 0 };
  let open = 0, realised = 0, estimatedEur = 0, unavailable = false;

  // rate at a trade date: broker leg rate if present, else daily close. Records source.
  const rateAt = (ccy, leg, useBrokerLeg, iso) => {
    if (useBrokerLeg) { const r = brokerRate(leg); if (r != null) { return { r, src: 'broker' }; } }
    return { r: dailyRate(ccy, fxAt(iso)), src: 'daily' };
  };

  const allTickers = new Set([...byTicker.keys(), ...holdingByT.keys()]);
  for (const t of allTickers) {
    const ccy = tickerCcy(t);
    const arr = byTicker.get(t) ?? [];

    // ── FIFO: recover open lots + closed chunks ──────────────────────────────
    const queue = [];        // open buy lots: { shares, buyDate, buyLeg }
    const closed = [];       // { shares, buyDate, buyLeg, saleDate, sellLeg }
    for (const leg of arr) {
      if (leg.s > 0) { queue.push({ shares: leg.s, buyDate: leg.d, buyLeg: leg }); continue; }
      let toSell = Math.abs(leg.s);
      while (toSell > 1e-9 && queue.length) {
        const lot = queue[0];
        const take = Math.min(lot.shares, toSell);
        closed.push({ shares: take, buyDate: lot.buyDate, buyLeg: lot.buyLeg, saleDate: leg.d, sellLeg: leg });
        lot.shares -= take; toSell -= take;
        if (lot.shares <= 1e-9) queue.shift();
      }
      // toSell left over = sell without a matching buy (incomplete history) → ignored.
    }

    // ── Closed lots sold WITHIN the window ───────────────────────────────────
    for (const c of closed) {
      if (windowStart && c.saleDate < windowStart) continue;      // sold before window → not in scope
      const t0 = windowStart && c.buyDate < windowStart ? windowStart : c.buyDate;
      const salePrice = priceNorm(c.sellLeg?.price, c.sellLeg?.currency ?? ccy)
        ?? (closeAt[t] ? priceNorm(closeAt[t](c.saleDate), ccy) : null);
      if (salePrice == null) { unavailable = true; byLot.push({ t, kind: 'sold', shares: c.shares, note: 'no sale price' }); continue; }
      const proceeds = c.shares * salePrice;
      const eSale = rateAt(ccy, c.sellLeg, true, c.saleDate);
      const eT0   = rateAt(ccy, c.buyLeg, t0 === c.buyDate, t0);
      if (eSale.r == null || eT0.r == null) { unavailable = true; continue; }
      const effect = proceeds * (eSale.r - eT0.r);
      realised += effect;
      sources[eSale.src]++; sources[eT0.src]++;
      byLot.push({ t, kind: 'sold', shares: c.shares, ccy, t0, saleDate: c.saleDate, proceeds, eT0: eT0.r, eSale: eSale.r, effect, src: `${eT0.src}/${eSale.src}` });
    }

    // ── Open lots ────────────────────────────────────────────────────────────
    const q = quotes[t];
    const curPrice = priceNorm(q?.price, q?.currency ?? ccy);
    let reconOpenShares = 0;
    for (const lot of queue) reconOpenShares += lot.shares;
    if (curPrice != null) {
      const eNow = dailyRate(ccy, fxNow);
      for (const lot of queue) {
        const t0 = windowStart && lot.buyDate < windowStart ? windowStart : lot.buyDate;
        const localVal = lot.shares * curPrice;
        const eT0 = rateAt(ccy, lot.buyLeg, t0 === lot.buyDate, t0);
        if (eNow == null || eT0.r == null) { unavailable = true; continue; }
        const effect = localVal * (eNow - eT0.r);
        open += effect;
        sources[eT0.src]++;
        byLot.push({ t, kind: 'open', shares: lot.shares, ccy, t0, localVal, eT0: eT0.r, eNow, effect, src: eT0.src });
      }
    }

    // ── Estimate fallback for held shares the legs don't explain ─────────────
    const held = holdingByT.get(t)?.s ?? 0;
    const gap = held - reconOpenShares;
    if (gap > 1e-6 && curPrice != null && windowStart) {
      const eNow = dailyRate(ccy, fxNow);
      const eStart = dailyRate(ccy, fxAt(windowStart));
      if (eNow != null && eStart != null) {
        const localVal = gap * curPrice;
        const effect = localVal * (eNow - eStart);
        estimatedEur += effect;
        sources.estimate++;
        byLot.push({ t, kind: 'estimate', shares: gap, ccy, t0: windowStart, localVal, effect, src: 'estimate' });
      } else { unavailable = true; }
    }
  }

  const total = unavailable && open === 0 && realised === 0 && estimatedEur === 0 ? null
    : Math.round((open + realised + estimatedEur) * 100) / 100;
  return {
    total,
    open: Math.round(open * 100) / 100,
    realised: Math.round(realised * 100) / 100,
    estimatedEur: Math.round(estimatedEur * 100) / 100,
    available: !unavailable,
    byLot,
    sources,
  };
}
