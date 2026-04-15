'use client';
import { useState, useEffect } from 'react';

const LIMIT = 5;
const STORAGE_KEY = 'portfolio_ai_usage';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function readUsage() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.date === todayStr()) return stored.count ?? 0;
  } catch {}
  return 0;
}

function writeUsage(count) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayStr(), count }));
}

export default function PortfolioAISummary({ holdings, portfolioStats }) {
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [usageCount,  setUsageCount]  = useState(0);
  const [showCount,   setShowCount]   = useState(false);

  useEffect(() => {
    const count = readUsage();
    setUsageCount(count);
    if (count > 0) setShowCount(true);
  }, []);

  const limitReached = usageCount >= LIMIT;

  const generate = async () => {
    if (!holdings?.length || limitReached) return;
    setLoading(true);
    setError(null);
    setSummary(null);

    const holdingsPayload = holdings
      .filter(h => h.price != null)
      .map(h => ({
        ticker:       h.t,
        shares:       h.s,
        avgCost:      h.costVal / h.s,
        currentPrice: h.price,
        pnlPct:       h.pnlPct,
        marketValue:  h.mktVal,
      }));

    try {
      const res  = await fetch('/api/ai-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'portfolio-summary', holdings: holdingsPayload, portfolioStats }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setSummary(json.summary);
        setGeneratedAt(new Date());
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        setShowCount(true);
        writeUsage(newCount);
      }
    } catch {
      setError('Failed to reach AI service.');
    } finally {
      setLoading(false);
    }
  };

  const minsAgo = generatedAt
    ? Math.floor((Date.now() - generatedAt.getTime()) / 60000)
    : null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 24,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: summary || loading || error ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Portfolio AI Summary
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
            color: 'var(--text-muted)', border: '1px solid var(--border-color)',
            borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
          }}>
            Powered by Claude
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {generatedAt && minsAgo != null && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {minsAgo === 0 ? 'Just now' : `${minsAgo}m ago`}
            </span>
          )}
          {!summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {limitReached ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Daily limit reached (5/5). Come back tomorrow.
                </span>
              ) : (
                <button
                  onClick={generate}
                  disabled={loading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 6,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1,
                    transition: 'opacity .15s',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 14 }}>✦</span>
                  Generate Portfolio Summary
                </button>
              )}
              {showCount && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {usageCount}/{LIMIT} generations used today
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {!limitReached && (
                <button
                  onClick={() => { setSummary(null); setError(null); setGeneratedAt(null); }}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-muted)', fontSize: 11,
                    cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit',
                  }}
                >
                  Regenerate
                </button>
              )}
              {showCount && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {usageCount}/{LIMIT} generations used today
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spinner */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
            <circle cx="8" cy="8" r="6" stroke="var(--accent)" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Analysing your portfolio…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ fontSize: 12, color: 'var(--negative)', padding: '6px 0' }}>
          {error}
        </div>
      )}

      {/* Result */}
      {summary && (
        <div style={{
          fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7,
          borderLeft: '2px solid var(--accent)', paddingLeft: 14,
        }}>
          {summary}
        </div>
      )}
    </div>
  );
}
