const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const isins: unknown = body?.isins;

    if (!Array.isArray(isins) || isins.length === 0) {
      return Response.json({ resolved: {}, error: 'isins must be a non-empty array' });
    }

    // Dedupe, type-guard, cap at 100 (OpenFIGI batch limit per request)
    const unique = [...new Set(isins.filter((i): i is string => typeof i === 'string'))];
    const batch  = unique.slice(0, 100);

    const figiRes = await fetch(OPENFIGI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map((isin) => ({ idType: 'ID_ISIN', idValue: isin }))),
    });

    if (!figiRes.ok) {
      return Response.json({ resolved: {}, error: `OpenFIGI returned HTTP ${figiRes.status}` });
    }

    type FigiEntry = { ticker: string; exchCode: string };
    type FigiResult = { data?: FigiEntry[]; error?: string };
    const figiData = (await figiRes.json()) as FigiResult[];

    const resolved: Record<string, string> = {};
    for (let i = 0; i < batch.length; i++) {
      const entry = figiData[i];
      if (!entry || entry.error || !entry.data?.length) continue;
      // Prefer primary US exchange listing; fall back to first result
      const preferred = entry.data.find((d) => d.exchCode === 'US') ?? entry.data[0];
      if (preferred?.ticker) resolved[batch[i]] = preferred.ticker;
    }

    return Response.json({ resolved });
  } catch (err) {
    console.error('[resolve-isin] error:', err);
    return Response.json({ resolved: {}, error: 'Internal error during ISIN resolution' });
  }
}
