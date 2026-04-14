'use client';
import { useState } from 'react';

const iStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 4,
  color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, width: '100%',
  outline: 'none', boxSizing: 'border-box',
};

export default function PortfolioModal({ holdings, cash, onSave, onClose }) {
  const initial = holdings.length
    ? holdings.map(h => ({ t: h.t ?? '', s: h.s ?? 0, c: h.c ?? 0, d: h.d ?? '' }))
    : [{ t: '', s: 0, c: 0, d: '' }];

  const [rows,         setRows]         = useState(initial);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [cashAmount,   setCashAmount]   = useState(cash?.amount   ?? 0);
  const [cashCurrency, setCashCurrency] = useState(cash?.currency ?? 'USD');

  const handleSave = async () => {
    const valid = rows.filter(r => r.t.trim());
    if (!valid.length) { setError('Add at least one ticker.'); return; }

    const parsed = valid.map(r => ({
      t: r.t.trim().toUpperCase(),
      s: r.s,
      c: r.c,
      ...(r.d ? { d: r.d } : {}),
    }));
    console.log('[PortfolioModal] saving holdings:', JSON.stringify(parsed));

    const cashData = cashAmount > 0 ? { amount: cashAmount, currency: cashCurrency } : null;

    setSaving(true);
    setError('');
    try {
      await onSave(parsed, cashData);
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 8,
        width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto',
        padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>My Portfolio</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Add your holdings to track your portfolio</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer', lineHeight: 1, marginLeft: 12, flexShrink: 0 }}>✕</button>
        </div>

        {/* Cash Position */}
        <div style={{
          marginBottom: 18, padding: '12px 16px',
          background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Cash Position
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={String(cashAmount || '')}
              onChange={e => setCashAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              type="number"
              min="0"
              step="0.01"
              style={{ ...iStyle, width: 140 }}
            />
            <select
              value={cashCurrency}
              onChange={e => setCashCurrency(e.target.value)}
              style={{ ...iStyle, width: 72 }}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Cash in brokerage account (added to Portfolio Value &amp; Cost Basis)
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 116px 28px', gap: 8, marginBottom: 6 }}>
          {['Ticker', 'Shares', 'Avg Cost ($)'].map(h => (
            <div key={h} style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>Date bought <span style={{ fontStyle: 'italic' }}>(optional)</span></div>
          <div />
        </div>

        {rows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 116px 28px', gap: 8, marginBottom: 8 }}>
            <input
              value={row.t}
              onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, t: e.target.value } : x))}
              placeholder="NVDA"
              style={iStyle}
            />
            <input
              value={String(row.s ?? '')}
              onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, s: parseFloat(e.target.value) || 0 } : x))}
              placeholder="100"
              type="number"
              min="0"
              style={iStyle}
            />
            <input
              value={String(row.c ?? '')}
              onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, c: parseFloat(e.target.value) || 0 } : x))}
              placeholder="50.00"
              type="number"
              min="0"
              step="0.01"
              style={iStyle}
            />
            <input
              value={row.d ?? ''}
              onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, d: e.target.value } : x))}
              type="date"
              style={{
                ...iStyle,
                border: '1px solid var(--border-color)',
                color: row.d ? 'var(--text-primary)' : 'var(--text-muted)',
                colorScheme: 'dark',
              }}
            />
            <button
              onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 15, cursor: 'pointer', padding: 0, alignSelf: 'center' }}
            >✕</button>
          </div>
        ))}

        <button
          onClick={() => setRows(r => [...r, { t: '', s: 0, c: 0, d: '' }])}
          style={{
            background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 4,
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
            padding: '6px 12px', width: '100%', marginTop: 4, marginBottom: 18,
          }}
        >+ Add ticker</button>

        {error && <div style={{ color: 'var(--negative)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border-strong)', borderRadius: 4, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', padding: '7px 14px' }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: '#2563eb', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', padding: '7px 16px', opacity: saving ? 0.7 : 1 }}
          >{saving ? 'Saving…' : 'Save Portfolio'}</button>
        </div>
      </div>
    </div>
  );
}
