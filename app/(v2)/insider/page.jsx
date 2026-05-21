'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';

/* ─── Transaction type codes (identical to V1) ──────────────────────────── */
const CODES = {
  'P': 'Purchase', 'S': 'Sale',  'A': 'Award',
  'D': 'Disposition', 'F': 'Tax', 'G': 'Gift', 'M': 'Option Exercise',
  'J': 'Other', 'C': 'Conversion', 'I': 'Discretionary', 'W': 'Will',
  'X': 'Exercise', 'Z': 'Trust',
};

/* ─── Badge colors (semantic — kept as-is from V1) ──────────────────────── */
const BADGE_COLORS = {
  'S': '#f85149',  // Sale — red
  'P': '#3fb950',  // Purchase — green
  'A': '#2563eb',  // Award — blue
  'M': '#7c3aed',  // Option Exercise — purple
  'X': '#7c3aed',  // Exercise — purple
  'F': '#d97706',  // Tax — orange
  'D': '#d97706',  // Disposition — orange
};
const DEFAULT_BADGE_COLOR = '#6b7280';

/* ─── Column definitions ─────────────────────────────────────────────────── */
const COLS = [
  { key: 'ticker',           label: 'Ticker', align: 'left'  },
  { key: 'name',             label: 'Name',   align: 'left'  },
  { key: 'transactionCode',  label: 'Type',   align: 'left'  },
  { key: 'change',           label: 'Shares', align: 'right' },
  { key: 'transactionPrice', label: 'Price',  align: 'right' },
  { key: 'value',            label: 'Value',  align: 'right' },
  { key: 'transactionDate',  label: 'Date',   align: 'right' },
];

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function InsiderV2Page() {
  const { isLoaded, isSignedIn } = useUser();
  const [tickers,      setTickers]      = useState(null); // null = Clerk not yet loaded
  const [transactions, setTransactions] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [sortKey,      setSortKey]      = useState('transactionDate');
  const [sortDir,      setSortDir]      = useState('desc');

  // Resolve tickers once Clerk has loaded (auth state known)
  // Logged-out + no portfolio → getDemoTickers() always (page renders data + nudge)
  // Signed-in  + no portfolio → [] → DemoPrompt (they should add holdings)
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const stored   = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      let ts = holdings.map(h => h.t);
      if (!ts.length && !isSignedIn) ts = getDemoTickers();
      setTickers(ts);
    } catch {
      setTickers(!isSignedIn ? getDemoTickers() : []);
    }
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch transactions when tickers are resolved
  useEffect(() => {
    if (!tickers?.length) return;
    setLoading(true);
    fetch(`/api/insider?tickers=${tickers.join(',')}`)
      .then(r => r.json())
      .then(data => setTransactions(Array.isArray(data) ? data : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [tickers?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

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

  /* ─── Shared th style ───────────────────────────────────────────────────── */
  const thBase = {
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
        }}>
          Analysis
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Insider Transactions
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Recent buy and sell activity from company executives, directors, and major shareholders
        </p>
      </div>

      {/* ── Sign-in nudge (logged-out only) ──────────────────────────────── */}
      {isLoaded && !isSignedIn && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Not seeing your portfolio?{' '}
          <a href="/sign-in" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
            Sign in
          </a>{' '}
          to load your holdings.
        </div>
      )}

      {/* ── Clerk loading / localStorage resolving ───────────────────────── */}
      {tickers === null && (
        <div className="chart-placeholder">Loading…</div>
      )}

      {/* ── Signed-in with no portfolio ──────────────────────────────────── */}
      {tickers !== null && tickers.length === 0 && (
        <DemoPrompt message="Add stocks to your portfolio to view insider transactions" />
      )}

      {/* ── Fetching ─────────────────────────────────────────────────────── */}
      {tickers !== null && tickers.length > 0 && loading && (
        <div className="chart-placeholder">Loading insider transactions…</div>
      )}

      {/* ── No transactions returned ─────────────────────────────────────── */}
      {tickers !== null && tickers.length > 0 && !loading && transactions.length === 0 && (
        <div className="chart-placeholder">No recent insider transactions found.</div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {tickers !== null && tickers.length > 0 && !loading && transactions.length > 0 && (
        <div className="dv2-valuation-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {COLS.map(c => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => handleSort(c.key)}
                      style={{
                        ...thBase,
                        textAlign: c.align === 'left' ? 'left' : 'right',
                        color: active ? 'var(--accent-cyan)' : 'var(--text-muted)',
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
                const isBuy      = t.transactionCode === 'P';
                const isSell     = t.transactionCode === 'S';
                const value      = t.transactionPrice && t.change
                  ? Math.abs(t.change * t.transactionPrice) : null;
                const badgeColor = BADGE_COLORS[t.transactionCode] ?? DEFAULT_BADGE_COLOR;
                return (
                  <tr
                    key={i}
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Ticker — th/td:first-child → sticky on mobile via dv2-valuation-scroll */}
                    <td style={{
                      padding: '9px 14px', whiteSpace: 'nowrap',
                      fontWeight: 700, color: 'var(--accent)',
                    }}>
                      {t.ticker}
                    </td>
                    <td style={{
                      padding: '9px 14px', whiteSpace: 'nowrap',
                      fontSize: 12, color: 'var(--text-secondary)',
                    }}>
                      {t.name}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        background: badgeColor, color: '#fff',
                        borderRadius: 3, padding: '1px 7px',
                        fontSize: 11, fontWeight: 600,
                      }}>
                        {CODES[t.transactionCode] || t.transactionCode}
                      </span>
                    </td>
                    <td style={{
                      padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums', fontSize: 13,
                      color: isBuy ? 'var(--positive)' : isSell ? 'var(--negative)' : 'var(--text-secondary)',
                    }}>
                      {t.change > 0 ? '+' : ''}{t.change?.toLocaleString('en-US')}
                    </td>
                    <td style={{
                      padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums', fontSize: 13,
                      color: 'var(--text-secondary)',
                    }}>
                      {t.transactionPrice ? '$' + t.transactionPrice.toFixed(2) : '—'}
                    </td>
                    <td style={{
                      padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums', fontSize: 13,
                      color: 'var(--text-secondary)',
                    }}>
                      {value ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                    </td>
                    <td style={{
                      padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap',
                      fontSize: 11, color: 'var(--text-secondary)',
                    }}>
                      {t.transactionDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
