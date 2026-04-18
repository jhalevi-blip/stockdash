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
    if (r.ok) {
      const data = JSON.parse(text);
      const fg = data?.fear_and_greed;
      if (fg?.score != null) {
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
      if (r.ok) {
        const data = JSON.parse(text);
        const now = data?.fgi?.now;
        if (now?.value != null) {
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
    if (r.ok) {
      const data = JSON.parse(text);
      const entry = data?.data?.[0];
      if (entry?.value != null) {
        return { score: Number(entry.value), rating: entry.value_classification };
      }
    }
  } catch(e) {
    console.error('[macro] Alternative.me F&G error:', e.message);
  }

  return null;
}

async function fetchYahooYield(encodedTicker) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });
    const data = JSON.parse(await r.text());
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// Returns { price, change, changesPercentage } — same shape as makeIndex output.
async function fetchYahooQuote(encodedTicker) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });
    const text = await r.text();
    const data = JSON.parse(text);
    const meta  = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? null;
    const prev  = meta?.chartPreviousClose ?? meta?.previousClose ?? null;
    if (price == null) return null;
    const change    = prev != null ? price - prev : null;
    const changePct = change != null && prev ? (change / prev) * 100 : null;
    return { price, change, changesPercentage: changePct };
  } catch(e) {
    console.error(`[macro] fetchYahooQuote ${encodedTicker} error:`, e.message);
    return null;
  }
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
        return JSON.parse(text);
      } catch(e) {
        console.error('[macro] VIX error:', e.message);
        return null;
      }
    })(),
    fetchFearGreed(),
  ]);

  try {
    const [spyRes, qqqRes, diaRes, dxyRes, goldRes, oilRes, irx, fvx, tnx, tyx, fmpTreasury] = await Promise.all([
      fetchYahooQuote('%5EGSPC'),  // S&P 500 actual index
      fetchYahooQuote('%5EIXIC'),  // NASDAQ actual index
      fetchYahooQuote('%5EDJI'),   // Dow Jones actual index
      fetch(`https://finnhub.io/api/v1/quote?symbol=UUP&token=${fhKey}`, opts).then(r => r.json()),
      fetchYahooQuote('GC%3DF'),  // Gold futures (COMEX) — Finnhub OANDA:XAU_USD requires premium
      fetchYahooQuote('CL%3DF'),  // WTI crude futures — Finnhub USO ETF doesn't track spot price
      fetchYahooYield('%5EIRX'),  // 13-week T-bill (~3 month)
      fetchYahooYield('%5EFVX'),  // 5-year
      fetchYahooYield('%5ETNX'),  // 10-year
      fetchYahooYield('%5ETYX'),  // 30-year
      fmpKey
        ? fetch(`https://financialmodelingprep.com/stable/treasury-rates?limit=1&apikey=${fmpKey}`, opts)
            .then(r => r.json())
            .then(d => Array.isArray(d) ? d[0] : null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    // Build treasury: FMP provides all tenors (month1, month6, year1, year2, etc.).
    // Yahoo Finance only has 3m/5y/10y/30y — use those to override FMP where available.
    let treasury = null;
    if (fmpTreasury) {
      treasury = { ...fmpTreasury };
      if (irx != null) treasury.month3 = irx;
      if (fvx != null) treasury.year5  = fvx;
      if (tnx != null) treasury.year10 = tnx;
      if (tyx != null) treasury.year30 = tyx;
    } else if (irx != null || fvx != null || tnx != null || tyx != null) {
      treasury = { month3: irx, year5: fvx, year10: tnx, year30: tyx };
    }

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

    return Response.json({
      indices: {
        SPY: spyRes ? { symbol: '^GSPC', ...spyRes } : null,
        QQQ: qqqRes ? { symbol: '^IXIC', ...qqqRes } : null,
        DIA: diaRes ? { symbol: '^DJI',  ...diaRes } : null,
        VIX: vix,
      },
      commodities: {
        gold: goldRes,  // { price, change, changesPercentage } from Yahoo Finance GC=F
        oil:  oilRes,   // { price, change, changesPercentage } from Yahoo Finance CL=F
        dxy:  makeIndex(dxyRes,  'UUP'),
      },
      fearGreed,
      treasury,  // month3, year5, year10, year30 from Yahoo Finance; FMP fallback
      gdp: null,
    }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' }
    });
  } catch(e) {
    console.error('[macro] outer error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
