'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useUser, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import PortfolioModal from './PortfolioModal';
import { startDemo } from '@/lib/startDemo';

const links = [
  { href: '/dashboard',      label: 'Dashboard',   icon: '📊' },
  { href: '/performance',   label: 'Performance', icon: '📈' },
  { href: '/macro',          label: 'Macro',       icon: '🌏', dataTour: 'macro-link' },
  { href: '/insider',        label: 'Insider',     icon: '🔎', dataTour: 'insider-link' },
  { href: '/institutional',  label: 'Ownership',   icon: '🏛', dataTour: 'ownership-link' },
  { href: '/peers',          label: 'Peers',       icon: '📋' },
  { href: '/research',       label: 'Research',    icon: '📑' },
  { href: '/valuation',      label: 'Valuation',   icon: '📐' },
  { href: '/earnings',       label: 'Earnings',    icon: '📅' },
  { href: '/analyst',        label: 'Analyst',     icon: '🎯' },
];

export default function NavBar() {
  const path   = usePathname();
  const router = useRouter();
  const [open,         setOpen]         = useState(false);
  const [demoHovered,  setDemoHovered]  = useState(false);
  const [dark,         setDark]         = useState(true);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [savedHoldings, setSavedHoldings] = useState([]);
  const [isDemo,       setIsDemo]       = useState(false);
  const { isLoaded, isSignedIn } = useUser();
  const hasSynced = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('stockdash_theme');
    const isDark = saved !== 'light';
    setDark(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    setIsDemo(localStorage.getItem('stockdash_demo') === 'true');
  }, []);

  // Sync portfolio from Supabase → localStorage when user signs in
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (hasSynced.current) return;
    hasSynced.current = true;
    // Clear demo mode — real account takes over
    localStorage.removeItem('stockdash_demo');
    localStorage.removeItem('stockdash_holdings');
    setIsDemo(false);
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

  // Load holdings from localStorage in demo mode
  useEffect(() => {
    if (!isDemo) return;
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      if (stored) setSavedHoldings(JSON.parse(stored));
    } catch {}
  }, [isDemo]);

  async function savePortfolio(holdings) {
    localStorage.setItem('stockdash_holdings', JSON.stringify(holdings));
    setSavedHoldings(holdings);
    if (isDemo) {
      window.dispatchEvent(new CustomEvent('portfolio-saved'));
      return;
    }
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings }),
    });
    if (!res.ok) throw new Error('Save failed');
    window.dispatchEvent(new CustomEvent('portfolio-saved'));
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('stockdash_theme', next ? 'dark' : 'light');
  }

  const showEditPortfolio = (isLoaded && isSignedIn) || isDemo;

  const authSection = isLoaded && (
    isSignedIn ? (
      <UserButton afterSignOutUrl="/" />
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => startDemo()}
          onMouseEnter={() => setDemoHovered(true)}
          onMouseLeave={() => setDemoHovered(false)}
          style={{
            background: 'var(--bg-primary)',
            border: `1px solid ${demoHovered ? 'var(--text-primary)' : 'var(--accent)'}`,
            borderRadius: 6, color: 'var(--text-primary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            padding: '4px 12px', whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'border-color 0.15s',
          }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
          Try Demo
        </button>
        <SignInButton mode="modal">
          <button style={{
            background: 'none', border: '1px solid var(--border-color)',
            borderRadius: 6, color: 'var(--text-secondary)',
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
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        overflowX: 'auto',
        boxShadow: '0 1px 4px var(--shadow-sm)',
      }} className="desktop-nav">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            {...(l.dataTour ? { 'data-tour': l.dataTour } : {})}
            style={{
              padding: '10px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: path === l.href ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: path === l.href ? '2px solid var(--accent)' : '2px solid transparent',
              textDecoration: 'none',
              transition: 'color .2s',
              whiteSpace: 'nowrap',
            }}
          >
            {l.label}
          </Link>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {showEditPortfolio && (
            <button
              data-tour="edit-portfolio"
              onClick={() => setModalOpen(true)}
              style={{
                background: 'none', border: '1px solid var(--accent)',
                borderRadius: 6, color: 'var(--accent)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                padding: '4px 12px', whiteSpace: 'nowrap',
              }}>🛠 Edit Portfolio</button>
          )}
          <button onClick={toggleTheme} style={{
            background: 'none',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 16,
            cursor: 'pointer',
            padding: '4px 10px',
            lineHeight: 1,
          }} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? '🌙' : '🌔'}
          </button>
          {authSection}
        </div>
      </nav>

      {/* Mobile nav */}
      <div className="mobile-nav">
        <div style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          boxShadow: '0 1px 4px var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {links.find(l => l.href === path)?.icon}{' '}
            {links.find(l => l.href === path)?.label || 'Menu'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showEditPortfolio && (
              <button
                data-tour="edit-portfolio"
                onClick={() => setModalOpen(true)}
                style={{
                  background: 'none', border: '1px solid var(--accent)',
                  borderRadius: 6, color: 'var(--accent)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  padding: '3px 10px', whiteSpace: 'nowrap',
                }}>🛠 Edit Portfolio</button>
            )}
            {isLoaded && isSignedIn && <UserButton afterSignOutUrl="/" />}
            <button onClick={toggleTheme} style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              fontSize: 16, cursor: 'pointer', padding: '4px 6px',
            }}>{dark ? '🌙' : '🌔'}</button>
            <button onClick={() => setOpen(!open)} style={{
              background: 'none', border: 'none', color: 'var(--text-primary)',
              fontSize: 20, cursor: 'pointer', padding: '4px 8px',
            }}>{open ? '✕' : '☰'}</button>
          </div>
        </div>

        {open && (
          <div style={{
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-color)',
            position: 'absolute',
            left: 0, right: 0, zIndex: 100,
            boxShadow: '0 8px 24px var(--shadow-sm)',
          }}>
            {links.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                fontSize: 14,
                fontWeight: 600,
                color: path === l.href ? 'var(--accent)' : 'var(--text-primary)',
                background: path === l.href ? 'var(--bg-accent-subtle)' : 'transparent',
                borderBottom: '1px solid var(--border-color)',
                textDecoration: 'none',
              }}>
                <span style={{ fontSize: 18 }}>{l.icon}</span>
                {l.label}
                {path === l.href && (
                  <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>→</span>
                )}
              </Link>
            ))}
            {isLoaded && !isSignedIn && (
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => { setOpen(false); startDemo(); }}
                  onMouseEnter={() => setDemoHovered(true)}
                  onMouseLeave={() => setDemoHovered(false)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: `1px solid ${demoHovered ? 'var(--text-primary)' : 'var(--accent)'}`,
                    borderRadius: 6, color: 'var(--text-primary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'border-color 0.15s',
                  }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                  Try Demo
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <SignInButton mode="modal">
                    <button style={{
                      flex: 1, background: 'none', border: '1px solid var(--border-color)',
                      borderRadius: 6, color: 'var(--text-primary)',
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
