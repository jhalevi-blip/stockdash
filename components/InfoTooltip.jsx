'use client';
import { useState, useEffect, useRef } from 'react';

export default function InfoTooltip({ text, children, placement = 'bottom', style, boxStyle }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(v => !v);
    }
  }

  return (
    <div
      ref={wrapperRef}
      role="button"
      tabIndex={0}
      style={{
        position: 'relative',
        flex:     '1 1 180px',
        minWidth: 0,
        cursor:   'help',
        ...style,
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
      onKeyDown={handleKeyDown}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          style={{
            position:     'absolute',
            [placement === 'top' ? 'bottom' : 'top']: 'calc(100% + 8px)',
            left:         0,
            zIndex:       100,
            background:   'var(--bg-card)',
            border:       '1px solid var(--border-strong)',
            borderRadius: 8,
            padding:      '12px 14px',
            fontSize:     13,
            color:        'var(--text-primary)',
            lineHeight:   1.5,
            maxWidth:     360,
            boxShadow:    '0 8px 24px rgba(0,0,0,0.4)',
            whiteSpace:   'normal',
            ...boxStyle,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
