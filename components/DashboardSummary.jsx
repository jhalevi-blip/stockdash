'use client';
import { useState, useEffect } from 'react';

const fmt = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(Math.abs(n), d) + '%';
const clr = (n) => n == null ? '#8b949e' : n >= 0 ? '#16a34a' : '#dc2626';

function Skeleton() {
  return (
    <div style={{ height: 60, background: '#21262d', borderRadius: 4 }} />
  );
}

function Card({ title, children, loading }) {
  return (
    <div style={{
      background: '#161b22',
      border: '1px solid #21262d',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 110,
    }}>
      <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {title}
      </div>
      {loading ? <Skeleton /> : children}
    </div>
  );
}

export default function DashboardSummary({ holdings, rows, earnings, news }) {
  const [macro,   setMacro]   = useState(null);
  const [insider, setInsider] = useState(null);
  const [analyst, setAnalyst] = useState(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!holdings.length) { setFetched(true); return; }
    const tickers = holdings.map(h => h.t).join(',');
    Promise.all([
      fetch('/api/macro').then(r => r.json()).catch(() => null),
      fetch(`/api/insider?tickers=${tickers}`).then(r => r.json()).catch(() => []),
      fetch(`/api/short-interest?tickers=${tickers}`).then(r => r.json()).catch(() => []),
    ]).then(([m, ins, ana]) => {
      setMacro(m);
      setInsider(Array.isArray(ins) ? ins : []);
      setAnalyst(Array.isArray(ana) ? ana : []);
    }).finally(() => setFetched(true));
  }, [holdings]);

  // Portfolio derived values
  const totalMkt  = rows.reduce((s, r) => s + (r.mktVal  ?? 0), 0);
  const totalPnl  = rows.reduce((s, r) => s + (r.pnlAmt  ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.costVal ?? 0), 0);
  const totalPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const withPnl = rows.filter(r => r.pnlPct != null);
  const best  = withPnl.length ? withPnl.reduce((a, b) => b.pnlPct > a.pnlPct ? b : a) : null;
  const worst = withPnl.length ? withPnl.reduce((a, b) => b.pnlPct < a.pnlPct ? b : a) : null;

  // Next earnings
  const upcoming = earnings.filter(e => !e.noData && e.date);
  const nextEarning = upcoming.length
    ? upcoming.reduce((a, b) => new Date(a.date) < new Date(b.date) ? a : b)
    : null;

  // Analyst
  const withTarget = (analyst ?? []).filter(a => a.lastQuarterTarget);

  // Insider — most recent transaction
  const recentInsider = (insider ?? [])
    .filter(i => i.transactionDate)
    .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))[0] ?? null;

  // Macro
  const spy = macro?.indices?.SPY;
  const qqq = macro?.indices?.QQQ;
  const fg  = macro?.fearGreed;

  // News
  const topNews = news?.[0] ?? null;

  const loading = !fetched;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12,
      marginBottom: 28,
    }}>

      {/* 1 — Portfolio Health */}
      <Card title="Portfolio Health">
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3' }}>
          ${fmt(totalMkt)}
        </div>
        <div style={{ fontSize: 14, color: clr(totalPnl) }}>
          {totalPnl >= 0 ? '+$' : '−$'}{fmt(Math.abs(totalPnl))}&nbsp;
          <span style={{ fontSize: 12 }}>({fmtD(totalPct)})</span>
        </div>
        {best && worst && best.t !== worst.t && (
          <div style={{ fontSize: 11, color: '#8b949e', display: 'flex', gap: 10 }}>
            <span>▲ <span style={{ color: '#16a34a' }}>{best.t} {fmtD(best.pnlPct)}</span></span>
            <span>▼ <span style={{ color: '#dc2626' }}>{worst.t} {fmtD(worst.pnlPct)}</span></span>
          </div>
        )}
      </Card>

      {/* 2 — Next Earnings */}
      <Card title="Next Earnings">
        {nextEarning ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#58a6ff' }}>{nextEarning.symbol}</div>
            <div style={{ fontSize: 13, color: '#e6edf3' }}>
              {new Date(nextEarning.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            {nextEarning.epsEstimate != null && (
              <div style={{ fontSize: 12, color: '#8b949e' }}>Est. EPS: ${fmt(nextEarning.epsEstimate)}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>No upcoming earnings</div>
        )}
      </Card>

      {/* 3 — Analyst Targets */}
      <Card title="Analyst Targets" loading={loading}>
        {withTarget.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {withTarget.slice(0, 3).map(a => {
              const row    = rows.find(r => r.t === a.ticker);
              const upside = row?.price && a.lastQuarterTarget
                ? ((a.lastQuarterTarget - row.price) / row.price) * 100
                : null;
              return (
                <div key={a.ticker} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#58a6ff', minWidth: 48 }}>{a.ticker}</span>
                  <span style={{ color: '#e6edf3' }}>${fmt(a.lastQuarterTarget)}</span>
                  {upside != null && (
                    <span style={{ color: clr(upside) }}>{fmtD(upside)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>No analyst data</div>
        )}
      </Card>

      {/* 4 — Insider Activity */}
      <Card title="Insider Activity" loading={loading}>
        {recentInsider ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#58a6ff', fontWeight: 600, fontSize: 15 }}>{recentInsider.ticker}</span>
              <span style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                background: recentInsider.transactionCode === 'P' ? '#14532d' : '#450a0a',
                color:      recentInsider.transactionCode === 'P' ? '#4ade80' : '#f87171',
              }}>
                {recentInsider.transactionCode === 'P' ? 'BUY' : recentInsider.transactionCode === 'S' ? 'SELL' : recentInsider.transactionCode}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {recentInsider.name}
            </div>
            <div style={{ fontSize: 12, color: '#8b949e' }}>
              {recentInsider.change != null && `${Math.abs(recentInsider.change).toLocaleString()} shares`}
              {recentInsider.transactionDate && ` · ${new Date(recentInsider.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>No recent insider transactions</div>
        )}
      </Card>

      {/* 5 — Market Pulse */}
      <Card title="Market Pulse" loading={loading}>
        {macro ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[{ label: 'SPY', d: spy }, { label: 'QQQ', d: qqq }].map(({ label, d }) => d && (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8b949e', minWidth: 36 }}>{label}</span>
                <span style={{ color: '#e6edf3' }}>${fmt(d.price)}</span>
                <span style={{ color: clr(d.changesPercentage) }}>{fmtD(d.changesPercentage)}</span>
              </div>
            ))}
            {fg && (
              <div style={{ fontSize: 12, color: '#8b949e', paddingTop: 2, borderTop: '1px solid #21262d' }}>
                Fear & Greed:&nbsp;
                <span style={{ color: fg.score >= 50 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {Math.round(fg.score)} — {fg.rating}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>No market data</div>
        )}
      </Card>

      {/* 6 — Top News */}
      <Card title="Top News">
        {topNews ? (
          <a href={topNews.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 11, color: '#58a6ff' }}>
              {topNews.ticker}&nbsp;·&nbsp;{topNews.source}
            </div>
            <div style={{ fontSize: 13, color: '#e6edf3', lineHeight: 1.45 }}>
              {topNews.headline}
            </div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>
              {new Date(topNews.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </a>
        ) : (
          <div style={{ fontSize: 13, color: '#8b949e' }}>No news available</div>
        )}
      </Card>

    </div>
  );
}
