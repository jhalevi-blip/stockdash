'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useUser, useClerk, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import PortfolioModal from './PortfolioModal';
import { startDemo } from '@/lib/startDemo';
import {
  migrateIfNeeded, loadUserHoldings, saveUserHoldings, clearHoldingsCache, CACHE_KEY,
} from '@/lib/holdingsStorage';

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
  { href: '/analyst-ratings', label: 'Analyst',     icon: '🎯' },
  { href: '/analyst',        label: 'Short Int.',  icon: '📉' },
];

export default function NavBar() {
  const path   = usePathname();
  const router = useRouter();
  const [open,          setOpen]          = useState(false);
  const [demoHovered,   setDemoHovered]   = useState(false);
  const [dark,          setDark]          = useState(true);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [savedHoldings, setSavedHoldings] = useState([]);
  const [savedCash,     setSavedCash]     = useState(null);
  const [isDemo,        setIsDemo]        = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();
  const { openSignUp } = useClerk();
  const hasSynced  = useRef(false);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('stockdash_theme');
    const isDark = saved !== 'light';
    setDark(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    setIsDemo(localStorage.getItem('stockdash_demo') === 'true');
    // Load cash position from localStorage
    const cashAmt = parseFloat(localStorage.getItem('stockdash_cash_amount') || '0') || 0;
    const cashCcy = localStorage.getItem('stockdash_cash_currency') || 'USD';
    if (cashAmt > 0) setSavedCash({ amount: cashAmt, currency: cashCcy });
  }, []);

  // Clear shared cache when user signs out so the next user starts clean
  useEffect(() => {
    if (!isLoaded) return;
    if (wasSignedIn.current && !isSignedIn) {
      clearHoldingsCache();
    }
    wasSignedIn.current = isSignedIn ?? false;
  }, [isLoaded, isSignedIn]);

  // Sync portfolio from Supabase → localStorage when user signs in
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    if (hasSynced.current) return;
    hasSynced.current = true;
    const userId = user.id;
    const signingUpFromDemo = localStorage.getItem('stockdash_demo') === 'true';

    if (signingUpFromDemo) {
      // New user arriving from demo — discard demo holdings so they start clean.
      // migrateIfNeeded would copy demo data into their scoped key, which the
      // Supabase fallback path would then silently adopt as their real portfolio.
      localStorage.removeItem('stockdash_holdings');
      localStorage.removeItem(`holdings_${userId}`);
    } else {
      // Returning user signing back in — migrate unscoped data to their scoped key.
      migrateIfNeeded(userId);
    }
    // Clear demo mode — real account takes over
    localStorage.removeItem('stockdash_demo');
    setIsDemo(false);

    const justSaved = localStorage.getItem('portfolio_just_saved');
    if (justSaved) {
      // Reload came from savePortfolio — scoped key already has correct data.
      localStorage.removeItem('portfolio_just_saved');
      const local = loadUserHoldings(userId);
      console.log('[NavBar] justSaved path — key:', `holdings_${userId}`, '— data:', local);
      if (local) {
        saveUserHoldings(userId, local);
        setSavedHoldings(local);
        window.dispatchEvent(new CustomEvent('portfolio-saved'));
      }
      return;
    }

    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        // Sync cash from Supabase if localStorage doesn't have it
        if (data.cash?.amount > 0) {
          const localCash = parseFloat(localStorage.getItem('stockdash_cash_amount') || '0') || 0;
          if (!localCash) {
            setSavedCash(data.cash);
            localStorage.setItem('stockdash_cash_amount', String(data.cash.amount));
            localStorage.setItem('stockdash_cash_currency', data.cash.currency ?? 'USD');
          }
        }
        if (data.signedIn && data.holdings?.length) {
          console.log('[NavBar] Supabase holdings found:', data.holdings.length, 'positions');
          saveUserHoldings(userId, data.holdings);
          setSavedHoldings(data.holdings);
          window.dispatchEvent(new CustomEvent('portfolio-saved'));
        } else {
          // No Supabase record — use scoped localStorage if present
          const scopedKey = `holdings_${userId}`;
          const local = loadUserHoldings(userId);
          console.log('[NavBar] No Supabase data — reading key:', scopedKey, '— data:', local);
          if (local?.length) {
            saveUserHoldings(userId, local);
            setSavedHoldings(local);
            window.dispatchEvent(new CustomEvent('portfolio-saved'));
          } else {
            console.warn('[NavBar] No holdings found in Supabase or localStorage for key:', scopedKey);
          }
        }
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, user?.id]);

  // Load holdings from localStorage in demo mode
  useEffect(() => {
    if (!isDemo) return;
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) setSavedHoldings(JSON.parse(stored));
    } catch {}
  }, [isDemo]);

  async function savePortfolio(holdings, cash) {
    saveUserHoldings(user?.id, holdings);
    setSavedHoldings(holdings);
    // Persist cash to localStorage
    if (cash?.amount > 0) {
      localStorage.setItem('stockdash_cash_amount',  String(cash.amount));
      localStorage.setItem('stockdash_cash_currency', cash.currency ?? 'USD');
    } else {
      localStorage.removeItem('stockdash_cash_amount');
      localStorage.removeItem('stockdash_cash_currency');
    }
    setSavedCash(cash?.amount > 0 ? cash : null);
    if (isDemo) {
      window.dispatchEvent(new CustomEvent('portfolio-saved'));
      return;
    }
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings, cash: cash?.amount > 0 ? cash : null }),
    });
    if (!res.ok) throw new Error('Save failed');
    localStorage.setItem('portfolio_just_saved', 'true');
    window.location.reload();
  }

  function openModal() {
    const h = loadUserHoldings(user?.id);
    if (h) setSavedHoldings(h);
    const cashAmt = parseFloat(localStorage.getItem('stockdash_cash_amount') || '0') || 0;
    const cashCcy = localStorage.getItem('stockdash_cash_currency') || 'USD';
    setSavedCash(cashAmt > 0 ? { amount: cashAmt, currency: cashCcy } : null);
    setModalOpen(true);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('stockdash_theme', next ? 'dark' : 'light');
  }

  const showEditPortfolio = true;

  function handleEditPortfolioClick() {
    if (isSignedIn) {
      openModal();
    } else {
      openSignUp();
    }
  }

  const authSection = isLoaded && (
    isSignedIn ? (
      <UserButton afterSignOutUrl="/" />
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isDemo && (
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
        )}
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
      {/* Desktop top bar — nav links live in the sidebar */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          height: 44,
          boxShadow: '0 1px 4px var(--shadow-sm)',
        }}
        className="desktop-nav"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showEditPortfolio && (
            <button
              data-tour="edit-portfolio"
              onClick={handleEditPortfolioClick}
              style={{
                background: 'none', border: '1px solid var(--accent)',
                borderRadius: 6, color: 'var(--accent)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                padding: '4px 12px', whiteSpace: 'nowrap',
              }}>🛠 Edit Portfolio</button>
          )}
          {authSection}
        </div>
      </div>

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
                onClick={handleEditPortfolioClick}
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
                {!isDemo && (
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
                )}
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
          cash={savedCash}
          onSave={savePortfolio}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
