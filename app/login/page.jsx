'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startDemo } from '@/lib/startDemo';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError('Incorrect password. Try again.');
      setLoading(false);
    }
  };

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

      <div style={{
        background: '#111416', border: '1px solid #21262d', borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: '40px', width: '100%', maxWidth: '360px'
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3', letterSpacing: 0.5, marginBottom: 6 }}>
          Sign in
        </div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 28 }}>
          Enter your password to continue
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              width: '100%', background: '#0d0f12', border: '1px solid #30363d',
              borderRadius: 4, color: '#c9d1d9', padding: '10px 12px',
              fontSize: 13, outline: 'none', marginBottom: 12, boxSizing: 'border-box'
            }}
            autoFocus
          />
          {error && (
            <div style={{ color: '#f85149', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', background: '#1f6feb', color: '#fff', border: 'none',
              borderRadius: 4, padding: '10px', fontSize: 13, fontWeight: 600,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              opacity: loading || !password ? 0.6 : 1
            }}
          >
            {loading ? 'Checking…' : 'Enter Dashboard'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={() => startDemo('/dashboard')}
            style={{
              background: 'none', border: 'none', color: '#8b949e',
              fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Try Demo
          </button>
        </div>
      </div>
    </div>
  );
}