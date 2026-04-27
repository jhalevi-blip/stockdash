'use client';
import { useState, useEffect, useCallback } from 'react';
import { track } from '@/lib/posthog';
import { getAttribution } from '@/lib/attribution';

// ── Label translations ────────────────────────────────────────────────────────
const LABELS = {
  en: {
    claudeRating:       'CLAUDE RATING',
    thesis:             '📊 THESIS',
    bullCase:           '▲ BULL CASE',
    bearCase:           '▼ BEAR CASE',
    whatToWatch:        '👁 WHAT TO WATCH',
    analyzing:          'Claude is analyzing this stock...',
    regenerate:         'Regenerate',
    generateButton:     'Generate AI Summary',
    networkError:       "Couldn't reach AI service. Please try again.",
    genericError:       'Something went wrong. Please try again.',
    tickerLimitReached: 'Already regenerated twice for this ticker today',
    dailyLimitReached:  'Daily limit reached (10 tickers). Come back tomorrow.',
    generationCount:    'Generation {n} of 2',
    usedToday:          '{count}/10 tickers analyzed today',
    signInPrompt:       'Sign in to generate AI summaries.',
    poweredBy:          'Powered by Claude Opus 4.7',
  },
  nl: {
    claudeRating:       'CLAUDE BEOORDELING',
    thesis:             '📊 THESE',
    bullCase:           '▲ BULL CASE',
    bearCase:           '▼ BEAR CASE',
    whatToWatch:        '👁 OM IN DE GATEN TE HOUDEN',
    analyzing:          'Claude analyseert dit aandeel...',
    regenerate:         'Opnieuw genereren',
    generateButton:     'AI-samenvatting genereren',
    networkError:       'Kan de AI-service niet bereiken. Probeer het opnieuw.',
    genericError:       'Er ging iets mis. Probeer het opnieuw.',
    tickerLimitReached: 'Vandaag al 2x opnieuw gegenereerd voor dit aandeel',
    dailyLimitReached:  'Daglimiet bereikt (10 aandelen). Kom morgen terug.',
    generationCount:    'Generatie {n} van 2',
    usedToday:          '{count}/10 aandelen vandaag geanalyseerd',
    signInPrompt:       'Meld je aan om AI-samenvattingen te genereren.',
    poweredBy:          'Aangedreven door Claude Opus 4.7',
  },
};

function getLabels(lang) {
  const prefix = (lang || 'en').split('-')[0].toLowerCase();
  return LABELS[prefix] ?? LABELS.en;
}

function ratingColor(rating) {
  if (rating >= 8.0) return '#3fb950';
  if (rating >= 6.0) return '#58a6ff';
  if (rating >= 4.0) return '#d29922';
  return '#f85149';
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getTickerCountsToday() {
  try {
    return JSON.parse(localStorage.getItem(`stock_ai_ticker_counts_${getTodayKey()}`) || '{}');
  } catch { return {}; }
}

function incrementTickerCount(ticker) {
  try {
    const today = getTodayKey();
    const counts = getTickerCountsToday();
    counts[ticker] = (counts[ticker] || 0) + 1;
    localStorage.setItem(`stock_ai_ticker_counts_${today}`, JSON.stringify(counts));
  } catch {}
}

function canGenerateForTicker(ticker) {
  const counts = getTickerCountsToday();
  const tickerCount = counts[ticker] || 0;
  if (tickerCount >= 2) return { allowed: false, reason: 'ticker_limit_2' };
  const distinctCount = Object.keys(counts).length;
  const isNewTicker = !(ticker in counts);
  if (isNewTicker && distinctCount >= 10) return { allowed: false, reason: 'daily_limit_10' };
  return { allowed: true };
}

function getCachedSummary(ticker) {
  try {
    const raw = localStorage.getItem(`stock_ai_${ticker}_${getTodayKey()}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedSummary(ticker, data) {
  try {
    localStorage.setItem(`stock_ai_${ticker}_${getTodayKey()}`, JSON.stringify(data));
    incrementTickerCount(ticker);
  } catch {}
}

function pruneStaleCacheKeys() {
  try {
    const today = getTodayKey();
    Object.keys(localStorage)
      .filter(k => k.startsWith('stock_ai_') && !k.includes(today))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ── Skeleton shimmer block ────────────────────────────────────────────────────
function Skeleton({ style }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 4,
      animation: 'pulse 1.5s ease-in-out infinite',
      ...style,
    }} />
  );
}

export default function StockIntelAISummary({
  ticker, isSignedIn, dataLoading,
  row, analystD, valD, finD, earningsHist, insiders, siD, peersList,
}) {
  const [summary,      setSummary]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [tickersUsed,  setTickersUsed]  = useState(0);  // UI only — always read localStorage fresh for logic
  const [uiLang,       setUiLang]       = useState('en');
  const [isMobile,     setIsMobile]     = useState(false);

  // Prune stale keys + init UI state on mount
  useEffect(() => {
    pruneStaleCacheKeys();
    setUiLang((navigator.language || 'en').split('-')[0].toLowerCase());
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On ticker change: load cache or clear
  useEffect(() => {
    if (!ticker) { setSummary(null); setError(null); return; }
    const cached = getCachedSummary(ticker);
    if (cached) {
      setSummary(cached);
      if (cached.language) setUiLang(cached.language);
      setError(null);
    } else {
      setSummary(null);
      setError(null);
    }
    // Update tickersUsed counter for UI
    setTickersUsed(Object.keys(getTickerCountsToday()).length);
  }, [ticker]);

  const L = getLabels(uiLang);

  const doGenerate = useCallback(async (currentTicker) => {
    if (!currentTicker) return;
    // Always read from localStorage — never rely on React state for rate-limit decisions
    const check = canGenerateForTicker(currentTicker);
    if (!check.allowed) return;

    setLoading(true);
    setError(null);

    const userLang = navigator.language || 'en';

    try {
      const res = await fetch('/api/stock-ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: currentTicker,
          price: row?.price ?? null,
          userLang,
          analystD: analystD ?? null,
          valD: valD ?? null,
          finD: finD?.error ? null : (finD ?? null),
          earningsHist: earningsHist ?? null,
          insiders: insiders ?? null,
          siD: siD ?? null,
          peersList: peersList ?? null,
          row: row ?? null,
        }),
      });
      const json = await res.json();

      if (json.error) {
        setError(json.message ?? L.genericError);
      } else {
        setCachedSummary(currentTicker, json);
        setSummary(json);
        if (json.language) setUiLang(json.language);
        setTickersUsed(Object.keys(getTickerCountsToday()).length);
        const hasPos = !!(row?.s > 0);
        track('stock_ai_generated', { ticker: currentTicker, has_position: hasPos, attribution: getAttribution() });
      }
    } catch {
      setError(L.networkError);
    } finally {
      setLoading(false);
    }
  }, [row, analystD, valD, finD, earningsHist, insiders, siD, peersList, L]);

  const generate = useCallback(() => {
    doGenerate(ticker);
  }, [ticker, doGenerate]);

  const regenerate = useCallback(() => {
    if (!ticker) return;
    // Always read fresh from localStorage
    const check = canGenerateForTicker(ticker);
    if (!check.allowed) return;
    try { localStorage.removeItem(`stock_ai_${ticker}_${getTodayKey()}`); } catch {}
    setSummary(null);
    setError(null);
    doGenerate(ticker);
  }, [ticker, doGenerate]);

  // Render-time rate limit state (read fresh from localStorage each render)
  const tickerCounts   = getTickerCountsToday();
  const tickerCount    = tickerCounts[ticker] || 0;
  const distinctCount  = Object.keys(tickerCounts).length;
  const isNewTicker    = ticker ? !(ticker in tickerCounts) : false;
  const dailyLimitReached  = isNewTicker && distinctCount >= 10;
  const tickerLimitReached = tickerCount >= 2;

  const showGenerate   = !loading && !summary && !error;
  const showRegenerate = !loading && (!!summary || !!error);

  const sections = summary ? [
    { key: 'thesis',        label: L.thesis,       value: summary.thesis },
    { key: 'bull_case',     label: L.bullCase,      value: summary.bull_case },
    { key: 'bear_case',     label: L.bearCase,      value: summary.bear_case },
    { key: 'what_to_watch', label: L.whatToWatch,   value: summary.what_to_watch },
  ].filter(s => s.value != null && s.value !== '') : [];

  return (
    <div
      style={{
        gridColumn: '1 / -1',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        padding: '16px 20px',
      }}
      aria-busy={loading}
    >
      {/* ── Header row ── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: isMobile ? 'flex-start' : 'space-between',
        gap: isMobile ? 12 : 0,
        marginBottom: (summary || loading || error) ? 14 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Stock AI Summary
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
            color: 'var(--text-muted)', border: '1px solid var(--border-color)',
            borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
          }}>
            {L.poweredBy}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: isMobile ? 'flex-end' : 'auto' }}>
          {/* Not signed in */}
          {!isSignedIn && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{L.signInPrompt}</span>
          )}

          {/* Signed in — idle state */}
          {isSignedIn && showGenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {dailyLimitReached ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{L.dailyLimitReached}</span>
              ) : (
                <button
                  onClick={generate}
                  disabled={dataLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 6,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                    cursor: dataLoading ? 'not-allowed' : 'pointer',
                    opacity: dataLoading ? 0.6 : 1,
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 14 }}>✦</span>
                  {L.generateButton}
                </button>
              )}
              {distinctCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {L.usedToday.replace('{count}', distinctCount)}
                </span>
              )}
            </div>
          )}

          {/* Signed in — summary or error state */}
          {isSignedIn && showRegenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {tickerLimitReached ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{L.tickerLimitReached}</span>
              ) : (
                <button
                  onClick={regenerate}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-muted)', fontSize: 11,
                    cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit',
                  }}
                >
                  {L.regenerate}
                </button>
              )}
              {tickerCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {L.generationCount.replace('{n}', tickerCount)}
                </span>
              )}
              {distinctCount > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {L.usedToday.replace('{count}', distinctCount)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0 24px' }}>
            <Skeleton style={{ width: 200, height: 52, borderRadius: 6 }} />
            <Skeleton style={{ width: 300, height: 15 }} />
          </div>
          <div style={{ borderTop: '1px solid #21262d' }} />
          {[2, 2, 2].map((lineCount, i) => (
            <div key={i}>
              <div style={{ display: 'flex', gap: 20, padding: '16px 0', alignItems: 'flex-start' }}>
                <Skeleton style={{ width: 120, height: 13, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: lineCount }).map((_, j) => (
                    <Skeleton key={j} style={{ height: 13, width: j === lineCount - 1 ? '60%' : '100%' }} />
                  ))}
                </div>
              </div>
              {i < 2 && <div style={{ borderTop: '1px solid #21262d' }} />}
            </div>
          ))}
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', margin: '16px 0 0' }}>
            {L.analyzing}
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div style={{ fontSize: 12, color: 'var(--negative)', padding: '8px 0' }}>
          {error}
        </div>
      )}

      {/* ── Summary ── */}
      {summary && !loading && (
        <div>
          {/* Rating block */}
          <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
            }}>
              {L.claudeRating}
            </div>
            <div
              aria-label={`Claude rating ${(+summary.rating).toFixed(1)} out of 10`}
              style={{ lineHeight: 1 }}
            >
              <span style={{
                fontSize: 44, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: ratingColor(+summary.rating),
              }}>
                {(+summary.rating).toFixed(1)}
              </span>
              <span style={{ fontSize: 20, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                / 10
              </span>
            </div>
            <div style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.5, maxWidth: 500, margin: '10px auto 0' }}>
              {summary.rating_summary}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #21262d' }} />

          {/* Adaptive section rows */}
          {sections.map((section, i) => (
            <div key={section.key}>
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? 6 : 20,
                padding: '16px 0',
                alignItems: 'flex-start',
              }}>
                <h3 style={{
                  width: isMobile ? 'auto' : 160,
                  flexShrink: 0,
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  margin: 0,
                  paddingTop: isMobile ? 0 : 2,
                }}>
                  {section.label}
                </h3>
                <p style={{ flex: 1, fontSize: 14, color: '#c9d1d9', lineHeight: 1.6, margin: 0 }}>
                  {section.value}
                </p>
              </div>
              {i < sections.length - 1 && <div style={{ borderTop: '1px solid #21262d' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
