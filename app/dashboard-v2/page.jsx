'use client';

import { useState } from 'react';
import Card from './_components/Card';
import HeroValue from './_components/HeroValue';
import MetricChip from './_components/MetricChip';
import MacroStrip from './_components/MacroStrip';
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

      {/* Phase B.2b ends here. Holdings + side rail, AI summary, suggested
          actions, earnings, news, and quick-jump tiles land in C, D, E. */}
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
