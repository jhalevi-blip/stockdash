'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import Logo from './Logo';

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
      <div className="sidebar-logo">
        <Logo />
      </div>

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
        <Link href="/privacy" style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', padding: '8px 0 0' }}>
          Privacy Policy
        </Link>
      </div>

    </nav>
  );
}
