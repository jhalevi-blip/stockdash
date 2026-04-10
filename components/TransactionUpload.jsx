'use client';
import { useState, useRef, useEffect } from 'react';

const fmt    = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const clr    = (n) => n == null ? '#8b949e' : n >= 0 ? '#3fb950' : '#f85149';
const fmtEur = (n, forceSign = true) => {
  if (n == null) return '—';
  const sign = forceSign ? (n >= 0 ? '+' : '-') : (n < 0 ? '-' : '');
  return `${sign}€${fmt(Math.abs(n))}`;
};

export default function TransactionUpload({ onResults }) {
  const [dragOver, setDragOver] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [results,  setResults]  = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('realized_pnl');
      if (saved) {
        const data = JSON.parse(saved);
        setResults(data);
        onResults?.(data);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function processFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Please upload a CSV or XLSX file.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res  = await fetch('/api/transactions', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Upload failed');
        return;
      }
      localStorage.setItem('realized_pnl', JSON.stringify(data));
      setResults(data);
      onResults?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }

  function handleClear() {
    localStorage.removeItem('realized_pnl');
    setResults(null);
    onResults?.(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const { positions = [], totalPnl, txCount } = results ?? {};
  const best  = positions.length ? positions.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
  const worst = positions.length ? positions.reduce((a, b) => b.pnl < a.pnl ? b : a) : null;

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    padding: '14px 18px',
    flex: '1 1 160px',
    minWidth: 0,
  };
  const labelStyle = {
    fontSize: 10,
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
    marginBottom: 6,
  };

  return (
    <div>
      {!results && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !loading && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#22d3ee' : '#30363d'}`,
            borderRadius: 10,
            padding: '40px 24px',
            textAlign: 'center',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: dragOver ? 'rgba(34,211,238,0.04)' : 'var(--bg-card)',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => processFile(e.target.files[0])}
          />
          {loading ? (
            <div style={{ color: '#8b949e', fontSize: 14 }}>Processing transactions…</div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                Drop your broker CSV / XLSX here
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
                Supports DeGiro transactions export · click to browse<br />
                Calculates realized P&amp;L using FIFO method
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 6,
          background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)',
          color: '#f85149', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {results && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
            <div style={{ ...cardStyle, borderColor: totalPnl >= 0 ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)' }}>
              <div style={labelStyle}>Total Realized P&L</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: clr(totalPnl), lineHeight: 1 }}>
                {fmtEur(totalPnl)}
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                {positions.length} closed position{positions.length !== 1 ? 's' : ''} · {txCount} transactions
              </div>
            </div>

            {best && (
              <div style={cardStyle}>
                <div style={labelStyle}>Best Trade</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#3fb950' }}>{best.symbol}</div>
                <div style={{ fontSize: 13, color: '#3fb950' }}>+€{fmt(best.pnl)}</div>
              </div>
            )}

            {worst && worst !== best && (
              <div style={cardStyle}>
                <div style={labelStyle}>Worst Trade</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f85149' }}>{worst.symbol}</div>
                <div style={{ fontSize: 13, color: '#f85149' }}>-€{fmt(Math.abs(worst.pnl))}</div>
              </div>
            )}

            <button
              onClick={handleClear}
              style={{
                alignSelf: 'flex-end',
                background: '#21262d', color: '#8b949e',
                border: '1px solid #30363d', borderRadius: 6,
                padding: '8px 16px', fontSize: 12, cursor: 'pointer',
                fontWeight: 600, marginBottom: 0,
              }}
            >
              Clear / Re-upload
            </button>
          </div>

          {/* Closed positions table */}
          {positions.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      { label: 'Symbol',       align: 'left'  },
                      { label: 'Shares Sold',  align: 'right' },
                      { label: 'Cost Basis',   align: 'right' },
                      { label: 'Proceeds',     align: 'right' },
                      { label: 'Realized P&L', align: 'right' },
                      { label: 'First Buy',    align: 'right' },
                      { label: 'Last Sell',    align: 'right' },
                    ].map(({ label, align }) => (
                      <th
                        key={label}
                        className={align === 'left' ? 'left' : ''}
                        style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={i}>
                      <td className="left" style={{ fontWeight: 700, color: '#e6edf3' }}>{p.symbol}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(p.closedShares, p.closedShares % 1 === 0 ? 0 : 2)}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e' }}>€{fmt(p.totalBoughtEur)}</td>
                      <td style={{ textAlign: 'right' }}>€{fmt(p.totalSoldEur)}</td>
                      <td style={{ textAlign: 'right', color: clr(p.pnl), fontWeight: 700 }}>
                        {fmtEur(p.pnl)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#8b949e', fontSize: 11 }}>{p.firstBuy ?? '—'}</td>
                      <td style={{ textAlign: 'right', color: '#8b949e', fontSize: 11 }}>{p.lastSell ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
