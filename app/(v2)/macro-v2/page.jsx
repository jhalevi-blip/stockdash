'use client';
import { useEffect, useState } from 'react';

/* ─── Formatter ─────────────────────────────────────────────────────────── */
const fmt = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';

/* ─── Fear & Greed score → color ────────────────────────────────────────── */
function fgColor(score) {
  if (score == null) return 'var(--text-muted)';
  if (score <= 24)   return '#dc2626';
  if (score <= 44)   return '#f85149';
  if (score <= 55)   return '#d97706';
  if (score <= 74)   return '#16a34a';
  return '#3fb950';
}

/* ─── KPI item ──────────────────────────────────────────────────────────── */
function KpiItem({ label, value, changePct, change, prefix = '$', suffix = '', valueColor, borderColor }) {
  const isPos    = changePct >= 0;
  const chgColor = changePct == null ? 'var(--text-muted)' : isPos ? 'var(--positive)' : 'var(--negative)';
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${borderColor ?? 'var(--border-color)'}`,
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value != null ? prefix + fmt(value) + suffix : '—'}
      </div>
      {changePct != null && (
        <div style={{ fontSize: 12, color: chgColor, marginTop: 4 }}>
          {isPos ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
          {change != null && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
              ({isPos ? '+' : ''}{fmt(change)})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Yield item (label + pct value, no change row) ────────────────────── */
function YieldItem({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
        {value != null ? fmt(value, 2) + '%' : '—'}
      </div>
    </div>
  );
}

/* ─── Fear & Greed item ─────────────────────────────────────────────────── */
function FearGreedItem({ fearGreed }) {
  const score      = fearGreed?.score != null ? Math.round(fearGreed.score) : null;
  const rating     = fearGreed?.rating ?? null;
  const scoreColor = fgColor(score);
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        CNN Fear &amp; Greed
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
        {score != null ? score : '—'}
        {score != null && (
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 400, marginLeft: 4 }}>/100</span>
        )}
      </div>
      {rating && (
        <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: scoreColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: scoreColor, fontWeight: 600 }}>{rating}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Section label ─────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
      {children}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function MacroV2Page() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/macro')
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const idx       = data?.indices ?? {};
  const t         = data?.treasury ?? null;
  const spy       = idx['SPY'];
  const qqq       = idx['QQQ'];
  const dia       = idx['DIA'];
  const vix       = idx['VIX'];
  const gold      = data?.commodities?.gold;
  const oil       = data?.commodities?.oil;
  const dxy       = data?.commodities?.dxy;
  const fearGreed = data?.fearGreed;

  // VIX color (border + text): red above 25, amber above 18, default otherwise
  const vixColor = vix?.price > 25 ? '#dc2626' : vix?.price > 18 ? '#d97706' : undefined;

  // Yield curve spread — only when both tenors are available
  const hasSpread  = t?.year2 != null && t?.year10 != null;
  const spread     = hasSpread ? t.year10 - t.year2 : null;
  const spreadColor = spread != null && spread < 0 ? '#dc2626' : '#16a34a';

  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ── Page heading ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
        }}>
          Markets
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Macro overview
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Live market indices, commodities, FX, and treasury yield curve.
        </p>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && (
        <div className="chart-placeholder">Loading macro data…</div>
      )}

      {/* ── Data ────────────────────────────────────────────────────────── */}
      {!loading && (
        <>
          {/* Market Indices */}
          <section style={{ marginBottom: 24 }}>
            <SectionLabel>Market Indices</SectionLabel>
            <div className="dv2-macro-kpis">
              <KpiItem label="S&P 500"        value={spy?.price} changePct={spy?.changesPercentage} change={spy?.change} />
              <KpiItem label="NASDAQ"         value={qqq?.price} changePct={qqq?.changesPercentage} change={qqq?.change} />
              <KpiItem label="Dow Jones"      value={dia?.price} changePct={dia?.changesPercentage} change={dia?.change} />
              <KpiItem label="VIX Fear Index" value={vix?.price} changePct={vix?.changesPercentage} change={vix?.change}
                prefix="" valueColor={vixColor} borderColor={vixColor} />
              <FearGreedItem fearGreed={fearGreed} />
            </div>
          </section>

          {/* Commodities & FX */}
          <section style={{ marginBottom: 24 }}>
            <SectionLabel>Commodities &amp; FX</SectionLabel>
            <div className="dv2-macro-kpis">
              <KpiItem label="Gold (oz)"        value={gold?.price} changePct={gold?.changesPercentage} change={gold?.change} />
              <KpiItem label="WTI Crude Oil"    value={oil?.price}  changePct={oil?.changesPercentage}  change={oil?.change} />
              <KpiItem label="DXY Dollar Index" value={dxy?.price}  changePct={dxy?.changesPercentage}  change={dxy?.change} prefix="" />
            </div>
          </section>

          {/* Treasury Yields */}
          {t && (
            <section style={{ marginBottom: 24 }}>
              <SectionLabel>Treasury Yields</SectionLabel>
              <div className="dv2-macro-yields">
                <YieldItem label="1 Month" value={t.month1} />
                <YieldItem label="3 Month" value={t.month3} />
                <YieldItem label="6 Month" value={t.month6} />
                <YieldItem label="1 Year"  value={t.year1}  />
                <YieldItem label="2 Year"  value={t.year2}  />
                <YieldItem label="5 Year"  value={t.year5}  />
                <YieldItem label="10 Year" value={t.year10} />
                <YieldItem label="30 Year" value={t.year30} />
              </div>
              {hasSpread && (
                <div style={{ marginTop: 10, fontSize: 12, color: spreadColor }}>
                  {spread < 0 ? '⚠ Inverted yield curve' : '✓ Normal yield curve'} · 2Y/10Y spread: {spread.toFixed(2)}%
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* ── Footer disclaimer ───────────────────────────────────────────── */}
      {!loading && (
        <div style={{
          marginTop: 8,
          padding: '14px 0 24px',
          color: 'var(--text-faint, rgba(230,237,243,0.45))',
          fontSize: 11,
          textAlign: 'center',
          borderTop: '1px solid var(--border-section, var(--border-color))',
        }}>
          Data via Finnhub &amp; Yahoo Finance · Indices cached 5 min · Yields updated daily ·
          StockDashes is for informational purposes only and does not constitute financial advice
        </div>
      )}

    </div>
  );
}
