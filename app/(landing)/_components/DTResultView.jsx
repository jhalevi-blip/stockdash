'use client';
// Dedicated, logged-out result view for the landing CSV demo. Everything here
// renders from the EUR daily ledger (usePerformanceLedger → ledger.js): the
// TWR-vs-SPY line and the headline percentages are time-weighted and in EUR.
// There is deliberately NO current-value / market-value table — that would need
// correct current-quote FX, which we don't have. Cost basis below is shown in
// each position's native currency, exactly as parsed, and nothing else.
import dynamic from 'next/dynamic';

// recharts in an async chunk, same as the /performance page.
const PortfolioVsSpyChart = dynamic(
  () => import('@/app/(v2)/performance/_components/PerfCharts').then((m) => m.PortfolioVsSpyChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);

const fmt  = (n, d = 1) => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(d) + '%');
const clr  = (n) => (n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)');

function money(amount, ccy) {
  const sym = ccy === 'EUR' ? '€' : ccy === 'USD' ? '$' : ccy === 'GBP' ? '£' : '';
  const n = (amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return sym ? `${sym}${n}` : `${n} ${ccy}`;
}

function Stat({ label, value, valueColor }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 10, padding: '14px 18px', flex: '1 1 150px', minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valueColor ?? 'var(--text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

export default function DTResultView({ perf, result, onReset }) {
  const {
    matchedCount, totalCount, excludedCount,
    positionsTotal, cappedTo, holdings,
  } = result;

  const xInterval = perf.ready && perf.chartData?.length
    ? Math.max(1, Math.floor((perf.chartData.length - 1) / 5))
    : 1;

  return (
    <div style={{
      border: '1px solid #1c232c', borderRadius: 10, background: '#07090d',
      padding: '18px 18px 22px', boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            Your real return
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Time-weighted, in EUR, with historical FX handled — benchmarked against SPY.
          </div>
        </div>
        <button
          onClick={onReset}
          style={{
            background: 'transparent', border: '1px solid #30363d', borderRadius: 8,
            color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
            padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          Try another file
        </button>
      </div>

      {/* Matched-position count + cap notice — never hidden */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          Matched {matchedCount} of {totalCount} positions.
        </span>
        {excludedCount > 0 && (
          <> {excludedCount} {excludedCount === 1 ? 'was' : 'were'} excluded — we couldn&apos;t confirm a priced listing for the right company (no match, no price history, or an ambiguous ticker).</>
        )}
        {cappedTo != null && (
          <div style={{ marginTop: 4 }}>
            Showing your {cappedTo} largest positions by cost basis (of {positionsTotal}).
          </div>
        )}
      </div>

      {/* Headline percentages */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat label="Portfolio TWR" value={perf.ready ? fmt(perf.twrPct) : '…'} valueColor={perf.ready ? clr(perf.twrPct) : undefined} />
        <Stat label="SPY total return" value={perf.ready ? fmt(perf.spyPct) : '…'} valueColor={perf.ready ? clr(perf.spyPct) : undefined} />
        <Stat label="vs SPY" value={perf.ready ? fmt(perf.vsSpyPct) : '…'} valueColor={perf.ready ? clr(perf.vsSpyPct) : undefined} />
      </div>

      {/* TWR vs SPY chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Your holdings vs SPY
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
            time-weighted · total return · cash excluded
          </span>
        </div>
        {perf.loading ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Building daily ledger…
          </div>
        ) : !perf.ready ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Couldn&apos;t load price history for these positions.
          </div>
        ) : !perf.integrity?.ok ? (
          <div style={{ padding: 16, border: '1px solid var(--negative)', borderRadius: 8, color: 'var(--negative)', fontSize: 13, lineHeight: 1.5 }}>
            Couldn&apos;t chart this range — {perf.integrity?.reason}. Some price history for your positions is missing.
          </div>
        ) : (
          <>
            <PortfolioVsSpyChart data={perf.chartData} xInterval={xInterval} />
            <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12 }}>
              <span style={{ color: '#58a6ff', fontWeight: 600 }}>— Portfolio TWR ({fmt(perf.twrPct)})</span>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>— SPY total return ({fmt(perf.spyPct)})</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Time-weighted return since {perf.D0}, cash excluded. Deposits don&apos;t move the line.
            </div>
          </>
        )}
      </div>

      {/* Position list with cost basis (native currency, as parsed) */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          Your open positions
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
            {holdings.length} held · cost basis in native currency
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>Ticker</th>
              <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>Shares</th>
              <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>Avg cost</th>
              <th style={{ padding: '4px 0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Cost basis</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={`${h.t}-${h.currency}`} style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '6px 8px 6px 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {h.t}
                  {h.currency !== 'EUR' && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 500 }}>{h.currency}</span>
                  )}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  {h.s.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(h.c, h.currency)}</td>
                <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>
                  {money(h.s * h.c, h.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Returns are time-weighted and cash-excluded. Cost basis is shown in each position&apos;s
        native currency as parsed from your statement. Informational only, not investment advice.
      </div>
    </div>
  );
}
