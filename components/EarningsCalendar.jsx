'use client';
import { useEffect, useState } from 'react';

export default function EarningsCalendar({ tickers }) {
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const url = tickers?.length ? `/api/earnings?tickers=${tickers.join(',')}` : '/api/earnings';
    fetch(url)
      .then(r => r.json())
      .then(data => setEarnings(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [tickers?.join(',')]);

  if (loading) return <div className="news-placeholder">Loading earnings calendar…</div>;
  if (!earnings.length) return <div className="news-placeholder">No upcoming earnings found for your holdings.</div>;

  const today = new Date();
  const known  = earnings.filter(e => !e.noData);
  const noData = earnings.filter(e =>  e.noData);

  return (
    <div className="earnings-grid">
      {known.map((e, i) => {
        const date = new Date(e.date);
        const daysAway = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
        const isClose = daysAway <= 7;
        const isSoon  = daysAway <= 14;

        return (
          <div key={i} className={`earnings-card ${isClose ? 'earnings-close' : isSoon ? 'earnings-soon' : ''}`}>
            <div className="earnings-ticker">{e.symbol}</div>
            <div className="earnings-date">
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="earnings-days">
              {daysAway === 0 ? '🔴 Today' : daysAway === 1 ? '🟠 Tomorrow' : `${daysAway} days away`}
            </div>
            {e.hour && (
              <div className="earnings-time">
                {e.hour === 'amc' ? 'After Close' : e.hour === 'bmo' ? 'Before Open' : e.hour}
              </div>
            )}
            {e.epsEstimate != null && (
              <div className="earnings-eps">EPS est: ${e.epsEstimate}</div>
            )}
          </div>
        );
      })}
      {noData.map((e, i) => (
        <div key={`nd-${i}`} className="earnings-card" style={{ opacity: 0.45 }}>
          <div className="earnings-ticker">{e.symbol}</div>
          <div className="earnings-date" style={{ color: '#8b949e' }}>No upcoming earnings</div>
          <div className="earnings-days" style={{ color: '#484f58', fontSize: 11 }}>Date not available</div>
        </div>
      ))}
    </div>
  );
}