'use client';
import { useState, useRef } from 'react';

// ── TickerInput ────────────────────────────────────────────────────────────────
function TickerInput({ value, onChange, onSelect, inputStyle }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [open,        setOpen]        = useState(false);
  const debounceRef  = useRef(null);
  const blurTimerRef = useRef(null);

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/ticker-search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch { setSuggestions([]); setOpen(false); }
      finally  { setLoading(false); }
    }, 300);
  }

  function handleBlur() {
    blurTimerRef.current = setTimeout(() => setOpen(false), 150);
  }

  function handleSelect(symbol) {
    clearTimeout(blurTimerRef.current);
    onSelect(symbol);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Search ticker..."
        style={inputStyle}
      />
      {(loading || open) && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
          borderRadius: 8, marginTop: 4, overflow: 'hidden',
        }}>
          {loading && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Searching…
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
              No matches
            </div>
          )}
          {!loading && suggestions.map(s => (
            <button
              key={s.symbol}
              onMouseDown={() => handleSelect(s.symbol)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', minHeight: 44, padding: '10px 14px',
                background: 'none', border: 'none',
                borderBottom: '1px solid var(--border-color)',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', flexShrink: 0, minWidth: 56 }}>
                {s.symbol}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {s.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const iStyle = {
  background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', padding: '10px 14px', fontSize: 14, width: '100%',
  outline: 'none', boxSizing: 'border-box',
};
// 16px prevents iOS auto-zoom on focus; minHeight 44px meets HIG tap target
const iStyleMobile = { ...iStyle, fontSize: 16, minHeight: 44, minWidth: 0, maxWidth: '100%' };

const COLS = '2fr 150px 170px 190px 44px';

export default function PortfolioModal({ holdings, cash, onSave, onClose }) {
  const initial = holdings.length
    ? holdings.map(h => ({ t: h.t ?? '', s: h.s ?? 0, c: h.c ?? 0, d: h.d ?? '' }))
    : [{ t: '', s: 0, c: 0, d: '' }];

  const [rows,         setRows]         = useState(initial);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [cashAmount,   setCashAmount]   = useState(cash?.amount   ?? 0);
  const [cashCurrency, setCashCurrency] = useState(cash?.currency ?? 'USD');
  const sharesRefs = useRef([]); // desktop: auto-focus after autocomplete selection

  const handleSave = async () => {
    const valid = rows.filter(r => r.t.trim());
    if (!valid.length) { setError('Add at least one ticker.'); return; }
    const parsed = valid.map(r => ({
      t: r.t.trim().toUpperCase(),
      s: r.s, c: r.c,
      ...(r.d ? { d: r.d } : {}),
    }));
    const cashData = cashAmount > 0 ? { amount: cashAmount, currency: cashCurrency } : null;
    setSaving(true); setError('');
    try {
      await onSave(parsed, cashData);
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  function addRow() {
    setRows(r => [{ t: '', s: 0, c: 0, d: '' }, ...r]);
  }

  const addStockBtn = () => (
    <button
      onClick={addRow}
      style={{
        background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 6,
        color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
        padding: '10px 16px', width: '100%', minHeight: 44,
      }}
    >+ Add stock</button>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @media (max-width: 600px) {
          .pm-modal       { width: 100% !important; max-width: 100% !important;
                            height: 100% !important; border-radius: 0 !important; }
          .pm-header      { padding: 16px 16px 0 !important; }
          .pm-list        { padding: 8px 16px 0 !important; }
          .pm-col-headers { display: none !important; }
          .pm-row-desktop { display: none !important; }
          .pm-row-mobile  { display: flex !important; }
          .pm-add-top     { display: block !important; }
          .pm-add-bottom  { display: none !important; }
          .pm-footer      { position: sticky !important; bottom: 0 !important;
                            z-index: 10 !important; padding: 12px 16px !important; }
          .pm-action-btn  { min-height: 44px !important; padding: 0 20px !important; }
        }
        @media (min-width: 601px) {
          .pm-add-top    { display: none !important; }
          .pm-row-mobile { display: none !important; }
        }
      `}</style>

      <div className="pm-modal" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12,
        width: '90vw', maxWidth: 1200, height: '85vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>

        {/* ── Header ── */}
        <div className="pm-header" style={{ padding: '28px 36px 0', flexShrink: 0 }}>
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
                width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
                placeholder="0.00" type="number" min="0" step="0.01"
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

          {/* Column headers — desktop only */}
          <div className="pm-col-headers" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-color)' }}>
            {['Ticker', 'Shares', 'Avg Cost (USD)', 'Date Bought (optional)', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable list ── */}
        <div className="pm-list" style={{ flex: 1, overflowY: 'auto', padding: '12px 36px 0' }}>

          {/* Add stock — top, mobile only */}
          <div className="pm-add-top" style={{ marginBottom: 10 }}>
            {addStockBtn()}
          </div>

          {rows.map((row, i) => (
            <div key={i} style={{ marginBottom: 10 }}>

              {/* ── Desktop row (5-col grid) ── */}
              <div
                className="pm-row-desktop"
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'flex-start' }}
              >
                <TickerInput
                  value={row.t}
                  onChange={val => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, t: val } : x))}
                  onSelect={symbol => {
                    setRows(prev => prev.map((x, idx) => idx === i ? { ...x, t: symbol } : x));
                    setTimeout(() => sharesRefs.current[i]?.focus(), 50);
                  }}
                  inputStyle={{ ...iStyle, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}
                />
                <input
                  ref={el => sharesRefs.current[i] = el}
                  value={String(row.s ?? '')}
                  onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, s: parseFloat(e.target.value) || 0 } : x))}
                  placeholder="100" type="number" min="0"
                  style={iStyle}
                />
                <input
                  value={String(row.c ?? '')}
                  onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, c: parseFloat(e.target.value) || 0 } : x))}
                  placeholder="50.00" type="number" min="0" step="0.01"
                  style={iStyle}
                />
                <input
                  value={row.d ?? ''}
                  onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, d: e.target.value } : x))}
                  type="date"
                  style={{ ...iStyle, border: '1px solid var(--border-color)', color: row.d ? 'var(--text-primary)' : 'var(--text-muted)', colorScheme: 'dark' }}
                />
                <button
                  onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
                  style={{
                    background: 'none', border: '1px solid var(--border-color)', borderRadius: 6,
                    color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
                    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--negative)'; e.currentTarget.style.color = 'var(--negative)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >✕</button>
              </div>

              {/* ── Mobile card (stacked) ── */}
              <div
                className="pm-row-mobile"
                style={{
                  display: 'none', flexDirection: 'column', gap: 8,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                  borderRadius: 8, padding: 12,
                }}
              >
                {/* Ticker + delete */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <TickerInput
                      value={row.t}
                      onChange={val => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, t: val } : x))}
                      onSelect={symbol => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, t: symbol } : x))}
                      inputStyle={{ ...iStyleMobile, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}
                    />
                  </div>
                  <button
                    onClick={() => setRows(r => r.filter((_, idx) => idx !== i))}
                    style={{
                      background: 'none', border: '1px solid var(--border-color)', borderRadius: 6,
                      color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
                      width: 44, height: 44, minWidth: 44, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >✕</button>
                </div>
                {/* Shares + cost */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    value={String(row.s ?? '')}
                    onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, s: parseFloat(e.target.value) || 0 } : x))}
                    placeholder="Shares" type="number" min="0"
                    style={iStyleMobile}
                  />
                  <input
                    value={String(row.c ?? '')}
                    onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, c: parseFloat(e.target.value) || 0 } : x))}
                    placeholder="Avg cost" type="number" min="0" step="0.01"
                    style={iStyleMobile}
                  />
                </div>
                {/* Date — full width */}
                <input
                  value={row.d ?? ''}
                  onChange={e => setRows(prev => prev.map((x, idx) => idx === i ? { ...x, d: e.target.value } : x))}
                  type="date"
                  style={{ ...iStyleMobile, border: '1px solid var(--border-color)', color: row.d ? 'var(--text-primary)' : 'var(--text-muted)', colorScheme: 'dark' }}
                />
              </div>

            </div>
          ))}

          {/* Add stock — bottom, desktop only */}
          <div className="pm-add-bottom" style={{ marginBottom: 20, marginTop: 6 }}>
            {addStockBtn()}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="pm-footer" style={{
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
              className="pm-action-btn"
              style={{
                background: 'none', border: '1px solid var(--border-strong)', borderRadius: 6,
                color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '9px 20px',
              }}
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="pm-action-btn"
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
