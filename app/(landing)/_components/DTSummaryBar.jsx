export default function DTSummaryBar({ stats }) {
  const cells = [
    { label: 'Total Value',   value: `$${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    { label: 'Day P&L',       value: `${stats.dayPnl >= 0 ? '+' : ''}$${stats.dayPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, sub: `${stats.dayPnlPct >= 0 ? '+' : ''}${stats.dayPnlPct}%`, pos: stats.dayPnl >= 0 },
    { label: 'Total Return',  value: `${stats.totalReturn >= 0 ? '+' : ''}$${stats.totalReturn.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, sub: `${stats.totalReturnPct >= 0 ? '+' : ''}${stats.totalReturnPct}%`, pos: stats.totalReturn >= 0 },
    { label: 'Holdings',      value: stats.holdingsCount },
    { label: 'Claude Rating', value: `${stats.claudeRating} / 10`, sub: stats.claudeRatingLabel },
    { label: 'As Of',         value: stats.asOf },
  ];

  return (
    <div style={{
      display: 'flex', overflowX: 'auto',
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
    }}>
      {cells.map((cell, i) => (
        <div key={i} style={{
          padding: '12px 20px',
          borderRight: i < cells.length - 1 ? '1px solid var(--border-color)' : 'none',
          minWidth: 130, flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
            {cell.label}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: cell.pos === true ? 'var(--positive-bright)' : cell.pos === false ? 'var(--negative-soft)' : 'var(--text-primary)',
          }}>
            {cell.value}
          </div>
          {cell.sub && (
            <div style={{ fontSize: 11, marginTop: 1, color: cell.pos === true ? 'var(--positive-soft)' : cell.pos === false ? 'var(--negative-soft)' : 'var(--text-secondary)' }}>
              {cell.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
