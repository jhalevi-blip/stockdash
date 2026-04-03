'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUser, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import PortfolioModal from './PortfolioModal';
import { startDemo } from '@/lib/startDemo';

const links = [
  { href: '/dashboard',      label: 'Dashboard',   icon: '📊' },
  { href: '/macro',          label: 'Macro',       icon: '🌍' },
  { href: '/insider',        label: 'Insider',     icon: '🦅' },
  { href: '/institutional',  label: 'Ownership',   icon: '🏦' },
  { href: '/peers',          label: 'Peers',       icon: '🔍' },
  { href: '/research',       label: 'Research',    icon: '🔬' },
  { href: '/valuation',      label: 'Valuation',   icon: '🔢' },
  { href: '/earnings',       label: 'Earnings',    icon: '📈' },
  { href: '/short-interest', label: 'Analyst',     icon: '🎯' },
];

export default function NavBar() {
  const path   = usePathname();
  const router = useRouter();
  const [open,         setOpen]         = useState(false);
  const [dark,         setDark]         = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [savedHoldings, setSavedHoldings] = useState([]);
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  // Sync portfolio from Supabase → localStorage when user signs in
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    // Clear demo mode — real account takes over
    localStorage.removeItem('stockdash_demo');
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        if (data.signedIn && data.holdings?.length) {
          localStorage.setItem('stockdash_holdings', JSON.stringify(data.holdings));
          setSavedHoldings(data.holdings);
        } else {
          // No Supabase record yet — load from localStorage if present
          try {
            const stored = localStorage.getItem('stockdash_holdings');
            if (stored) setSavedHoldings(JSON.parse(stored));
          } catch {}
        }
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn]);

  async function savePortfolio(holdings) {
    localStorage.setItem('stockdash_holdings', JSON.stringify(holdings));
    setSavedHoldings(holdings);
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings }),
    });
    if (!res.ok) throw new Error('Save failed');
    // Notify pages already mounted (e.g. dashboard) to re-fetch
    window.dispatchEvent(new CustomEvent('portfolio-saved'));
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  const bg             = dark ? '#161b22' : '#ffffff';
  const border         = dark ? '#21262d' : '#e2e6ed';
  const activeColor    = dark ? '#e6edf3' : '#1a1d23';
  const inactiveColor  = dark ? '#8b949e' : '#6b7280';
  const mobileTextColor  = dark ? '#c9d1d9' : '#374151';
  const mobileActiveBg   = dark ? '#1e3a5f' : '#eff6ff';
  const mobileActiveColor = dark ? '#58a6ff' : '#2563eb';
  const mobileRowBorder  = dark ? '#21262d' : '#f0f2f5';

  const authSection = isLoaded && (
    isSignedIn ? (
      <UserButton afterSignOutUrl="/" />
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => startDemo()} style={{
          background: '#0d1117', border: '1px solid #58a6ff',
          borderRadius: 6, color: '#e6edf3',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          padding: '4px 12px', whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
          Try Demo
        </button>
        <SignInButton mode="modal">
          <button style={{
            background: 'none', border: `1px solid ${border}`,
            borderRadius: 6, color: inactiveColor,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            padding: '4px 12px',
          }}>Sign In</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button style={{
            background: '#2563eb', border: '1px solid #2563eb',
            borderRadius: 6, color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            padding: '4px 12px',
          }}>Sign Up</button>
        </SignUpButton>
      </div>
    )
  );

  return (
    <>
      {/* Desktop nav */}
      <nav style={{
        background: bg,
        borderBottom: `1px solid ${border}`,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }} className="desktop-nav">
        {links.map(l => (
          <Link key={l.href} href={l.href} style={{
            padding: '10px 16px',
            fontSize: 12,
            fontWeight: 600,
            color: path === l.href ? activeColor : inactiveColor,
            borderBottom: path === l.href ? '2px solid #2563eb' : '2px solid transparent',
            textDecoration: 'none',
            transition: 'color .2s',
            whiteSpace: 'nowrap',
          }}>{l.label}</Link>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isLoaded && isSignedIn && (
            <button onClick={() => setModalOpen(true)} style={{
              background: 'none', border: '1px solid #58a6ff',
              borderRadius: 6, color: '#58a6ff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              padding: '4px 12px', whiteSpace: 'nowrap',
            }}>✏ Edit Portfolio</button>
          )}
          <button onClick={toggleTheme} style={{
            background: 'none',
            border: `1px solid ${border}`,
            borderRadius: 6,
            color: inactiveColor,
            fontSize: 16,
            cursor: 'pointer',
            padding: '4px 10px',
            lineHeight: 1,
          }} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? '☀️' : '🌙'}
          </button>
          {authSection}
        </div>
      </nav>

      {/* Mobile nav */}
      <div className="mobile-nav">
        <div style={{
          background: bg,
          borderBottom: `1px solid ${border}`,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: inactiveColor }}>
            {links.find(l => l.href === path)?.icon}{' '}
            {links.find(l => l.href === path)?.label || 'Menu'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isLoaded && isSignedIn && (
              <button onClick={() => setModalOpen(true)} style={{
                background: 'none', border: '1px solid #58a6ff',
                borderRadius: 6, color: '#58a6ff',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                padding: '3px 10px', whiteSpace: 'nowrap',
              }}>✏ Edit Portfolio</button>
            )}
            {isLoaded && isSignedIn && <UserButton afterSignOutUrl="/" />}
            <button onClick={toggleTheme} style={{
              background: 'none', border: 'none', color: inactiveColor,
              fontSize: 16, cursor: 'pointer', padding: '4px 6px',
            }}>{dark ? '☀️' : '🌙'}</button>
            <button onClick={() => setOpen(!open)} style={{
              background: 'none', border: 'none', color: mobileTextColor,
              fontSize: 20, cursor: 'pointer', padding: '4px 8px',
            }}>{open ? '✕' : '☰'}</button>
          </div>
        </div>

        {open && (
          <div style={{
            background: bg,
            borderBottom: `1px solid ${border}`,
            position: 'absolute',
            left: 0, right: 0, zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          }}>
            {links.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                fontSize: 14,
                fontWeight: 600,
                color: path === l.href ? mobileActiveColor : mobileTextColor,
                background: path === l.href ? mobileActiveBg : 'transparent',
                borderBottom: `1px solid ${mobileRowBorder}`,
                textDecoration: 'none',
              }}>
                <span style={{ fontSize: 18 }}>{l.icon}</span>
                {l.label}
                {path === l.href && (
                  <span style={{ marginLeft: 'auto', color: mobileActiveColor }}>◀</span>
                )}
              </Link>
            ))}
            {isLoaded && !isSignedIn && (
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${border}` }}>
                <button onClick={() => { setOpen(false); startDemo(); }} style={{
                  background: '#0d1117', border: '1px solid #58a6ff',
                  borderRadius: 6, color: '#e6edf3',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                  Try Demo
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <SignInButton mode="modal">
                    <button style={{
                      flex: 1, background: 'none', border: `1px solid ${border}`,
                      borderRadius: 6, color: mobileTextColor,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px',
                    }}>Sign In</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button style={{
                      flex: 1, background: '#2563eb', border: '1px solid #2563eb',
                      borderRadius: 6, color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px',
                    }}>Sign Up</button>
                  </SignUpButton>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {modalOpen && (
        <PortfolioModal
          holdings={savedHoldings}
          onSave={savePortfolio}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
