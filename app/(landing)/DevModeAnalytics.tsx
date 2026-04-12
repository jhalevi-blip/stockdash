'use client';

import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';

export default function DevModeAnalytics() {
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    setDevMode(localStorage.getItem('devMode') === 'true');

    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setDevMode(prev => {
          const next = !prev;
          localStorage.setItem('devMode', String(next));
          return next;
        });
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <Analytics disabled={devMode} />
      {devMode && (
        <div
          title="Dev mode — analytics disabled (Ctrl+Shift+D to toggle)"
          style={{
            position: 'fixed',
            bottom: 8,
            right: 8,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#f59e0b',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
