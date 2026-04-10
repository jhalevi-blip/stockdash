'use client';
import { useState, useEffect } from 'react';

const fmt = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(Math.abs(n), d) + '%';
const clr = (n) => n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)';

function Skeleton() {
  return (
    <div style={{ height: 60, background: 'var(--border-color)', borderRadius: 4 }} />
  );
}

function Card({ title, children, loading }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 110,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {title}
      </div>
      {loading ? <Skeleton /> : children}
    </div>
  );
}

export default function DashboardSummary({ holdings, rows, earnings, news, onMacro }) {
  const [macro,          setMacro]          = useState(null);
  const [insider,        setInsider]        = useState(null);
  const [analyst,        setAnalyst]        = useState(null);
  const [shortInterest,  setShortInterest]  = useState(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!holdings.length) { setFetched(true); return; }
    const tickers = holdings.map(h => h.t).join(',');
    Promise.all([
      fetch('/api/macro').then(r => r.json()).catch(() => null),
      fetch(`/api/insider?tickers=${tickers}`).then(r => r.json()).catch(() => []),
      fetch(`/api/short-interest?tickers=${tickers}`).then(r => r.json()).catch(() => []),
      fetch(`/api/short-interest-data?tickers=${tickers}`).then(r => r.json()).catch(() => []),
    ]).then(([m, ins, ana, si]) => {
      setMacro(m);
      setInsider(Array.isArray(ins) ? ins : []);
      setAnalyst(Array.isArray(ana) ? ana : []);
      setShortInterest(Array.isArray(si) ? si : []);
      onMacro?.(m);
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

  // Short interest — most shorted holding
  const mostShorted = (shortInterest ?? []).length
    ? (shortInterest ?? []).reduce((best, cur) =>
        (cur.shortPercentOfFloat ?? 0) > (best.shortPercentOfFloat ?? 0) ? cur : best
      )
    : null;

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
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          ${fmt(totalMkt)}
        </div>
        <div style={{ fontSize: 14, color: clr(totalPnl) }}>
          {totalPnl >= 0 ? '+$' : '−$'}{fmt(Math.abs(totalPnl))}&nbsp;
          <span style={{ fontSize: 12 }}>({fmtD(totalPct)})</span>
        </div>
        {best && worst && best.t !== worst.t && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 10 }}>
            <span>▲ <span style={{ color: 'var(--positive)' }}>{best.t} {fmtD(best.pnlPct)}</span></span>
            <span>▼ <span style={{ color: 'var(--negative)' }}>{worst.t} {fmtD(worst.pnlPct)}</span></span>
          </div>
        )}
      </Card>

      {/* 2 — Next Earnings */}
      <Card title="Next Earnings">
        {nextEarning ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{nextEarning.symbol}</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {new Date(nextEarning.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            {nextEarning.epsEstimate != null && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Est. EPS: ${fmt(nextEarning.epsEstimate)}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No upcoming earnings</div>
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
                  <span style={{ color: 'var(--accent)', minWidth: 48 }}>{a.ticker}</span>
                  <span style={{ color: 'var(--text-primary)' }}>${fmt(a.lastQuarterTarget)}</span>
                  {upside != null && (
                    <span style={{ color: clr(upside) }}>{fmtD(upside)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No analyst data</div>
        )}
      </Card>

      {/* 4 — Insider Activity */}
      <Card title="Insider Activity" loading={loading}>
        {recentInsider ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 15 }}>{recentInsider.ticker}</span>
              {(() => {
                const CODE_LABEL = { P: 'Purchase', S: 'Sale', M: 'Open Market', A: 'Award', D: 'Disposition' };
                const isBuy = ['P', 'M', 'A'].includes(recentInsider.transactionCode);
                const label = CODE_LABEL[recentInsider.transactionCode] ?? recentInsider.transactionCode;
                return (
                  <span style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                    background: isBuy ? 'var(--bg-buy)' : 'var(--bg-sell)',
                    color:      isBuy ? 'var(--text-buy)' : 'var(--text-sell)',
                  }}>
                    {label}
                  </span>
                );
              })()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {recentInsider.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {recentInsider.change != null && `${Math.abs(recentInsider.change).toLocaleString()} shares`}
              {recentInsider.transactionDate && ` · ${new Date(recentInsider.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No recent insider transactions</div>
        )}
      </Card>

      {/* 5 — Most Shorted */}
      <Card title="Most Shorted" loading={loading}>
        {mostShorted ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 15 }}>{mostShorted.ticker}</span>
              <span style={{
                fontSize: 18, fontWeight: 700,
                color: mostShorted.shortPercentOfFloat > 0.20 ? 'var(--negative)'
                     : mostShorted.shortPercentOfFloat < 0.05 ? 'var(--positive)'
                     : '#d97706',
              }}>
                {mostShorted.shortPercentOfFloat != null
                  ? fmt(mostShorted.shortPercentOfFloat * 100, 1) + '%'
                  : '—'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Short % of float</div>
            {mostShorted.siChange != null && (
              <div style={{ fontSize: 12, color: mostShorted.siChange > 0 ? 'var(--negative)' : 'var(--positive)', fontWeight: 600 }}>
                {mostShorted.siChange > 0 ? '▲' : '▼'} {Math.abs(mostShorted.siChange).toFixed(1)}% MoM
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No short interest data</div>
        )}
      </Card>

      {/* 6 — Market Pulse */}
      <Card title="Market Pulse" loading={loading}>
        {macro ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[{ label: 'SPY', d: spy }, { label: 'QQQ', d: qqq }].map(({ label, d }) => d && (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)', minWidth: 36 }}>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>${fmt(d.price)}</span>
                <span style={{ color: clr(d.changesPercentage) }}>{fmtD(d.changesPercentage)}</span>
              </div>
            ))}
            {fg && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 2, borderTop: '1px solid var(--border-color)' }}>
                Fear & Greed:&nbsp;
                <span style={{ color: fg.score >= 50 ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>
                  {Math.round(fg.score)} — {fg.rating}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No market data</div>
        )}
      </Card>

      {/* 6 — Top News */}
      <Card title="Top News">
        {topNews ? (
          <a href={topNews.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)' }}>
              {topNews.ticker}&nbsp;·&nbsp;{topNews.source}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>
              {topNews.headline}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {new Date(topNews.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </a>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No news available</div>
        )}
      </Card>

    </div>
  );
}
