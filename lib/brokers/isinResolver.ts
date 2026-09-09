const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

// OpenFIGI rejects requests with more than 10 mapping jobs on the unauthenticated
// tier (HTTP 413). We hold no API key, so every batch must stay ≤ 10 and run
// sequentially — 3 concurrent chunks trip the per-caller rate limit.
export const OPENFIGI_BATCH = 10;

type FigiEntry = { ticker: string; exchCode: string; name?: string };
type FigiResult = { data?: FigiEntry[]; error?: string };

// ISIN home-country prefixes for which the US OTC foreign-ordinary line (ASMLF,
// RYDAF, ADYYF …) is the wrong pick — a euro investor holds the native listing.
const EU_ISIN_PREFIXES = new Set([
  'NL', 'GB', 'DE', 'FR', 'BE', 'IE', 'FI', 'ES', 'IT', 'CH', 'SE', 'DK', 'NO', 'AT', 'PT',
]);

// OpenFIGI composite exchange code per home market. NA / LN / GR are verified
// against the live mapping response for NL0010273215, GB00BP6MXD84 and
// NL0012969182; DC / ID confirmed via Carlsberg/Vestas and Kerry/Ryanair/Kingspan;
// the remainder are OpenFIGI's documented country-composite codes.
const HOME_EXCH: Record<string, string> = {
  NL: 'NA', GB: 'LN', DE: 'GR', FR: 'FP', BE: 'BB', IE: 'ID', FI: 'FH',
  ES: 'SM', IT: 'IM', CH: 'SW', SE: 'SS', DK: 'DC', NO: 'NO', AT: 'AV', PT: 'PL',
};

// OpenFIGI exchange codes for genuine US primary venues (NYSE, NASDAQ tiers,
// NYSE American, NYSE Arca) — as opposed to the US composite ('US') / OTC ('PQ',
// 'UV') lines, which for non-US-listed names carry only the foreign-ordinary proxy.
const US_PRIMARY_EXCH = new Set(['UN', 'UW', 'UQ', 'UR', 'UA', 'UP']);

/**
 * Pick the ticker + company name for one ISIN from OpenFIGI's `data[]` entries.
 *
 *   European ISIN  → the home-market listing only (e.g. NL → exchCode 'NA' →
 *                    'ASML'). The US OTC foreign-ordinary line is never used;
 *                    if the home listing is absent we return null so the caller
 *                    treats the ISIN as unresolved rather than substituting a
 *                    thin OTC proxy.
 *   Everything else → unchanged: prefer the US listing, else the first entry.
 */
export function pickPreferredEntry(
  isin: string,
  data: FigiEntry[] | undefined,
): { ticker: string; name: string } | null {
  if (!data?.length) return null;
  const cc = String(isin).slice(0, 2).toUpperCase();

  let hit: FigiEntry | undefined;
  if (EU_ISIN_PREFIXES.has(cc)) {
    // A genuine US PRIMARY-venue listing (NYSE/NASDAQ/Arca, exchCode UN/UW/UQ/UA/UP)
    // means the company actually trades in the US, so prefer it over a native or
    // stale home listing — Transocean (CH) → RIG, CRH (IE) → CRH. This is distinct
    // from the US composite/OTC line ('US'/'PQ'/'UV'), which for names that don't
    // really list in the US is only the thin foreign-ordinary proxy (Adyen ADYYF,
    // Nokia NOKBF, ASML ASMLF, Shell RYDAF) — those have NO primary-venue entry, so
    // we keep the home listing instead.
    const usPrimary = data.find((d) => US_PRIMARY_EXCH.has(d.exchCode) && d.ticker);
    const home = HOME_EXCH[cc];
    const homeHit = home ? data.find((d) => d.exchCode === home && d.ticker) : undefined;
    hit = usPrimary ?? homeHit;
  } else {
    // US / rest-of-world ISIN path — unchanged.
    hit = data.find((d) => d.exchCode === 'US') ?? data[0];
  }
  if (!hit?.ticker) return null;
  // OpenFIGI returns Bloomberg-style LSE tickers with a trailing slash (BP → 'BP/').
  // Strip it so the symbol matches FMP ('BP') and isn't misread as an option symbol
  // by the slash guard downstream. Only a TRAILING slash — mid-slash option tickers
  // like 'QBTS/15F27P2' are untouched and still filtered.
  const ticker = hit.ticker.replace(/[/∕／]+$/, '');
  return ticker ? { ticker, name: hit.name ?? '' } : null;
}

/** Ticker-only view of pickPreferredEntry — the contract the import parsers rely on. */
export function pickPreferredTicker(isin: string, data: FigiEntry[] | undefined): string | null {
  return pickPreferredEntry(isin, data)?.ticker ?? null;
}

async function fetchFigiBatch(batch: string[]): Promise<FigiResult[] | null> {
  try {
    const res = await fetch(OPENFIGI_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(batch.map((isin) => ({ idType: 'ID_ISIN', idValue: isin }))),
    });
    if (!res.ok) {
      // Surface, don't swallow: an unauthenticated >10-job request returns 413,
      // which previously vanished silently and dropped every holding.
      console.error(`[isinResolver] OpenFIGI HTTP ${res.status} for ${batch.length} ISINs: ${batch.join(',')}`);
      return null;
    }
    return (await res.json()) as FigiResult[];
  } catch (err) {
    // Partial resolution beats total failure — but log so failures stay visible.
    console.error(`[isinResolver] OpenFIGI request failed for ${batch.length} ISINs: ${batch.join(',')}`, err);
    return null;
  }
}

/** Server-side branch: sequential ≤OPENFIGI_BATCH chunks, ticker-only (import path). */
async function resolveViaOpenFIGI(isins: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  for (let i = 0; i < isins.length; i += OPENFIGI_BATCH) {
    const batch = isins.slice(i, i + OPENFIGI_BATCH);
    const figiData = await fetchFigiBatch(batch);
    if (!figiData) continue;
    for (let j = 0; j < batch.length; j++) {
      const ticker = pickPreferredTicker(batch[j], figiData[j]?.data);
      if (ticker) resolved.set(batch[j], ticker);
    }
  }
  return resolved;
}

/** Server-side branch: same chunks, ticker + OpenFIGI company name (demo identity check). */
async function resolveDetailedViaOpenFIGI(isins: string[]): Promise<Map<string, { ticker: string; name: string }>> {
  const resolved = new Map<string, { ticker: string; name: string }>();
  for (let i = 0; i < isins.length; i += OPENFIGI_BATCH) {
    const batch = isins.slice(i, i + OPENFIGI_BATCH);
    const figiData = await fetchFigiBatch(batch);
    if (!figiData) continue;
    for (let j = 0; j < batch.length; j++) {
      const entry = pickPreferredEntry(batch[j], figiData[j]?.data);
      if (entry) resolved.set(batch[j], entry);
    }
  }
  return resolved;
}

/**
 * Resolve ISINs → tickers. Environment-aware:
 *   Server: OpenFIGI directly. Browser: proxy through /api/brokers/resolve-isin.
 */
export async function resolveBatchIsins(isins: string[]): Promise<Map<string, string>> {
  if (isins.length === 0) return new Map();
  const unique = [...new Set(isins)];

  if (typeof window === 'undefined') return resolveViaOpenFIGI(unique);

  try {
    const res = await fetch('/api/brokers/resolve-isin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isins: unique }),
    });
    if (!res.ok) return new Map();
    const { resolved } = (await res.json()) as { resolved: Record<string, string> };
    return new Map(Object.entries(resolved ?? {}));
  } catch {
    return new Map();
  }
}

/**
 * Resolve ISINs → { ticker, name }. Same environment-awareness as resolveBatchIsins.
 * Used only by the logged-out demo's identity check — the import parsers keep
 * using the ticker-only resolveBatchIsins above, so their path is unchanged.
 */
export async function resolveBatchIsinsWithNames(
  isins: string[],
): Promise<Map<string, { ticker: string; name: string }>> {
  if (isins.length === 0) return new Map();
  const unique = [...new Set(isins)];

  if (typeof window === 'undefined') return resolveDetailedViaOpenFIGI(unique);

  try {
    const res = await fetch('/api/brokers/resolve-isin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isins: unique }),
    });
    if (!res.ok) return new Map();
    const { resolved, names } = (await res.json()) as {
      resolved: Record<string, string>;
      names?: Record<string, string>;
    };
    const map = new Map<string, { ticker: string; name: string }>();
    for (const isin of Object.keys(resolved ?? {})) {
      map.set(isin, { ticker: resolved[isin], name: (names ?? {})[isin] ?? '' });
    }
    return map;
  } catch {
    return new Map();
  }
}
