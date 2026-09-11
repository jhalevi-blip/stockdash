'use client';
// Dedicated, logged-out result view for the landing CSV demo. Everything here
// renders from the EUR daily ledger (usePerformanceLedger → ledger.js): the
// TWR-vs-SPY line and the headline percentages are time-weighted and in EUR.
// There is deliberately NO current-value / market-value table — that would need
// correct current-quote FX, which we don't have. Cost basis below is shown in
// each position's native currency, exactly as parsed, and nothing else.
import dynamic from 'next/dynamic';
import { UI_STRINGS } from '@/lib/landing/brokerConfigs';
import { money } from '@/lib/landing/money';

// recharts in an async chunk, same as the /performance page.
const PortfolioVsSpyChart = dynamic(
  () => import('@/app/(v2)/performance/_components/PerfCharts').then((m) => m.PortfolioVsSpyChart),
  { ssr: false, loading: () => <div style={{ height: 220 }} /> },
);

const fmt  = (n, d = 1) => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(d) + '%');
const clr  = (n) => (n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)');

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

export default function DTResultView({ perf, result, onReset, lang = 'en' }) {
  const S = UI_STRINGS[lang]?.result ?? UI_STRINGS.en.result;
  const {
    matchedCount, totalCount, excludedCount,
    positionsTotal, cappedTo, holdings,
    closedIncluded = 0, droppedTickers = [], unsizedTickers = [],
    collisionTickers = [], optionsExcluded = 0, splitTickers = [],
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
            {S.heading}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {S.subhead}
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
          {S.tryAnother}
        </button>
      </div>

      {/* Matched-position count + cap notice — never hidden */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {S.matched(matchedCount, totalCount)}
        </span>
        {excludedCount > 0 && (
          <> {S.excluded(excludedCount)}</>
        )}
        {optionsExcluded > 0 && (
          <div style={{ marginTop: 4 }}>
            {S.options(optionsExcluded)}
          </div>
        )}
        {cappedTo != null && (
          <div style={{ marginTop: 4 }}>
            {S.capped(cappedTo, positionsTotal)}
          </div>
        )}
        {closedIncluded > 0 && (
          <div style={{ marginTop: 4 }}>
            {S.closed(closedIncluded)}
          </div>
        )}
        {droppedTickers.length > 0 && (
          <div style={{ marginTop: 4, color: 'var(--negative)' }}>
            {S.dropped(droppedTickers)}
          </div>
        )}
        {unsizedTickers.length > 0 && (
          <div style={{ marginTop: 4, color: 'var(--negative)' }}>
            {S.unsized(unsizedTickers)}
          </div>
        )}
        {collisionTickers.length > 0 && (
          <div style={{ marginTop: 4, color: 'var(--negative)' }}>
            {S.collision(collisionTickers)}
          </div>
        )}
        {splitTickers.length > 0 && (
          <div style={{ marginTop: 4, color: 'var(--negative)' }}>
            {S.split(splitTickers)}
          </div>
        )}
      </div>

      {/* Headline percentages */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat label={S.statTwr} value={perf.ready ? fmt(perf.twrPct) : '…'} valueColor={perf.ready ? clr(perf.twrPct) : undefined} />
        <Stat label={S.statSpy} value={perf.ready ? fmt(perf.spyPct) : '…'} valueColor={perf.ready ? clr(perf.spyPct) : undefined} />
        <Stat label={S.statVs} value={perf.ready ? fmt(perf.vsSpyPct) : '…'} valueColor={perf.ready ? clr(perf.vsSpyPct) : undefined} />
      </div>

      {/* TWR vs SPY chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          {S.chartHeading}
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
            {S.chartCaption}
          </span>
        </div>
        {perf.loading ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {S.chartBuilding}
          </div>
        ) : !perf.ready ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {S.chartNoPrice}
          </div>
        ) : !perf.integrity?.ok ? (
          <div style={{ padding: 16, border: '1px solid var(--negative)', borderRadius: 8, color: 'var(--negative)', fontSize: 13, lineHeight: 1.5 }}>
            {S.chartRangeErr(perf.integrity?.reason)}
          </div>
        ) : (
          <>
            <PortfolioVsSpyChart data={perf.chartData} xInterval={xInterval} />
            <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12 }}>
              <span style={{ color: '#58a6ff', fontWeight: 600 }}>{S.legendPortfolio(fmt(perf.twrPct))}</span>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>{S.legendSpy(fmt(perf.spyPct))}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {S.chartSince(perf.D0)}
            </div>
          </>
        )}
      </div>

      {/* Position list with cost basis (native currency, as parsed) */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          {S.posHeading}
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
            {S.posCaption(holdings.length)}
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>{S.thTicker}</th>
              <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>{S.thShares}</th>
              <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>{S.thAvgCost}</th>
              <th style={{ padding: '4px 0 8px 8px', fontWeight: 600, textAlign: 'right' }}>{S.thCostBasis}</th>
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
        {S.footer}
      </div>
    </div>
  );
}
