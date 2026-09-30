'use client';
// InfoTip — a small ⓘ next to a term that reveals a plain-language explanation.
//
//   Desktop : opens on hover AND on keyboard focus (Tab to the icon).
//   Mobile  : opens on tap; tapping outside (or Esc) closes it.
//
// The copy lives in lib/glossary.js. Pass a glossary key via `id`, or override with
// explicit `term` / `text` props.
//
//   <InfoTip id="twr" />
//   <InfoTip term="Custom" text="Explanation…" />
//
// Positioning: the popup is portalled to <body> and positioned with fixed coords that
// are clamped into the viewport (8px margin) and flipped above the icon when there's no
// room below — so it can never overflow the screen (checked at 390px) and is immune to
// ancestor transforms that would otherwise capture position:fixed.
import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '@/lib/glossary';

const MARGIN = 8;

export default function InfoTip({ id, term, text, size = 15, style }) {
  const entry = id ? GLOSSARY[id] : null;
  const title = term ?? entry?.term ?? null;
  const body  = text ?? entry?.text ?? '';

  const [open, setOpen]     = useState(false);
  const [coords, setCoords] = useState(null); // null until measured → render offscreen/hidden
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const tipId  = useId();

  const reposition = useCallback(() => {
    const btn = btnRef.current, pop = popRef.current;
    if (!btn || !pop) return;
    const b  = btn.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    // Horizontal: centre on the icon, then clamp fully inside the viewport.
    let left = b.left + b.width / 2 - pw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - pw - MARGIN));
    // Vertical: below the icon; flip above if it would spill past the bottom.
    let top = b.bottom + 6;
    if (top + ph > vh - MARGIN && b.top - ph - 6 >= MARGIN) top = b.top - ph - 6;
    setCoords({ left, top });
  }, []);

  // Measure once open (and keep pinned on scroll/resize).
  useEffect(() => {
    if (!open) { setCoords(null); return; }
    reposition();
    const onMove = () => reposition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, reposition]);

  // Outside tap / Esc closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!body) return null;

  const popup = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popRef}
      id={tipId}
      role="tooltip"
      style={{
        position:     'fixed',
        left:         coords ? coords.left : -9999,
        top:          coords ? coords.top  : -9999,
        visibility:   coords ? 'visible' : 'hidden',
        zIndex:       1000,
        maxWidth:     'min(320px, calc(100vw - 16px))',
        background:   'var(--bg-card)',
        border:       '1px solid var(--border-strong)',
        borderRadius: 8,
        padding:      '10px 12px',
        fontSize:     13,
        lineHeight:   1.5,
        color:        'var(--text-primary)',
        boxShadow:    '0 8px 24px rgba(0,0,0,0.4)',
        whiteSpace:   'normal',
        textAlign:    'left',
        fontWeight:   400,
      }}
    >
      {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      <div style={{ color: 'var(--text-primary)' }}>{body}</div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={title ? `What is ${title}?` : 'More information'}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          justifyContent: 'center',
          verticalAlign:  'middle',
          width:          size,
          height:         size,
          marginLeft:     4,
          padding:        0,
          border:         'none',
          background:     'transparent',
          color:          open ? 'var(--accent)' : 'var(--text-secondary)',
          cursor:         'pointer',
          borderRadius:   '50%',
          flex:           '0 0 auto',
          lineHeight:     0,
          ...style,
        }}
      >
        {/* Inline SVG (a graphic, not a text node) — meets non-text contrast and keeps
            the AA text-contrast audit clean. currentColor follows the button color. */}
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.6" r="0.95" fill="currentColor" />
          <rect x="7.15" y="6.8" width="1.7" height="5" rx="0.85" fill="currentColor" />
        </svg>
      </button>
      {popup}
    </>
  );
}
