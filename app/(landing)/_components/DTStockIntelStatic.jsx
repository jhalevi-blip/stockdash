// TODO Phase 3 — this component is being replaced. Patches below are crash-prevention only.
function ratingColor(r) {
  if (r >= 7.0) return 'var(--rating-good)';
  if (r >= 5.0) return 'var(--rating-mid)';
  return 'var(--rating-bad)';
}

export default function DTStockIntelStatic({ intel, selectedTicker }) {
  const entry = intel[selectedTicker];
  if (!entry) return null;

  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
          {selectedTicker}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--accent-cta)', background: 'rgba(59,130,246,0.12)',
          border: '1px solid rgba(59,130,246,0.25)', borderRadius: 'var(--radius)', padding: '3px 10px',
        }}>
          AI Analysis
        </span>
      </div>

      {/* Rating */}
      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Claude Rating
        </div>
        <span style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ratingColor(entry.rating) }}>
          {entry.rating.toFixed(1)}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>/ 10</span>
      </div>

      {/* Summary */}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
        {entry.thesis}
      </p>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'P/E Ratio',     value: entry.pe },
          { label: 'Market Cap',    value: `$${entry.mcap}` },
          { label: 'Short Float',   value: entry.shortFloat },
          { label: 'Next Earnings', value: entry.earnDate },
          { label: 'Div Yield',     value: entry.dy },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
