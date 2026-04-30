'use client';
import { useState, useEffect } from 'react';

const STORAGE_KEY_ANON = 'portfolio_ai_usage_anon';
const STORAGE_KEY_USER = 'portfolio_ai_usage_user';

// ── Label translations (EN + NL; others fall back to EN) ─────────────────────
const LABELS = {
  en: {
    claudeRating:    'CLAUDE RATING',
    overview:        '📊 OVERVIEW',
    whatsWorking:    "✅ WHAT'S WORKING",
    whatsDragging:   "⚠️ WHAT'S DRAGGING",
    biggestRisk:     '🎯 BIGGEST RISK',
    suggestedAction: '💡 SUGGESTED ACTION',
    // ── portfolio_shape labels ──────────────────────────────────────────────
    shape:             "🎯 WHAT YOU'RE REALLY LONG",
    shapeMore:         'Show blind spots & more',
    shapeLess:         'Show less',
    shapeHonorable:    '👁️ HONORABLE MENTIONS',
    shapeBlindSpots:   '🚩 BLIND SPOTS',
    shapeDataVerified: 'Data-verified: positions in this cluster are correlated (avg r > 0.5)',
    shapePatternBased: 'Pattern-based: thesis inferred from market knowledge, not correlation data',
    analyzing:       'Claude is analyzing your portfolio...',
    regenerate:      'Regenerate',
    generateButton:  'Generate',
    usedToday:           '{count}/{limit} used today',
    limitReachedMessage: 'Daily limit reached ({limit}/{limit}). Come back tomorrow.',
    networkError:    "Couldn't reach AI service. Please try again.",
    genericError:    'Something went wrong. Please try again.',
  },
  nl: {
    claudeRating:    'CLAUDE BEOORDELING',
    overview:        '📊 OVERZICHT',
    whatsWorking:    '✅ WAT WERKT',
    whatsDragging:   '⚠️ WAT TREKT OMLAAG',
    biggestRisk:     '🎯 GROOTSTE RISICO',
    suggestedAction: '💡 VOORGESTELDE ACTIE',
    analyzing:       'Claude analyseert je portfolio...',
    regenerate:      'Opnieuw genereren',
    generateButton:  'Genereer',
    usedToday:           '{count}/{limit} vandaag gebruikt',
    limitReachedMessage: 'Daglimiet bereikt ({limit}/{limit}). Kom morgen terug.',
    networkError:    'Kan de AI-service niet bereiken. Probeer het opnieuw.',
    genericError:    'Er ging iets mis. Probeer het opnieuw.',
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function readUsage(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored?.date === todayStr()) return stored.count ?? 0;
  } catch {}
  return 0;
}

function writeUsage(key, count) {
  localStorage.setItem(key, JSON.stringify({ date: todayStr(), count }));
}

// ── Skeleton shimmer block (uses existing @keyframes pulse from globals.css) ──
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

export default function PortfolioAISummary({ holdings, portfolioStats, initialSummary, isSignedIn = false }) {
  const STORAGE_KEY = isSignedIn ? STORAGE_KEY_USER : STORAGE_KEY_ANON;
  const LIMIT       = isSignedIn ? 5 : 2;

  const [summary,     setSummary]     = useState(initialSummary ?? null);   // structured object | null
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);   // { type, message } | null
  const [generatedAt, setGeneratedAt] = useState(null);
  const [usageCount,  setUsageCount]  = useState(0);
  const [showCount,   setShowCount]   = useState(false);
  const [uiLang,      setUiLang]      = useState(initialSummary?.language ?? 'en');
  const [isMobile,      setIsMobile]      = useState(false);
  const [shapeExpanded, setShapeExpanded] = useState(false);

  useEffect(() => {
    if (!initialSummary) {
      const count = readUsage(STORAGE_KEY);
      setUsageCount(count);
      if (count > 0) setShowCount(true);
      setUiLang((navigator.language || 'en').split('-')[0].toLowerCase());
    }
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [initialSummary, isSignedIn]);

  const limitReached            = usageCount >= LIMIT;
  const L                       = getLabels(uiLang);
  const isInsufficientPositions = error?.type === 'insufficient_positions';

  // Button visibility logic
  const showGenerateButton = !loading && !summary && (!error || isInsufficientPositions);
  const showRegenerate     = !initialSummary && !loading && !isInsufficientPositions && (!!summary || !!error);

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
        avgCost:      h.s > 0 ? h.costVal / h.s : 0,
        currentPrice: h.price,
        pnlPct:       h.pnlPct,
        marketValue:  h.mktVal,
      }));

    const userLang = navigator.language || 'en';

    // Fetch correlation matrix for signed-in users only (/api/correlation requires auth)
    let correlationData = null;
    if (isSignedIn) {
      try {
        const corrRes = await fetch('/api/correlation');
        if (corrRes.ok) {
          correlationData = await corrRes.json();
          correlationData = {
            tickers:            correlationData.tickers,
            matrix:             correlationData.matrix,
            trading_days_used:  correlationData.trading_days_used,
            aligned_date_start: correlationData.aligned_date_start,
            aligned_date_end:   correlationData.aligned_date_end,
          };
        }
      } catch (e) {
        console.warn('[portfolio-ai] correlation fetch failed, proceeding without:', e.message);
      }
    }

    try {
      const res  = await fetch('/api/ai-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'portfolio-summary', holdings: holdingsPayload, portfolioStats, userLang, correlationData }),
      });
      const json = await res.json();

      if (json.error) {
        if (json.error === 'insufficient_positions') {
          setError({ type: 'insufficient_positions', message: json.message });
        } else if (json.error === 'generation_failed') {
          setError({ type: 'generation_failed', message: json.message ?? L.genericError });
        } else {
          setError({ type: 'generic', message: L.genericError });
        }
      } else {
        setSummary(json);
        if (json.language) setUiLang(json.language);
        setGeneratedAt(new Date());
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        setShowCount(true);
        writeUsage(STORAGE_KEY, newCount);
      }
    } catch {
      setError({ type: 'network', message: L.networkError });
    } finally {
      setLoading(false);
    }
  };

  // One-click regenerate: clears state then immediately calls generate()
  const regenerate = () => {
    setSummary(null);
    setError(null);
    setGeneratedAt(null);
    generate();
  };

  const minsAgo = generatedAt
    ? Math.floor((Date.now() - generatedAt.getTime()) / 60000)
    : null;

  // Adaptive sections: filter null / undefined / empty string
  const sections = summary ? [
    { key: 'overview',         label: L.overview,         value: summary.overview },
    { key: 'whats_working',    label: L.whatsWorking,     value: summary.whats_working },
    { key: 'whats_dragging',   label: L.whatsDragging,    value: summary.whats_dragging },
    { key: 'biggest_risk',     label: L.biggestRisk,      value: summary.biggest_risk },
    { key: 'suggested_action', label: L.suggestedAction,  value: summary.suggested_action },
  ].filter(s => s.value != null && s.value !== '') : [];

  return (
    <div
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}
      aria-busy={loading}
      data-tour="portfolio-ai-summary"
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
            Portfolio Intelligence
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
            color: 'var(--text-muted)', border: '1px solid var(--border-color)',
            borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
          }}>
            Powered by Claude Opus 4.7
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: isMobile ? 'flex-end' : 'auto' }}>
          {generatedAt && minsAgo != null && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {minsAgo === 0 ? 'Just now' : `${minsAgo}m ago`}
            </span>
          )}

          {/* Idle / insufficient-positions state: show Generate button */}
          {showGenerateButton && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {limitReached ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {L.limitReachedMessage.replaceAll('{limit}', LIMIT)}
                </span>
              ) : (
                <button
                  onClick={generate}
                  data-tour="portfolio-ai-summary-cta"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 6,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 14 }}>✦</span>
                  {isMobile ? L.generateButton : 'Generate Portfolio Summary'}
                </button>
              )}
              {showCount && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {L.usedToday.replace('{count}', usageCount).replace('{limit}', LIMIT)}
                </span>
              )}
            </div>
          )}

          {/* Summary or error state: show Regenerate button */}
          {showRegenerate && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {!limitReached && (
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
              {showCount && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {L.usedToday.replace('{count}', usageCount).replace('{limit}', LIMIT)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading: skeleton matching real layout ── */}
      {loading && (
        <div>
          {/* Rating skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0 24px' }}>
            <Skeleton style={{ width: 200, height: 52, borderRadius: 6 }} />
            <Skeleton style={{ width: 300, height: 15 }} />
          </div>
          <div style={{ borderTop: '1px solid #21262d' }} />
          {/* Section row skeletons — 5 rows, last has 3 lines (suggested action is longer) */}
          {[2, 2, 2, 2, 3].map((lineCount, i) => (
            <div key={i}>
              <div style={{ display: 'flex', gap: 20, padding: '16px 0', alignItems: 'flex-start' }}>
                <Skeleton style={{ width: 120, height: 13, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: lineCount }).map((_, j) => (
                    <Skeleton key={j} style={{ height: 13, width: j === lineCount - 1 ? '60%' : '100%' }} />
                  ))}
                </div>
              </div>
              {i < 4 && <div style={{ borderTop: '1px solid #21262d' }} />}
            </div>
          ))}
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', margin: '16px 0 0' }}>
            {L.analyzing}
          </p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div style={{
          fontSize: isInsufficientPositions ? 13 : 12,
          color: isInsufficientPositions ? 'var(--text-muted)' : 'var(--negative)',
          padding: '8px 0',
          textAlign: isInsufficientPositions ? 'center' : 'left',
        }}>
          {error.message}
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

          {/* ── "What You're Really Long" block ── */}
          {summary?.portfolio_shape && (
            <>
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
                  {L.shape}
                </h3>

                <div style={{ flex: 1 }}>
                  {/* Headline */}
                  <p style={{ fontSize: 14, color: '#c9d1d9', lineHeight: 1.6, margin: 0, fontStyle: 'italic', marginBottom: 16 }}>
                    {summary.portfolio_shape.headline}
                  </p>

                  {/* Primary clusters */}
                  {summary.portfolio_shape.primary_clusters.map((c, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#c9d1d9' }}>
                          {c.label}
                        </span>
                        <span
                          title={c.confidence === 'data_verified' ? L.shapeDataVerified : L.shapePatternBased}
                          style={{ fontSize: 12, color: '#8b949e', cursor: 'help' }}
                        >
                          {c.confidence === 'data_verified' ? '✓' : '~'}
                        </span>
                        <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 'auto' }}>
                          {c.concentration_pct}% · {c.positions.join(', ')}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, margin: 0 }}>
                        {c.explanation}
                      </p>
                    </div>
                  ))}

                  {/* Expand toggle */}
                  {(summary.portfolio_shape.honorable_mentions?.length > 0 ||
                    summary.portfolio_shape.blind_spots?.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setShapeExpanded(v => !v)}
                      style={{
                        background: 'none', border: 'none',
                        color: '#58a6ff', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer', padding: '4px 0', marginTop: 4,
                        fontFamily: 'inherit',
                      }}
                    >
                      {shapeExpanded ? L.shapeLess : L.shapeMore}
                    </button>
                  )}

                  {/* Honorable mentions + blind spots — collapsed by default */}
                  {shapeExpanded && (
                    <div style={{ marginTop: 12 }}>
                      {summary.portfolio_shape.honorable_mentions?.length > 0 && (
                        <>
                          <p style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                            letterSpacing: '0.05em', margin: 0, marginTop: 16, marginBottom: 8,
                          }}>
                            {L.shapeHonorable}
                          </p>
                          {summary.portfolio_shape.honorable_mentions.map((m, i) => (
                            <div key={i} style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#c9d1d9' }}>
                                  {m.label}
                                </span>
                                <span style={{ fontSize: 12, color: '#8b949e', marginLeft: 'auto' }}>
                                  {m.positions.join(', ')}
                                </span>
                              </div>
                              <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5, margin: 0 }}>
                                {m.note}
                              </p>
                            </div>
                          ))}
                        </>
                      )}

                      {summary.portfolio_shape.blind_spots?.length > 0 && (
                        <>
                          <p style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                            letterSpacing: '0.05em', margin: 0, marginTop: 16, marginBottom: 8,
                          }}>
                            {L.shapeBlindSpots}
                          </p>
                          <ul style={{ paddingLeft: 16, margin: 0 }}>
                            {summary.portfolio_shape.blind_spots.map((b, i) => (
                              <li key={i} style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.5, marginBottom: 4 }}>
                                {b}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #21262d' }} />
            </>
          )}

          {/* Section rows — dividers only between rendered rows */}
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
