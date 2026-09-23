// Coverage + identity gate — shared between the logged-out landing demo
// (lib/brokers/parseInBrowser.js) and the authenticated import path
// (app/api/upload/route.ts).
//
// Two gates protect against ISIN resolution mapping to the wrong company (a
// Belgian ISIN once resolved to an ETF rather than the intended issuer):
//   • coverage — a resolved ticker with no FMP price history can't be charted
//     and is usually a symbol collision; excluded on every ticker.
//   • identity — OpenFIGI's company name is compared against FMP's profile name.
//     Runs only on tickers that CAME FROM an ISIN → OpenFIGI resolution: a
//     broker-supplied ticker (Saxo, Trading212, Schwab) has no resolution step
//     to second-guess, so it passes untouched.
//
// The name-matching half (normName / nameMatch) is pure and env-free so both
// callers share one definition — the whole point of the gate is that the two
// paths must not drift. The FMP fetch helpers here are server-only (they take
// the key directly); the demo keeps its own browser fetches through the thin
// /api/* wrappers, since the FMP key can't reach the client.

import type { BrokerFormat } from './types';

// ── Name matching (pure — shared with the demo) ─────────────────────────────────

const CORP_SUFFIXES =
  /\b(n\s*v|nv|s\s*a|sa|ag|plc|se|asa|a\s*s|oyj|spa|s\s*p\s*a|inc|incorporated|corp|corporation|co|company|ltd|limited|holding|holdings|group|the)\b/g;

export function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    // Collapse dotted acronyms BEFORE punctuation is stripped, so a legal suffix
    // written 'p.l.c.' / 'N.V.' / 'S.p.A.' becomes one token (plc / nv / spa) and
    // then strips like its undotted form — otherwise it survives as 'p l c' and
    // breaks the match (FMP writes 'BP p.l.c.', OpenFIGI writes 'BP PLC').
    .replace(/[a-z](?:\.[a-z])+\.?/g, (m) => m.replace(/\./g, ''))
    .replace(/[.,/&'"()-]/g, ' ')   // remaining punctuation → space
    .replace(CORP_SUFFIXES, ' ')     // drop corporate suffixes / filler
    .replace(/\s+/g, ' ')
    .trim();
}

// Loose match: after normalising, exact at any length, or a clear substring
// either direction — but only when the shorter name is ≥4 chars, since the
// suffix stripping can reduce a name to 2–3 letters that collide with unrelated
// companies. Exact equality stays allowed at any length.
export function nameMatch(a: string, b: string): boolean {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 4) return false;
  return x.includes(y) || y.includes(x);
}

// ── Broker → ticker origin ──────────────────────────────────────────────────────
// Only ISIN-resolved brokers can carry a wrong-company mapping. Of those, only
// DeGiro also carries the OpenFIGI company name that identity needs. IBKR and
// Rabobank resolve ISINs with the ticker-only resolver (resolveBatchIsins), so
// identity can't run on them yet — they're reported, never silently passed.
export type BrokerOrigin = 'broker-supplied' | 'isin-named' | 'isin-unnamed';

export function brokerOrigin(broker: BrokerFormat): BrokerOrigin {
  if (broker === 'degiro') return 'isin-named';
  if (broker === 'ibkr' || broker === 'rabobank') return 'isin-unnamed';
  return 'broker-supplied';
}

// ── Gate decision (pure — testable without network) ─────────────────────────────

export type ExclusionReason = 'coverage' | 'identity';

export interface Exclusion {
  broker:   BrokerFormat;
  ticker:   string;
  reason:   ExclusionReason;
  /** OpenFIGI company name (identity exclusions only; null when absent). */
  figiName: string | null;
  /** FMP profile company name (identity exclusions only; null when absent). */
  fmpName:  string | null;
}

/**
 * Why an ISIN-resolved lot could not be identity-checked. None of these are
 * evidence of a wrong mapping — absence of an answer, not a contradicting one —
 * so the lot is passed through, not excluded.
 *   broker-has-no-name       → IBKR / Rabobank resolve ISINs without a name.
 *   fmp-profile-unavailable  → FMP returned no profile name (likely transient).
 *   no-openfigi-name         → the resolver produced a ticker but no company name.
 */
export type IdentityUnverifiedReason =
  | 'broker-has-no-name'
  | 'fmp-profile-unavailable'
  | 'no-openfigi-name';

export interface IdentityUnverified {
  broker: BrokerFormat;
  ticker: string;
  reason: IdentityUnverifiedReason;
}

export interface GateDecision {
  /** `${broker}__${ticker}` keys to drop from every downstream consumer. */
  excludedKeys:       Set<string>;
  /** Per (broker, ticker) exclusion with reason — for the response body. */
  exclusions:         Exclusion[];
  /** ISIN-resolved (broker, ticker) pairs that couldn't be identity-checked.
   *  Passed through, not excluded — reported so the gap is visible. */
  identityUnverified: IdentityUnverified[];
  /** (broker, ticker) pairs whose COVERAGE probe failed transiently (network
   *  throw / non-OK HTTP) — distinct from a confirmed-empty price series. Passed
   *  through rather than dropping a real holding on a transient failure. */
  coverageUnverified: { broker: BrokerFormat; ticker: string }[];
}

export interface GateContext {
  /** Tickers FMP confirmed it can price (≥1 row in the probe window). */
  covered:             Set<string>;
  /** Tickers whose coverage probe failed transiently — NOT a confirmed-empty
   *  series. These are passed through and reported, never excluded. */
  coverageProbeFailed: Set<string>;
  /** FMP profile name per ticker (identity-capable brokers only). */
  profiles:            Record<string, { name: string | null }>;
  /** OpenFIGI company name for a resolved (broker, ticker), or undefined. */
  figiNameFor:         (broker: BrokerFormat, ticker: string) => string | undefined;
}

export function key(broker: BrokerFormat, ticker: string): string {
  return `${broker}__${ticker}`;
}

/**
 * Decide which (broker, ticker) lots to exclude. Pure: all network results are
 * supplied via `ctx`. Only *evidence* excludes:
 *   • coverage — a CONFIRMED-empty FMP series (probe succeeded, zero rows).
 *     A probe that threw or returned non-OK is transient, not evidence, so the
 *     lot passes and lands in coverageUnverified.
 *   • identity — both names present and they DISAGREE. A missing name on either
 *     side (FMP profile unavailable, no OpenFIGI name) is not evidence, so the
 *     lot passes and lands in identityUnverified.
 * This is the one deliberate divergence from the demo (parseInBrowser.js), which
 * excludes on any absent name — fine there (nothing persists; the user re-drops
 * the file), wrong here (it would silently drop a real holding from a stored
 * portfolio on a transient fetch failure — the very loss the gate exists to stop).
 */
export function decideGate(
  brokerTickers: { broker: BrokerFormat; ticker: string }[],
  ctx: GateContext,
): GateDecision {
  const excludedKeys       = new Set<string>();
  const exclusions:         Exclusion[] = [];
  const identityUnverified: IdentityUnverified[] = [];
  const coverageUnverified: { broker: BrokerFormat; ticker: string }[] = [];

  for (const { broker, ticker } of brokerTickers) {
    const k = key(broker, ticker);

    // Coverage — every ticker, every broker. A ticker FMP can't price is NO LONGER
    // dropped: it is kept and reported as coverageUnverified, so the position is
    // saved and shown as "no price" on the dashboard rather than silently vanishing
    // from a stored portfolio (the EU-ETF loss). Only the identity check below can
    // exclude — a confirmed wrong-company ISIN mapping is a different, safety concern.
    if (!ctx.covered.has(ticker)) {
      coverageUnverified.push({ broker, ticker });          // uncovered → pass, report, price as "no price"
      continue;
    }

    const origin = brokerOrigin(broker);
    if (origin === 'broker-supplied') continue;            // nothing to second-guess → pass

    if (origin === 'isin-unnamed') {                       // IBKR / Rabobank — no name to check
      identityUnverified.push({ broker, ticker, reason: 'broker-has-no-name' });
      continue;
    }

    // isin-named (DeGiro) — compare OpenFIGI name against FMP's.
    const figiName = ctx.figiNameFor(broker, ticker) ?? null;
    const fmpName  = ctx.profiles[ticker]?.name ?? null;
    if (figiName && fmpName) {
      if (nameMatch(figiName, fmpName)) continue;          // verified → pass
      excludedKeys.add(k);                                 // both present + disagree = evidence
      exclusions.push({ broker, ticker, reason: 'identity', figiName, fmpName });
      continue;
    }

    // A name is missing on one side — absence of an answer, not a contradiction.
    identityUnverified.push({
      broker, ticker,
      reason: !fmpName ? 'fmp-profile-unavailable' : 'no-openfigi-name',
    });
  }

  return { excludedKeys, exclusions, identityUnverified, coverageUnverified };
}

// ── FMP fetch helpers (server-only) ─────────────────────────────────────────────

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const VALID_SYMBOL = /^[A-Z0-9]+$/;

async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export interface CoverageResult {
  /** Confirmed priceable: the probe returned ≥1 price row. */
  covered:     Set<string>;
  /** Probe failed transiently — network throw or non-OK HTTP. NOT a confirmed
   *  -empty series, so the caller passes these through rather than excluding a
   *  real holding on a transient failure. A malformed symbol FMP can't accept is
   *  deterministic, not transient, so it's left out of BOTH sets → excluded. */
  probeFailed: Set<string>;
}

/**
 * Server-side coverage probe: which tickers have any FMP price history in the
 * last year. Fans out one single-symbol request per ticker — FMP's Starter tier
 * restricts the batch endpoints, and the demo's /api/historical-prices does the
 * same fan-out. Distinguishes a confirmed-empty series (probe OK, zero rows →
 * evidence of no listing) from a transient failure (throw / non-OK HTTP), so the
 * caller can exclude the former but pass the latter through.
 */
export async function fmpCoverage(tickers: string[], apiKey: string): Promise<CoverageResult> {
  const covered     = new Set<string>();
  const probeFailed = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  const from  = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const fromDate = from.toISOString().slice(0, 10);

  await inChunks([...new Set(tickers)], 20, async (t) => {
    if (!VALID_SYMBOL.test(t)) return;   // deterministic non-priceable → excluded
    try {
      const res = await fetch(
        `${FMP_BASE}/historical-price-eod/light?symbol=${t}&from=${fromDate}&to=${today}&apikey=${apiKey}`,
        { next: { revalidate: 86400 } },
      );
      if (!res.ok) { probeFailed.add(t); return; }   // HTTP error → transient, not evidence
      const json = await res.json();
      const rows = Array.isArray(json) ? json : json?.historical;
      if (Array.isArray(rows) && rows.length > 0) covered.add(t);
      // else: probe succeeded with an empty series → confirmed non-priceable → excluded
    } catch { probeFailed.add(t); }   // network throw → transient
  });
  return { covered, probeFailed };
}

/**
 * Server-side FMP profile names per ticker. FMP's /profile takes a single symbol,
 * so this fans out and returns a { ticker → { name } } map. A missing entry means
 * the profile couldn't be fetched — decideGate treats that as unverified.
 */
export async function fmpProfiles(
  tickers: string[],
  apiKey: string,
): Promise<Record<string, { name: string | null }>> {
  const out: Record<string, { name: string | null }> = {};
  await inChunks([...new Set(tickers)], 20, async (t) => {
    if (!VALID_SYMBOL.test(t)) return;
    try {
      const res = await fetch(
        `${FMP_BASE}/profile?symbol=${t}&apikey=${apiKey}`,
        { next: { revalidate: 86400 } },
      );
      if (!res.ok) return;
      const json = await res.json();
      const p = Array.isArray(json) ? json[0] : json;
      if (p) out[t] = { name: p.companyName ?? null };
    } catch { /* skip → unverified */ }
  });
  return out;
}
