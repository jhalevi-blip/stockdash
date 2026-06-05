// Server-only helper: batched daily-close history from FMP's stable EOD endpoint.
//
// Extracted from the logic in app/api/historical-prices/route.js — kept independent on
// purpose (do NOT import the route). Used by the /themes temperature engine, which needs
// more symbols than the route's 20-ticker request cap allows, so we chunk here.

import { trackFMP } from './apiUsage';

const FMP_STABLE_EOD = 'https://financialmodelingprep.com/stable/historical-price-eod/full';
const BATCH_SIZE = 20;            // FMP per-call ceiling, mirrors the historical-prices route
const SYMBOL_RE = /^[A-Z0-9]+$/;  // same validation as the route

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fetch daily closes for many symbols, batching to respect FMP's 20-per-call ceiling.
 * Never throws — unreachable / invalid / empty symbols land in failedSymbols.
 *
 * @param {string[]} symbols
 * @param {number}   years    how many years back to request (clamped 1..5)
 * @returns {Promise<{
 *   seriesBySymbol: Record<string, { date: string, close: number }[]>,
 *   failedSymbols: string[],
 * }>}
 */
export async function fetchDailyCloses(symbols, years) {
  // Normalise + dedupe up front.
  const normalized = [...new Set((symbols ?? []).map(s => String(s).trim().toUpperCase()).filter(Boolean))];

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) {
    console.error('[fmpHistory] FMP_API_KEY not configured');
    return { seriesBySymbol: {}, failedSymbols: normalized };
  }

  // Split valid vs invalid; invalid symbols are reported as failed, never fetched.
  const valid   = normalized.filter(s => SYMBOL_RE.test(s));
  const invalid = normalized.filter(s => !SYMBOL_RE.test(s));

  const today = new Date().toISOString().slice(0, 10);
  const yearsBack = Math.min(Math.max(parseInt(String(years ?? 1), 10), 1), 5);
  const fromDateObj = new Date();
  fromDateObj.setFullYear(fromDateObj.getFullYear() - yearsBack);
  const fromDate = fromDateObj.toISOString().slice(0, 10);

  const seriesBySymbol = {};
  const failedSymbols = [...invalid];

  for (const batch of chunk(valid, BATCH_SIZE)) {
    // One usage tick per batch (each symbol is one FMP call).
    trackFMP(batch.length).catch(() => {});

    const results = await Promise.all(
      batch.map(async symbol => {
        try {
          const url = `${FMP_STABLE_EOD}?symbol=${symbol}&from=${fromDate}&to=${today}&apikey=${fmpKey}`;
          const res = await fetch(url, { next: { revalidate: 86400 } });

          if (!res.ok) {
            console.error(`[fmpHistory] FMP ${res.status} for ${symbol}`);
            return { symbol, prices: null };
          }

          const json = await res.json();

          // stable endpoint returns array directly; v3 returns { historical: [...] }
          let rows;
          if (Array.isArray(json)) {
            rows = json;
          } else if (Array.isArray(json?.historical)) {
            rows = json.historical;
          } else {
            console.error(`[fmpHistory] unexpected FMP shape for ${symbol}:`, JSON.stringify(json).slice(0, 200));
            return { symbol, prices: null };
          }

          const prices = rows
            .filter(d => d.date && d.close != null)
            .map(d => ({ date: d.date, close: +d.close }))
            .sort((a, b) => a.date.localeCompare(b.date));

          if (!prices.length) {
            console.error(`[fmpHistory] no usable data for ${symbol}`);
            return { symbol, prices: null };
          }

          return { symbol, prices };
        } catch (err) {
          console.error(`[fmpHistory] fetch failed for ${symbol}:`, err);
          return { symbol, prices: null };
        }
      })
    );

    for (const r of results) {
      if (r.prices) seriesBySymbol[r.symbol] = r.prices;
      else failedSymbols.push(r.symbol);
    }
  }

  return { seriesBySymbol, failedSymbols };
}
