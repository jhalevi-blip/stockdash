// Returns recent weekly close history for 5 macro symbols, used to render
// sparklines in the v2 MacroStrip. One request, server-side fan-out.
//
// Response shape:
//   { SPY: number[], DJI: number[], VIX: number[], OIL: number[], TNX: number[] }
//
// Keys mirror /api/macro's `indices` convention where possible (SPY, DJI, VIX).
// OIL = WTI crude (CL=F), TNX = 10-year yield (^TNX).

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

// Fetch last `weeks` weekly closes for a Yahoo Finance symbol.
// Returns number[] (ascending), or [] on failure.
async function fetchSpark(encodedSymbol, weeks = 30) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1wk&range=1y`;
    const res  = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data   = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    // Filter nulls, keep last `weeks` values
    const clean = closes.filter(v => v != null);
    return clean.slice(-weeks);
  } catch {
    return [];
  }
}

export async function GET() {
  const [spy, dji, vix, oil, tnx] = await Promise.all([
    fetchSpark('%5EGSPC'),   // S&P 500
    fetchSpark('%5EDJI'),    // Dow Jones
    fetchSpark('%5EVIX'),    // VIX
    fetchSpark('CL%3DF'),    // WTI crude (CL=F)
    fetchSpark('%5ETNX'),    // 10-year Treasury yield
  ]);

  return Response.json(
    { SPY: spy, DJI: dji, VIX: vix, OIL: oil, TNX: tnx },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=1800' } }
  );
}
