'use client';

import { useEffect, useState } from 'react';
import { MACRO } from '../_lib/mockData';
import { fmtPct, colorForChange } from '@/app/(v2)/_lib/format';
import Sparkline from '@/app/(v2)/_components/Sparkline';

function transformMacro(json) {
  const { indices, treasury } = json;
  const items = [];

  const fmt = (n, dec = 2) =>
    n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const fmtAbs = (n, dec = 2) => {
    if (n == null) return '';
    return (n >= 0 ? '+' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  if (indices?.SPY) {
    const d = indices.SPY;
    items.push({ label: 'S&P 500',   value: fmt(d.price),  change: d.changesPercentage, changeAbs: fmtAbs(d.change), sparkKey: 'SPY' });
  }
  if (indices?.DIA) {
    const d = indices.DIA;
    items.push({ label: 'Dow',       value: fmt(d.price),  change: d.changesPercentage, changeAbs: fmtAbs(d.change), sparkKey: 'DJI' });
  }
  if (indices?.VIX) {
    const d = indices.VIX;
    items.push({ label: 'VIX',       value: fmt(d.price),  change: d.changesPercentage, changeAbs: fmtAbs(d.change), sparkKey: 'VIX' });
  }
  if (json.commodities?.oil?.price != null) {
    const d = json.commodities.oil;
    items.push({ label: 'WTI', value: fmt(d.price), change: d.changesPercentage, changeAbs: fmtAbs(d.change), sparkKey: 'OIL' });
  }
  if (treasury?.year10 != null) {
    items.push({ label: '10Y Yield', value: `${treasury.year10.toFixed(2)}%`, change: 0, changeAbs: '', sparkKey: 'TNX' });
  }
  if (json.fearGreed?.score != null) {
    const fg = json.fearGreed;
    const fgColor = /extreme greed/i.test(fg.rating) || /\bgreed\b/i.test(fg.rating)
      ? 'var(--positive)'
      : /extreme fear/i.test(fg.rating) || /\bfear\b/i.test(fg.rating)
      ? 'var(--negative)'
      : 'var(--text-muted)';
    items.push({ label: 'Fear & Greed', value: String(Math.round(fg.score)), change: 0, changeAbs: fg.rating ?? '', color: fgColor });
  }

  return items;
}

export default function MacroStrip({ onIndexClick }) {
  const [data,   setData]   = useState(null);
  const [sparks, setSparks] = useState(null);

  useEffect(() => {
    fetch('/api/macro')
      .then(r => r.json())
      .then(json => {
        if (json.error) return;
        const items = transformMacro(json);
        if (items.length) setData(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/macro-sparks')
      .then(r => r.json())
      .then(json => setSparks(json))
      .catch(() => {});
  }, []);

  const list = data ?? MACRO;

  return (
    <div className="dv2-macro-scroll">
    <div className="dv2-macro-grid" style={{
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      {list.map(m => (
        <button key={m.label} onClick={() => onIndexClick?.(m.label)} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: '9px 10px',
          background: 'var(--bg-card)',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          transition: 'background .2s',
        }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-card)'}>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>{m.label}</span>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>{m.value}</span>
          {m.sparkKey && sparks?.[m.sparkKey]?.length > 0
            ? <Sparkline data={sparks[m.sparkKey]} width={80} height={16} strokeWidth={1} />
            : <div style={{ height: 16 }} />
          }
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: m.color ?? colorForChange(m.change),
            fontVariantNumeric: 'tabular-nums',
          }}>{m.changeAbs}{m.change !== 0 && ` (${fmtPct(m.change)})`}</span>
        </button>
      ))}
    </div>
    </div>
  );
}
