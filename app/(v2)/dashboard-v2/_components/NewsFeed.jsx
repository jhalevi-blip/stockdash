'use client';

import { useEffect, useState } from 'react';
import { HOLDINGS } from '../_lib/mockData';

function timeAgo(unixSeconds) {
  const now = Date.now() / 1000;
  const diff = now - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NewsFeed() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tickers = HOLDINGS.map(h => h.ticker).join(',');
    fetch(`/api/news?tickers=${tickers}`)
      .then(r => r.json())
      .then(arr => {
        setData(Array.isArray(arr) ? arr.slice(0, 5) : []);
        setLoading(false);
      })
      .catch(e => {
        setError('Could not load news');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 64,
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
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent news.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((n, i) => (
        <a
          key={i}
          href={n.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            padding: '10px 12px',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
            textDecoration: 'none',
            color: 'var(--text-primary)',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover, rgba(255,255,255,0.05))'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary, rgba(255,255,255,0.02))'}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-muted)',
            marginBottom: 4,
          }}>
            <span style={{
              fontWeight: 700,
              color: 'var(--accent, #58a6ff)',
            }}>{n.ticker}</span>
            <span>·</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.source}
            </span>
            <span>{timeAgo(n.time)}</span>
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {n.headline}
          </div>
        </a>
      ))}
    </div>
  );
}
