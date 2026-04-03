'use client';
import { useEffect, useState } from 'react';
import InsiderTransactions from '@/components/InsiderTransactions';
import { getDemoTickers } from '@/lib/startDemo';

export default function InsiderPage() {
  const [tickers, setTickers] = useState([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const t = holdings.map(h => h.t);
      setTickers(t.length ? t : (localStorage.getItem('stockdash_demo') === 'true' ? getDemoTickers() : []));
    } catch {}
  }, []);

  return (
    <main style={{ padding: '20px 24px' }}>
      <div className="section-title" style={{ marginBottom: 16 }}>Insider Transactions</div>
      <InsiderTransactions tickers={tickers} />
    </main>
  );
}
