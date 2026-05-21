'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '../_lib/routes';
import Logo from './Logo';

export default function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function close() { setOpen(false); }

  return (
    <>
      {/* Hamburger button — floats over content, visible only at ≤768px via CSS */}
      <button
        className="v2-hamburger"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? '✕' : '☰'}
      </button>

      {/* Backdrop — conditionally rendered when open */}
      {open && (
        <div
          className="v2-drawer-backdrop"
          aria-hidden="true"
          onClick={close}
        />
      )}

      {/* Drawer — always in DOM, slide controlled by CSS class */}
      {/* TODO: add focus trap for full keyboard accessibility (v2) */}
      <nav
        className={`v2-drawer${open ? ' v2-drawer--open' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--border-color)' }}>
          <Logo size={22} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 1 }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.id === 'dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.id}
                href={item.id === 'dashboard' ? '/dashboard' : item.href}
                onClick={close}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background .2s, color .2s',
                }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
