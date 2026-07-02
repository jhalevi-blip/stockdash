import { ImageResponse } from 'next/og';
import { loadInterFonts } from '@/lib/og-fonts';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function LogoMark({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none">
      <rect x="1" y="14" width="4" height="6" rx="0.5" fill="#c49a1a" />
      <rect x="8" y="9" width="4" height="11" rx="0.5" fill="#c49a1a" />
      <rect x="15" y="4" width="4" height="16" rx="0.5" fill="#c49a1a" />
      <path d="M2 12 L10 6 L17.5 0.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default async function Image() {
  const fonts = loadInterFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: '#0d1117',
          border: '1px solid #21262d',
          padding: '80px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* ── Wordmark ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={22} />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#c49a1a', fontWeight: 700, fontSize: 18, letterSpacing: '0.06em' }}>
              STOCK
            </span>
            <span style={{ color: '#2563eb', fontWeight: 700, fontSize: 18, letterSpacing: '0.06em' }}>
              DASHES
            </span>
          </div>
        </div>

        {/* ── Title + subtitle ── */}
        <div style={{ display: 'flex', flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: '#f0f6fc', fontSize: 60, fontWeight: 700, lineHeight: 1.15 }}>
            StockDashes Blog
          </div>
          <div style={{ color: '#8b949e', fontSize: 28, fontWeight: 400, marginTop: 20 }}>
            Guides on portfolio analysis and AI-powered investing
          </div>
        </div>

        {/* ── Bottom row: domain left, logo mark right ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#8b949e', fontSize: 24, fontWeight: 400 }}>
            stockdashes.com
          </span>
          <LogoMark size={96} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
