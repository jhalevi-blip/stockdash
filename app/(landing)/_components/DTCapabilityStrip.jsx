'use client';
import { useState } from 'react';
import { CAPABILITIES } from '@/lib/dTerminalCapabilities';

export default function DTCapabilityStrip() {
  const [hovered, setHovered] = useState(null);

  return (
    <section style={{ padding: '80px 24px' }}>
      <style>{`
        .dt-cap-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }
        @media (max-width: 900px) {
          .dt-cap-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 500px) {
          .dt-cap-grid { grid-template-columns: repeat(1, 1fr); }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Eyebrow */}
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          color: '#3b82f6', textTransform: 'uppercase',
          textAlign: 'center', marginBottom: 12,
        }}>
          Everything you need to research
        </div>

        {/* Headline */}
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#e6edf3',
          letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 12px',
        }}>
          Ten dashboards. One portfolio. Free.
        </h2>

        {/* Sub */}
        <p style={{
          fontSize: 16, color: 'rgba(230,237,243,0.6)', lineHeight: 1.6,
          textAlign: 'center', maxWidth: 600, margin: '0 auto 48px',
        }}>
          From insider transactions to AI-powered research — every dashboard a Bloomberg user expects, free for retail investors.
        </p>

        {/* 5×2 grid */}
        <div className="dt-cap-grid">
          {CAPABILITIES.map((cap, i) => (
            <div
              key={cap.name}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '20px 18px',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${hovered === i ? '#3b82f6' : '#1e2530'}`,
                borderRadius: 8,
                transform: hovered === i ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'border-color 0.15s ease, transform 0.15s ease',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 10, lineHeight: 1 }}>{cap.icon}</div>
              <div style={{
                fontSize: 14, fontWeight: 700, color: '#e6edf3',
                marginBottom: 6, letterSpacing: '-0.01em',
              }}>
                {cap.name}
              </div>
              <div style={{
                fontSize: 12, color: 'rgba(230,237,243,0.6)', lineHeight: 1.5,
              }}>
                {cap.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
