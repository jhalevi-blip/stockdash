const TICKERS = [
  'NVDA', 'TSLA', 'AAPL', 'AMZN', 'AMD', 'MSFT', 'META', 'SOFI', 'PLTR', 'INTC',
  'BABA', 'BAC', 'F', 'RIVN', 'NIO', 'AAL', 'SIRI', 'T', 'UBER', 'SNAP',
  'COIN', 'MSTR', 'GME', 'AMC', 'HOOD',
];

const COMPANY_NAMES: Record<string, string> = {
  NVDA: 'Nvidia', TSLA: 'Tesla', AAPL: 'Apple', AMZN: 'Amazon', AMD: 'AMD',
  MSFT: 'Microsoft', META: 'Meta', SOFI: 'SoFi', PLTR: 'Palantir', INTC: 'Intel',
  BABA: 'Alibaba', BAC: 'Bank of America', F: 'Ford', RIVN: 'Rivian', NIO: 'NIO',
  AAL: 'American Airlines', SIRI: 'Sirius XM', T: 'AT&T', UBER: 'Uber',
  SNAP: 'Snap', COIN: 'Coinbase', MSTR: 'MicroStrategy', GME: 'GameStop',
  AMC: 'AMC Entertainment', HOOD: 'Robinhood',
};

export interface MostTradedEntry {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const dynamic = 'force-dynamic';

let memCache: { week: string; data: MostTradedEntry[] } | null = null;

export async function GET() {
  const currentWeek = getISOWeek(new Date());

  if (memCache && memCache.week === currentWeek) {
    return Response.json(memCache.data, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
    });
  }

  const apiKey = process.env.FINNHUB_API_KEY;

  const results = await Promise.all(
    TICKERS.map(async (symbol) => {
      const [quoteRes, metricRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`, { next: { revalidate: 3600 } }),
        fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`, { next: { revalidate: 3600 } }),
      ]);

      const quote = await quoteRes.json();
      const metric = await metricRes.json();

      const price: number = quote.c || quote.pc || 0;
      const prevClose: number = quote.pc ?? 0;
      const change: number = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
      const volume: number = (metric?.metric?.['10DayAverageTradingVolume'] as number) ?? 0;

      return { symbol, price, change, volume };
    })
  );

  const sorted: MostTradedEntry[] = results
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map((item, i) => ({
      rank: i + 1,
      symbol: item.symbol,
      name: COMPANY_NAMES[item.symbol] ?? item.symbol,
      price: item.price,
      change: item.change,
      volume: item.volume,
    }));

  memCache = { week: currentWeek, data: sorted };

  return Response.json(sorted, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
