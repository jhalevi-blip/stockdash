'use client';
import { useState } from 'react';
import { computeSampleStats, SAMPLE_AI_SUMMARY, SAMPLE_STOCK_INTEL } from '@/lib/dTerminalSampleData';
import PortfolioAISummary from '@/components/PortfolioAISummary';
import DTSummaryBar from './DTSummaryBar';
import DTHoldingsTable from './DTHoldingsTable';
import DTStockIntelStatic from './DTStockIntelStatic';
import DTInlineCTA from './DTInlineCTA';

export default function DTerminalHero() {
  const [selectedTicker, setSelectedTicker] = useState('AAPL');
  const sampleStats = computeSampleStats();

  return (
    <section data-theme="dark" style={{ background: 'var(--bg-page-deep)', padding: '32px 24px' }}>
      <h1>D-Terminal Hero (scaffold)</h1>

      <DTSummaryBar stats={sampleStats} />

      <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
        <DTHoldingsTable
          holdings={sampleStats.rows}
          selectedTicker={selectedTicker}
          onSelect={setSelectedTicker}
        />
        <DTStockIntelStatic intel={SAMPLE_STOCK_INTEL} selectedTicker={selectedTicker} />
      </div>

      <div style={{ marginTop: 24 }}>
        <PortfolioAISummary initialSummary={SAMPLE_AI_SUMMARY} />
      </div>

      <DTInlineCTA />
    </section>
  );
}
