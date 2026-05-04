'use client';

import { useState } from 'react';
import Card from '@/app/(v2)/_components/Card';
import HeroValue from './_components/HeroValue';
import MetricChip from './_components/MetricChip';
import MacroStrip from './_components/MacroStrip';
import HoldingsTable from './_components/HoldingsTable';
import AllocationDonut from './_components/AllocationDonut';
import MoversList from './_components/MoversList';
import PortfolioAISummary from '@/components/PortfolioAISummary';
import { PORTFOLIO, HOLDINGS, AI_SUMMARY } from './_lib/mockData';
import { fmtCurrency } from '@/app/(v2)/_lib/format';

// PortfolioAISummary is reused as-is from the live dashboard. It
// renders its own card chrome (bg-card, border, border-radius 8) so we
// drop it directly into the page flow — no v2 Card wrapper. Passing
// initialSummary locks the component into display-only mode: no API
// calls, no buttons, no localStorage reads. See Phase D investigation.
export default function DashboardV2Page() {
  const [range, setRange] = useState('1M');

  // Synthesize portfolioStats shape from the mock PORTFOLIO constant.
  const portfolioStats = {
    totalValue: PORTFOLIO.totalValue,
    totalPnl: PORTFOLIO.unrealized,
    totalPnlPct: PORTFOLIO.unrealizedPct,
    cash: PORTFOLIO.cash,
  };

  return (
    <div style={{
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      {/* 1. Hero strip */}
      <Card padding="18px 20px">
        <HeroValue range={range} onRange={setRange} />
      </Card>

      {/* 2. KPI chips */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 10,
      }}>
        <MetricChip label="Today's P&L"  value={fmtCurrency(PORTFOLIO.dayChange, 0)}  change={PORTFOLIO.dayChangePct} />
        <MetricChip label="Unrealized"   value={fmtCurrency(PORTFOLIO.unrealized, 0)} change={PORTFOLIO.unrealizedPct} />
        <MetricChip label="Positions"    value={String(PORTFOLIO.positions)} />
        <MetricChip label="Cash"         value={fmtCurrency(PORTFOLIO.cash, 0)} />
      </div>

      {/* 3. Macro strip */}
      <MacroStrip />

      {/* 4. Holdings + side rail */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)',
        gap: 14,
      }}>
        <Card title="Holdings" eyebrow="Live">
          <HoldingsTable />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card title="Allocation by sector" eyebrow="Composition">
            <AllocationDonut size={140} strokeWidth={20} />
          </Card>
          <Card title="Top movers today" eyebrow="Intraday">
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--positive-soft)',
              marginBottom: 4,
            }}>↑ Gainers</div>
            <MoversList kind="up" />
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--negative-soft)',
              marginTop: 8, marginBottom: 4,
            }}>↓ Decliners</div>
            <MoversList kind="down" />
          </Card>
        </div>
      </div>

      {/* 5. AI Summary — reuses existing PortfolioAISummary with mock data */}
      <PortfolioAISummary
        holdings={HOLDINGS}
        portfolioStats={portfolioStats}
        initialSummary={AI_SUMMARY}
        isSignedIn={false}
      />

      {/* Phase D ends here. /correlations route, suggested actions,
          earnings, news, and quick-jump tiles land in D.5, E. */}
      <div style={{
        marginTop: 8,
        padding: '14px 0 24px',
        color: 'var(--text-faint, rgba(230,237,243,0.45))',
        fontSize: 11,
        textAlign: 'center',
        borderTop: '1px solid var(--border-section, var(--border-color))',
      }}>
        StockDashes is for informational purposes only and does not constitute financial advice ·
        No account needed · Loads in seconds · Your data stays on your device
      </div>
    </div>
  );
}
