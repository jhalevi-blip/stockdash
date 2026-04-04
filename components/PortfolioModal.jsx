'use client';
import { useState } from 'react';

const iStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 4,
  color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, width: '100%',
  outline: 'none', boxSizing: 'border-box',
};

export default function PortfolioModal({ holdings, onSave, onClose }) {
  const initial = holdings.length
    ? holdings.map(h => ({ t: h.t, s: h.s != null ? String(h.s) : '', c: h.c != null ? String(h.c) : '' }))
    : [{ t: '', s: '', c: '' }];

  const [rows,   setRows]   = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const update = (i, field, val) =>
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const handleSave = async () => {
    const valid = rows.filter(r => r.t.trim());
    if (!valid.length) { setError('Add at least one ticker.'); return; }

    const parsed = valid.map(r => ({
      t: r.t.trim().toUpperCase(),
      s: parseFloat(r.s) || 0,
      c: parseFloat(r.c) || 0,
    }));
    console.log('[PortfolioModal] saving holdings:', JSON.stringify(parsed));

    setSaving(true);
    setError('');
    try {
      await onSave(parsed);
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
        width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto',
        padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>My Portfolio</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>Add your holdings to track your portfolio</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer', lineHeight: 1, marginLeft: 12, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 28px', gap: 8, marginBottom: 6 }}>
          {['Ticker', 'Shares', 'Avg Cost ($)', ''].map(h => (
            <div key={h} style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>
          ))}
        </div>

        {rows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 28px', gap: 8, marginBottom: 8 }}>
            <input
              value={row.t}
              onChange={e => update(i, 't', e.target.value)}
              placeholder="NVDA"
              style={iStyle}
            />
            <input
              value={row.s}
              onChange={e => update(i, 's', e.target.value)}
              placeholder="100"
              type="number"
              min="0"
              style={iStyle}
            />
            <input
              value={row.c}
              onChange={e => update(i, 'c', e.target.value)}
              placeholder="50.00"
              type="number"
              min="0"
              step="0.01"
              style={iStyle}
            />
            <button
              onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 15, cursor: 'pointer', padding: 0, alignSelf: 'center' }}
            >✕</button>
          </div>
        ))}

        <button
          onClick={() => setRows(r => [...r, { t: '', s: '', c: '' }])}
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
