import { pickPreferredTicker, OPENFIGI_BATCH } from '@/lib/brokers/isinResolver';

const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const isins: unknown = body?.isins;

    if (!Array.isArray(isins) || isins.length === 0) {
      return Response.json({ resolved: {}, error: 'isins must be a non-empty array' });
    }

    // Dedupe + type-guard. Chunk into ≤OPENFIGI_BATCH-job requests, sequentially:
    // the unauthenticated OpenFIGI tier rejects >10 jobs (HTTP 413) and rate-limits
    // concurrent callers, so one 100-ISIN request silently dropped every holding.
    const unique = [...new Set(isins.filter((i): i is string => typeof i === 'string'))];

    type FigiEntry = { ticker: string; exchCode: string };
    type FigiResult = { data?: FigiEntry[]; error?: string };

    const resolved: Record<string, string> = {};
    let lastError: string | null = null;

    for (let i = 0; i < unique.length; i += OPENFIGI_BATCH) {
      const batch = unique.slice(i, i + OPENFIGI_BATCH);

      const figiRes = await fetch(OPENFIGI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((isin) => ({ idType: 'ID_ISIN', idValue: isin }))),
      });

      if (!figiRes.ok) {
        lastError = `OpenFIGI returned HTTP ${figiRes.status}`;
        continue; // partial resolution beats total failure
      }

      const figiData = (await figiRes.json()) as FigiResult[];
      for (let j = 0; j < batch.length; j++) {
        // Home-market listing for European ISINs, US listing otherwise; never a US OTC proxy.
        const ticker = pickPreferredTicker(batch[j], figiData[j]?.data);
        if (ticker) resolved[batch[j]] = ticker;
      }
    }

    // Only surface an error when nothing resolved — a partial map is still useful.
    return Response.json(
      Object.keys(resolved).length === 0 && lastError
        ? { resolved, error: lastError }
        : { resolved },
    );
  } catch (err) {
    console.error('[resolve-isin] error:', err);
    return Response.json({ resolved: {}, error: 'Internal error during ISIN resolution' });
  }
}
