'use client';

import { useState } from 'react';
import Card from './_components/Card';
import HeroValue from './_components/HeroValue';
import MetricChip from './_components/MetricChip';
import MacroStrip from './_components/MacroStrip';
import HoldingsTable from './_components/HoldingsTable';
import AllocationDonut from './_components/AllocationDonut';
import MoversList from './_components/MoversList';
import { PORTFOLIO } from './_lib/mockData';
import { fmtCurrency } from './_lib/format';

// Uses <div> instead of <main> to avoid colliding with the bare
// `main { padding: 20px 24px }` rule in app/globals.css.
export default function DashboardV2Page() {
  const [range, setRange] = useState('1M');

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
        <MetricChip label="Today's P&L"  value={fmtCurrency(PORTFOLIO.dayChange, 0)}    change={PORTFOLIO.dayChangePct} />
        <MetricChip label="Unrealized"   value={fmtCurrency(PORTFOLIO.unrealized, 0)}   change={PORTFOLIO.unrealizedPct} />
        <MetricChip label="Positions"    value={String(PORTFOLIO.positions)} />
        <MetricChip label="Cash"         value={fmtCurrency(PORTFOLIO.cash, 0)} />
      </div>

      {/* 3. Macro strip */}
      <MacroStrip />

      {/* 4. Holdings + side rail (Allocation + Top movers stacked) */}
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
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--positive-soft)',
              marginBottom: 4,
            }}>↑ Gainers</div>
            <MoversList kind="up" />
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--negative-soft)',
              marginTop: 8,
              marginBottom: 4,
            }}>↓ Decliners</div>
            <MoversList kind="down" />
          </Card>
        </div>
      </div>

      {/* Phase C ends here. AI summary, suggested actions, earnings,
          news, correlations route, and quick-jump tiles land in D, D.5, E. */}
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
