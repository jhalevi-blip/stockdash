'use client';
import { SignUp } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d0f12', display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    }}>
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
            card: { border: '1px solid #21262d', boxShadow: 'none' },
            headerTitle: { color: '#e6edf3' },
            headerSubtitle: { color: '#8b949e' },
            formButtonPrimary: { backgroundColor: '#1f6feb', fontSize: '13px', fontWeight: 600 },
            footerActionLink: { color: '#58a6ff' },
          },
        }}
        redirectUrl="/dashboard"
        signInUrl="/login"
      />
    </div>
  );
}
