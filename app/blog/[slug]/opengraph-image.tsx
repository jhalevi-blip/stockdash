import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { loadInterFonts } from '@/lib/og-fonts';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const POSTS_DIR = path.join(process.cwd(), 'content/blog');

function getPostFrontmatter(slug: string) {
  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data } = matter(raw);
  return data;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

// Logo mark SVG — inlined from components/Logo.jsx.
// Satori compatibility verified: rect, path (M/L coords), fill, stroke,
// strokeWidth, strokeLinecap, strokeLinejoin. No gradients/filters/transforms.
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

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const frontmatter = getPostFrontmatter(slug);
  const fonts = loadInterFonts();

  const title: string = frontmatter.title ?? '';
  const titleFontSize = title.length <= 60 ? 60 : title.length <= 90 ? 52 : 44;

  const dateStr = formatDate(frontmatter.date);
  const readTime: number | undefined = frontmatter.summary?.read_time_minutes;
  const metaStr = readTime ? `${dateStr} · ${readTime} min read` : dateStr;

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
        {/* gap:8 between SVG and text block; STOCK+DASHES share an inner
            container with no gap so only letter-spacing separates the two
            halves — prevents satori's flex-gap + trailing letter-spacing
            compounding that makes them read as two separate words */}
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

        {/* ── Title — grows to fill remaining vertical space ── */}
        <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center' }}>
          <div
            style={{
              color: '#f0f6fc',
              fontSize: titleFontSize,
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: 900,
            }}
          >
            {title}
          </div>
        </div>

        {/* ── Bottom row: meta left, logo mark right ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#8b949e', fontSize: 24, fontWeight: 400 }}>
            {metaStr}
          </span>
          <LogoMark size={96} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
