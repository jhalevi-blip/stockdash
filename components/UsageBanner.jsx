'use client';
import { useEffect, useState } from 'react';

export default function UsageBanner() {
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.json())
      .then(data => {
        const fmpHigh      = data?.fmp?.count     >= data?.fmp?.alertAt;
        const finnhubSpike = data?.finnhub?.count >= data?.finnhub?.alertAt;

        if (fmpHigh && finnhubSpike) {
          setBanner('FMP & Finnhub API limits near — some data may be unavailable today.');
        } else if (fmpHigh) {
          setBanner(`FMP API limit near (${data.fmp.count}/${data.fmp.limit} calls today) — some data may be unavailable.`);
        } else if (finnhubSpike) {
          setBanner(`Finnhub API rate spiking (${data.finnhub.count}/${data.finnhub.limit} calls/min) — some data may be delayed.`);
        }
      })
      .catch(() => {});
  }, []);

  if (!banner) return null;

  return (
    <div style={{
      background: '#422006',
      borderBottom: '1px solid #78350f',
      color: '#fef3c7',
      fontSize: 12,
      fontWeight: 500,
      padding: '7px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <span>⚠️ {banner}</span>
      <button
        onClick={() => setBanner(null)}
        style={{ background: 'none', border: 'none', color: '#fef3c7', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
        aria-label="Dismiss"
      >✕</button>
    </div>
  );
}
