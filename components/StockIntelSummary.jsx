'use client';
import { useState, useCallback } from 'react';

const fmt  = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(Math.abs(n), d) + '%';
const clr  = (n) => n == null ? '#8b949e' : n >= 0 ? '#16a34a' : '#dc2626';
const fmtM = (n) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'T';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'B';
  return '$' + n.toFixed(0) + 'M';
};
const fmtB = (n) => {
  // Raw dollar values from EDGAR (not already in millions)
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n < 0 ? '−' : '') + '$' + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return (n < 0 ? '−' : '') + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (n < 0 ? '−' : '') + '$' + (abs / 1e6).toFixed(0) + 'M';
  return '$' + n.toLocaleString();
};

function Skeleton({ height = 48 }) {
  return <div style={{ height, background: '#21262d', borderRadius: 4 }} />;
}

function Card({ title, loading, children, span }) {
  return (
    <div style={{
      background: '#161b22',
      border: '1px solid #21262d',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      gridColumn: span ? `span ${span}` : undefined,
    }}>
      <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {title}
      </div>
      {loading ? <Skeleton /> : children}
    </div>
  );
}

function KV({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span style={{ color: valueColor ?? '#e6edf3' }}>{value}</span>
    </div>
  );
}

export default function StockIntelSummary({ holdings, rows }) {
  const [ticker,    setTicker]    = useState('');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);

  const selectStock = useCallback(async (t) => {
    if (!t) { setTicker(''); setData(null); return; }
    setTicker(t);
    setLoading(true);
    setData(null);

    const [analyst, insider, earningsHist, valuation, peers, financials, news, filings] =
      await Promise.all([
        fetch(`/api/short-interest?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/insider?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/earnings-history?symbol=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/valuation?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/peers?ticker=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/financials?ticker=${t}`).then(r => r.json()).catch(() => null),
        fetch(`/api/news?tickers=${t}`).then(r => r.json()).catch(() => []),
        fetch(`/api/research?symbol=${t}&type=filings`).then(r => r.json()).catch(() => []),
      ]);

    setData({ analyst, insider, earningsHist, valuation, peers, financials, news, filings });
    setLoading(false);
  }, []);

  const row       = rows.find(r => r.t === ticker);
  const analystD  = data?.analyst?.find?.(a => a.ticker === ticker) ?? null;
  const valD      = data?.valuation?.find?.(v => v.ticker === ticker) ?? null;
  const insiders  = (data?.insider ?? []).slice(0, 4);
  const earnHist  = (data?.earningsHist ?? []).slice(-6);
  const peersList = (data?.peers ?? []).slice(0, 5);
  const finD      = data?.financials ?? null;
  const newsList  = (data?.news ?? []).slice(0, 4);
  const filings   = (data?.filings ?? []).slice(0, 4);

  const upside = row?.price && analystD?.lastQuarterTarget
    ? ((analystD.lastQuarterTarget - row.price) / row.price) * 100
    : null;

  console.log('[StockIntelSummary] holdings.length:', holdings.length, '| ticker:', ticker);

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Stock Intel
        </div>
        <select
          value={ticker}
          onChange={e => selectStock(e.target.value)}
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#e6edf3',
            padding: '5px 10px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {holdings.length === 0
            ? <option value="" disabled>Loading…</option>
            : <>
                <option value="">Select a stock…</option>
                {holdings.map(h => (
                  <option key={h.t} value={h.t}>{h.t}</option>
                ))}
              </>
          }
        </select>
        {ticker && (
          <span style={{ fontSize: 12, color: '#8b949e' }}>
            {row?.price != null ? `$${fmt(row.price)}` : ''}
            {row?.chgPct != null && (
              <span style={{ color: clr(row.chgPct), marginLeft: 6 }}>{fmtD(row.chgPct)}</span>
            )}
          </span>
        )}
      </div>

      {!ticker && (
        <div style={{ fontSize: 13, color: '#8b949e', padding: '12px 0' }}>
          Select a stock above to see a full intelligence brief.
        </div>
      )}

      {ticker && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>

          {/* 1 — Position */}
          <Card title="My Position">
            {row ? (
              <>
                <KV label="Shares"        value={fmt(row.s, 0)} />
                <KV label="Avg Cost"      value={`$${fmt(row.costVal / row.s)}`} />
                <KV label="Market Value"  value={row.mktVal != null ? `$${fmt(row.mktVal)}` : '—'} />
                <KV label="P&L"
                  value={row.pnlAmt != null ? `${row.pnlAmt >= 0 ? '+$' : '−$'}${fmt(Math.abs(row.pnlAmt))} (${fmtD(row.pnlPct)})` : '—'}
                  valueColor={clr(row.pnlAmt)}
                />
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No position data</div>
            )}
          </Card>

          {/* 2 — Analyst Target */}
          <Card title="Analyst Target" loading={loading}>
            {analystD ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3' }}>
                    ${fmt(analystD.lastQuarterTarget)}
                  </span>
                  {upside != null && (
                    <span style={{ fontSize: 14, color: clr(upside), fontWeight: 600 }}>
                      {fmtD(upside)}
                    </span>
                  )}
                </div>
                {analystD.lastQuarterCount && (
                  <div style={{ fontSize: 12, color: '#8b949e' }}>{analystD.lastQuarterCount} analysts · {analystD.source}</div>
                )}
                {analystD.allTimeTarget && analystD.allTimeTarget !== analystD.lastQuarterTarget && (
                  <KV label="All-time avg" value={`$${fmt(analystD.allTimeTarget)}`} />
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No analyst data</div>
            )}
          </Card>

          {/* 3 — Valuation */}
          <Card title="Valuation" loading={loading}>
            {valD ? (
              <>
                <KV label="P/E (TTM)"    value={valD.peRatio    != null ? fmt(valD.peRatio,   1) : '—'} />
                <KV label="Fwd P/E"      value={valD.forwardPE  != null ? fmt(valD.forwardPE, 1) : '—'} />
                <KV label="P/B"          value={valD.pbRatio    != null ? fmt(valD.pbRatio,   1) : '—'} />
                <KV label="P/S"          value={valD.psRatio    != null ? fmt(valD.psRatio,   1) : '—'} />
                <KV label="EV/EBITDA"    value={valD.evEbitda   != null ? fmt(valD.evEbitda,  1) : '—'} />
                <KV label="Market Cap"   value={fmtM(valD.marketCap)} />
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No valuation data</div>
            )}
          </Card>

          {/* 4 — Insider Activity */}
          <Card title="Insider Activity" loading={loading}>
            {insiders.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {insiders.map((ins, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
                    <span style={{
                      padding: '1px 5px', borderRadius: 3, fontWeight: 600, fontSize: 10, flexShrink: 0,
                      background: ins.transactionCode === 'P' ? '#14532d' : '#450a0a',
                      color:      ins.transactionCode === 'P' ? '#4ade80' : '#f87171',
                    }}>
                      {ins.transactionCode === 'P' ? 'BUY' : ins.transactionCode === 'S' ? 'SELL' : ins.transactionCode}
                    </span>
                    <span style={{ color: '#8b949e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ins.name?.split(' ').slice(-1)[0] ?? ins.name}
                    </span>
                    <span style={{ color: '#8b949e', flexShrink: 0 }}>
                      {ins.change != null ? Math.abs(ins.change).toLocaleString() : ''}
                    </span>
                    <span style={{ color: '#6e7681', flexShrink: 0 }}>
                      {ins.transactionDate ? ins.transactionDate.slice(5) : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No recent insider activity</div>
            )}
          </Card>

          {/* 5 — Earnings History */}
          <Card title="Earnings History" loading={loading}>
            {earnHist.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {earnHist.map(e => {
                  const beat = e.actual != null && e.estimate != null ? e.actual >= e.estimate : null;
                  return (
                    <div key={e.period} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#8b949e' }}>{e.period?.slice(0, 7)}</span>
                      <span style={{ color: '#e6edf3' }}>
                        {e.actual != null ? `$${fmt(e.actual)}` : '—'}
                      </span>
                      {e.estimate != null && (
                        <span style={{ color: '#6e7681' }}>est ${fmt(e.estimate)}</span>
                      )}
                      {beat != null && (
                        <span style={{ color: beat ? '#16a34a' : '#dc2626', fontSize: 10, fontWeight: 600 }}>
                          {beat ? '▲ BEAT' : '▼ MISS'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No earnings history</div>
            )}
          </Card>

          {/* 6 — Financials */}
          <Card title="Financials (Annual)" loading={loading}>
            {finD?.revenue?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 11, color: '#6e7681', marginBottom: 2 }}>Revenue</div>
                {finD.revenue.slice(-4).map(r => (
                  <div key={r.year} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#8b949e' }}>{r.year}</span>
                    <span style={{ color: '#e6edf3' }}>{fmtB(r.value)}</span>
                  </div>
                ))}
                {finD.netIncome?.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>Net Income</div>
                    {finD.netIncome.slice(-2).map(r => (
                      <div key={r.year} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#8b949e' }}>{r.year}</span>
                        <span style={{ color: clr(r.value) }}>{fmtB(r.value)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No financials data</div>
            )}
          </Card>

          {/* 7 — Peers */}
          <Card title="Peer Comparison" loading={loading} span={2}>
            {peersList.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Ticker', 'Mkt Cap', 'P/E', 'P/B', 'Rev Gr %', 'Net Mg %'].map(h => (
                        <th key={h} style={{ color: '#8b949e', fontWeight: 500, textAlign: h === 'Ticker' ? 'left' : 'right', padding: '3px 6px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {peersList.map(p => (
                      <tr key={p.ticker} style={{ background: p.isBase ? '#1c2128' : 'transparent' }}>
                        <td style={{ padding: '4px 6px', color: p.isBase ? '#58a6ff' : '#e6edf3', fontWeight: p.isBase ? 700 : 400 }}>{p.ticker}</td>
                        <td style={{ padding: '4px 6px', color: '#e6edf3', textAlign: 'right' }}>{fmtM(p.marketCap)}</td>
                        <td style={{ padding: '4px 6px', color: '#e6edf3', textAlign: 'right' }}>{p.peRatio != null ? fmt(p.peRatio, 1) : '—'}</td>
                        <td style={{ padding: '4px 6px', color: '#e6edf3', textAlign: 'right' }}>{p.pbRatio != null ? fmt(p.pbRatio, 1) : '—'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: clr(p.revenueGrowth) }}>{p.revenueGrowth != null ? fmtD(p.revenueGrowth) : '—'}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: clr(p.netMargin) }}>{p.netMargin != null ? fmtD(p.netMargin) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No peer data</div>
            )}
          </Card>

          {/* 8 — News */}
          <Card title="Recent News" loading={loading}>
            {newsList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {newsList.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                    <div style={{ fontSize: 11, color: '#6e7681' }}>
                      {n.source} · {new Date(n.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 12, color: '#e6edf3', lineHeight: 1.4 }}>{n.headline}</div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No news available</div>
            )}
          </Card>

          {/* 9 — SEC Filings */}
          <Card title="SEC Filings" loading={loading}>
            {filings.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filings.map((f, i) => (
                  <a key={i} href={f.finalLink} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <span style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 3,
                      background: '#21262d', color: '#58a6ff', fontWeight: 600, flexShrink: 0,
                    }}>
                      {f.type}
                    </span>
                    <span style={{ fontSize: 12, color: '#8b949e', flexShrink: 0 }}>{f.filingDate}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#8b949e' }}>No filings found</div>
            )}
          </Card>

        </div>
      )}
    </div>
  );
}
