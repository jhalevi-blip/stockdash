'use client';
import { useUser, SignUpButton } from '@clerk/nextjs';

export default function SignupGate({ title, description, children }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return null;
  if (isSignedIn) return children;

  return (
    <main style={{ padding: '20px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 420 }}>
      <div style={{
        background: 'var(--card-bg, #161b22)',
        border: '1px solid var(--border-color, #30363d)',
        borderRadius: 12,
        padding: '48px 40px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3', marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.6, marginBottom: 28 }}>{description}</div>
        <SignUpButton mode="modal">
          <button style={{
            background: '#2563eb',
            border: '1px solid #2563eb',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '10px 28px',
          }}>
            Sign Up Free
          </button>
        </SignUpButton>
      </div>
    </main>
  );
}
