import { parseTickers } from '@/lib/holdings';
import { trackFinnhub } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

// Stable fallback id for articles lacking a Finnhub `id` — djb2 hash of the url.
// The ranking route maps AI scores back by id, so every article needs one.
function hashUrl(url) {
  let h = 5381;
  const s = String(url ?? '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `u_${(h >>> 0).toString(36)}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  // Per-ticker article cap. Default 3 (dashboard behavior unchanged); clamp to 1..10.
  const limitRaw = Number.parseInt(searchParams.get('limit'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, limitRaw)) : 3;

  trackFinnhub(holdings.length); // 1 company-news call per ticker

  const today = new Date();
  const from = new Date(today - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = today.toISOString().split('T')[0];

  const results = await Promise.all(
    holdings.map(h =>
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${h.t}&from=${from}&to=${to}&token=${key}`, { next: { revalidate: 900 } })
        .then(r => r.json())
        .then(articles => articles.slice(0, limit).map(a => ({
          id: a.id ?? hashUrl(a.url),
          ticker: h.t,
          headline: a.headline,
          source: a.source,
          url: a.url,
          time: a.datetime,
          image: a.image,
          summary: a.summary,
        })))
        .catch(() => [])
    )
  );

  const all = results.flat().sort((a, b) => b.time - a.time);
  return Response.json(all, {
    headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=300' },
  });
}
