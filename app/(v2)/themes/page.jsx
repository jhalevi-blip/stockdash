'use client';

import { Suspense, Fragment, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Card from '@/app/(v2)/_components/Card';
import { useHoldings } from '@/lib/useHoldings';
import { THESES, DEFAULT_WORLDVIEW } from './_lib/theses';
import { MOCK_WORLDVIEW, MOCK_ROWS, MOCK_EXPOSURE } from './_lib/mockData';

// ─────────────────────────────────────────────────────────────
// Verdict pill colors (fixed verdict set)
// ─────────────────────────────────────────────────────────────
const VERDICT_COLOR = {
  Benefits: 'var(--positive)',
  Hurt:     'var(--negative)',
  Neutral:  'var(--text-muted)',
  Mixed:    'var(--warn)',
};

// Temperature bucket colors (hot → cold), theme-consistent.
const TEMP_COLOR = {
  HOT:      'var(--negative)',
  WARM:     '#f59e0b',
  LUKEWARM: 'var(--text-muted)',
  COOL:     '#60a5fa',
  COLD:     '#3b82f6',
  SPLIT:    'var(--accent-cyan)',
};

// Bucket → one-line meaning, for the "How to read this page" legend.
const TEMP_LEGEND = [
  ['HOT',      'stretched and crowded; the move is mature, late to add.'],
  ['WARM',     'trending above home base.'],
  ['LUKEWARM', 'near home base; nothing stretched, nothing washed out.'],
  ['COOL',     'below home base, out of favor.'],
  ['COLD',     'washed out; if the badge is still INTACT, this is the contrarian entry zone.'],
  ['SPLIT',    'the theme disagrees with itself; the chips show which leg is hot and which is cold.'],
];

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const WORLDVIEW_MAX = 300;
const RESCORE_CONCURRENCY = 2;

// Table cell styles modeled on dashboard/_components/HoldingsTable.jsx
const headerCell = (align) => ({
  textAlign: align,
  padding: '9px 10px',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  whiteSpace: 'nowrap',
});
const cellBase = (align) => ({
  textAlign: align,
  padding: '9px 10px',
  borderBottom: '1px solid var(--border-color)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-primary)',
  background: 'transparent',
});

const fmtWeight = (w) => (w == null ? '—' : `${w.toFixed(1)}%`);

// Signed formatters for the per-tracker temperature detail line.
const fmtSignedPct   = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const fmtSignedSigma = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}σ`);

// Short chip name from a tracker label: drop the parenthetical, trim the K-suffix for
// the k-shaped sectors, and cap at ~18 chars on a word boundary.
function shortTrackerName(thesisId, label) {
  let base = (label || '').split('(')[0].trim();
  if (thesisId === 'k-shaped') base = base.replace(/\s*K$/i, '').trim();
  if (base.length > 18) {
    let cut = base.slice(0, 18);
    const sp = cut.lastIndexOf(' ');
    if (sp > 8) cut = cut.slice(0, sp);
    base = cut.trim() + '…';
  }
  return base;
}

// ─────────────────────────────────────────────────────────────
// Pills (style modeled on MetricChip / BeatChip)
// ─────────────────────────────────────────────────────────────
function VerdictPill({ verdict, rationale, onClick, active }) {
  const color = VERDICT_COLOR[verdict] ?? 'var(--text-muted)';
  const clickable = !!rationale;
  return (
    <button
      type="button"
      title={rationale || undefined}
      onClick={clickable ? onClick : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.2,
        padding: '3px 9px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        background: active ? 'var(--bg-hover)' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {verdict}
    </button>
  );
}

// Generic non-interactive pill (Not scored / Scoring… / Failed)
function StatePill({ label, color = 'var(--text-muted)', border = 'var(--border-color)' }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: FONT,
      fontSize: 11,
      fontWeight: 600,
      padding: '3px 9px',
      borderRadius: 999,
      border: `1px solid ${border}`,
      color,
      background: 'transparent',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// Thesis-level temperature pill (bucket word). Same visual language as VerdictPill.
function TempBucketPill({ bucket, score }) {
  const color = TEMP_COLOR[bucket] ?? 'var(--text-muted)';
  const showScore = bucket !== 'SPLIT' && score != null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: FONT,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.04em',
      lineHeight: 1.2,
      padding: '2px 8px',
      borderRadius: 999,
      border: `1px solid ${color}`,
      color,
      background: 'transparent',
      whiteSpace: 'nowrap',
    }}>
      {bucket}
      {showScore && (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {`${score >= 0 ? '+' : ''}${score.toFixed(2)}`}
        </span>
      )}
    </span>
  );
}

// Per-tracker mini-chip — clickable (toggles detail) or a muted, non-clickable "n/a".
function TempChip({ label, color, clickable, active, title, onClick }) {
  const Comp = clickable ? 'button' : 'span';
  return (
    <Comp
      type={clickable ? 'button' : undefined}
      title={title || undefined}
      onClick={clickable ? onClick : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: FONT,
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.2,
        padding: '2px 7px',
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        background: active ? 'var(--bg-hover)' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Comp>
  );
}

// Labeled text block for the "How to read this page" legend.
function LegendBlock({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Exposure bar (Benefits / Hurt / Neutral as % of portfolio weight)
// ─────────────────────────────────────────────────────────────
function ExposureBar({ name, exposure }) {
  const { benefitsPct, hurtPct, neutralPct } = exposure;
  const seg = (pct, bg) => (pct > 0 ? <div style={{ width: `${pct}%`, background: bg }} /> : null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>by market value</span>
      </div>
      <div style={{
        display: 'flex',
        height: 10,
        borderRadius: 999,
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
      }}>
        {seg(benefitsPct, 'var(--positive)')}
        {seg(hurtPct, 'var(--negative)')}
        {seg(neutralPct, 'var(--text-muted)')}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-secondary)' }}>
        <span style={{ color: 'var(--positive)' }}>Benefits {benefitsPct}%</span>
        <span style={{ color: 'var(--negative)' }}>Hurt {hurtPct}%</span>
        <span style={{ color: 'var(--text-muted)' }}>Neutral {neutralPct}%</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
function ThemesPageInner() {
  const { isLoaded, isSignedIn } = useUser();
  const { holdings } = useHoldings();
  const signedIn = !!isSignedIn;

  // Live prices for market-value weights. Reuses the dashboard's exact path:
  // /api/prices?tickers=… → priceMap[ticker] = quote, weight = mktValue / total.
  const [prices, setPrices] = useState({});
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = holdings.map(h => h.t).join(',');
    fetch(`/api/prices?tickers=${tickers}`)
      .then(r => r.json())
      .catch(() => [])
      .then(arr => {
        const m = {};
        if (Array.isArray(arr)) arr.forEach(p => { m[p.ticker] = p; });
        setPrices(m);
      });
  }, [holdings]);

  // Global market temperatures (not user data) — fetched for everyone, including the
  // signed-out demo. temps: null = loading, {} or map = loaded; tempsError on failure.
  const [temps, setTemps]           = useState(null);
  const [tempsError, setTempsError] = useState(false);
  const [tempExpanded, setTempExpanded] = useState(null); // `${thesisId}::${trackerId}`
  const [legendOpen, setLegendOpen] = useState(false);     // "How to read this page"
  useEffect(() => {
    let cancelled = false;
    fetch('/api/theme-temperatures', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setTemps(j?.payload?.theses ?? {}); })
      .catch(() => { if (!cancelled) setTempsError(true); });
    return () => { cancelled = true; };
  }, []);

  // Cached classifications + saved worldview (signed-in only). No auto-scoring.
  const [verdictsByTicker, setVerdictsByTicker] = useState({});
  const [worldview, setWorldview] = useState(null); // resolved below
  useEffect(() => {
    if (!isLoaded) return;
    if (!signedIn) { setWorldview(MOCK_WORLDVIEW); return; }
    let cancelled = false;
    setWorldview(DEFAULT_WORLDVIEW); // default until the fetch resolves
    fetch('/api/user-settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j?.worldview) setWorldview(j.worldview); })
      .catch(() => {});
    fetch('/api/theme-classifications', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        const map = {};
        if (Array.isArray(j?.classifications)) j.classifications.forEach(c => { map[c.ticker] = c.verdicts; });
        setVerdictsByTicker(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoaded, signedIn]);

  // Real rows for signed-in users (weights from live prices; verdicts from cache).
  const realRows = useMemo(() => {
    if (!holdings?.length) return [];
    const enriched = holdings.map(h => {
      const q = prices[h.t] ?? {};
      const price = q.price ?? null;
      return { ticker: h.t, mktValue: price != null ? h.s * price : null };
    });
    const total = enriched.reduce((s, r) => s + (r.mktValue ?? 0), 0);
    return enriched.map(r => ({
      ticker: r.ticker,
      weightPct: (r.mktValue != null && total > 0) ? (r.mktValue / total) * 100 : null,
      verdicts: verdictsByTicker[r.ticker] ?? null,
    }));
  }, [holdings, prices, verdictsByTicker]);

  const worldviewText = worldview ?? (signedIn ? DEFAULT_WORLDVIEW : MOCK_WORLDVIEW);
  const rows = signedIn ? realRows : MOCK_ROWS;

  // Loading / empty states for the signed-in matrix
  const holdingsLoading = signedIn && holdings === null;
  const noHoldings      = signedIn && Array.isArray(holdings) && holdings.length === 0;

  // Expand-on-click rationale; key = `${ticker}::${thesisId}`
  const [expanded, setExpanded] = useState(null);
  const keyOf = (t, id) => `${t}::${id}`;
  const toggle = (t, id) => setExpanded(prev => (prev === keyOf(t, id) ? null : keyOf(t, id)));

  // ── Worldview edit ──────────────────────────────────────────────────────────
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState('');
  const [savingWv, setSavingWv]   = useState(false);
  const [wvHint, setWvHint]       = useState(false);

  function startEdit() { setDraft(worldviewText); setWvHint(false); setEditing(true); }
  function cancelEdit() { setEditing(false); }
  async function saveWorldview() {
    const text = draft.trim();
    if (!text || text.length > WORLDVIEW_MAX) return;
    setSavingWv(true);
    try {
      const res = await fetch('/api/user-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldview: text }),
      });
      const json = await res.json();
      if (res.ok && json.worldview) {
        setWorldview(json.worldview);
        setEditing(false);
        setWvHint(true);
      }
    } catch {}
    setSavingWv(false);
  }

  // ── Re-score (concurrency-2 promise pool, no library) ────────────────────────
  const [scoreStatus, setScoreStatus] = useState({}); // ticker -> 'scoring' | 'failed'
  const [scoring, setScoring]         = useState(false);
  const [doneCount, setDoneCount]     = useState(0);

  const scoreTickers = signedIn ? realRows.map(r => r.ticker) : [];
  const canRescore = signedIn && scoreTickers.length > 0 && !scoring;

  async function rescore() {
    if (!canRescore) return;
    const tickers = [...scoreTickers];
    setScoring(true);
    setDoneCount(0);
    setScoreStatus(() => { const m = {}; tickers.forEach(t => { m[t] = 'scoring'; }); return m; });

    let idx = 0;
    let done = 0;
    async function worker() {
      while (idx < tickers.length) {
        const t = tickers[idx++];
        try {
          const res = await fetch('/api/theme-classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: t }),
          });
          const json = await res.json();
          if (!res.ok || !json.verdicts) throw new Error('failed');
          setVerdictsByTicker(prev => ({ ...prev, [t]: json.verdicts }));
          setScoreStatus(prev => { const m = { ...prev }; delete m[t]; return m; });
        } catch {
          setScoreStatus(prev => ({ ...prev, [t]: 'failed' }));
        } finally {
          done += 1;
          setDoneCount(done);
        }
      }
    }
    const pool = Math.min(RESCORE_CONCURRENCY, tickers.length);
    await Promise.all(Array.from({ length: pool }, () => worker()));
    setScoring(false);
  }

  // ── Exposure (signed-in): compute once every holding is scored ───────────────
  const allScored = signedIn && realRows.length > 0 && realRows.every(r => verdictsByTicker[r.ticker]);
  const computedExposure = useMemo(() => {
    if (!allScored) return null;
    const totals = {};
    THESES.forEach(t => { totals[t.id] = { benefits: 0, hurt: 0, neutral: 0 }; });
    realRows.forEach(r => {
      const w = r.weightPct ?? 0;
      const v = verdictsByTicker[r.ticker];
      THESES.forEach(t => {
        const verdict = v?.[t.id]?.verdict;
        if (verdict === 'Benefits') totals[t.id].benefits += w;
        else if (verdict === 'Hurt') totals[t.id].hurt += w;
        else if (verdict === 'Neutral') totals[t.id].neutral += w;
        else if (verdict === 'Mixed') { totals[t.id].benefits += w / 2; totals[t.id].hurt += w / 2; }
      });
    });
    const out = {};
    THESES.forEach(t => {
      out[t.id] = {
        benefitsPct: Math.round(totals[t.id].benefits),
        hurtPct:     Math.round(totals[t.id].hurt),
        neutralPct:  Math.round(totals[t.id].neutral),
      };
    });
    return out;
  }, [allScored, realRows, verdictsByTicker]);

  if (!isLoaded) {
    return <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</main>;
  }

  const totalCols = 2 + THESES.length;

  // Cell content for a given row × thesis, honoring transient scoring status.
  function cellContent(row, thesisId) {
    const status = signedIn ? scoreStatus[row.ticker] : null;
    if (status === 'scoring') return <StatePill label="Scoring…" />;
    if (status === 'failed')  return <StatePill label="Failed" color="var(--negative)" border="var(--negative)" />;
    if (row.verdicts == null) return <NotScoredCell />;
    const v = row.verdicts[thesisId];
    if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return (
      <VerdictPill
        verdict={v.verdict}
        rationale={v.rationale}
        active={expanded === keyOf(row.ticker, thesisId)}
        onClick={() => toggle(row.ticker, thesisId)}
      />
    );
  }

  function NotScoredCell() { return <StatePill label="Not scored" />; }

  // Temperature block for one thesis card. Loading → muted "Temperature: …";
  // failure or missing thesis → muted "Temperature: unavailable"; otherwise a bucket
  // pill plus per-tracker chips, one detail line open at a time.
  function renderTemperature(thesisId) {
    const italic = { marginTop: 'auto', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' };
    if (temps === null && !tempsError) {
      return <div style={italic}>Temperature: …</div>;
    }
    const entry = (!tempsError && temps) ? temps[thesisId] : null;
    if (!entry) {
      return <div style={italic}>Temperature: unavailable</div>;
    }
    const trackers = Array.isArray(entry.trackers) ? entry.trackers : [];
    const openTracker = trackers.find(tr => !tr.error && `${thesisId}::${tr.id}` === tempExpanded) || null;
    return (
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Temperature
          </span>
          <TempBucketPill bucket={entry.temperature} score={entry.score} />
        </div>
        {entry.temperature === 'SPLIT' && entry.splitEnds && (() => {
          const { high, low } = entry.splitEnds;
          const colorFor = (id) => {
            const tr = trackers.find(t => t.id === id);
            return TEMP_COLOR[tr?.temperature] ?? 'var(--text-muted)';
          };
          const sgn = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
          return (
            <div style={{ fontSize: 10, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 4 }}>
              <span style={{ color: colorFor(high.id) }}>{shortTrackerName(thesisId, high.label)} {sgn(high.score)}</span>
              <span style={{ color: 'var(--text-muted)' }}>↔</span>
              <span style={{ color: colorFor(low.id) }}>{shortTrackerName(thesisId, low.label)} {sgn(low.score)}</span>
            </div>
          );
        })()}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {trackers.map(tr => {
            if (tr.error) {
              return <TempChip key={tr.id} label="n/a" color="var(--text-muted)" clickable={false} title={tr.error} />;
            }
            const k = `${thesisId}::${tr.id}`;
            return (
              <TempChip
                key={tr.id}
                label={shortTrackerName(thesisId, tr.label)}
                color={TEMP_COLOR[tr.temperature] ?? 'var(--text-muted)'}
                clickable
                active={tempExpanded === k}
                title={tr.note || undefined}
                onClick={() => setTempExpanded(prev => (prev === k ? null : k))}
              />
            );
          })}
        </div>
        {openTracker && (
          <div style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            12m {fmtSignedPct(openTracker.run12m)} · extension {fmtSignedSigma(openTracker.extensionSigma)} · off high {fmtSignedPct(openTracker.offHigh)}
          </div>
        )}
      </div>
    );
  }

  return (
    <main style={{
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      fontFamily: FONT,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      {/* Page-scoped responsive rules: @media + !important per repo convention */}
      <style>{`
        .themes-thesis-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .themes-matrix-desktop { display: block; }
        .themes-matrix-mobile { display: none; }
        @media (max-width: 640px) {
          .themes-thesis-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .themes-matrix-desktop { display: none !important; }
          .themes-matrix-mobile { display: flex !important; flex-direction: column; gap: 10px; }
        }
      `}</style>

      {/* a) Worldview header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Theme Research</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setLegendOpen(o => !o)}
              style={{
                fontFamily: FONT, fontSize: 12, fontWeight: 600,
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: 'pointer',
              }}
            >ⓘ How to read this page{legendOpen ? ' ▾' : ''}</button>
            <button
              type="button"
              onClick={startEdit}
              disabled={!signedIn || editing}
              title={signedIn ? undefined : 'Sign in to edit'}
              style={{
                fontFamily: FONT, fontSize: 12, fontWeight: 600,
                padding: '6px 14px', borderRadius: 6,
                border: `1px solid ${signedIn && !editing ? 'var(--accent)' : 'var(--border-color)'}`,
                background: 'transparent',
                color: signedIn && !editing ? 'var(--accent)' : 'var(--text-muted)',
                cursor: signedIn && !editing ? 'pointer' : 'not-allowed',
                opacity: signedIn && !editing ? 1 : 0.7,
              }}
            >Edit</button>
          </div>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: 6 }}>
            Worldview
          </div>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, WORLDVIEW_MAX))}
                maxLength={WORLDVIEW_MAX}
                rows={3}
                style={{
                  width: '100%', resize: 'vertical',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6, padding: '8px 10px',
                  color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5,
                  fontFamily: FONT, boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {draft.trim().length}/{WORLDVIEW_MAX}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingWv}
                    style={{
                      fontFamily: FONT, fontSize: 12, fontWeight: 600,
                      padding: '6px 14px', borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      background: 'transparent', color: 'var(--text-secondary)',
                      cursor: savingWv ? 'not-allowed' : 'pointer',
                    }}
                  >Cancel</button>
                  <button
                    type="button"
                    onClick={saveWorldview}
                    disabled={savingWv || !draft.trim() || draft.trim().length > WORLDVIEW_MAX}
                    style={{
                      fontFamily: FONT, fontSize: 12, fontWeight: 600,
                      padding: '6px 14px', borderRadius: 6,
                      border: '1px solid var(--accent)',
                      background: 'var(--accent)', color: '#fff',
                      cursor: (savingWv || !draft.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (savingWv || !draft.trim()) ? 0.7 : 1,
                    }}
                  >{savingWv ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{worldviewText}</p>
              {wvHint && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Worldview updated — re-score to apply it.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* How to read this page — collapsible legend; toggled from the header button */}
      {legendOpen && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <LegendBlock label="Temperature">
            Temperature measures how much of a thesis the market has already paid for — not whether the thesis is true. It blends the 12-month run, the stretch above the 200-day average (in units of the tracker&rsquo;s own normal movement), and the distance below the peak.
          </LegendBlock>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TEMP_LEGEND.map(([bucket, meaning]) => (
              <div key={bucket} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <TempBucketPill bucket={bucket} />
                <span style={{ flex: '1 1 220px', minWidth: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  — {meaning}
                </span>
              </div>
            ))}
          </div>

          <LegendBlock label="Validity">
            The INTACT badge is a separate dial: is the thesis still true at all? The rule of thumb: buy validity, time with temperature. A cold tracker under an intact thesis is a discount; a cold tracker under a wobbling badge may be a thesis dying, not on sale.
          </LegendBlock>

          <LegendBlock label="Chips">
            Each small chip is one gauge inside the thesis. Click it to see its numbers: 12-month run · stretch above the 200-day base (σ) · distance off the high.
          </LegendBlock>

          <LegendBlock label="Matrix">
            In the matrix below: Benefits and Hurt are a stock&rsquo;s exposure to each thesis, Mixed means two real opposing forces, Neutral means the exposure simply isn&rsquo;t dominant. Click any verdict for its one-line reason.
          </LegendBlock>

          <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)' }}>
            Observation, not advice — temperature flags stretch and discount; it doesn&rsquo;t schedule returns.
          </div>
        </div>
      )}

      {/* b) Four thesis cards */}
      <div className="themes-thesis-grid">
        {THESES.map(t => (
          <div key={t.id} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 999,
                color: 'var(--positive)', border: '1px solid var(--positive)', background: 'transparent',
              }}>{t.validity}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{t.view}</p>
            {renderTemperature(t.id)}
          </div>
        ))}
      </div>

      {/* c) Matrix */}
      <Card title="Theme Matrix" eyebrow={signedIn ? 'Your holdings' : 'Sample'}>
        {holdingsLoading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading your portfolio…
          </div>
        ) : noHoldings ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No holdings yet — add a portfolio to score it against your theses.
          </div>
        ) : (
          <>
            {/* Desktop: semantic table */}
            <div className="themes-matrix-desktop" style={{ overflowX: 'auto', margin: '0 -14px', padding: '0 14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
                <thead>
                  <tr>
                    <th style={headerCell('left')}>Ticker</th>
                    <th style={headerCell('right')}>Weight</th>
                    {THESES.map(t => <th key={t.id} style={headerCell('center')}>{t.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const expandedThesis = THESES.find(t => expanded === keyOf(row.ticker, t.id));
                    const showExpand = expandedThesis && row.verdicts?.[expandedThesis.id]
                      && !(signedIn && scoreStatus[row.ticker]);
                    return (
                      <Fragment key={row.ticker}>
                        <tr>
                          <td style={cellBase('left')}>
                            <span style={{ color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, fontSize: 12 }}>
                              {row.ticker}
                            </span>
                          </td>
                          <td style={cellBase('right')}>{fmtWeight(row.weightPct)}</td>
                          {THESES.map(t => (
                            <td key={t.id} style={{ ...cellBase('center'), textAlign: 'center' }}>
                              {cellContent(row, t.id)}
                            </td>
                          ))}
                        </tr>
                        {showExpand && (
                          <tr>
                            <td colSpan={totalCols} style={{
                              padding: '8px 10px 12px',
                              borderBottom: '1px solid var(--border-color)',
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              lineHeight: 1.5,
                              background: 'var(--bg-secondary)',
                            }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{expandedThesis.name}:</strong>{' '}
                              {row.verdicts[expandedThesis.id].rationale}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: per-holding cards (layout lives in the <style> block so it
                 doesn't override the responsive display rule) */}
            <div className="themes-matrix-mobile">
              {rows.map(row => {
                const status = signedIn ? scoreStatus[row.ticker] : null;
                return (
                  <div key={row.ticker} style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '12px',
                    background: 'var(--bg-secondary)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, fontSize: 13 }}>
                        {row.ticker}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtWeight(row.weightPct)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {THESES.map(t => {
                        const v = row.verdicts ? row.verdicts[t.id] : null;
                        const showExpand = v && !status && expanded === keyOf(row.ticker, t.id);
                        return (
                          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.name}</span>
                              {cellContent(row, t.id)}
                            </div>
                            {showExpand && (
                              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                {v.rationale}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* d) Exposure bars */}
      <Card title="Theme Exposure" eyebrow={signedIn ? 'Your holdings' : 'Sample'}>
        {signedIn ? (
          computedExposure ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {THESES.map(t => (
                <ExposureBar key={t.id} name={t.name} exposure={computedExposure[t.id]} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {scoring ? 'Scoring…' : 'Scores pending — run your first scoring.'}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {THESES.map(t => (
              <ExposureBar key={t.id} name={t.name} exposure={MOCK_EXPOSURE[t.id]} />
            ))}
          </div>
        )}
      </Card>

      {/* e) Re-score button */}
      <div>
        <button
          type="button"
          onClick={rescore}
          disabled={!canRescore}
          title={signedIn ? undefined : 'Sign in and add a portfolio to score'}
          style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600,
            padding: '9px 18px', borderRadius: 6,
            border: `1px solid ${canRescore ? 'var(--accent)' : 'var(--border-color)'}`,
            background: canRescore ? 'var(--accent)' : 'transparent',
            color: canRescore ? '#fff' : 'var(--text-muted)',
            cursor: canRescore ? 'pointer' : 'not-allowed',
            opacity: canRescore ? 1 : 0.7,
          }}
        >
          {scoring ? `Scoring ${doneCount}/${scoreTickers.length}…` : 'Re-score portfolio'}
        </button>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 8,
        padding: '14px 0 8px',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}>
        Not financial advice. Theses reflect a configurable worldview.
      </div>
    </main>
  );
}

export default function ThemesPage() {
  return (
    <Suspense fallback={
      <main style={{ padding: '18px 20px', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</main>
    }>
      <ThemesPageInner />
    </Suspense>
  );
}
