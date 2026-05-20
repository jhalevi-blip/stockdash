'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import Dot from './Dot';
import { PORTFOLIO } from '@/app/(v2)/dashboard-v2/_lib/mockData';

const RECENT_KEY = 'recent_research_tickers';
const MAX_RECENT = 5;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; } catch { return []; }
}
function addRecent(symbol) {
  try {
    const prev = getRecent().filter(s => s !== symbol);
    localStorage.setItem(RECENT_KEY, JSON.stringify([symbol, ...prev].slice(0, MAX_RECENT)));
  } catch {}
}

export default function Topbar({ onCommand }) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [open,        setOpen]        = useState(false);
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recent,      setRecent]      = useState([]);

  const inputRef    = useRef(null);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Global ⌘K / Ctrl+K to open
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Focus input when opened; load recent tickers
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIdx(0);
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Debounced search
  const doSearch = useCallback((q) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/ticker-search?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setResults(Array.isArray(json) ? json.slice(0, 5) : []);
      } catch {
        setResults([]);
      }
      setLoading(false);
      setSelectedIdx(0);
    }, 220);
  }, []);

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    doSearch(q);
  }

  // Keyboard navigation within palette
  function handleKeyDown(e) {
    const list = query.trim() ? results : recent.map(s => ({ symbol: s, name: '', exchange: '' }));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = list[selectedIdx];
      if (item) navigate(item.symbol);
    }
  }

  function navigate(symbol) {
    addRecent(symbol);
    setOpen(false);
    router.push(`/research?ticker=${symbol}`);
  }

  const displayList = query.trim()
    ? results
    : recent.map(s => ({ symbol: s, name: 'Recent', exchange: '' }));

  return (
    <>
      {/* Topbar */}
      <div className="v2-topbar" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Search trigger */}
          <button
            onClick={() => setOpen(true)}
            style={{
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
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ opacity: .6 }}>🔎</span>
            <span style={{ flex: 1 }}>Search ticker…</span>
            <span className="v2-topbar-desktop-only" style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              border: '1px solid var(--border-color)',
              padding: '1px 5px',
              borderRadius: 3,
            }}>⌘K</span>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span className="v2-topbar-desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Dot color="var(--positive)" /> Market open
          </span>
          <span className="v2-topbar-desktop-only" style={{ color: 'var(--text-muted)' }}>·</span>
          <span className="v2-topbar-desktop-only" style={{ fontVariantNumeric: 'tabular-nums' }}>{PORTFOLIO.asOf}</span>
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

        {/* Auth UI — mirrors V1 NavBar pattern */}
        {isLoaded && !isSignedIn && (
          <>
            <SignInButton mode="modal">
              <button style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '6px 12px',
              }}>Sign In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button style={{
                background: '#2563eb',
                border: '1px solid #2563eb',
                borderRadius: 6,
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '6px 12px',
              }}>Sign Up</button>
            </SignUpButton>
          </>
        )}
        {isLoaded && isSignedIn && (
          <UserButton afterSignOutUrl="/" />
        )}
      </div>

      {/* Command palette overlay */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 80,
        }}>
          <div
            ref={containerRef}
            style={{
              width: '100%', maxWidth: 500,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
            }}
          >
            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 16 }}>🔎</span>
              <input
                ref={inputRef}
                value={query}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Search ticker or company…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: 14, color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              />
              {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>…</span>}
              <kbd style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '1px 6px', borderRadius: 4, cursor: 'pointer' }}
                onClick={() => setOpen(false)}>Esc</kbd>
            </div>

            {/* Results / Recent */}
            {displayList.length > 0 && (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {!query.trim() && recent.length > 0 && (
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Recent
                  </div>
                )}
                {displayList.map((item, i) => (
                  <button
                    key={item.symbol + i}
                    onClick={() => navigate(item.symbol)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '10px 16px',
                      background: i === selectedIdx ? 'var(--bg-hover)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', minWidth: 56 }}>
                      {item.symbol}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                    {item.exchange && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{item.exchange}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {query.trim() && !loading && results.length === 0 && (
              <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                No results for "{query}"
              </div>
            )}

            {/* Footer hint */}
            <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 12, borderTop: '1px solid var(--border-color)' }}>
              <span><kbd style={{ border: '1px solid var(--border-color)', padding: '1px 4px', borderRadius: 3 }}>↑↓</kbd> navigate</span>
              <span><kbd style={{ border: '1px solid var(--border-color)', padding: '1px 4px', borderRadius: 3 }}>↵</kbd> open</span>
              <span><kbd style={{ border: '1px solid var(--border-color)', padding: '1px 4px', borderRadius: 3 }}>Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
