export default function DTMidCards({ stats }) {
  const POS = '#4ade80';
  const NEG = '#f87171';
  const SP500_DAILY = 0.91;

  const best  = [...stats.rows].sort((a, b) => b.change - a.change)[0];
  const worst = [...stats.rows].sort((a, b) => a.change - b.change)[0];
  const dayPct   = (stats.dayPL / stats.total) * 100;
  const relative = dayPct - SP500_DAILY;

  const fmtUSD = (n, dp = 2) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  const cards = [
    { label: "TODAY'S P&L", value: fmtUSD(stats.dayPL, 2), sub: `${fmtPct(dayPct)} on $${Math.round(stats.total).toLocaleString()}`, color: stats.dayPL >= 0 ? POS : NEG },
    { label: 'BEST TODAY',  value: best.ticker,  sub: `${fmtPct(best.change)} · ${fmtUSD(best.price)}`,   color: best.change  >= 0 ? POS : NEG },
    { label: 'WORST TODAY', value: worst.ticker, sub: `${fmtPct(worst.change)} · ${fmtUSD(worst.price)}`, color: worst.change >= 0 ? POS : NEG },
    { label: 'VS S&P 500',  value: fmtPct(relative), sub: relative >= 0 ? 'Outperforming today' : 'Underperforming today', color: relative >= 0 ? POS : NEG },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {cards.map((c) => (
        <div key={c.label} style={cardStyle}>
          <div style={labelStyle}>{c.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: c.color }}>{c.value}</div>
          <div style={subStyle}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

const cardStyle  = { background: '#0d1117', border: '1px solid #1c232c', borderRadius: 6, padding: '10px 12px' };
const labelStyle = { fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 4 };
const subStyle   = { fontSize: 10, color: '#6e7681', marginTop: 4 };
