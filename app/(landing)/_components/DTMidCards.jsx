export default function DTMidCards({ stats, market }) {
  const POS = '#16a34a';
  const NEG = '#dc2626';

  const fmtEUR = (n, dp = 2) =>
    '€' + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  const changed = stats.rows.filter((r) => r.change != null);
  const best  = changed.length ? [...changed].sort((a, b) => b.change - a.change)[0] : null;
  const worst = changed.length ? [...changed].sort((a, b) => a.change - b.change)[0] : null;
  const dayPct = stats.dayPL != null ? (stats.dayPL / stats.total) * 100 : null;
  const bench = market?.benchmarkDayPct ?? null;                       // URTH — MSCI World ETF
  const relative = dayPct != null && bench != null ? dayPct - bench : null;

  const cards = [];
  if (stats.dayPL != null) {
    cards.push({ key: 'pl', label: "TODAY'S P&L", value: fmtEUR(stats.dayPL, 2),
      sub: `${fmtPct(dayPct)} on €${Math.round(stats.total).toLocaleString('en-GB')}`,
      color: stats.dayPL >= 0 ? POS : NEG });
  }
  if (best)  cards.push({ key: 'best',  label: 'BEST TODAY',  value: best.ticker,  sub: fmtPct(best.change),  color: best.change  >= 0 ? POS : NEG });
  if (worst) cards.push({ key: 'worst', label: 'WORST TODAY', value: worst.ticker, sub: fmtPct(worst.change), color: worst.change >= 0 ? POS : NEG });
  if (relative != null) {
    cards.push({ key: 'msci', label: 'VS MSCI WORLD', value: fmtPct(relative),
      sub: relative >= 0 ? 'Outperforming today' : 'Underperforming today',
      color: relative >= 0 ? POS : NEG });
  }

  if (!cards.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 10 }}>
      {cards.map((c) => (
        <div key={c.key} style={cardStyle}>
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
