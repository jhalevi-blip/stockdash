async function fetchFearGreed() {
  // 1. Try CNN with full browser headers
  try {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.cnn.com/markets/fear-and-greed',
        'Origin': 'https://www.cnn.com',
      },
      cache: 'no-store',
    });
    const text = await r.text();
    console.log('[macro] CNN F&G status:', r.status, '| body:', text.slice(0, 300));
    if (r.ok) {
      const data = JSON.parse(text);
      const fg = data?.fear_and_greed;
      if (fg?.score != null) {
        console.log('[macro] CNN F&G success:', fg.score, fg.rating);
        return { score: fg.score, rating: fg.rating };
      }
    }
  } catch(e) {
    console.error('[macro] CNN F&G error:', e.message);
  }

  // 2. Try RapidAPI if key is available
  const rapidKey = process.env.RAPIDAPI_KEY;
  if (rapidKey) {
    try {
      const r = await fetch('https://fear-and-greed-index.p.rapidapi.com/v1/fgi', {
        headers: {
          'X-RapidAPI-Key': rapidKey,
          'X-RapidAPI-Host': 'fear-and-greed-index.p.rapidapi.com',
        },
        cache: 'no-store',
      });
      const text = await r.text();
      console.log('[macro] RapidAPI F&G status:', r.status, '| body:', text.slice(0, 300));
      if (r.ok) {
        const data = JSON.parse(text);
        const now = data?.fgi?.now;
        if (now?.value != null) {
          console.log('[macro] RapidAPI F&G success:', now.value, now.valueText);
          return { score: now.value, rating: now.valueText };
        }
      }
    } catch(e) {
      console.error('[macro] RapidAPI F&G error:', e.message);
    }
  }

  // 3. Fall back to Alternative.me (free, no auth)
  try {
    const r = await fetch('https://api.alternative.me/fng/', { cache: 'no-store' });
    const text = await r.text();
    console.log('[macro] Alternative.me F&G status:', r.status, '| body:', text.slice(0, 300));
    if (r.ok) {
      const data = JSON.parse(text);
      const entry = data?.data?.[0];
      if (entry?.value != null) {
        console.log('[macro] Alternative.me F&G success:', entry.value, entry.value_classification);
        return { score: Number(entry.value), rating: entry.value_classification };
      }
    }
  } catch(e) {
    console.error('[macro] Alternative.me F&G error:', e.message);
  }

  return null;
}

export async function GET() {
  const fhKey = process.env.FINNHUB_API_KEY;
  const fmpKey = process.env.FMP_API_KEY;
  if (!fhKey) return Response.json({ error: 'Missing API key' }, { status: 500 });

  const opts = { next: { revalidate: 3600 } };

  const [vixRes, fearGreed] = await Promise.all([
    (async () => {
      try {
        const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          cache: 'no-store',
        });
        const text = await r.text();
        console.log('[macro] VIX status:', r.status, '| body:', text.slice(0, 400));
        return JSON.parse(text);
      } catch(e) {
        console.error('[macro] VIX error:', e.message);
        return null;
      }
    })(),
    fetchFearGreed(),
  ]);

  try {
    const [spyRes, qqqRes, diaRes, dxyRes, treasury, goldRes, oilRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${fhKey}`, opts).then(r => r.json()),
      fetch(`https://finnhub.io/api/v1/quote?symbol=QQQ&token=${fhKey}`, opts).then(r => r.json()),
      fetch(`https://finnhub.io/api/v1/quote?symbol=DIA&token=${fhKey}`, opts).then(r => r.json()),
      fetch(`https://finnhub.io/api/v1/quote?symbol=UUP&token=${fhKey}`, opts).then(r => r.json()),
      fmpKey ? fetch(`https://financialmodelingprep.com/stable/treasury-rates?limit=1&apikey=${fmpKey}`, opts)
        .then(r => r.json()).then(d => Array.isArray(d) ? d[0] : null).catch(() => null) : Promise.resolve(null),
      fetch(`https://finnhub.io/api/v1/quote?symbol=GLD&token=${fhKey}`, opts).then(r => r.json()),
      fetch(`https://finnhub.io/api/v1/quote?symbol=USO&token=${fhKey}`, opts).then(r => r.json()),
    ]);

    const makeIndex = (d, symbol) => ({
      symbol,
      price: d.c > 0 ? d.c : d.pc,
      changesPercentage: d.dp,
      change: d.d,
    });

    // Parse VIX from Yahoo Finance chart response
    const vixMeta      = vixRes?.chart?.result?.[0]?.meta;
    const vixPrice     = vixMeta?.regularMarketPrice ?? null;
    const vixPrev      = vixMeta?.chartPreviousClose ?? vixMeta?.previousClose ?? null;
    const vixChange    = vixPrice != null && vixPrev ? vixPrice - vixPrev : null;
    const vixChangePct = vixChange != null && vixPrev ? (vixChange / vixPrev) * 100 : null;
    const vix = vixPrice != null
      ? { symbol: '^VIX', price: vixPrice, change: vixChange, changesPercentage: vixChangePct }
      : null;
    console.log('[macro] VIX parsed:', JSON.stringify(vix));
    console.log('[macro] Fear & Greed final:', JSON.stringify(fearGreed));

    return Response.json({
      indices: {
        SPY: makeIndex(spyRes, 'SPY'),
        QQQ: makeIndex(qqqRes, 'QQQ'),
        DIA: makeIndex(diaRes, 'DIA'),
        VIX: vix,
      },
      commodities: {
        gold: makeIndex(goldRes, 'GLD'),
        oil:  makeIndex(oilRes,  'USO'),
        dxy:  makeIndex(dxyRes,  'UUP'),
      },
      fearGreed,
      treasury,
      gdp: null,
    }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' }
    });
  } catch(e) {
    console.error('[macro] outer error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
