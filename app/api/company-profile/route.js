import { trackFMP } from '@/lib/apiUsage';

// Company profiles (name/exchange/currency) for the logged-out landing demo's
// identity check — confirms a resolved ticker is the right company, not a
// same-symbol collision on an unrelated US listing. Unauthenticated like the
// other demo data routes; the 60/min-per-IP middleware bounds abuse.
//
// FMP's /stable/profile does NOT accept multiple symbols (comma lists return 0
// records), so this fans out one request per ticker server-side and returns a
// single map to the browser — keeping the FMP key off the client.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tickers = (searchParams.get('tickers') ?? '')
    .split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
    .slice(0, 25);

  if (!tickers.length) return Response.json({ profiles: {} });

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });

  const entries = await Promise.all(tickers.map(async (t) => {
    if (!/^[A-Z0-9]+$/.test(t)) return [t, null];
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/profile?symbol=${t}&apikey=${fmpKey}`,
        { next: { revalidate: 86400 } },
      );
      if (!res.ok) return [t, null];
      const json = await res.json();
      const p = Array.isArray(json) ? json[0] : json;
      return [t, p ? { name: p.companyName ?? null, exchange: p.exchange ?? null, currency: p.currency ?? null } : null];
    } catch {
      return [t, null];
    }
  }));

  trackFMP(tickers.length).catch(() => {});

  return Response.json(
    { profiles: Object.fromEntries(entries) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
