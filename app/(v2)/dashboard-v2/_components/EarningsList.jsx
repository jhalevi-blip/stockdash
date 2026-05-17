'use client';

import { useEffect, useState } from 'react';

function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const now = new Date();
  return Math.ceil((d - now) / 86400000);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function EarningsList({ tickers }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tickers) return;
    fetch(`/api/earnings?tickers=${tickers}`)
      .then(r => r.json())
      .then(arr => {
        setData(arr.filter(e => !e.noData).slice(0, 6));
        setLoading(false);
      })
      .catch(e => {
        setError('Could not load earnings');
        setLoading(false);
      });
  }, [tickers]);

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
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No upcoming earnings in your portfolio.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map(e => {
        const days = daysUntil(e.date);
        const urgent = days <= 7;
        const soon = days > 7 && days <= 14;
        const accentColor = urgent ? 'var(--negative)'
                          : soon   ? '#f0b429'
                          : 'var(--accent, #58a6ff)';
        return (
          <div key={e.symbol} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            border: '1px solid var(--border-color)',
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: 6,
            background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          }}>
            <div style={{ flex: '0 0 56px' }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: 'var(--accent, #58a6ff)',
              }}>
                {e.symbol}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {formatDate(e.date)}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: urgent ? accentColor : 'var(--text-primary)',
              }}>
                {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
              </div>
              {e.epsEstimate != null && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Est. EPS ${e.epsEstimate.toFixed(2)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
