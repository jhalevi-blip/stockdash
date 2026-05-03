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

export default function DTStockIntel({ intel, selectedTicker, row, onLockedAction = () => {} }) {
  const entry = intel[selectedTicker];
  if (!entry || !row) return null;

  const POS = '#4ade80';
  const NEG = '#f87171';

  const fmtUSD = (n, dp = 2) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  const ratingColor = entry.rating >= 7 ? POS : entry.rating >= 5 ? '#d29922' : NEG;

  return (
    <div style={{
      width: '100%',
      padding: 14,
      background: '#0d1117',
      borderTop: '1px solid #1c232c',
    }}>

      {/* Section 1 — Header strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {/* Left: overline + ticker + price + change */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            color: '#6e7681', textTransform: 'uppercase',
          }}>
            Stock Intel
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3', fontFamily: 'monospace' }}>
            {selectedTicker}
          </span>
          <span style={{ fontSize: 14, color: '#e6edf3', fontVariantNumeric: 'tabular-nums' }}>
            {fmtUSD(row.price)}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            color: row.change >= 0 ? POS : NEG,
          }}>
            {fmtPct(row.change)}
          </span>
        </div>

        {/* Right: locked action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onLockedAction}
            style={{
              padding: '4px 10px', borderRadius: 5,
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: 'transparent', border: '1px solid #30363d', color: '#8b949e',
            }}
          >
            🔒 Save chart
          </button>
          <button
            onClick={onLockedAction}
            style={{
              padding: '4px 10px', borderRadius: 5,
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: '#3b82f6', border: '1px solid #3b82f6', color: '#ffffff',
            }}
          >
            Stock detail →
          </button>
        </div>
      </div>

      {/* Section 2 — Rating + thesis */}
      <div style={{
        display: 'flex', gap: 14,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.015)',
        borderRadius: 6,
        marginBottom: 12,
      }}>
        {/* Rating block */}
        <div style={{ textAlign: 'center', flexShrink: 0, width: 86 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            color: '#6e7681', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Claude Rating
          </div>
          <span style={{
            fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: ratingColor,
          }}>
            {entry.rating.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: '#6e7681', marginLeft: 2 }}>/10</span>
        </div>

        {/* Thesis block */}
        <div style={{ fontSize: 11, color: '#c9d1d9', lineHeight: 1.55, flex: 1 }}>
          <span style={{ fontWeight: 700, color: '#e6edf3' }}>Thesis · </span>
          {entry.thesis}
        </div>
      </div>

      {/* Section 3 — Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {[
          { label: 'P/E (TTM)',     value: entry.pe.toFixed(1) },
          { label: 'Market Cap',    value: entry.mcap },
          { label: 'Short Float',   value: entry.shortFloat },
          { label: 'Next Earnings', value: entry.earnDate },
          { label: 'Div Yield',     value: entry.dy },
          { label: 'Beta',          value: entry.beta.toFixed(2) },
        ].map(({ label, value }) => (
          <div key={label} style={cardStyle}>
            <div style={labelStyle}>{label}</div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: '#e6edf3',
              fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Section 4 — Deep-dive teaser */}
      <div style={{
        marginTop: 12,
        padding: '10px 12px',
        background: 'rgba(59,130,246,0.05)',
        border: '1px dashed rgba(59,130,246,0.3)',
        borderRadius: 6,
        fontSize: 11, color: '#8b949e',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>
          Insider trades · Analyst spread · Earnings beat history · Peer comps · Institutional ownership · Short interest · 5-year financials — all on the full page.
        </span>
        <button
          onClick={onLockedAction}
          style={{
            background: 'transparent', border: 'none',
            color: '#3b82f6', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', flexShrink: 0, marginLeft: 16,
          }}
        >
          Open full page →
        </button>
      </div>

    </div>
  );
}
