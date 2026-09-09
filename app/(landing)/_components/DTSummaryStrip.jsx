export default function DTSummaryStrip({ stats, market }) {
  const totalPct = (stats.totalPL / stats.totalCost) * 100;
  const POS = '#16a34a';
  const NEG = '#dc2626';

  const fmtEUR = (n, dp = 2) =>
    '€' + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  const fmtDayMonth = (iso) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

  const nextEarn = market?.nextEarningsSoonest ?? null; // { ticker, date } | null
  const vix = market?.vix ?? null;

  const cards = [];

  // 1. PORTFOLIO HEALTH — the demo book's own value (hardcoded book; always shown).
  cards.push(
    <div key="ph" style={cardStyle}>
      <div style={labelStyle}>PORTFOLIO HEALTH</div>
      <div style={numStyle('#e6edf3', 16)}>{fmtEUR(stats.total, 2)}</div>
      <div style={{ fontSize: 10, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: stats.totalPL >= 0 ? POS : NEG }}>
        {fmtPct(totalPct)} all-time
      </div>
    </div>,
  );

  // 2. NEXT EARNINGS — fetched; the card is omitted entirely when not available.
  if (nextEarn) {
    cards.push(
      <div key="ne" style={cardStyle}>
        <div style={labelStyle}>NEXT EARNINGS</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3', fontFamily: 'monospace' }}>{nextEarn.ticker}</div>
        <div style={subStyle}>{fmtDayMonth(nextEarn.date)}</div>
      </div>,
    );
  }

  // 3. MARKET PULSE (VIX) — fetched; omitted when not available.
  if (vix != null) {
    const col = vix < 20 ? POS : NEG;
    cards.push(
      <div key="mp" style={cardStyle}>
        <div style={labelStyle}>MARKET PULSE</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: col, fontFamily: 'monospace' }}>VIX</span>
          <span style={{ fontSize: 13, color: col, fontVariantNumeric: 'tabular-nums' }}>{vix.toFixed(2)}</span>
        </div>
        <div style={subStyle}>{vix < 20 ? 'Below 20 · calm' : 'Above 20 · elevated'}</div>
      </div>,
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 8 }}>
      {cards}
    </div>
  );
}

const cardStyle = {
  background: '#0d1117',
  border: '1px solid #1c232c',
  borderRadius: 6,
  padding: '10px 12px',
};

const labelStyle = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: '#6e7681',
  textTransform: 'uppercase',
  marginBottom: 4,
};

const subStyle = {
  fontSize: 10,
  color: '#6e7681',
  marginTop: 4,
};

const numStyle = (color, size) => ({
  fontSize: size,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  fontFamily: 'monospace',
  letterSpacing: '-0.01em',
  color,
});
