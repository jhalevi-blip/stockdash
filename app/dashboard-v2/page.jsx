'use client';

export default function DashboardV2Page() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      padding: '40px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
        Dashboard v2 — foundation
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
        Phase A complete. Modules will land here in Phase B.
      </p>
    </main>
  );
}
