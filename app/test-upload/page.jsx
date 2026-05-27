'use client';
import { useState } from 'react';
import UnifiedUpload from '@/components/UnifiedUpload';

export default function TestUpload() {
  const [lastEvent, setLastEvent] = useState(null);
  return (
    <div style={{ padding: 40, maxWidth: 900, margin: '0 auto' }}>
      <h1>UnifiedUpload integration test</h1>
      <p style={{ color: '#8b949e' }}>
        Throwaway page for testing /api/upload + UnifiedUpload before
        File 7 wires the real consumer. Delete before Stage 1 cleanup.
      </p>
      <UnifiedUpload
        onHoldings={(holdings, mode, meta) => {
          console.log('[onHoldings]', { count: holdings.length, mode, meta });
          setLastEvent({ type: 'holdings', count: holdings.length, mode, meta });
        }}
        onTransactions={(results) => {
          console.log('[onTransactions]', results);
          setLastEvent({ type: 'transactions', positions: results.positions?.length, totalPnl: results.totalPnl });
        }}
      />
      {lastEvent && (
        <pre style={{ marginTop: 20, padding: 12, background: '#0d1117',
                      border: '1px solid #30363d', borderRadius: 6,
                      color: '#c9d1d9', fontSize: 12 }}>
          {JSON.stringify(lastEvent, null, 2)}
        </pre>
      )}
    </div>
  );
}
