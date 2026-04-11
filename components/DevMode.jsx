'use client';
import { useEffect, useState } from 'react';

export default function DevMode() {
  const [toast, setToast] = useState(null); // 'on' | 'off' | null

  useEffect(() => {
    function handleKey(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const next = localStorage.getItem('dev_mode') !== 'true';
        if (next) {
          localStorage.setItem('dev_mode', 'true');
          document.documentElement.setAttribute('data-va-disable', 'true');
        } else {
          localStorage.removeItem('dev_mode');
          document.documentElement.removeAttribute('data-va-disable');
        }
        setToast(next ? 'on' : 'off');
        setTimeout(() => setToast(null), 3000);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!toast) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: toast === 'on' ? '#1a3a2a' : '#2a1a1a',
      border: `1px solid ${toast === 'on' ? '#3fb950' : '#f85149'}`,
      borderRadius: 8, padding: '10px 16px',
      fontSize: 13, fontWeight: 600,
      color: toast === 'on' ? '#3fb950' : '#f85149',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
    }}>
      Dev mode {toast === 'on' ? 'ON — analytics tracking disabled' : 'OFF — analytics tracking enabled'}
    </div>
  );
}
