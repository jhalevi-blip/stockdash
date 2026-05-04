'use client';

import Sidebar from './_components/Sidebar';
import Topbar from './_components/Topbar';

// V2 layout — owns its own chrome (Sidebar + Topbar). Opts out of
// app/layout.jsx's AppShell via the AUTH_PATHS list in
// components/AppShell.jsx.
export default function DashboardV2Layout({ children }) {
  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
    }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
        {children}
      </div>
    </div>
  );
}
