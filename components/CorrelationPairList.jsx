'use client';
import { useState, useEffect } from 'react';
import { summarizeCorrelationMatrix } from '@/lib/correlation';

const LABELS = {
  en: {
    sectionTitle:    'CORRELATION ANALYSIS',
    intro:           'How your positions move together over the past',
    daysWord:        'days',
    strongestHeader: 'Strongest correlations — these positions move together',
    lowestHeader:    'Lowest correlations — your real diversifiers',
    dateRange:       'Based on',
    dateRangeJoin:   'to',
    loading:         'Computing correlations...',
    error:           "Couldn't load correlation data right now.",
    insufficient:    'Need at least 2 positions to compute correlations.',
    signupTitle:     'See how your positions move together',
    signupBody:      'Sign up to view your portfolio\'s correlation analysis — discover which positions are real diversifiers and which are concentrated bets.',
    signupCTA:       'Sign up free',
  },
};

function correlationLabel(r) {
  if (r >= 0.7)  return 'very high';
  if (r >= 0.4)  return 'moderate';
  if (r >= 0.1)  return 'low';
  if (r >= -0.1) return 'none';
  return 'inverse';
}

const cardStyle = {
  background:    'var(--bg-card)',
  border:        '1px solid var(--border-color)',
  borderRadius:  8,
  padding:       '16px 20px',
  marginBottom:  24,
};

const sectionLabelStyle = {
  fontSize:      11,
  color:         'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight:    600,
  marginBottom:  12,
};

export default function CorrelationPairList({ isSignedIn }) {
  const [correlationData,  setCorrelationData]  = useState(null);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState(null);
  const [isMobile,         setIsMobile]         = useState(false);
  const [takeaways,        setTakeaways]        = useState(null);
  const [takeawaysLoading, setTakeawaysLoading] = useState(false);
  const L = LABELS.en;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/correlation')
      .then(res => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (!data?.tickers || data.tickers.length < 2 || !data.matrix) {
          setError('insufficient');
          return;
        }
        setCorrelationData(data);

        // Chained takeaways fetch — non-blocking, slides in when ready
        setTakeawaysLoading(true);
        fetch('/api/ai-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'correlation-takeaways', correlationData: data }),
        })
          .then(r => r.json())
          .then(t => {
            if (cancelled) return;
            if (t.takeaways && Array.isArray(t.takeaways) && t.takeaways.length > 0) {
              setTakeaways(t.takeaways);
            }
          })
          .catch(() => { /* silent fail */ })
          .finally(() => {
            if (!cancelled) setTakeawaysLoading(false);
          });
      })
      .catch(() => {
        if (cancelled) return;
        setError('error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  if (!isSignedIn) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionLabelStyle}>{L.sectionTitle}</h3>
        <div style={{
          textAlign:    'center',
          padding:      '24px 16px',
          background:   'rgba(88, 166, 255, 0.04)',
          border:       '1px dashed rgba(88, 166, 255, 0.3)',
          borderRadius: 6,
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#c9d1d9', margin: '0 0 8px' }}>
            🔒 {L.signupTitle}
          </p>
          <p style={{ fontSize: 12, color: '#8b949e', margin: '0 0 16px', lineHeight: 1.5 }}>
            {L.signupBody}
          </p>
          <a href="/sign-up" style={{
            display:        'inline-block',
            background:     '#58a6ff',
            color:          '#0d1117',
            padding:        '8px 16px',
            borderRadius:   6,
            fontSize:       13,
            fontWeight:     600,
            textDecoration: 'none',
          }}>
            {L.signupCTA}
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionLabelStyle}>{L.sectionTitle}</h3>
        <p style={{
          textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
          padding: '32px 0', margin: 0,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          {L.loading}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <h3 style={sectionLabelStyle}>{L.sectionTitle}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', margin: 0 }}>
          {error === 'insufficient' ? L.insufficient : L.error}
        </p>
      </div>
    );
  }

  if (!correlationData) return null;

  const { top_pairs, bottom_pairs } = summarizeCorrelationMatrix(
    correlationData.tickers,
    correlationData.matrix,
    { topN: 5, bottomN: 5 }
  );

  const PairRow = ({ pair }) => (
    <div style={{
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'baseline',
      padding:        '8px 0',
      borderBottom:   '1px solid #21262d',
      fontSize:       13,
    }}>
      <span style={{ color: '#c9d1d9', fontWeight: 500 }}>
        {pair.a} × {pair.b}
      </span>
      <span style={{ color: '#8b949e', fontVariantNumeric: 'tabular-nums' }}>
        {pair.r.toFixed(2)}{' '}
        <span style={{ color: '#6e7681', fontSize: 12 }}>({correlationLabel(pair.r)})</span>
      </span>
    </div>
  );

  return (
    <div style={cardStyle}>
      <h3 style={sectionLabelStyle}>{L.sectionTitle}</h3>
      <p style={{ fontSize: 12, color: '#8b949e', margin: '0 0 20px', lineHeight: 1.5 }}>
        {L.intro} {correlationData.trading_days_used ?? '—'} {L.daysWord}.
      </p>

      {/* Takeaways block — slides in when ready */}
      {(takeawaysLoading || takeaways) && (
        <div style={{
          background:   'rgba(88, 166, 255, 0.04)',
          border:       '1px solid rgba(88, 166, 255, 0.15)',
          borderRadius: 6,
          padding:      '14px 16px',
          marginBottom: 24,
        }}>
          <p style={{
            fontSize:      11,
            color:         'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight:    600,
            margin:        '0 0 12px',
          }}>
            💡 Key takeaways
          </p>
          {takeawaysLoading && !takeaways ? (
            <p style={{
              fontSize:  12,
              color:     'var(--text-muted)',
              margin:    0,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              Generating insights...
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {takeaways.map((t, i) => (
                <li key={i} style={{
                  fontSize:     13,
                  color:        '#c9d1d9',
                  lineHeight:   1.6,
                  marginBottom: i === takeaways.length - 1 ? 0 : 8,
                }}>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24 }}>
        {/* Strongest pairs */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, margin: '0 0 8px', letterSpacing: '0.02em' }}>
            {L.strongestHeader}
          </p>
          <div>
            {top_pairs.map((p, i) => <PairRow key={`top-${i}`} pair={p} />)}
          </div>
        </div>

        {/* Lowest pairs */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: '#8b949e', fontWeight: 600, margin: '0 0 8px', letterSpacing: '0.02em' }}>
            {L.lowestHeader}
          </p>
          <div>
            {bottom_pairs.map((p, i) => <PairRow key={`bottom-${i}`} pair={p} />)}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#6e7681', textAlign: 'center', margin: '20px 0 0' }}>
        {L.dateRange} {correlationData.aligned_date_start} {L.dateRangeJoin} {correlationData.aligned_date_end}
      </p>
    </div>
  );
}
