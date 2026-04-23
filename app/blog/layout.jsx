import Logo from '@/components/Logo';
import Link from 'next/link';

export default function BlogLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 48,
        borderBottom: '1px solid #21262d',
      }}>
        <Logo />
        <Link href="/blog" style={{ color: '#8b949e', fontSize: 13, textDecoration: 'none' }}>Blog</Link>
      </nav>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px', width: '100%' }}>
        {children}
      </main>
    </div>
  );
}
