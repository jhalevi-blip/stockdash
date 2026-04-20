'use client';
import { useEffect, useState } from 'react';
import InsiderTransactions from '@/components/InsiderTransactions';
import { getDemoTickers } from '@/lib/startDemo';
import SignupGate from '@/components/SignupGate';

export default function InsiderPage() {
  const [tickers, setTickers] = useState(null); // null = not yet read from localStorage

  useEffect(() => {
    try {
      // TODO: reads stockdash_holdings without ownership check — a polluted browser
      // may show stale data here. Track: consolidate all unscoped cache reads behind
      // a single ownership-aware getter (dual-table consolidation pass).
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const t = holdings.map(h => h.t);
      setTickers(t.length ? t : (localStorage.getItem('stockdash_demo') === 'true' ? getDemoTickers() : []));
    } catch {
      setTickers([]);
    }
  }, []);

  return (
    <SignupGate
      title="Insider Transactions"
      description="Monitor recent buy and sell activity from company executives, directors, and major shareholders — filed directly with the SEC."
    >
      <main style={{ padding: '20px 24px' }}>
        <div className="section-title" style={{ marginBottom: 16 }}>Insider Transactions</div>
        {tickers === null
          ? <div className="news-placeholder">Loading…</div>
          : <InsiderTransactions tickers={tickers} />
        }
      </main>
    </SignupGate>
  );
}
