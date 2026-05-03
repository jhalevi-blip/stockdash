import { SAMPLE_TOP_STATS } from '@/lib/dTerminalSampleData';

export default function DTSummaryStrip({ stats }) {
  const totalPct = (stats.totalPL / stats.totalCost) * 100;
  const POS = '#4ade80';
  const NEG = '#f87171';

  const fmtUSD = (n, dp = 2) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 8,
    }}>
      {/* 1. PORTFOLIO HEALTH */}
      <div style={cardStyle}>
        <div style={labelStyle}>PORTFOLIO HEALTH</div>
        <div style={numStyle('#e6edf3', 16)}>{fmtUSD(stats.total, 2)}</div>
        <div style={{
          fontSize: 10, marginTop: 4, fontVariantNumeric: 'tabular-nums',
          color: stats.totalPL >= 0 ? POS : NEG,
        }}>
          {fmtPct(totalPct)} all-time
        </div>
      </div>

      {/* 2. NEXT EARNINGS */}
      <div style={cardStyle}>
        <div style={labelStyle}>NEXT EARNINGS</div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: '#e6edf3', fontFamily: 'monospace',
        }}>{SAMPLE_TOP_STATS.nextEarnings.ticker}</div>
        <div style={subStyle}>{SAMPLE_TOP_STATS.nextEarnings.when}</div>
      </div>

      {/* 3. ANALYST TARGETS */}
      <div style={cardStyle}>
        <div style={labelStyle}>ANALYST TARGETS</div>
        <div style={numStyle(POS, 14)}>+{SAMPLE_TOP_STATS.analystTargets.upsidePct.toFixed(1)}%</div>
        <div style={subStyle}>{SAMPLE_TOP_STATS.analystTargets.sub}</div>
      </div>

      {/* 4. INSIDER ACTIVITY */}
      <div style={cardStyle}>
        <div style={labelStyle}>INSIDER ACTIVITY</div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: NEG, fontFamily: 'monospace',
        }}>{SAMPLE_TOP_STATS.insiderActivity.state}</div>
        <div style={subStyle}>{SAMPLE_TOP_STATS.insiderActivity.sub}</div>
      </div>

      {/* 5. MOST SHORTED */}
      <div style={cardStyle}>
        <div style={labelStyle}>MOST SHORTED</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, color: '#e6edf3', fontFamily: 'monospace',
          }}>{SAMPLE_TOP_STATS.mostShorted.ticker}</span>
          <span style={{
            fontSize: 11, color: NEG, fontVariantNumeric: 'tabular-nums',
          }}>{SAMPLE_TOP_STATS.mostShorted.floatPct}</span>
        </div>
        <div style={subStyle}>{SAMPLE_TOP_STATS.mostShorted.sub}</div>
      </div>

      {/* 6. MARKET PULSE */}
      <div style={cardStyle}>
        <div style={labelStyle}>MARKET PULSE</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: NEG, fontFamily: 'monospace',
          }}>VIX</span>
          <span style={{
            fontSize: 13, color: NEG, fontVariantNumeric: 'tabular-nums',
          }}>{SAMPLE_TOP_STATS.marketPulse.vix}</span>
        </div>
        <div style={subStyle}>{SAMPLE_TOP_STATS.marketPulse.sub}</div>
      </div>

      {/* 7. TOP NEWS */}
      <div style={cardStyle}>
        <div style={labelStyle}>TOP NEWS</div>
        <div style={{
          fontSize: 11, color: '#c9d1d9', lineHeight: 1.35, fontWeight: 500,
        }}>{SAMPLE_TOP_STATS.topNews}</div>
      </div>
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
