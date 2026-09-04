'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import Dot from './Dot';
import { NAV_ITEMS } from '../_lib/routes';
import { getMarketStatus } from '@/lib/marketStatus';
import { FLAGSHIP_LABEL } from '@/lib/aiModels';

// Compact ET time for the footer status line, e.g. "10:47 AM ET".
function etTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date) + ' ET';
}

export default function Sidebar() {
  const pathname = usePathname();

  // Live market status — mount-gated (null until mounted) to avoid an SSR/client
  // hydration mismatch, then ticks once a minute. Replaces the old hardcoded clock.
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const status = now ? getMarketStatus(now) : null;

  // Desktop collapse (icons-only, ~48px). Persisted in localStorage; mount-gated read to
  // avoid an SSR/client hydration mismatch (same pattern as the clock above). Below 768px
  // the whole sidebar is display:none and the mobile drawer takes over, so this only ever
  // affects desktop. The content column is flex:1, so it reflows into the reclaimed width.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem('v2_sidebar_collapsed') === '1');
  }, []);
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem('v2_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  return (
    <aside className="v2-sidebar" style={{
      width: collapsed ? 48 : 208,
      flexShrink: 0,
      background: 'var(--bg-page-deep)',
      borderRight: '1px solid var(--border-color)',
      padding: '16px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      overflow: 'hidden',
      transition: 'width .15s ease',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        padding: collapsed ? '0 6px 14px' : '0 16px 14px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
      }}>
        {!collapsed && <Logo size={22} />}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            flexShrink: 0, width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)', borderRadius: 6,
            cursor: 'pointer', fontSize: 13, lineHeight: 1,
          }}
        >{collapsed ? '»' : '«'}</button>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', padding: collapsed ? '10px 6px' : '10px 8px', gap: 1 }}>
        {NAV_ITEMS.map(item => {
          // /dashboard should be the active item when we're on /dashboard itself
          const isActive = item.id === 'dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.id} href={item.id === 'dashboard' ? '/dashboard' : item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '8px 0' : '8px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'background .2s, color .2s',
              }}>
              <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.emoji}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div style={{
        marginTop: 'auto',
        padding: collapsed ? '12px 0' : '12px 16px',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'stretch',
        gap: 6,
      }}>
        <div
          title={collapsed && status ? `${status.label} · ${etTime(now)}` : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          {status ? (
            <>
              <Dot color={status.isOpen ? 'var(--positive)' : 'var(--text-muted)'} />
              {!collapsed && <span>{status.label} · {etTime(now)}</span>}
            </>
          ) : (
            <>
              <Dot color="var(--text-muted)" />
              {!collapsed && <span>—</span>}
            </>
          )}
        </div>
        {!collapsed && (
          <div style={{ color: 'var(--text-faint, rgba(230,237,243,0.45))' }}>
            Powered by Claude {FLAGSHIP_LABEL}
          </div>
        )}
      </div>
    </aside>
  );
}
