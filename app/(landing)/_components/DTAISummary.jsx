import { FLAGSHIP_LABEL } from '@/lib/aiModels';

// Empty state: the portfolio AI rating + research brief are generated for a
// signed-in user's real holdings. No fabricated score or thesis behind a lock —
// just a plain muted label, worded to match step 3 of the walkthrough.
export default function DTAISummary() {
  return (
    <div style={{
      width: '100%',
      padding: '14px 16px',
      background: '#0d1117',
      border: '1px solid #1c232c',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#6e7681', textTransform: 'uppercase' }}>
          Portfolio AI Summary
        </span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', color: '#6e7681', border: '1px solid #1c232c', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase' }}>
          Claude {FLAGSHIP_LABEL}
        </span>
      </div>
      <p style={{ fontSize: 11, color: '#6e7681', lineHeight: 1.55, margin: 0 }}>
        An AI rating &amp; research brief on your holdings — generated after you sign up.
      </p>
    </div>
  );
}
