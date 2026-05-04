'use client';

import Dot from './Dot';
// PORTFOLIO.asOf is a display-only timestamp. Replace with prop
// or date utility when real data lands in Phase H.
import { PORTFOLIO } from '@/app/(v2)/dashboard-v2/_lib/mockData';

// Uses <div> instead of <header> to avoid colliding with the bare
// `header { ... }` rule in app/globals.css.
export default function Topbar({ onCommand }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 18px',
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border-color)',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          flex: 1,
          maxWidth: 360,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}>
          <span style={{ opacity: .6 }}>🔎</span>
          <span>Search ticker, page, or command…</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            padding: '1px 5px',
            borderRadius: 3,
          }}>⌘K</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dot color="var(--positive-bright)" /> Market open
        </span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{PORTFOLIO.asOf}</span>
      </div>
      <button onClick={() => onCommand?.('editPortfolio')} style={{
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        padding: '6px 12px',
        fontSize: 12,
        cursor: 'pointer',
        fontWeight: 500,
      }}>🛠 Edit Portfolio</button>
    </div>
  );
}
