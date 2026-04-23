'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const links = [
  { href: '/dashboard',      label: 'Dashboard',   icon: '📊' },
  { href: '/performance',    label: 'Performance', icon: '📈' },
  { href: '/macro',          label: 'Macro',       icon: '🌏', dataTour: 'macro-link' },
  { href: '/insider',        label: 'Insider',     icon: '🔎', dataTour: 'insider-link' },
  { href: '/institutional',  label: 'Ownership',   icon: '🏛', dataTour: 'ownership-link' },
  { href: '/peers',          label: 'Peers',       icon: '📋' },
  { href: '/research',       label: 'Research',    icon: '📑' },
  { href: '/valuation',      label: 'Valuation',   icon: '📐' },
  { href: '/earnings',       label: 'Earnings',    icon: '📅' },
  { href: '/analyst-ratings', label: 'Analyst',    icon: '🎯' },
  { href: '/analyst',        label: 'Short Int.',  icon: '📉' },
];

export default function Sidebar() {
  const path = usePathname();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(localStorage.getItem('stockdash_theme') !== 'light');
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('stockdash_theme', next ? 'dark' : 'light');
  }

  return (
    <nav className="app-sidebar" data-tour="nav-tabs">

      {/* Logo */}
      <Link href="/dashboard" className="sidebar-logo" style={{ textDecoration: 'none' }}>
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

      {/* Nav links */}
      <div className="sidebar-links">
        {links.map(l => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`sidebar-link${active ? ' sidebar-link-active' : ''}`}
              {...(l.dataTour ? { 'data-tour': l.dataTour } : {})}
            >
              <span className="sidebar-link-icon">{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Theme toggle at bottom */}
      <div className="sidebar-footer">
        <button onClick={toggleTheme} className="sidebar-theme-btn">
          <span>{dark ? '🌙' : '🌔'}</span>
          <span>{dark ? 'Dark' : 'Light'}</span>
        </button>
      </div>

    </nav>
  );
}
