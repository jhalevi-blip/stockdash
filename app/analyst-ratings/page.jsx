'use client';
import { useEffect, useState } from 'react';
import { DEMO_FALLBACK } from '@/lib/startDemo';

const f = (n, d=2) => n?.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) ?? '—';

export default function AnalystRatingsPage() {
  const [data,    setData]    = useState([]);
  const [prices,  setPrices]  = useState({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('upside');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let tickers = [];
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      tickers = holdings.map(h => h.t);
    } catch {}
    if (!tickers.length) tickers = DEMO_FALLBACK;
    const tp = tickers.join(',');

    Promise.all([
      fetch(`/api/short-interest?tickers=${tp}`).then(r => r.json()),
      fetch(`/api/prices?tickers=${tp}`).then(r => r.json()),
    ]).then(([analyst, priceData]) => {
      setData(Array.isArray(analyst) ? analyst : []);
      const map = {};
      if (Array.isArray(priceData)) priceData.forEach(p => { map[p.ticker] = p.price; });
      setPrices(map);
    }).finally(() => setLoading(false));
  }, []);

  const getUpsideColor = (pct) => {
    if (pct == null) return '#8b949e';
    if (pct >= 20)  return '#3fb950';
    if (pct >= 0)   return '#79c0ff';
    return '#f85149';
  };

  const enriched = data.map(r => {
    const price = prices[r.ticker];
    const upside = price && r.lastQuarterTarget
      ? ((r.lastQuarterTarget - price) / price * 100) : null;
    return { ...r, price, upside };
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...enriched].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity);
    const bv = b[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <main style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <div className="section-title">Analyst Price Targets</div>
      </div>

      {loading && <div className="chart-placeholder">Loading analyst data…</div>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  { key: 'ticker',            label: 'Ticker',               align: 'left'  },
                  { key: 'name',              label: 'Name',                 align: 'left'  },
                  { key: 'price',             label: 'Current Price',        align: 'right' },
                  { key: 'lastQuarterTarget', label: 'Last Quarter Target',  align: 'right' },
                  { key: 'lastQuarterCount',  label: 'Analysts (Q)',         align: 'right' },
                  { key: 'upside',            label: 'Upside %',             align: 'right' },
                  { key: 'lastYearTarget',    label: 'Last Year Target',     align: 'right' },
                  { key: 'lastYearCount',     label: 'Analysts (Y)',         align: 'right' },
                  { key: 'allTimeTarget',     label: 'All Time Target',      align: 'right' },
                ].map(c => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      className={c.align === 'left' ? 'left' : ''}
                      onClick={() => handleSort(c.key)}
                      style={{
                        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                        padding: '10px 16px', fontSize: 12, fontWeight: 600,
                        color: active ? '#22d3ee' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {c.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td className="tkr left">{r.ticker}</td>
                  <td className="left" style={{ fontSize: 12 }}>{r.name}</td>
                  <td className="price-val">{r.price ? '$' + f(r.price) : '—'}</td>
                  <td style={{ color: '#374151', fontWeight: 600 }}>
                    {r.lastQuarterTarget ? '$' + f(r.lastQuarterTarget) : '—'}
                  </td>
                  <td className="neutral">{r.lastQuarterCount ?? '—'}</td>
                  <td style={{ color: getUpsideColor(r.upside), fontWeight: 700 }}>
                    {r.upside != null ? (r.upside >= 0 ? '+' : '') + f(r.upside) + '%' : '—'}
                  </td>
                  <td className="neutral">{r.lastYearTarget ? '$' + f(r.lastYearTarget) : '—'}</td>
                  <td className="neutral">{r.lastYearCount ?? '—'}</td>
                  <td className="neutral">{r.allTimeTarget ? '$' + f(r.allTimeTarget) : '—'}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#8b949e' }}>
                    No analyst data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 12 }}>
        🟢 &gt;20% upside · 🔵 0–20% upside · 🔴 Downside · Targets from FMP analyst consensus
      </p>
    </main>
  );
}
