'use client';
import { SignUp } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import Logo from '@/components/Logo';

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
          <Logo href="/" />
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
            footerActionText: { color: '#8b949e' },
            footerActionLink: { color: '#58a6ff' },
          },
        }}
        forceRedirectUrl="/dashboard"
        signInUrl="/sign-in"
      />
    </div>
  );
}
