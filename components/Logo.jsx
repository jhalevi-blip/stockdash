import Link from 'next/link';

export default function Logo({ href = '/dashboard' }) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect x="1"  y="14" width="4" height="6" rx="0.5" fill="#c49a1a" />
        <rect x="8"  y="9"  width="4" height="11" rx="0.5" fill="#c49a1a" />
        <rect x="15" y="4"  width="4" height="16" rx="0.5" fill="#c49a1a" />
        <path d="M2 12 L10 6 L17.5 0.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span style={{ color: '#c49a1a', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em' }}>STOCK</span>
      <span style={{ color: '#2563eb', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em' }}>DASHES</span>
    </Link>
  );
}
