'use client';
import { SignUpButton } from '@clerk/nextjs';

export default function DTInlineCTA() {
  return (
    <div style={{
      marginTop: 24, padding: '24px 20px', textAlign: 'center',
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
    }}>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Sign up to unlock your own AI summary
      </p>
      <SignUpButton mode="modal">
        <button style={{
          padding: '10px 28px', borderRadius: 'var(--radius)', border: 'none',
          cursor: 'pointer', background: 'var(--accent-cta)', color: '#fff',
          fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
          boxShadow: 'var(--shadow-cta-blue)',
        }}>
          Sign Up Free
        </button>
      </SignUpButton>
    </div>
  );
}
