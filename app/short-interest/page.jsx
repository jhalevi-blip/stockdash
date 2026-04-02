'use client';
import { useEffect, useState } from 'react';

const f = (n, d=2) => n?.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) ?? '—';

export default function AnalystPage() {
  const [data,    setData]    = useState([]);
  const [prices,  setPrices]  = useState({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('upside');

  useEffect(() => {
    let tp = '';
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      tp = holdings.map(h => h.t).join(',');
    } catch {}
    Promise.all([
      fetch(tp ? `/api/short-interest?tickers=${tp}` : '/api/short-interest').then(r => r.json()),
      fetch(tp ? `/api/prices?tickers=${tp}` : '/api/prices').then(r => r.json()),
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

  const sorted = [...enriched].sort((a, b) => {
    if (sortKey === 'upside') return (b.upside ?? -999) - (a.upside ?? -999);
    if (sortKey === 'target') return (b.lastQuarterTarget ?? 0) - (a.lastQuarterTarget ?? 0);
    if (sortKey === 'count')  return (b.lastQuarterCount ?? 0) - (a.lastQuarterCount ?? 0);
    return 0;
  });

  return (
    <main style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Analyst Price Targets</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b949e' }}>
          Sort by:
          {[['upside', 'Upside %'], ['target', 'Target Price'], ['count', 'Analyst Count']].map(([key, label]) => (
            <button key={key} onClick={() => setSortKey(key)} style={{
              background: sortKey === key ? '#1f6feb' : '#21262d',
              color: sortKey === key ? '#fff' : '#c9d1d9',
              border: `1px solid ${sortKey === key ? '#58a6ff' : '#30363d'}`,
              borderRadius: 4, padding: '4px 10px', fontSize: 11,
              fontWeight: 600, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {loading && <div className="chart-placeholder">Loading analyst data…</div>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Ticker</th>
                <th className="left">Name</th>
                <th>Current Price</th>
                <th>Last Quarter Target</th>
                <th>Analysts (Q)</th>
                <th>Upside %</th>
                <th>Last Year Target</th>
                <th>Analysts (Y)</th>
                <th>All Time Target</th>
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