// "StockDashes vs your DEGIRO overview" — capability comparison.
// StockDashes covers everything except placing trades; DEGIRO's overview
// covers only placing trades. The point isn't rivalry — it's division of
// labour, hammered home by the closing line.

const ROWS = [
  { label: 'Real time-weighted return',    sd: true,  dg: false },
  { label: 'Benchmark comparison',         sd: true,  dg: false },
  { label: 'Historical-FX cost basis',     sd: true,  dg: false },
  { label: 'Per-position profit and loss', sd: true,  dg: false },
  { label: 'Dividend calendar',            sd: true,  dg: false },
  { label: 'AI research per holding',      sd: true,  dg: false },
  { label: 'Place trades',                 sd: false, dg: true  },
];

function Mark({ on }) {
  return on
    ? <span aria-label="Yes" style={{ color: '#3fb950', fontWeight: 700, fontSize: 16 }}>✓</span>
    : <span aria-label="No" style={{ color: '#6e7681', fontSize: 16 }}>—</span>;
}

export default function DTComparisonTable() {
  return (
    <section style={{ padding: '72px 24px', borderTop: '1px solid #1e2530' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 30, fontWeight: 800, color: '#e6edf3',
          letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 32px',
        }}>
          StockDashes vs your DEGIRO overview
        </h2>

        <div style={{
          border: '1px solid #1e2530', borderRadius: 10, overflow: 'hidden',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}></th>
                <th style={thStyle}>StockDashes</th>
                <th style={thStyle}>DEGIRO</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} style={{ borderTop: '1px solid #1e2530' }}>
                  <td style={{
                    ...tdStyle, textAlign: 'left', color: '#e6edf3', fontWeight: 500,
                  }}>
                    {r.label}
                  </td>
                  <td style={{ ...tdStyle, background: 'rgba(59,130,246,0.05)' }}><Mark on={r.sd} /></td>
                  <td style={tdStyle}><Mark on={r.dg} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{
          fontSize: 17, fontWeight: 600, color: '#e6edf3',
          textAlign: 'center', lineHeight: 1.5, margin: '32px auto 0', maxWidth: 560,
        }}>
          Use DEGIRO to buy. Use StockDashes to understand what you bought.
        </p>
      </div>
    </section>
  );
}

const thStyle = {
  padding: '14px 16px',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#8b949e', textAlign: 'center',
  background: 'var(--bg-secondary, #0d1117)',
};

const tdStyle = {
  padding: '13px 16px',
  fontSize: 14, textAlign: 'center', color: '#c9d1d9',
};
