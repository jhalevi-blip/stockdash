'use client';
import { useState } from 'react';
import { computeSampleStats, SAMPLE_AI_SUMMARY, SAMPLE_STOCK_INTEL } from '@/lib/dTerminalSampleData';
import PortfolioAISummary from '@/components/PortfolioAISummary';
import DTSummaryStrip from './DTSummaryStrip';
import DTHoldingsTable from './DTHoldingsTable';
import DTStockIntel from './DTStockIntel';
import DTMidCards from './DTMidCards';
import DTStickyCTA from './DTStickyCTA';
// NOTE: DTInlineCTA is no longer imported — replaced by DTStickyCTA at the app-shell bottom.

export default function DTerminalHero() {
  const [selectedTicker, setSelectedTicker] = useState('NVDA');  // NVDA per brief
  const sampleStats = computeSampleStats();

  return (
    <section data-theme="dark" style={{
      background: '#0d1117',
      minHeight: 800,
      padding: '0',
    }}>
      {/* HERO COPY BLOCK */}
      {/* <div> not <header> — globals.css has a global header rule that turns <header> into display:flex */}
      <div style={{
        padding: '38px 32px 22px',
        textAlign: 'center',
        maxWidth: 820,
        margin: '0 auto',
      }}>
        {/* Powered-by capsule */}
        <span style={{
          display: 'inline-block',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          color: 'var(--accent-cta)',
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 4,
          padding: '3px 9px',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          Powered by Claude Opus 4.7
        </span>

        {/* H1 */}
        <h1 style={{
          fontSize: 42, fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
          margin: '0 0 14px',
        }}>
          A professional-grade research<br/>terminal for your portfolio.
        </h1>

        {/* Lede */}
        <p style={{
          fontSize: 16,
          color: 'rgba(230,237,243,0.6)',
          lineHeight: 1.55,
          margin: '0 auto',
          maxWidth: 600,
        }}>
          Institutional-quality analysis on every holding — from Claude Opus 4.7. Free, no ads, your data stays on your device.
        </p>

        {/* TICKER CHIPS — deferred to Step 9 polish pass per Phase 3 plan */}
      </div>

      {/* APP SHELL */}
      <div style={{
        margin: '0 24px 22px',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid #1c232c',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        background: '#07090d',
        position: 'relative',
      }}>
        {/* MAIN — dashboard contents */}
        <div style={{
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <DTSummaryStrip stats={sampleStats} />

          <DTMidCards stats={sampleStats} />

          <DTHoldingsTable
            holdings={sampleStats.rows}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
          />

          <DTStockIntel
            intel={SAMPLE_STOCK_INTEL}
            selectedTicker={selectedTicker}
            row={sampleStats.rows.find(r => r.ticker === selectedTicker)}
          />

          <PortfolioAISummary initialSummary={SAMPLE_AI_SUMMARY} />
        </div>

        {/* STICKY BOTTOM CTA — sits inside the app shell at the bottom */}
        <DTStickyCTA />
      </div>
    </section>
  );
}
