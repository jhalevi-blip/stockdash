'use client';
// The logged-out "drop your DEGIRO statement, see your real return" flow, wired
// to the hero's "See my real return" button via an imperative openPicker().
//
// Parsing runs entirely in the browser (parseFileInBrowser). The return is then
// computed by the existing EUR ledger hook (usePerformanceLedger), which fetches
// daily closes + EURUSD from the unauthenticated /api/historical-prices. Nothing
// here writes to Supabase and the statement bytes are never uploaded.
import { useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { parseFileInBrowser } from '@/lib/brokers/parseInBrowser';
import { usePerformanceLedger } from '@/lib/performance/usePerformanceLedger';
import DTResultView from './DTResultView';
import { UI_STRINGS } from '@/lib/landing/brokerConfigs';

// Explicit copy per failure mode — pulled from the language strings (never a
// generic "something went wrong").
function errorContent(detail, S) {
  const e = S.errors[detail?.status] ?? S.errors.parse_error;
  return { title: e.title, body: e.body(detail) };
}

const CARD = {
  border: '1px solid #1c232c', borderRadius: 10, background: '#07090d',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
};

const DTCsvDemo = forwardRef(function DTCsvDemo({ lang = 'en', framed = false }, ref) {
  const S = UI_STRINGS[lang]?.demo ?? UI_STRINGS.en.demo;
  const [phase, setPhase]   = useState('idle');   // idle | parsing | error | result
  const [detail, setDetail] = useState(null);     // error detail OR ok result
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    openPicker: () => inputRef.current?.click(),
  }), []);

  // Ledger inputs — null until we have a successful parse. The hook is called
  // unconditionally (returns { ready:false } when legs are null).
  const result = phase === 'result' ? detail : null;
  const realizedData = useMemo(() => (
    result ? { tradeLegs: result.tradeLegs, deposits: result.deposits, dividends: result.dividends } : null
  ), [result]);

  // Window start = the file's first trade, floored to 5 years back (the max
  // history /api/historical-prices returns), so the chart label stays honest.
  const defaultStart = useMemo(() => {
    if (!result?.tradeLegs?.length) return undefined;
    const earliest = result.tradeLegs.map((l) => l.d).filter(Boolean).sort()[0];
    if (!earliest) return undefined;
    const floorDate = new Date();
    floorDate.setFullYear(floorDate.getFullYear() - 5);
    const floor = floorDate.toISOString().slice(0, 10);
    return earliest < floor ? floor : earliest;
  }, [result]);

  const perf = usePerformanceLedger({
    realizedData,
    currentCashEur: result?.currentCashEur ?? 0,
    defaultStart,
  });

  async function handleFile(file) {
    if (!file) return;
    setPhase('parsing');
    setDetail(null);
    let res;
    try {
      res = await parseFileInBrowser(file);
    } catch {
      res = { status: 'parse_error', message: 'Something went wrong reading your file.' };
    }
    if (res.status === 'ok') { setDetail(res); setPhase('result'); }
    else { setDetail(res); setPhase('error'); }
  }

  function onInputChange(e) {
    const f = e.target.files?.[0];
    e.target.value = '';   // allow re-selecting the same file
    handleFile(f);
  }
  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  }
  function reset() { setPhase('idle'); setDetail(null); }

  const trust = (
    <p style={{ fontSize: 12, color: 'rgba(230,237,243,0.45)', lineHeight: 1.55, margin: '12px auto 0', maxWidth: 520 }}>
      {S.trust}
    </p>
  );

  // Hidden input shared across every phase.
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".csv,.xlsx,.xls"
      onChange={onInputChange}
      style={{ display: 'none' }}
    />
  );

  if (phase === 'result') {
    // On the broker pages the result stands alone — unlike the homepage, there's
    // no sample dashboard below to fill the width — so at 2560 a bare 1200 card
    // reads as marooned. When framed, wrap it in a full-width panel using the same
    // border language as the walkthrough / trust strip (a subtly darker band with
    // top + bottom borders), so it reads as a deliberate section. The card itself
    // stays 1200 to line up with the walkthrough and comparison table below.
    if (framed) {
      return (
        <div style={{ borderTop: '1px solid #1e2530', borderBottom: '1px solid #1e2530', background: '#0b0e13', padding: '32px 0' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
            {fileInput}
            <DTResultView perf={perf} result={detail} onReset={reset} lang={lang} />
          </div>
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto 22px', padding: '0 24px' }}>
        {fileInput}
        <DTResultView perf={perf} result={detail} onReset={reset} lang={lang} />
      </div>
    );
  }

  return (
    <div style={{ margin: '0 24px 22px' }}>
      {fileInput}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => phase !== 'parsing' && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && phase !== 'parsing') inputRef.current?.click(); }}
        style={{
          ...CARD,
          border: `1.5px dashed ${dragActive ? 'var(--accent-cta)' : '#2b3542'}`,
          background: dragActive ? 'rgba(59,130,246,0.06)' : '#0b0e13',
          boxShadow: 'none',
          padding: '40px 28px',
          textAlign: 'center',
          cursor: phase === 'parsing' ? 'default' : 'pointer',
          transition: 'border-color 120ms, background 120ms',
        }}
      >
        {phase === 'parsing' ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600 }}>
            {S.parsing}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {S.dropHeadline}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
              {S.browsePrefix}
              <span style={{ color: 'var(--accent-cta)', fontWeight: 600, textDecoration: 'underline' }}>
                {S.browseLink}
              </span>
            </div>

            {phase === 'error' && detail && (
              <div style={{
                margin: '18px auto 0', maxWidth: 520, textAlign: 'left',
                border: '1px solid var(--negative)', borderRadius: 8,
                padding: '12px 14px', background: 'rgba(248,81,73,0.06)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--negative)' }}>
                  {errorContent(detail, S).title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  {errorContent(detail, S).body}
                </div>
              </div>
            )}

            {trust}
          </>
        )}
      </div>
    </div>
  );
});

export default DTCsvDemo;
