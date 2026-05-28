const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

/**
 * Server-side branch: calls OpenFIGI directly with an absolute URL.
 * Mirrors app/api/brokers/resolve-isin/route.ts exactly — same headers,
 * body shape, response parsing, and US-exchange preference.
 */
async function resolveViaOpenFIGI(isins: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  for (let i = 0; i < isins.length; i += 100) {
    const batch = isins.slice(i, i + 100);
    try {
      const res = await fetch(OPENFIGI_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(batch.map((isin) => ({ idType: 'ID_ISIN', idValue: isin }))),
      });

      if (!res.ok) continue;

      type FigiEntry  = { ticker: string; exchCode: string };
      type FigiResult = { data?: FigiEntry[]; error?: string };
      const figiData  = (await res.json()) as FigiResult[];

      for (let j = 0; j < batch.length; j++) {
        const entry = figiData[j];
        if (!entry || entry.error || !entry.data?.length) continue;
        const preferred = entry.data.find((d) => d.exchCode === 'US') ?? entry.data[0];
        if (preferred?.ticker) resolved.set(batch[j], preferred.ticker);
      }
    } catch {
      // Skip failed batch — partial resolution is better than total failure
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

  // Browser: proxy through internal route
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
