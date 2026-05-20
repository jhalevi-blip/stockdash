'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ROUTES } from '@/app/(v2)/_lib/routes';

const TILES = [
  { id: 'earnings', label: 'Next Earnings',     emoji: '📅', desc: 'See upcoming earnings dates for your holdings', href: ROUTES.earnings },
  { id: 'analyst',  label: 'Analyst Targets',   emoji: '🎯', desc: 'Price targets and consensus ratings',          href: ROUTES.analyst },
  { id: 'insider',  label: 'Insider Activity',  emoji: '🔎', desc: 'Recent insider buying and selling',            href: ROUTES.insider },
  { id: 'shorts',   label: 'Most Shorted',      emoji: '📉', desc: 'Stocks with the highest short interest',      href: ROUTES.shorts },
];

export default function QuickJumpTiles() {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="dv2-tiles-grid">
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
