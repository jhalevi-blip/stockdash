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
      minHeight: '100vh', background: '#0d0f12', display: 'flex',
      alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#111416', border: '1px solid #21262d', borderRadius: '8px',
        padding: '40px', width: '100%', maxWidth: '360px'
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', letterSpacing: 1, marginBottom: 6 }}>
          PORTFOLIO<span style={{ color: '#58a6ff' }}>INTEL</span>
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