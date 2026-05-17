'use client';

import { useEffect, useState } from 'react';
import { HOLDINGS } from '../_lib/mockData';

const CODE_LABELS = {
  P: 'Buy',  S: 'Sale', A: 'Award', M: 'Exer.', X: 'Exer.',
  G: 'Gift', F: 'Tax',  D: 'Sale',  J: 'Other',
};

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function InsiderActivity() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tickers = HOLDINGS.map(h => h.ticker).join(',');
    fetch(`/api/insider?tickers=${tickers}`)
      .then(r => r.json())
      .then(arr => {
        setData(Array.isArray(arr) ? arr.slice(0, 5) : []);
        setLoading(false);
      })
      .catch(e => {
        setError('Could not load insider activity');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 56,
            background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  if (error) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</div>;
  }

  if (!data || data.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent insider transactions.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((t, i) => {
        const isBuy = t.change > 0;
        const isSale = t.change < 0;
        const label = CODE_LABELS[t.transactionCode] || 'Trade';
        const value = t.transactionPrice ? Math.abs(t.change) * t.transactionPrice : null;
        const accentColor = isBuy ? 'var(--positive-soft, #56d364)'
                          : isSale ? 'var(--negative-soft, #f85149)'
                          : 'var(--text-muted)';
        return (
          <div key={i} style={{
            padding: '10px 12px',
            border: '1px solid var(--border-color)',
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: 6,
            background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}>
              <span style={{ fontWeight: 700, color: 'var(--accent, #58a6ff)' }}>{t.ticker}</span>
              <span>·</span>
              <span style={{
                fontWeight: 600,
                color: accentColor,
                textTransform: 'uppercase',
                letterSpacing: '.04em',
              }}>{label}</span>
              <span style={{ flex: 1 }} />
              <span>{formatDate(t.transactionDate)}</span>
            </div>
            <div style={{ fontSize: 12, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {Math.abs(t.change).toLocaleString('en-US')} sh
              {value != null && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                  · ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
