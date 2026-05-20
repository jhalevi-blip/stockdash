'use client';

import { useState, useEffect } from 'react';

export default function DebugOverlay() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    function collect() {
      const sidebarEl = document.querySelector('.v2-sidebar');
      setInfo({
        width: window.innerWidth,
        sidebarExists: !!sidebarEl,
        sidebarDisplay: sidebarEl
          ? window.getComputedStyle(sidebarEl).display
          : 'n/a',
        mediaMatch: window.matchMedia('(max-width: 768px)').matches,
        ua: navigator.userAgent.slice(0, 60),
      });
    }
    collect();
    window.addEventListener('resize', collect);
    return () => window.removeEventListener('resize', collect);
  }, []);

  if (!info) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 8,
      background: 'rgba(255,255,0,0.95)',
      color: '#000',
      fontFamily: 'monospace',
      fontSize: 10,
      padding: '6px 8px',
      borderRadius: 4,
      zIndex: 9999,
      maxWidth: '50vw',
      wordWrap: 'break-word',
      lineHeight: 1.5,
    }}>
      {`w=${info.width}px`}{'\n'}
      {`sidebar exists=${String(info.sidebarExists)}`}{'\n'}
      {`sidebar display=${info.sidebarDisplay}`}{'\n'}
      {`(max-width:768px)=${String(info.mediaMatch)}`}{'\n'}
      {`ua=${info.ua}`}
    </div>
  );
}
