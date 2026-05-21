'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import Dot from './Dot';
import { NAV_ITEMS } from '../_lib/routes';

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="v2-sidebar" style={{
      width: 208,
      flexShrink: 0,
      background: 'var(--bg-page-deep)',
      borderRight: '1px solid var(--border-color)',
      padding: '16px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ padding: '0 16px 14px', borderBottom: '1px solid var(--border-color)' }}>
        <Logo size={22} />
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', padding: '10px 8px', gap: 1 }}>
        {NAV_ITEMS.map(item => {
          // /dashboard should be the active item when we're on /dashboard itself
          const isActive = item.id === 'dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.id} href={item.id === 'dashboard' ? '/dashboard' : item.href} style={{
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
            }}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.emoji}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div style={{
        marginTop: 'auto',
        padding: '12px 16px',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dot color="var(--positive)" />
          <span>Live · 4:00 PM ET</span>
        </div>
        <div style={{ color: 'var(--text-faint, rgba(230,237,243,0.45))' }}>
          Powered by Claude Opus 4.7
        </div>
      </div>
    </aside>
  );
}
