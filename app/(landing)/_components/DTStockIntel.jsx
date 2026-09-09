'use client';
import { SignUpButton } from '@clerk/nextjs';

const cardStyle = {
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid #1c232c',
  borderRadius: 4,
};

const labelStyle = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#6e7681',
  textTransform: 'uppercase',
  marginBottom: 3,
};

export default function DTStockIntel({ market, selectedTicker, row }) {
  if (!row) return null;

  const m = market?.perTicker?.[selectedTicker] ?? {};
  const fmtEUR = (n, dp = 2) => '€' + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtDayMonth = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const DASH = '—';

  // Metric grid — every value traces to the fetched market data; null → em dash,
  // never a fabricated number. Short float removed (Yahoo-scrape-only). Market cap
  // is Finnhub's USD figure, tagged 'USD' like the holdings table's USD rows.
  const metrics = [
    { label: 'P/E (TTM)',     value: m.pe != null ? m.pe.toFixed(1) : DASH },
    { label: 'Market Cap',    value: m.marketCapMM != null ? '$' + (m.marketCapMM / 1000).toFixed(0) + 'B' : DASH, tag: m.marketCapMM != null ? 'USD' : null },
    { label: 'Next Earnings', value: m.nextEarnings ? fmtDayMonth(m.nextEarnings) : DASH },
    { label: 'Div Yield',     value: m.divYield != null ? m.divYield.toFixed(2) + '%' : DASH },
    { label: 'Beta',          value: m.beta != null ? m.beta.toFixed(2) : DASH },
  ];

  return (
    <div style={{ width: '100%', padding: 14, background: '#0d1117', borderTop: '1px solid #1c232c' }}>

      {/* Header strip — the price is the demo book's mark, not a live quote, so no
          day change is shown here (a live move against a frozen mark is a mismatch).
          The real per-position day change lives in the holdings table above. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#6e7681', textTransform: 'uppercase' }}>
            Stock Intel
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3', fontFamily: 'monospace' }}>
            {selectedTicker}
          </span>
          <span style={{ fontSize: 14, color: '#e6edf3', fontVariantNumeric: 'tabular-nums' }}>
            {fmtEUR(row.price)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <SignUpButton mode="modal">
            <button style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid #30363d', color: '#8b949e' }}>
              🔒 Save chart
            </button>
          </SignUpButton>
          <SignUpButton mode="modal">
            <button style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: '#3b82f6', border: '1px solid #3b82f6', color: '#ffffff' }}>
              Stock detail →
            </button>
          </SignUpButton>
        </div>
      </div>

      {/* Empty state where the AI rating + thesis will be, once you sign up. No
          fabricated score or thesis text — just a plain muted label. */}
      <div style={{
        padding: '10px 12px', marginBottom: 12,
        background: 'rgba(255,255,255,0.015)', borderRadius: 6,
        fontSize: 11, color: '#6e7681', lineHeight: 1.5,
      }}>
        An AI rating &amp; research brief on every holding — after sign-up.
      </div>

      {/* Metrics grid — fetched */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {metrics.map(({ label, value, tag }) => (
          <div key={label} style={cardStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
              {value}
              {tag && (
                <span style={{ marginLeft: 5, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', color: '#6e7681', border: '1px solid #1c232c', borderRadius: 3, padding: '1px 3px', verticalAlign: 'middle' }}>
                  {tag}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Deep-dive teaser */}
      <div style={{
        marginTop: 12, padding: '10px 12px',
        background: 'rgba(59,130,246,0.05)', border: '1px dashed rgba(59,130,246,0.3)', borderRadius: 6,
        fontSize: 11, color: '#8b949e', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>
          Insider trades · Analyst spread · Earnings beat history · Peer comps · Institutional ownership · Short interest · 5-year financials — all on the full page.
        </span>
        <SignUpButton mode="modal">
          <button style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}>
            Open full page →
          </button>
        </SignUpButton>
      </div>

    </div>
  );
}
