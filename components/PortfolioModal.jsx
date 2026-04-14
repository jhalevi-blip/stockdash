'use client';
import { useState } from 'react';

const iStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', padding: '10px 14px', fontSize: 14, width: '100%',
  outline: 'none', boxSizing: 'border-box',
};

const COLS = '2fr 150px 170px 190px 40px';

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
        background: 'rgba(0,0,0,0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12,
        width: '90vw', maxWidth: 1200,
        height: '85vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>

        {/* ── Header (fixed) ── */}
        <div style={{ padding: '28px 36px 0', flexShrink: 0 }}>

          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>My Portfolio</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                Add your holdings — ticker, number of shares, average cost in USD, and optional purchase date
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid var(--border-color)', borderRadius: 6,
                color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
                lineHeight: 1, marginLeft: 16, flexShrink: 0,
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>

          {/* Cash Position */}
          <div style={{
            marginBottom: 24, padding: '16px 20px',
            background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Cash Position
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={String(cashAmount || '')}
                onChange={e => setCashAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                type="number"
                min="0"
                step="0.01"
                style={{ ...iStyle, width: 200 }}
              />
              <select
                value={cashCurrency}
                onChange={e => setCashCurrency(e.target.value)}
                style={{ ...iStyle, width: 100 }}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Cash held in brokerage — shown as a separate card on the dashboard, excluded from P&amp;L
              </span>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
            {['Ticker', 'Shares', 'Avg Cost (USD)', 'Date Bought (optional)', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable holdings list ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 36px 0' }}>
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: 12,
                marginBottom: 10, alignItems: 'center',
              }}
            >
              <input
                value={row.t}
                onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, t: e.target.value } : x))}
                placeholder="NVDA"
                style={{ ...iStyle, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}
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
                style={{
                  background: 'none', border: '1px solid var(--border-color)', borderRadius: 6,
                  color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
                  width: 36, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--negative)'; e.currentTarget.style.color = 'var(--negative)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >✕</button>
            </div>
          ))}

          <button
            onClick={() => setRows(r => [...r, { t: '', s: 0, c: 0, d: '' }])}
            style={{
              background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 6,
              color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
              padding: '10px 16px', width: '100%', marginTop: 6, marginBottom: 20,
            }}
          >+ Add row</button>
        </div>

        {/* ── Footer (fixed) ── */}
        <div style={{
          padding: '16px 36px 24px', flexShrink: 0,
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
        }}>
          {error && (
            <div style={{ color: 'var(--negative)', fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid var(--border-strong)', borderRadius: 6,
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '9px 20px',
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: '#2563eb', border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                padding: '9px 24px', opacity: saving ? 0.7 : 1,
              }}
            >{saving ? 'Saving…' : 'Save Portfolio'}</button>
          </div>
        </div>

      </div>
    </div>
  );
}
