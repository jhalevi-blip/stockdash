'use client';
import { useEffect, useState } from 'react';

const CODES = {
  'P': 'Purchase', 'S': 'Sale', 'A': 'Award',
  'D': 'Disposition', 'F': 'Tax', 'G': 'Gift', 'M': 'Option Exercise',
  'J': 'Other', 'C': 'Conversion', 'I': 'Discretionary', 'W': 'Will',
  'X': 'Exercise', 'Z': 'Trust',
};

const BADGE_COLORS = {
  'S': '#f85149',  // Sale — red
  'P': '#3fb950',  // Purchase — green
  'A': '#2563eb',  // Award — blue
  'M': '#7c3aed',  // Option Exercise — purple
  'X': '#7c3aed',  // Exercise — purple
  'F': '#d97706',  // Tax — orange
  'D': '#d97706',  // Disposition — orange
};
const DEFAULT_BADGE_COLOR = '#6b7280'; // gray for Gift, Other, etc.

export default function InsiderTransactions({ tickers }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = tickers?.length ? `/api/insider?tickers=${tickers.join(',')}` : '/api/insider';
    fetch(url)
      .then(r => r.json())
      .then(data => setTransactions(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [tickers?.join(',')]);

  if (loading) return <div className="news-placeholder">Loading insider transactions…</div>;
  if (!transactions.length) return <div className="news-placeholder">No recent insider transactions found.</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="left">Ticker</th>
            <th className="left">Name</th>
            <th className="left">Type</th>
            <th>Shares</th>
            <th>Price</th>
            <th>Value</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, i) => {
            const isBuy = t.transactionCode === 'P';
            const isSell = t.transactionCode === 'S';
            const value = t.transactionPrice && t.change
              ? Math.abs(t.change * t.transactionPrice) : null;
            const badgeColor = BADGE_COLORS[t.transactionCode] ?? DEFAULT_BADGE_COLOR;
            return (
              <tr key={i}>
                <td className="tkr left">{t.ticker}</td>
                <td className="left" style={{fontSize:12}}>{t.name}</td>
                <td className="left">
                  <span style={{
                    background: badgeColor, color: '#fff',
                    borderRadius: 3, padding: '1px 7px',
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {CODES[t.transactionCode] || t.transactionCode}
                  </span>
                </td>
                <td className={isBuy ? 'pos' : isSell ? 'neg' : 'neutral'}>
                  {t.change > 0 ? '+' : ''}{t.change?.toLocaleString()}
                </td>
                <td>{t.transactionPrice ? '$' + t.transactionPrice.toFixed(2) : '—'}</td>
                <td>{value ? '$' + value.toLocaleString(undefined, {maximumFractionDigits:0}) : '—'}</td>
                <td className="neutral" style={{fontSize:11}}>{t.transactionDate}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}