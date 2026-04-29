'use client';
import { useState, useEffect } from 'react';
import { calculateCorrelationMatrix, calculateDailyReturns } from '@/lib/correlation';

const TICKERS = ['NVDA', 'TSLA', 'AAPL', 'AMZN', 'AMD'];

// ── Cell color by correlation value ──────────────────────────────────────────
function cellBg(r, isDiag) {
  if (isDiag)   return '#1c2128';
  if (r > 0.85) return '#3d0c0c';
  if (r > 0.70) return '#3d1f00';
  if (r > 0.30) return '#2d2800';
  return '#0d2818';
}
function cellFg(r, isDiag) {
  if (isDiag)   return '#6e7681';
  if (r > 0.85) return '#f87171';
  if (r > 0.70) return '#fb923c';
  if (r > 0.30) return '#facc15';
  return '#4ade80';
}

const td = {
  padding: '8px 12px',
  textAlign: 'center',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  border: '1px solid #21262d',
};

const th = {
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#8b949e',
  borderBottom: '1px solid #21262d',
  textAlign: 'center',
};

export default function CorrelationDebugPage() {
  const [status,       setStatus]       = useState('idle');
  const [rawData,      setRawData]      = useState(null);   // [{ticker, prices}]
  const [failedTickers,setFailedTickers]= useState([]);
  const [matrix,       setMatrix]       = useState(null);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    setStatus('loading');
    fetch(`/api/historical-prices?tickers=${TICKERS.join(',')}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setError(json.error);
          setStatus('error');
          return;
        }
        setRawData(json.data ?? []);
        setFailedTickers(json.failedTickers ?? []);
        const result = calculateCorrelationMatrix(json.data ?? []);
        setMatrix(result);
        setStatus('done');
      })
      .catch(err => {
        setError(String(err));
        setStatus('error');
      });
  }, []);

  return (
    <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto', color: '#e6edf3', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          background: '#2d1f00', border: '1px solid #92400e', color: '#fbbf24',
          borderRadius: 4, padding: '2px 8px', marginBottom: 10, display: 'inline-block',
        }}>
          DEBUG — Delete before launch
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '10px 0 4px' }}>Correlation Pipeline Debug</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: 0 }}>
          Tickers: {TICKERS.join(', ')} · Source: FMP 1-year daily EOD · Status:{' '}
          <span style={{ color: status === 'done' ? '#4ade80' : status === 'error' ? '#f87171' : '#facc15' }}>
            {status}
          </span>
        </p>
      </div>

      {status === 'loading' && (
        <p style={{ color: '#8b949e', fontSize: 13 }}>Fetching price history…</p>
      )}

      {status === 'error' && (
        <div style={{ background: '#3d0c0c', border: '1px solid #f87171', borderRadius: 6, padding: '12px 16px', color: '#f87171', fontSize: 13 }}>
          Error: {error}
        </div>
      )}

      {status === 'done' && (
        <>
          {failedTickers.length > 0 && (
            <div style={{ background: '#3d1f00', border: '1px solid #fb923c', borderRadius: 6, padding: '10px 16px', color: '#fb923c', fontSize: 12, marginBottom: 24 }}>
              Failed tickers: {failedTickers.join(', ')}
            </div>
          )}

          {/* ── SECTION 1: Raw data summary ── */}
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8b949e', marginBottom: 12 }}>
              1 · Raw Data Summary
            </h2>
            <div style={{ overflowX: 'auto', border: '1px solid #21262d', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#161b22' }}>
                    {['Ticker', 'Days of data', 'First date', 'Last date', 'Last close', 'Returns calculated'].map(h => (
                      <th key={h} style={{ ...th, textAlign: h === 'Ticker' ? 'left' : 'center' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawData.map(({ ticker, prices }) => {
                    const returns = calculateDailyReturns(prices);
                    const sparse  = prices.length < 100;
                    return (
                      <tr key={ticker} style={{ background: sparse ? '#2d1f00' : 'transparent' }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: sparse ? '#fb923c' : '#58a6ff' }}>
                          {ticker}{sparse ? ' ⚠' : ''}
                        </td>
                        <td style={{ ...td, color: sparse ? '#fb923c' : '#e6edf3' }}>{prices.length}</td>
                        <td style={{ ...td, color: '#8b949e' }}>{prices[0]?.date ?? '—'}</td>
                        <td style={{ ...td, color: '#8b949e' }}>{prices[prices.length - 1]?.date ?? '—'}</td>
                        <td style={{ ...td }}>${prices[prices.length - 1]?.close?.toFixed(2) ?? '—'}</td>
                        <td style={{ ...td, color: '#8b949e' }}>{returns.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── SECTION 2: Correlation matrix ── */}
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8b949e', marginBottom: 12 }}>
              2 · Correlation Matrix
            </h2>
            {matrix === null ? (
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '16px', color: '#8b949e', fontSize: 13 }}>
                Insufficient aligned data for a stable correlation matrix (need ≥30 trading days).
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto', border: '1px solid #21262d', borderRadius: 8, marginBottom: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#161b22' }}>
                        <th style={{ ...th, textAlign: 'left', width: 60 }}> </th>
                        {matrix.tickers.map(t => (
                          <th key={t} style={th}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.matrix.map((row, i) => (
                        <tr key={matrix.tickers[i]}>
                          <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#58a6ff', background: '#161b22' }}>
                            {matrix.tickers[i]}
                          </td>
                          {row.map((r, j) => {
                            const isDiag = i === j;
                            return (
                              <td key={j} style={{
                                ...td,
                                background: cellBg(r, isDiag),
                                color:      cellFg(r, isDiag),
                                fontWeight: isDiag ? 400 : 600,
                              }}>
                                {r.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#6e7681', marginBottom: 8 }}>
                  <span>Aligned date range: <strong style={{ color: '#e6edf3' }}>{matrix.alignedDateRange.start}</strong> → <strong style={{ color: '#e6edf3' }}>{matrix.alignedDateRange.end}</strong></span>
                  <span>Trading days used: <strong style={{ color: '#e6edf3' }}>{matrix.alignedDateRange.count}</strong></span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
                  {[
                    { label: '< 0.30', bg: cellBg(0.1, false), fg: cellFg(0.1, false) },
                    { label: '0.30–0.70', bg: cellBg(0.5, false), fg: cellFg(0.5, false) },
                    { label: '0.70–0.85', bg: cellBg(0.78, false), fg: cellFg(0.78, false) },
                    { label: '> 0.85', bg: cellBg(0.9, false), fg: cellFg(0.9, false) },
                  ].map(({ label, bg, fg }) => (
                    <span key={label} style={{ background: bg, color: fg, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ── SECTION 3: Top correlated pairs ── */}
          {matrix && (
            <section>
              <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8b949e', marginBottom: 12 }}>
                3 · Correlated Pairs (all unique, sorted)
              </h2>
              {(() => {
                const pairs = [];
                for (let i = 0; i < matrix.tickers.length; i++) {
                  for (let j = i + 1; j < matrix.tickers.length; j++) {
                    pairs.push({
                      label: `${matrix.tickers[i]} × ${matrix.tickers[j]}`,
                      r: matrix.matrix[i][j],
                    });
                  }
                }
                pairs.sort((a, b) => b.r - a.r);
                const top5    = pairs.slice(0, 5);
                const bottom5 = pairs.slice(-5).reverse();

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>Top 5 (most correlated)</div>
                      {top5.map(({ label, r }) => (
                        <div key={label} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '7px 12px', borderRadius: 6, marginBottom: 4,
                          background: cellBg(r, false),
                        }}>
                          <span style={{ fontSize: 13, color: '#e6edf3' }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cellFg(r, false) }}>{r.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>Bottom 5 (least correlated)</div>
                      {bottom5.map(({ label, r }) => (
                        <div key={label} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '7px 12px', borderRadius: 6, marginBottom: 4,
                          background: cellBg(r, false),
                        }}>
                          <span style={{ fontSize: 13, color: '#e6edf3' }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cellFg(r, false) }}>{r.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </section>
          )}
        </>
      )}
    </div>
  );
}
