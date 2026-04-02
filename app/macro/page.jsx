'use client';
import { useEffect, useState } from 'react';

const fmt = (n, d=2) => n?.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) ?? '—';

function fgColor(score) {
  if (score == null) return '#6b7280';
  if (score <= 24)   return '#dc2626';
  if (score <= 44)   return '#f85149';
  if (score <= 55)   return '#d97706';
  if (score <= 74)   return '#16a34a';
  return '#3fb950';
}

const Card = ({ label, value, change, changePct, prefix='$', suffix='', color, dark }) => {
  const isPos   = changePct >= 0;
  const chgColor = changePct == null ? '#6b7280' : isPos ? '#16a34a' : '#dc2626';
  const bg      = dark ? '#161b22' : '#ffffff';
  const border  = color || (dark ? '#21262d' : '#e2e6ed');
  const lblColor = dark ? '#8b949e' : '#6b7280';
  const valColor = dark ? '#e6edf3' : '#1a1d23';
  const mutedColor = dark ? '#6b7280' : '#9ca3af';
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: '16px 20px', minWidth: 160, flex: '1 1 160px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 11, color: lblColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valColor, fontVariantNumeric: 'tabular-nums' }}>
        {value != null ? prefix + fmt(value) + suffix : '—'}
      </div>
      {changePct != null && (
        <div style={{ fontSize: 12, color: chgColor, marginTop: 4 }}>
          {isPos ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
          {change != null && <span style={{ color: mutedColor, marginLeft: 6 }}>({isPos ? '+' : ''}{fmt(change)})</span>}
        </div>
      )}
    </div>
  );
};

const YieldCard = ({ label, value, dark }) => {
  const bg       = dark ? '#161b22' : '#ffffff';
  const border   = dark ? '#21262d' : '#e2e6ed';
  const lblColor = dark ? '#8b949e' : '#6b7280';
  const valColor = dark ? '#e6edf3' : '#1a1d23';
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: '16px 20px', minWidth: 120, flex: '1 1 120px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 11, color: lblColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valColor }}>
        {value != null ? fmt(value, 2) + '%' : '—'}
      </div>
    </div>
  );
};

const FearGreedCard = ({ fearGreed, dark }) => {
  const bg       = dark ? '#161b22' : '#ffffff';
  const border   = dark ? '#21262d' : '#e2e6ed';
  const lblColor = dark ? '#8b949e' : '#6b7280';
  const valColor = dark ? '#e6edf3' : '#1a1d23';
  const score    = fearGreed?.score != null ? Math.round(fearGreed.score) : null;
  const rating   = fearGreed?.rating ?? null;
  const scoreColor = fgColor(score);
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 8, padding: '16px 20px', minWidth: 160, flex: '1 1 160px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 11, color: lblColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>CNN Fear &amp; Greed</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
        {score != null ? score : '—'}
        {score != null && <span style={{ fontSize: 13, color: valColor, fontWeight: 400, marginLeft: 4 }}>/100</span>}
      </div>
      {rating && (
        <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: scoreColor, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: scoreColor, fontWeight: 600 }}>{rating}</span>
        </div>
      )}
    </div>
  );
};

const SectionLabel = ({ children, dark }) => (
  <div style={{ fontSize: 11, color: dark ? '#8b949e' : '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
    {children}
  </div>
);

export default function MacroPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [dark,    setDark]    = useState(false);

  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    fetch('/api/macro')
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const idx  = data?.indices || {};
  const t    = data?.treasury;
  const gdp  = data?.gdp;
  const spy  = idx['SPY'];
  const qqq  = idx['QQQ'];
  const dia  = idx['DIA'];
  const vix  = idx['^VIX'] || idx['VIX'];
  const gold = data?.commodities?.gold;
  const oil  = data?.commodities?.oil;
  const dxy  = data?.commodities?.dxy;
  const fearGreed = data?.fearGreed;

  const vixBorder   = vix?.price > 25 ? '#dc2626' : vix?.price > 18 ? '#d97706' : (dark ? '#21262d' : '#e2e6ed');
  const spreadColor = t?.year10 - t?.year2 < 0 ? '#dc2626' : '#16a34a';

  return (
    <main style={{ padding: '20px 24px' }}>
      <div className="section-title" style={{ marginBottom: 16 }}>Macro Dashboard</div>

      {loading && <div className="chart-placeholder">Loading macro data…</div>}

      {!loading && (
        <>
          {/* Market Indices */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel dark={dark}>Market Indices</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Card dark={dark} label="S&P 500 (SPY)"    value={spy?.price}  changePct={spy?.changesPercentage}  change={spy?.change} />
              <Card dark={dark} label="Nasdaq (QQQ)"     value={qqq?.price}  changePct={qqq?.changesPercentage}  change={qqq?.change} />
              <Card dark={dark} label="Dow Jones (DIA)"  value={dia?.price}  changePct={dia?.changesPercentage}  change={dia?.change} />
              <Card dark={dark} label="VIX Fear Index"   value={vix?.price}  changePct={vix?.changesPercentage}  change={vix?.change}
                prefix="" color={vixBorder} />
              <FearGreedCard dark={dark} fearGreed={fearGreed} />
            </div>
          </div>

          {/* Commodities & FX */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel dark={dark}>Commodities &amp; FX</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Card dark={dark} label="Gold (oz)"        value={gold?.price} changePct={gold?.changesPercentage} change={gold?.change} />
              <Card dark={dark} label="WTI Crude Oil"    value={oil?.price}  changePct={oil?.changesPercentage}  change={oil?.change} />
              <Card dark={dark} label="DXY Dollar Index" value={dxy?.price}  changePct={dxy?.changesPercentage}  change={dxy?.change} prefix="" />
            </div>
          </div>

          {/* Treasury Yields */}
          {t && (
            <div style={{ marginBottom: 24 }}>
              <SectionLabel dark={dark}>Treasury Yields</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <YieldCard dark={dark} label="1 Month"  value={t.month1} />
                <YieldCard dark={dark} label="3 Month"  value={t.month3} />
                <YieldCard dark={dark} label="6 Month"  value={t.month6} />
                <YieldCard dark={dark} label="1 Year"   value={t.year1} />
                <YieldCard dark={dark} label="2 Year"   value={t.year2} />
                <YieldCard dark={dark} label="5 Year"   value={t.year5} />
                <YieldCard dark={dark} label="10 Year"  value={t.year10} />
                <YieldCard dark={dark} label="30 Year"  value={t.year30} />
              </div>
              {t.year2 && t.year10 && (
                <div style={{ marginTop: 10, fontSize: 12, color: spreadColor }}>
                  {t.year10 - t.year2 < 0 ? '⚠ Inverted yield curve' : '✓ Normal yield curve'} · 2Y/10Y spread: {(t.year10 - t.year2).toFixed(2)}%
                </div>
              )}
            </div>
          )}

          {/* Economic Indicators */}
          {gdp && (
            <div style={{ marginBottom: 24 }}>
              <SectionLabel dark={dark}>Economic Indicators</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Card dark={dark} label="GDP Growth" value={gdp.value} prefix="" suffix="%" changePct={null} />
              </div>
            </div>
          )}

          <p className="note">Data via FMP · Indices cached 1 hour · Yields updated daily</p>
        </>
      )}
    </main>
  );
}
