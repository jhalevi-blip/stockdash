'use client';
import { useEffect, useState } from 'react';
import InsiderTransactions from '@/components/InsiderTransactions';
import { getDemoTickers } from '@/lib/startDemo';

export default function InsiderPage() {
  const [tickers, setTickers] = useState(null); // null = not yet read from localStorage

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const t = holdings.map(h => h.t);
      setTickers(t.length ? t : (localStorage.getItem('stockdash_demo') === 'true' ? getDemoTickers() : []));
    } catch {
      setTickers([]);
    }
  }, []);

  return (
    <main style={{ padding: '20px 24px' }}>
      <div className="section-title" style={{ marginBottom: 16 }}>Insider Transactions</div>
      {tickers === null
        ? <div className="news-placeholder">Loading…</div>
        : <InsiderTransactions tickers={tickers} />
      }
    </main>
  );
}
