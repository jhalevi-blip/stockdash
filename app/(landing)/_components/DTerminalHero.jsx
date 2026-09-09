'use client';
import { useState, useRef } from 'react';
import { SignUpButton } from '@clerk/nextjs';
import { computeSampleStats } from '@/lib/dTerminalSampleData';
import DTAISummary from './DTAISummary';
import DTSummaryStrip from './DTSummaryStrip';
import DTHoldingsTable from './DTHoldingsTable';
import DTStockIntel from './DTStockIntel';
import DTMidCards from './DTMidCards';
import DTStickyCTA from './DTStickyCTA';
import DTCsvDemo from './DTCsvDemo';
import { FLAGSHIP_LABEL } from '@/lib/aiModels';

export default function DTerminalHero({ market }) {
  const [selectedTicker, setSelectedTicker] = useState('ASML');  // EUR flagship holding
  const sampleStats = computeSampleStats(market);
  const demoRef = useRef(null);   // exposes openPicker() from DTCsvDemo

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
        {/* Powered-by capsule — model named via FLAGSHIP_LABEL so copy can't drift */}
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
          For DEGIRO &amp; Saxo · Powered by Claude {FLAGSHIP_LABEL}
        </span>

        {/* H1 */}
        <h1 style={{
          fontSize: 42, fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
          margin: '0 0 14px',
        }}>
          See the real DEGIRO and Saxo return your broker won&apos;t show you.
        </h1>

        {/* Lede */}
        <p style={{
          fontSize: 16,
          color: 'rgba(230,237,243,0.6)',
          lineHeight: 1.55,
          margin: '0 auto',
          maxWidth: 600,
        }}>
          Import one Account Statement export. Real time-weighted return, benchmarked, with historical FX handled. Free, ad-free, EU-hosted.
        </p>

        {/* CTAs — primary routes to the demo (not sign-up); secondary is sign-up */}
        <div style={{
          display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
          marginTop: 22,
        }}>
          <button
            onClick={() => demoRef.current?.openPicker()}
            style={{
              padding: '13px 30px', borderRadius: 10,
              background: 'var(--accent-cta)', border: '1px solid var(--accent-cta)',
              color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
              cursor: 'pointer', boxShadow: '0 0 28px rgba(59,130,246,0.3)',
            }}
          >
            See my real return
          </button>
          <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
            <button style={{
              padding: '13px 30px', borderRadius: 10,
              background: 'transparent', border: '1px solid #30363d',
              color: 'var(--text-primary)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
              cursor: 'pointer',
            }}>
              Sign up free
            </button>
          </SignUpButton>
        </div>

        {/* Trust fine print under the CTA */}
        <p style={{
          fontSize: 12, color: 'rgba(230,237,243,0.35)',
          margin: '14px auto 0', maxWidth: 560, lineHeight: 1.5,
        }}>
          No broker login. Read-only CSV. EU-hosted. Delete in one click. We never sell your data.
        </p>
      </div>

      {/* CSV DEMO — dropzone + real-return result (replaces the mock with the visitor's file) */}
      <DTCsvDemo ref={demoRef} />

      {/* SAMPLE LABEL — the app shell below is an illustration, not the visitor's data */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '0 24px',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(230,237,243,0.3)', marginBottom: 8,
      }}>
        Sample portfolio · example data
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
          <DTSummaryStrip stats={sampleStats} market={market} />

          <DTMidCards stats={sampleStats} market={market} />

          <DTHoldingsTable
            holdings={sampleStats.rows}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
          />

          <DTStockIntel
            market={market}
            selectedTicker={selectedTicker}
            row={sampleStats.rows.find(r => r.ticker === selectedTicker)}
          />

          <DTAISummary />
        </div>

        {/* STICKY BOTTOM CTA — sits inside the app shell at the bottom */}
        <DTStickyCTA />
      </div>
    </section>
  );
}
