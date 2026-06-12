'use client';

import CorrelationPairList from '@/components/CorrelationPairList';

// Reuses the existing CorrelationPairList component from the live
// /dashboard. Component renders its own card chrome (bg-card, border,
// border-radius 8) so we drop it directly into the page flow — no
// (v2) Card wrapper. Passing isSignedIn={false} disables all API
// calls; component renders the signup gate instead. Real auth wiring
// lands in Phase H.
export default function CorrelationsPage() {
  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      {/* Page heading */}
      <div style={{
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}>
          Analysis
        </div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          margin: 0,
          color: 'var(--text-primary)',
        }}>
          Correlation analysis
        </h1>
        <p style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          margin: '6px 0 0',
          maxWidth: 600,
        }}>
          See which positions move together and which truly diversify your
          portfolio. Pairs are computed from aligned daily returns over the
          past trading window.
        </p>
      </div>

      {/* Reused component — renders its own card chrome */}
      <CorrelationPairList isSignedIn={false} />

      {/* Footer disclaimer */}
      <div style={{
        marginTop: 20,
        padding: '14px 0 24px',
        color: 'var(--text-faint, rgba(230,237,243,0.45))',
        fontSize: 11,
        textAlign: 'center',
        borderTop: '1px solid var(--border-section, var(--border-color))',
      }}>
        Correlations are estimates based on past data and may not predict
        future behavior · Pairs need at least 2 positions and 30 trading
        days to compute · EU-hosted, never sold
      </div>
    </div>
  );
}
