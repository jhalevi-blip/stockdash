'use client';

import { Suspense, Fragment, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Card from '@/app/(v2)/_components/Card';
import { useHoldings } from '@/lib/useHoldings';
import { THESES, DEFAULT_WORLDVIEW } from './_lib/theses';
import { MOCK_WORLDVIEW, MOCK_ROWS, MOCK_EXPOSURE } from './_lib/mockData';

// ─────────────────────────────────────────────────────────────
// Verdict pill colors (fixed verdict set)
// ─────────────────────────────────────────────────────────────
const VERDICT_COLOR = {
  Benefits: 'var(--positive)',
  Hurt:     'var(--negative)',
  Neutral:  'var(--text-muted)',
  Mixed:    'var(--warn)',
};

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

// Table cell styles modeled on dashboard/_components/HoldingsTable.jsx
const headerCell = (align) => ({
  textAlign: align,
  padding: '9px 10px',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  whiteSpace: 'nowrap',
});
const cellBase = (align) => ({
  textAlign: align,
  padding: '9px 10px',
  borderBottom: '1px solid var(--border-color)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-primary)',
  background: 'transparent',
});

const fmtWeight = (w) => (w == null ? '—' : `${w.toFixed(1)}%`);

// ─────────────────────────────────────────────────────────────
// Verdict pill (style modeled on MetricChip / BeatChip)
// ─────────────────────────────────────────────────────────────
function VerdictPill({ verdict, rationale, onClick, active }) {
  const color = VERDICT_COLOR[verdict] ?? 'var(--text-muted)';
  const clickable = !!rationale;
  return (
    <button
      type="button"
      title={rationale || undefined}
      onClick={clickable ? onClick : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.2,
        padding: '3px 9px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        background: active ? 'var(--bg-hover)' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {verdict}
    </button>
  );
}

function NotScoredPill() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: FONT,
      fontSize: 11,
      fontWeight: 600,
      padding: '3px 9px',
      borderRadius: 999,
      border: '1px solid var(--border-color)',
      color: 'var(--text-muted)',
      background: 'transparent',
      whiteSpace: 'nowrap',
    }}>
      Not scored
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Exposure bar (Benefits / Hurt / Neutral as % of portfolio weight)
// ─────────────────────────────────────────────────────────────
function ExposureBar({ name, exposure }) {
  const { benefitsPct, hurtPct, neutralPct } = exposure;
  const seg = (pct, bg) => (pct > 0 ? <div style={{ width: `${pct}%`, background: bg }} /> : null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>by market value</span>
      </div>
      <div style={{
        display: 'flex',
        height: 10,
        borderRadius: 999,
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
      }}>
        {seg(benefitsPct, 'var(--positive)')}
        {seg(hurtPct, 'var(--negative)')}
        {seg(neutralPct, 'var(--text-muted)')}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-secondary)' }}>
        <span style={{ color: 'var(--positive)' }}>Benefits {benefitsPct}%</span>
        <span style={{ color: 'var(--negative)' }}>Hurt {hurtPct}%</span>
        <span style={{ color: 'var(--text-muted)' }}>Neutral {neutralPct}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
function ThemesPageInner() {
  const { isLoaded, isSignedIn } = useUser();
  const { holdings } = useHoldings();

  // Live prices for market-value weights. Reuses the dashboard's exact path:
  // /api/prices?tickers=… → priceMap[ticker] = quote, weight = mktValue / total.
  const [prices, setPrices] = useState({});
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = holdings.map(h => h.t).join(',');
    fetch(`/api/prices?tickers=${tickers}`)
      .then(r => r.json())
      .catch(() => [])
      .then(arr => {
        const m = {};
        if (Array.isArray(arr)) arr.forEach(p => { m[p.ticker] = p; });
        setPrices(m);
      });
  }, [holdings]);

  // Real rows for signed-in users (weights from live prices; verdicts not scored yet).
  const realRows = useMemo(() => {
    if (!holdings?.length) return [];
    const enriched = holdings.map(h => {
      const q = prices[h.t] ?? {};
      const price = q.price ?? null;
      return { ticker: h.t, mktValue: price != null ? h.s * price : null };
    });
    const total = enriched.reduce((s, r) => s + (r.mktValue ?? 0), 0);
    return enriched.map(r => ({
      ticker: r.ticker,
      weightPct: (r.mktValue != null && total > 0) ? (r.mktValue / total) * 100 : null,
      verdicts: null, // scoring wired in the next stage
    }));
  }, [holdings, prices]);

  const signedIn   = !!isSignedIn;
  const worldview  = signedIn ? DEFAULT_WORLDVIEW : MOCK_WORLDVIEW;
  const rows       = signedIn ? realRows : MOCK_ROWS;
  const exposure   = signedIn ? null : MOCK_EXPOSURE;

  // Loading / empty states for the signed-in matrix
  const holdingsLoading = signedIn && holdings === null;
  const noHoldings      = signedIn && Array.isArray(holdings) && holdings.length === 0;

  // Expand-on-click rationale; key = `${ticker}::${thesisId}`
  const [expanded, setExpanded] = useState(null);
  const keyOf = (t, id) => `${t}::${id}`;
  const toggle = (t, id) => setExpanded(prev => (prev === keyOf(t, id) ? null : keyOf(t, id)));

  if (!isLoaded) {
    return <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</main>;
  }

  const totalCols = 2 + THESES.length;

  return (
    <main style={{
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      fontFamily: FONT,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      {/* Page-scoped responsive rules: @media + !important per repo convention */}
      <style>{`
        .themes-thesis-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .themes-matrix-desktop { display: block; }
        .themes-matrix-mobile { display: none; }
        @media (max-width: 640px) {
          .themes-thesis-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .themes-matrix-desktop { display: none !important; }
          .themes-matrix-mobile { display: block !important; }
        }
      `}</style>

      {/* a) Worldview header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Theme Research</h1>
          <button
            type="button"
            disabled
            title="Coming soon"
            style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 600,
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid var(--border-color)',
              background: 'transparent', color: 'var(--text-muted)',
              cursor: 'not-allowed', opacity: 0.7,
            }}
          >Edit</button>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: 6 }}>
            Worldview
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{worldview}</p>
        </div>
      </div>

      {/* b) Four thesis cards */}
      <div className="themes-thesis-grid">
        {THESES.map(t => (
          <div key={t.id} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 999,
                color: 'var(--positive)', border: '1px solid var(--positive)', background: 'transparent',
              }}>{t.validity}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{t.view}</p>
            <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Temperature: coming soon
            </div>
          </div>
        ))}
      </div>

      {/* c) Matrix */}
      <Card title="Theme Matrix" eyebrow={signedIn ? 'Your holdings' : 'Sample'}>
        {holdingsLoading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading your portfolio…
          </div>
        ) : noHoldings ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No holdings yet — add a portfolio to score it against your theses.
          </div>
        ) : (
          <>
            {/* Desktop: semantic table */}
            <div className="themes-matrix-desktop" style={{ overflowX: 'auto', margin: '0 -14px', padding: '0 14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
                <thead>
                  <tr>
                    <th style={headerCell('left')}>Ticker</th>
                    <th style={headerCell('right')}>Weight</th>
                    {THESES.map(t => <th key={t.id} style={headerCell('center')}>{t.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const expandedThesis = THESES.find(t => expanded === keyOf(row.ticker, t.id));
                    return (
                      <Fragment key={row.ticker}>
                        <tr>
                          <td style={cellBase('left')}>
                            <span style={{ color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, fontSize: 12 }}>
                              {row.ticker}
                            </span>
                          </td>
                          <td style={cellBase('right')}>{fmtWeight(row.weightPct)}</td>
                          {THESES.map(t => {
                            const v = row.verdicts ? row.verdicts[t.id] : null;
                            return (
                              <td key={t.id} style={{ ...cellBase('center'), textAlign: 'center' }}>
                                {row.verdicts == null ? (
                                  <NotScoredPill />
                                ) : v ? (
                                  <VerdictPill
                                    verdict={v.verdict}
                                    rationale={v.rationale}
                                    active={expanded === keyOf(row.ticker, t.id)}
                                    onClick={() => toggle(row.ticker, t.id)}
                                  />
                                ) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                        {expandedThesis && row.verdicts?.[expandedThesis.id] && (
                          <tr>
                            <td colSpan={totalCols} style={{
                              padding: '8px 10px 12px',
                              borderBottom: '1px solid var(--border-color)',
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              lineHeight: 1.5,
                              background: 'var(--bg-secondary)',
                            }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{expandedThesis.name}:</strong>{' '}
                              {row.verdicts[expandedThesis.id].rationale}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: per-holding cards */}
            <div className="themes-matrix-mobile" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(row => (
                <div key={row.ticker} style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, fontSize: 13 }}>
                      {row.ticker}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtWeight(row.weightPct)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {THESES.map(t => {
                      const v = row.verdicts ? row.verdicts[t.id] : null;
                      return (
                        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.name}</span>
                            {row.verdicts == null ? (
                              <NotScoredPill />
                            ) : v ? (
                              <VerdictPill
                                verdict={v.verdict}
                                rationale={v.rationale}
                                active={expanded === keyOf(row.ticker, t.id)}
                                onClick={() => toggle(row.ticker, t.id)}
                              />
                            ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </div>
                          {v && expanded === keyOf(row.ticker, t.id) && (
                            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                              {v.rationale}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* d) Exposure bars */}
      <Card title="Theme Exposure" eyebrow={signedIn ? 'Your holdings' : 'Sample'}>
        {signedIn ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Scores pending — run your first scoring.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {THESES.map(t => (
              <ExposureBar key={t.id} name={t.name} exposure={exposure[t.id]} />
            ))}
          </div>
        )}
      </Card>

      {/* e) Re-score button */}
      <div>
        <button
          type="button"
          disabled
          title="Wired in the next stage"
          style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600,
            padding: '9px 18px', borderRadius: 6,
            border: '1px solid var(--border-color)',
            background: 'transparent', color: 'var(--text-muted)',
            cursor: 'not-allowed', opacity: 0.7,
          }}
        >Re-score portfolio</button>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 8,
        padding: '14px 0 8px',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        Not financial advice. Theses reflect a configurable worldview.
      </div>
    </main>
  );
}

export default function ThemesPage() {
  return (
    <Suspense fallback={
      <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</main>
    }>
      <ThemesPageInner />
    </Suspense>
  );
}
