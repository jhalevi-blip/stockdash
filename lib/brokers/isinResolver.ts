const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

// OpenFIGI rejects requests with more than 10 mapping jobs on the unauthenticated
// tier (HTTP 413). We hold no API key, so every batch must stay ≤ 10 and run
// sequentially — 3 concurrent chunks trip the per-caller rate limit.
export const OPENFIGI_BATCH = 10;

type FigiEntry = { ticker: string; exchCode: string };

// ISIN home-country prefixes for which the US OTC foreign-ordinary line (ASMLF,
// RYDAF, ADYYF …) is the wrong pick — a euro investor holds the native listing.
const EU_ISIN_PREFIXES = new Set([
  'NL', 'GB', 'DE', 'FR', 'BE', 'IE', 'FI', 'ES', 'IT', 'CH', 'SE', 'DK', 'NO', 'AT', 'PT',
]);

// OpenFIGI composite exchange code per home market. NA / LN / GR are verified
// against the live mapping response for NL0010273215, GB00BP6MXD84 and
// NL0012969182; the remainder are OpenFIGI's documented country-composite codes.
const HOME_EXCH: Record<string, string> = {
  NL: 'NA', GB: 'LN', DE: 'GR', FR: 'FP', BE: 'BB', IE: 'ID', FI: 'FH',
  ES: 'SM', IT: 'IM', CH: 'SW', SE: 'SS', DK: 'DC', NO: 'NO', AT: 'AV', PT: 'PL',
};

/**
 * Pick the ticker for one ISIN from OpenFIGI's `data[]` entries.
 *
 *   European ISIN  → the home-market listing only (e.g. NL → exchCode 'NA' →
 *                    'ASML'). The US OTC foreign-ordinary line is never used;
 *                    if the home listing is absent we return null so the caller
 *                    treats the ISIN as unresolved rather than substituting a
 *                    thin OTC proxy.
 *   Everything else → unchanged: prefer the US listing, else the first entry.
 */
export function pickPreferredTicker(isin: string, data: FigiEntry[] | undefined): string | null {
  if (!data?.length) return null;
  const cc = String(isin).slice(0, 2).toUpperCase();

  if (EU_ISIN_PREFIXES.has(cc)) {
    const home = HOME_EXCH[cc];
    const hit = home ? data.find((d) => d.exchCode === home && d.ticker) : undefined;
    return hit?.ticker ?? null;
  }

  // US / rest-of-world ISIN path — unchanged.
  const preferred = data.find((d) => d.exchCode === 'US') ?? data[0];
  return preferred?.ticker ?? null;
}

/**
 * Server-side branch: calls OpenFIGI directly with an absolute URL, in
 * sequential chunks of OPENFIGI_BATCH. Mirrors app/api/brokers/resolve-isin.
 */
async function resolveViaOpenFIGI(isins: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  for (let i = 0; i < isins.length; i += OPENFIGI_BATCH) {
    const batch = isins.slice(i, i + OPENFIGI_BATCH);
    try {
      const res = await fetch(OPENFIGI_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(batch.map((isin) => ({ idType: 'ID_ISIN', idValue: isin }))),
      });

      if (!res.ok) {
        // Surface, don't swallow: an unauthenticated >10-job request returns 413,
        // which previously vanished silently and dropped every holding. Control
        // flow is unchanged — partial resolution still beats total failure.
        console.error(
          `[isinResolver] OpenFIGI HTTP ${res.status} for ${batch.length} ISINs: ${batch.join(',')}`,
        );
        continue;
      }

      type FigiResult = { data?: FigiEntry[]; error?: string };
      const figiData = (await res.json()) as FigiResult[];

      for (let j = 0; j < batch.length; j++) {
        const ticker = pickPreferredTicker(batch[j], figiData[j]?.data);
        if (ticker) resolved.set(batch[j], ticker);
      }
    } catch (err) {
      // Skip failed batch — partial resolution is better than total failure —
      // but log it so the next upstream failure is visible in the server logs.
      console.error(
        `[isinResolver] OpenFIGI request failed for ${batch.length} ISINs: ${batch.join(',')}`,
        err,
      );
    }
  }

  return resolved;
}

/**
 * Resolve ISINs → tickers. Environment-aware:
 *   Server context (typeof window === 'undefined'): calls OpenFIGI directly.
 *   Browser context: proxies through /api/brokers/resolve-isin (keeps any
 *   future API key server-side, avoids CORS).
 */
export async function resolveBatchIsins(isins: string[]): Promise<Map<string, string>> {
  if (isins.length === 0) return new Map();

  const unique = [...new Set(isins)];

  if (typeof window === 'undefined') {
    return resolveViaOpenFIGI(unique);
  }

  // Browser: proxy through internal route (the route does the ≤10 chunking).
  try {
    const res = await fetch('/api/brokers/resolve-isin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isins: unique }),
    });

    if (!res.ok) return new Map();

    const { resolved } = (await res.json()) as { resolved: Record<string, string> };
    return new Map(Object.entries(resolved ?? {}));
  } catch {
    return new Map();
  }
}
