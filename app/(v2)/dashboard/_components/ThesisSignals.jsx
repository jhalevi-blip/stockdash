'use client';
import { useState, useEffect } from 'react';

// Experimental "AI Thesis Signals" panel. Reads the thesis_signals table
// (populated by /api/cron/thesis-signals) and renders one row per signal.
// Self-chroming card, matching the PortfolioAISummary shape.

const STATUS_META = {
  green:    { color: '#3fb950', label: 'Clear' },
  amber:    { color: '#d29922', label: 'Watch' },
  red:      { color: '#f85149', label: 'Alert' },
  unparsed: { color: 'var(--text-muted)', label: 'Check manually' },
};

const SIGNAL_LABEL = {
  edgar_keywords:   'EDGAR keyword scan',
  meta_obligations: 'Purchase obligations',
  goog_rpo:         'Revenue backlog (RPO)',
};

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusChip({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.unparsed;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      flexShrink: 0, whiteSpace: 'nowrap',
      fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
      color: meta.color,
      border: `1px solid ${meta.color}`,
      borderRadius: 3, padding: '2px 8px',
      background: status === 'unparsed' ? 'transparent' : `${meta.color}14`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
      {meta.label}
    </span>
  );
}

export default function ThesisSignals() {
  const [signals,     setSignals]     = useState(null); // null = loading, [] = empty, [...] = data
  const [errorStatus, setErrorStatus] = useState(null); // null | HTTP status number | 'network'

  useEffect(() => {
    let cancelled = false;
    fetch('/api/thesis-signals')
      .then((r) => {
        if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
        return r.json();
      })
      .then((json) => { if (!cancelled) setSignals(Array.isArray(json.signals) ? json.signals : []); })
      .catch((e) => { if (!cancelled) { setErrorStatus(e.status ?? 'network'); setSignals([]); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 24,
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--accent-cyan)',
        }}>
          Renegotiation watch
        </span>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          letterSpacing: '-.005em',
        }}>
          AI thesis signals
        </h3>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '.04em',
          color: 'var(--text-muted)', border: '1px solid var(--border-color)',
          borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', marginLeft: 'auto',
        }}>
          Experimental
        </span>
      </div>

      {/* ── States ── */}
      {signals === null && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading signals…</div>
      )}

      {signals !== null && signals.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
          {errorStatus == null
            ? 'No data yet — first run pending.'
            : typeof errorStatus === 'number'
              ? `Couldn't load signals (HTTP ${errorStatus}).`
              : "Couldn't load signals. Please try again later."}
        </div>
      )}

      {/* ── Rows ── */}
      {signals !== null && signals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {signals.map((s, i) => {
            const checked = fmtDate(s.checked_at);
            return (
              <div
                key={`${s.signal_key}:${s.ticker}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '12px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-color)',
                }}
              >
                <StatusChip status={s.status} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{s.ticker}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {SIGNAL_LABEL[s.signal_key] ?? s.signal_key}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 3 }}>
                    {/* Never hide failures — unparsed rows always show the manual-check prompt. */}
                    {s.status === 'unparsed'
                      ? (s.value_text || 'Check manually.')
                      : (s.value_text || '—')}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
                    {checked && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>checked {checked}</span>
                    )}
                    {s.source_url && (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
                      >
                        {s.status === 'unparsed' ? 'Open filing →' : 'View filing →'}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
