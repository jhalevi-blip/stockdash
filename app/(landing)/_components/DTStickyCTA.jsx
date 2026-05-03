'use client';
import { SignUpButton } from '@clerk/nextjs';

export default function DTStickyCTA() {
  return (
    <div style={{
      width: '100%',
      padding: '12px 20px',
      background: 'linear-gradient(to top, rgba(59,130,246,0.16), rgba(59,130,246,0.04))',
      borderTop: '1px solid rgba(59,130,246,0.25)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 14,
    }}>
      {/* Left — text block */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          You're seeing live sample data. Sign up to use your own portfolio.
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          Free forever · No credit card · No ads · Your data stays on your device
        </div>
      </div>

      {/* Right — CTA button */}
      <SignUpButton mode="modal">
        <button style={{
          fontSize: 13, fontWeight: 700,
          padding: '8px 18px',
          borderRadius: 'var(--radius)',
          background: 'var(--accent-cta)',
          color: '#fff',
          boxShadow: '0 0 24px rgba(59,130,246,0.35)',
          border: '1px solid var(--accent-cta)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Sign up free →
        </button>
      </SignUpButton>
    </div>
  );
}
