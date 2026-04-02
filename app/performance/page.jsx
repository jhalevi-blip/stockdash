'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine, ComposedChart, Bar,
} from 'recharts';

const f  = (n, d=0) => n?.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) ?? '—';
const f2 = (n)      => n != null ? n.toFixed(2) : '—';

const CardBase = ({ border, children }) => (
  <div style={{
    background: '#ffffff', borderRadius: 8, padding: '16px 20px',
    flex: '1 1 160px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    border: `1px solid ${border}`,
  }}>
    {children}
  </div>
);

const CardLabel = ({ children }) => (
  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
    {children}
  </div>
);

export default function PerformancePage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch('/api/performance')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <main style={{ padding: '20px 24px' }}>
      <div className="chart-placeholder">Reconstructing portfolio history… this may take 15–20 seconds on first load.</div>
    </main>
  );

  if (error) return (
    <main style={{ padding: '20px 24px' }}>
      <div style={{ padding: 16, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>
        Error: {error}
      </div>
    </main>
  );

  const isAhead        = (data?.currentPortfolio ?? 0) > (data?.currentSpy ?? 0);
  const diff           = Math.abs((data?.currentPortfolio ?? 0) - (data?.currentSpy ?? 0));
  const eurStrengthened = (data?.eurUsdChangePct ?? 0) > 0;
  const currencyHelped  = (data?.totalCurrencyImpact ?? 0) < 0; // stronger EUR = lower EUR portfolio value

  return (
    <main style={{ padding: '20px 24px' }}>
      <div className="section-title" style={{ marginBottom: 20 }}>Portfolio Performance vs S&P 500</div>

      {/* ── Row 1: Portfolio summary cards ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <CardBase border="#16a34a">
          <CardLabel>Your Portfolio</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>€{f(data?.currentPortfolio)}</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Current market value</div>
        </CardBase>

        <CardBase border="#2563eb">
          <CardLabel>SPY (Mirror Trades)</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2563eb' }}>€{f(data?.currentSpy)}</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>If all trades mirrored into SPY</div>
        </CardBase>

        <CardBase border={isAhead ? '#16a34a' : '#dc2626'}>
          <CardLabel>vs SPY</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: isAhead ? '#16a34a' : '#dc2626' }}>
            {isAhead ? '+' : '-'}€{diff.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            {isAhead ? '✅ Ahead of SPY' : '❌ Behind SPY'}
          </div>
        </CardBase>
      </div>

      {/* ── Portfolio vs SPY chart ── */}
      <div style={{ marginBottom: 28 }}>
        <div className="section-title">Portfolio Value vs SPY (Mirror Trades)</div>
        <div className="chart-panel">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data?.chartData || []} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={d => d?.slice(0, 7)} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={75}
                tickFormatter={v => '€' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v)} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ed', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                labelStyle={{ color: '#6b7280', fontSize: 11 }}
                formatter={(v, n) => ['€' + f(v), n]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Line type="monotone" dataKey="portfolio" name="Your Portfolio" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="spy" name="SPY (Mirror)" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Row 2: Context cards ── */}
      <div className="section-title" style={{ marginBottom: 12 }}>Risk & Currency Context</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>

        <CardBase border="#7c3aed">
          <CardLabel>Portfolio Beta</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#7c3aed' }}>{f2(data?.portfolioBeta)}x</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            {(data?.portfolioBeta ?? 1) > 1.5
              ? '⚡ High risk vs market'
              : (data?.portfolioBeta ?? 1) > 1
              ? '📈 Above market risk'
              : '🛡 Defensive'}
          </div>
          <div style={{ fontSize: 10, color: '#c4b5fd', marginTop: 6, lineHeight: 1.5 }}>
            For every 1% SPY moves, your portfolio moves ~{f2(data?.portfolioBeta)}%
          </div>
        </CardBase>

        <CardBase border="#d97706">
          <CardLabel>EUR/USD Rate</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{f2(data?.currentEurUsd)}</div>
          <div style={{ fontSize: 11, color: eurStrengthened ? '#dc2626' : '#16a34a', marginTop: 4 }}>
            {eurStrengthened ? '▲' : '▼'} {Math.abs(data?.eurUsdChangePct ?? 0).toFixed(2)}% since Jul 2025
            {eurStrengthened ? ' (EUR stronger → hurts USD holdings)' : ' (EUR weaker → helps USD holdings)'}
          </div>
          <div style={{ fontSize: 10, color: '#fbbf24', marginTop: 6 }}>
            Started at {f2(data?.startEurUsd)} · Now {f2(data?.currentEurUsd)}
          </div>
        </CardBase>

        <CardBase border={currencyHelped ? '#dc2626' : '#16a34a'}>
          <CardLabel>Currency Impact</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: currencyHelped ? '#dc2626' : '#16a34a' }}>
            {(data?.totalCurrencyImpact ?? 0) >= 0 ? '+' : ''}€{f(data?.totalCurrencyImpact)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            {currencyHelped
              ? '📉 EUR strength reduced your EUR returns'
              : '📈 EUR weakness boosted your EUR returns'}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
            vs holding at Jul 2025 rate ({f2(data?.startEurUsd)})
          </div>
        </CardBase>

        <CardBase border="#6b7280">
          <CardLabel>Beta-Adjusted Performance</CardLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: isAhead ? '#16a34a' : '#dc2626' }}>
            {isAhead ? 'Outperforming' : 'Underperforming'}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            Risk-adjusted: taking {f2(data?.portfolioBeta)}x more risk than SPY
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
            Fair comparison requires {f2(data?.portfolioBeta)}x SPY return to break even on risk
          </div>
        </CardBase>
      </div>

      {/* ── EUR/USD chart ── */}
      <div style={{ marginBottom: 28 }}>
        <div className="section-title">EUR/USD Rate Since Jul 2025</div>
        <div className="chart-panel">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data?.eurUsdData || []} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={d => d?.slice(0, 7)} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={60}
                domain={['auto', 'auto']} tickFormatter={v => v.toFixed(3)} />
              <Tooltip
                contentStyle={{ background: '#ffffff', border: '1px solid #e2e6ed', borderRadius: 6 }}
                labelStyle={{ color: '#6b7280', fontSize: 11 }}
                formatter={(v) => [v.toFixed(4), 'EUR/USD']}
              />
              <ReferenceLine y={data?.startEurUsd} stroke="#9ca3af" strokeDasharray="4 4"
                label={{ value: `Start ${f2(data?.startEurUsd)}`, fill: '#9ca3af', fontSize: 10 }} />
              <Line type="monotone" dataKey="rate" name="EUR/USD" stroke="#d97706" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
            A rising EUR/USD means EUR is strengthening — this reduces the EUR value of your USD-denominated holdings.
            Dashed line = rate when you started investing (Jul 2025).
          </div>
        </div>
      </div>

      <p className="note">
        SPY mirror: each buy/sell mirrored into SPY at same USD value. Beta weighted by current position size.
        Currency impact vs Jul 2025 baseline rate. Yahoo Finance data · Cached 1 hour.
      </p>
    </main>
  );
}
