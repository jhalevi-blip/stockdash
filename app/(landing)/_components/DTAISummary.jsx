export default function DTAISummary({ summary }) {
  if (!summary) return null;

  const POS = '#4ade80';
  const AMB = '#d29922';
  const NEG = '#f87171';

  const ratingColor = summary.rating >= 7 ? POS : summary.rating >= 5 ? AMB : NEG;

  const sections = [
    { label: '📊 OVERVIEW',         body: summary.overview },
    { label: "✅ WHAT'S WORKING",   body: summary.whats_working },
    { label: "⚠️ WHAT'S DRAGGING",  body: summary.whats_dragging },
    { label: '🎯 BIGGEST RISK',      body: summary.biggest_risk },
    { label: '💡 SUGGESTED ACTION',  body: summary.suggested_action },
  ];

  return (
    <div style={{
      width: '100%',
      padding: '14px 16px',
      background: '#0d1117',
      border: '1px solid #1c232c',
      borderRadius: 6,
    }}>

      {/* Section 1 — Header strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            color: '#6e7681', textTransform: 'uppercase',
          }}>
            Portfolio AI Summary
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
            color: '#6e7681', border: '1px solid #1c232c',
            borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase',
          }}>
            Claude Opus 4.7
          </span>
        </div>
        <span style={{ fontSize: 9, color: '#6e7681' }}>Just now</span>
      </div>

      {/* Section 2 — Rating + thesis */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '6px 0 14px',
        borderBottom: '1px solid #1c232c',
      }}>
        <div style={{ textAlign: 'center', width: 92, flexShrink: 0 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            color: '#6e7681', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Claude Rating
          </div>
          <span style={{
            fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: ratingColor,
          }}>
            {summary.rating.toFixed(1)}
          </span>
          <span style={{ fontSize: 16, color: '#6e7681', marginLeft: 3 }}>/10</span>
        </div>
        <p style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.55, flex: 1, margin: 0 }}>
          {summary.rating_summary}
        </p>
      </div>

      {/* Section 3 — 5-row list */}
      <div>
        {sections.map((s, i) => (
          <div key={s.label} style={{
            display: 'flex', gap: 14,
            padding: '10px 0',
            borderBottom: i < sections.length - 1 ? '1px solid #1c232c' : 'none',
          }}>
            <div style={{
              width: 130, flexShrink: 0,
              fontSize: 10, fontWeight: 700, color: '#6e7681',
              letterSpacing: '0.05em', paddingTop: 1,
            }}>
              {s.label}
            </div>
            <div style={{ flex: 1, fontSize: 11, color: '#c9d1d9', lineHeight: 1.55 }}>
              {s.body}
            </div>
          </div>
        ))}
      </div>


    </div>
  );
}
