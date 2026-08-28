// Resolve a TradingView symbol to the symbol FMP will actually quote (spec §2).
//
// The FMP Starter plan has no global coverage, but most non-US names have a US
// listing it already serves. Resolution runs ONCE at import; the result is stored
// so it's never derived at request time.
//
// Contract (never guess, never drop — spec §2 step 2):
//   • clean "no US listing on this plan" → { resolved:false, providerSymbol:null, error:null }
//   • the resolution CALL itself failed  → { resolved:false, providerSymbol:null, error:'...' }
//     (surfaced so the operator can retry — a failed search is NOT the same as
//      "this name has no coverage", and must never be silently buried as one)
//   • resolved                            → { resolved:true,  providerSymbol:'ASML', exchange:'NASDAQ' }

import { fetchExternal } from '../externalFetch.js';

const FMP_BASE = 'https://financialmodelingprep.com/stable';

// FMP `exchange` / `exchangeShortName` values that count as a US listing.
const US_EXCHANGES = new Set([
  'NASDAQ', 'NYSE', 'AMEX', 'NYSE AMERICAN', 'NYSEARCA', 'NYSE ARCA',
  'BATS', 'CBOE', 'OTC', 'PNK', 'OTCMKTS',
]);

function isUsListing(row) {
  const ex = String(row.exchange || row.exchangeShortName || '').toUpperCase();
  return US_EXCHANGES.has(ex);
}

// Confirm a candidate symbol via a single quote lookup — the honest way to accept a
// symbol we derived (FX pair, hyphen variant) without guessing it exists.
// @returns {{ ok:true, row: object|null } | { ok:false, error: string }}
//   ok+row  = covered (a real priced quote)
//   ok+null = not covered on this plan (empty result)
//   !ok     = the call failed (surface + retry)
async function fetchQuoteRow(symbol, fmpKey, label) {
  const res = await fetchExternal(`${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${fmpKey}`, { label });
  if (!res.ok) {
    return { ok: false, error: res.status ? `quote HTTP ${res.status}` : (res.error || 'quote failed') };
  }
  const row = Array.isArray(res.data) ? res.data[0] : null;
  return { ok: true, row: row && row.price != null ? row : null };
}

const FAILED = (error) => ({
  resolved: false, providerSymbol: null, exchange: null, error,
  note: 'resolution failed — retry before trusting this row',
});

async function resolveEquity(displaySymbol, fmpKey) {
  const url = `${FMP_BASE}/search-symbol?query=${encodeURIComponent(displaySymbol)}&limit=25&apikey=${fmpKey}`;
  const res = await fetchExternal(url, { label: `watchlist-resolve:${displaySymbol}` });

  if (!res.ok) {
    // Search call failed — do NOT treat as "no listing".
    return FAILED(res.status ? `search HTTP ${res.status}` : (res.error || 'search failed'));
  }

  const rows = Array.isArray(res.data) ? res.data : [];
  const us = rows.filter(isUsListing);
  // Prefer an exact ticker match on a US exchange, else the first US listing.
  const pick = us.find(r => String(r.symbol).toUpperCase() === displaySymbol) || us[0];
  if (pick) {
    return {
      resolved: true,
      providerSymbol: String(pick.symbol).toUpperCase(),
      exchange: String(pick.exchange || pick.exchangeShortName || '').toUpperCase() || null,
      error: null,
      note: null,
    };
  }

  // Class shares: TradingView writes a dot (BRK.B) but FMP quotes with a hyphen
  // (BRK-B), and FMP's symbol SEARCH returns nothing for the dotted form. Try the
  // hyphen variant — CONFIRMED via a quote lookup, so it's verified, not guessed.
  if (displaySymbol.includes('.')) {
    const hyphen = displaySymbol.replace(/\./g, '-');
    const q = await fetchQuoteRow(hyphen, fmpKey, `watchlist-resolve-hyphen:${hyphen}`);
    if (!q.ok) return FAILED(q.error);
    if (q.row) {
      return {
        resolved: true,
        providerSymbol: hyphen,
        exchange: String(q.row.exchange || '').toUpperCase() || null,
        error: null,
        note: null,
      };
    }
  }

  return {
    resolved: false, providerSymbol: null, exchange: null, error: null,
    note: 'no US listing on current plan',
  };
}

async function resolveFx(displaySymbol, fmpKey) {
  // FX display symbol IS the provider symbol (e.g. GBPUSD). Confirm coverage with a
  // single quote lookup rather than guessing the pair exists on this plan.
  const q = await fetchQuoteRow(displaySymbol, fmpKey, `watchlist-resolve-fx:${displaySymbol}`);
  if (!q.ok) return FAILED(q.error);
  if (!q.row) {
    return {
      resolved: false, providerSymbol: null, exchange: null, error: null,
      note: 'pair not covered on current plan',
    };
  }
  return { resolved: true, providerSymbol: displaySymbol, exchange: 'FX', error: null, note: null };
}

/**
 * @param {{ displaySymbol: string, assetClass: 'equity'|'fx', fmpKey: string }} args
 */
export async function resolveSymbol({ displaySymbol, assetClass, fmpKey }) {
  if (assetClass === 'fx') return resolveFx(displaySymbol, fmpKey);
  return resolveEquity(displaySymbol, fmpKey);
}
