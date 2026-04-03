'use client';
import { useState } from 'react';
import { startDemo } from '@/lib/startDemo';

export default function DemoPrompt({ message }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await startDemo();
    // startDemo calls window.location.reload() — setLoading(false) is a
    // safety net in case it runs before the reload fires
    setLoading(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '64px 24px',
    }}>
      <div style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: '40px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        maxWidth: 400,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 36 }}>📊</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>
            {message ?? 'No portfolio configured'}
          </div>
          <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6 }}>
            Add your tickers via the Edit Portfolio button, or try the demo to see this page
            with live data for today&apos;s top 5 most-traded stocks.
          </div>
        </div>

        <button
          onClick={handleClick}
          disabled={loading}
          style={{
            background: '#0d1117',
            color: '#e6edf3',
            border: '1px solid #58a6ff',
            borderRadius: 6,
            padding: '13px 32px',
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            transition: 'border-color 0.15s',
          }}
        >
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: loading ? '#8b949e' : '#22c55e',
          }} />
          {loading ? 'Loading sample data…' : 'Try with Sample Portfolio'}
        </button>

        <div style={{ fontSize: 12, color: '#6e7681' }}>
          No account needed · Uses today&apos;s top 5 most-traded stocks
        </div>
      </div>
    </div>
  );
}
