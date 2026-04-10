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

const COLS = [
  { key: 'ticker',           label: 'Ticker', align: 'left' },
  { key: 'name',             label: 'Name',   align: 'left' },
  { key: 'transactionCode',  label: 'Type',   align: 'left' },
  { key: 'change',           label: 'Shares', align: 'right' },
  { key: 'transactionPrice', label: 'Price',  align: 'right' },
  { key: 'value',            label: 'Value',  align: 'right' },
  { key: 'transactionDate',  label: 'Date',   align: 'right' },
];

export default function InsiderTransactions({ tickers }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('transactionDate');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  useEffect(() => {
    if (!tickers?.length) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/insider?tickers=${tickers.join(',')}`)
      .then(r => r.json())
      .then(data => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [tickers?.join(',')]);

  if (loading) return <div className="news-placeholder">Loading insider transactions…</div>;
  if (!transactions.length) return <div className="news-placeholder">No recent insider transactions found.</div>;

  const sorted = [...transactions].sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'value') {
      av = a.change && a.transactionPrice ? Math.abs(a.change * a.transactionPrice) : null;
      bv = b.change && b.transactionPrice ? Math.abs(b.change * b.transactionPrice) : null;
    }
    av = av ?? (sortDir === 'desc' ? -Infinity : Infinity);
    bv = bv ?? (sortDir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLS.map(c => {
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
          {sorted.map((t, i) => {
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