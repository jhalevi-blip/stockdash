// Shared per-position currency valuation — used by BOTH the dashboard and
// /performance so their totals can never diverge. Value each position in its own
// currency, then convert to the display currency. Rules:
//   • GBX / GBp are pence → ÷100 into GBP (price AND cost).
//   • A position is "priced" only when the quote's currency matches the holding's
//     currency (no pricing off a different listing / ADR). Otherwise it is
//     "no price": excluded from value/P&L totals, never dropped.
//   • Quote currency is derived from the exchange (lib/quoteCurrency.js); FMP omits it.

import { exchangeCurrency } from '@/lib/quoteCurrency';

export const isPence = (raw) => raw === 'GBX' || raw === 'GBp';
export const normCcy = (raw) => (isPence(raw) ? 'GBP' : String(raw || 'USD').toUpperCase());

/** FX rates as USD-per-unit. Missing rate → that currency can't be converted. */
export const buildFxRates = (eurUsd, gbpUsd) => ({
  USD: 1,
  ...(eurUsd ? { EUR: eurUsd } : {}),
  ...(gbpUsd ? { GBP: gbpUsd } : {}),
});

/** Convert `amount` from `fromCcy` to `displayCcy`; null if either rate is missing. */
export function toDisplay(amount, fromCcy, rates, displayCcy) {
  if (amount == null) return null;
  const from = rates[fromCcy], to = rates[displayCcy];
  if (from == null || to == null) return null;
  return (amount * from) / to;
}

/** Resolve a quote's currency: prefer an explicit `currency`, else derive from `exchange`. */
export function quoteCurrency(quote) {
  if (!quote) return null;
  const raw = quote.currency ?? exchangeCurrency(quote.exchange);
  return raw ? normCcy(raw) : null;
}

/**
 * Value one holding against a quote, in its own currency + converted to display.
 * @param {{s:number,c:number,currency?:string}} holding
 * @param {{price?:number,currency?:string,exchange?:string}|null} quote
 * @param {Record<string,number>} rates  buildFxRates(...)
 * @param {string} displayCcy
 * @returns {{priced:boolean, nativeCcy:string, price:number|null, costNative:number,
 *   mktNative:number|null, plNative:number|null, plPct:number|null,
 *   valueDisplay:number|null, costDisplay:number|null, plDisplay:number|null}}
 */
export function valuePosition(holding, quote, rates, displayCcy) {
  const rawCcy = holding.currency || 'USD';         // legacy rows default to USD
  const nativeCcy = normCcy(rawCcy);
  const costNative = isPence(rawCcy) ? holding.c / 100 : holding.c; // per share
  const costTotalNative = holding.s * costNative;

  const qCcy = quoteCurrency(quote);
  const priceNative = quote?.price == null
    ? null
    : (isPence(quote.currency ?? '') ? quote.price / 100 : quote.price);

  const priced = priceNative != null && qCcy != null && qCcy === nativeCcy
    && rates[nativeCcy] != null && rates[displayCcy] != null;

  if (!priced) {
    return { priced: false, nativeCcy, price: null, costNative,
             mktNative: null, plNative: null, plPct: null,
             valueDisplay: null, costDisplay: toDisplay(costTotalNative, nativeCcy, rates, displayCcy), plDisplay: null };
  }
  const mktNative = holding.s * priceNative;
  const plNative  = mktNative - costTotalNative;
  return {
    priced: true, nativeCcy, price: priceNative, costNative, mktNative, plNative,
    plPct: costTotalNative > 0 ? (plNative / costTotalNative) * 100 : 0,
    valueDisplay: toDisplay(mktNative, nativeCcy, rates, displayCcy),
    costDisplay:  toDisplay(costTotalNative, nativeCcy, rates, displayCcy),
    plDisplay:    toDisplay(plNative, nativeCcy, rates, displayCcy),
  };
}
