'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ROUTES } from '@/app/(v2)/_lib/routes';

const TILES = [
  { id: 'insider',      label: 'Insider',      emoji: '🔎', desc: 'Officer & exec trades',       href: ROUTES.insider },
  { id: 'ownership',    label: 'Ownership',    emoji: '🏛',  desc: 'Institutional holders',       href: ROUTES.ownership },
  { id: 'peers',        label: 'Peers',        emoji: '📋', desc: 'Industry comparison',          href: ROUTES.peers },
  { id: 'research',     label: 'Research',     emoji: '📑', desc: 'SEC filings & docs',           href: ROUTES.research },
  { id: 'correlations', label: 'Correlations', emoji: '🔗', desc: 'How positions move together',  href: ROUTES.correlations },
];

export default function QuickJumpTiles() {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
      gap: 10,
    }}>
      {TILES.map(tile => (
        <Link
          key={tile.id}
          href={tile.href}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 6,
            padding: '12px 14px',
            border: hovered === tile.id
              ? '1px solid var(--accent, #58a6ff)'
              : '1px solid var(--border-color)',
            borderRadius: 8,
            background: hovered === tile.id
              ? 'var(--bg-card-hover, rgba(88,166,255,0.06))'
              : 'var(--bg-secondary, rgba(255,255,255,0.02))',
            textDecoration: 'none',
            color: 'var(--text-primary)',
            transform: hovered === tile.id ? 'translateY(-2px)' : 'translateY(0)',
            transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease',
            cursor: 'pointer',
          }}
          onMouseEnter={() => setHovered(tile.id)}
          onMouseLeave={() => setHovered(null)}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>{tile.emoji}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{tile.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tile.desc}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
