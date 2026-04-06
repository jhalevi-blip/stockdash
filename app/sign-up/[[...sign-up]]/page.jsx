'use client';
import { SignUp } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(31,111,235,0.12) 0%, #0d0f12 60%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1"  y="14" width="4" height="6" rx="0.5" fill="#c49a1a" />
            <rect x="8"  y="9"  width="4" height="11" rx="0.5" fill="#c49a1a" />
            <rect x="15" y="4"  width="4" height="16" rx="0.5" fill="#c49a1a" />
            <path d="M2 12 L10 6 L17.5 0.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: '#c49a1a' }}>STOCK</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: '#2563eb', marginLeft: -6 }}>DASHES</span>
        </div>
        <p style={{ fontSize: 13, color: '#4b5563', margin: 0 }}>Free · Open · No Ads</p>
      </div>

      <SignUp
        appearance={{
          baseTheme: dark,
          variables: {
            colorBackground: '#111416',
            colorInputBackground: '#0d0f12',
            colorInputText: '#c9d1d9',
            colorText: '#e6edf3',
            colorTextSecondary: '#8b949e',
            colorPrimary: '#1f6feb',
            colorDanger: '#f85149',
            borderRadius: '4px',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          },
          elements: {
            card: { border: '1px solid #21262d', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
            headerTitle: { color: '#e6edf3' },
            headerSubtitle: { color: '#8b949e' },
            formButtonPrimary: { backgroundColor: '#1f6feb', fontSize: '13px', fontWeight: 600 },
            footerActionLink: { color: '#58a6ff' },
          },
        }}
        forceRedirectUrl="/dashboard"
        signInUrl="/login"
      />
    </div>
  );
}
