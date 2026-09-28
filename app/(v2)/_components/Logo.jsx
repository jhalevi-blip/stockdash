'use client';

export default function Logo({ size = 22 }) {
  const w = size * 1.05;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <svg width={w} height={size} viewBox="0 0 22 22" fill="none" style={{ color: 'var(--brand-gold)' }}>
        <rect x="2" y="14" width="3" height="6" fill="currentColor" />
        <rect x="7" y="10" width="3" height="10" fill="currentColor" />
        <rect x="12" y="6" width="3" height="14" fill="currentColor" />
        <path d="M3 13 L17 3 M13 3 H17 V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '.02em', display: 'inline-flex' }}>
        <span style={{ color: 'var(--brand-gold)' }}>STOCK</span>
        <span style={{ color: '#2563eb', marginLeft: 2 }}>DASHES</span>
      </span>
    </span>
  );
}
