'use client';
import { usePathname } from 'next/navigation';
import NavBar from './NavBar';
import DemoBanner from './DemoBanner';
import UsageBanner from './UsageBanner';

const AUTH_PATHS = ['/sign-up', '/login'];

export default function AppShell() {
  const path = usePathname();
  if (AUTH_PATHS.some(p => path === p || path.startsWith(p + '/'))) return null;
  return (
    <>
      <div className="app-header">
        <div className="app-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1"  y="14" width="4" height="6" rx="0.5" fill="#c49a1a" />
            <rect x="8"  y="9"  width="4" height="11" rx="0.5" fill="#c49a1a" />
            <rect x="15" y="4"  width="4" height="16" rx="0.5" fill="#c49a1a" />
            <path d="M2 12 L10 6 L17.5 0.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ color: '#c49a1a' }}>STOCK</span><span style={{ color: '#2563eb' }}>DASHES</span>
        </div>
      </div>
      <NavBar />
      <DemoBanner />
      <UsageBanner />
    </>
  );
}
