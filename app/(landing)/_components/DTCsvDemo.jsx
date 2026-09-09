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

// Explicit copy per failure mode — never a generic "something went wrong".
function errorContent(detail) {
  switch (detail?.status) {
    case 'not_degiro':
      return {
        title: 'That doesn’t look like a DEGIRO statement',
        body: `This demo reads the DEGIRO Account Statement (Rekeningoverzicht) export.${
          detail.detectedFormat && detail.detectedFormat !== 'generic' && detail.detectedFormat !== 'unknown'
            ? ` We detected a ${detail.detectedFormat} file instead.`
            : ''
        } In DEGIRO: Inbox → Account Statement → export to XLSX, then drop it here.`,
      };
    case 'degiro_transactions_export':
      return {
        title: 'That’s the DEGIRO Transactions export',
        body: 'For your real return we need the Account Statement (Rekeningoverzicht) export instead — it carries the full history. In DEGIRO: Inbox → Account Statement → export to XLSX.',
      };
    case 'zero_resolved':
      return {
        title: 'We couldn’t match any of your holdings',
        body: `We read your statement but none of your ${detail.totalCount} position${detail.totalCount === 1 ? '' : 's'} could be matched to a ticker. This usually happens with funds or non-US-listed names our lookup doesn’t cover yet.`,
      };
    case 'no_positions':
      return {
        title: 'No open positions to show',
        body: detail.matchedCount > 0
          ? 'We matched your trades, but they’ve all been fully closed — there are no open positions left to chart.'
          : 'We read your DEGIRO statement but found no buy/sell transactions in it.',
      };
    case 'parse_error':
    default:
      return {
        title: 'We couldn’t read that file',
        body: detail?.message ?? 'Please try exporting your DEGIRO Account Statement again as XLSX.',
      };
  }
}

const CARD = {
  border: '1px solid #1c232c', borderRadius: 10, background: '#07090d',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
};

const DTCsvDemo = forwardRef(function DTCsvDemo(_props, ref) {
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
      Your file never leaves your browser — it&apos;s parsed on your device. To match your
      holdings to tickers, only the ISIN codes are sent to a lookup service. No account,
      and your statement is never uploaded.
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
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto 22px', padding: '0 24px' }}>
        {fileInput}
        <DTResultView perf={perf} result={detail} onReset={reset} />
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
            Reading your statement… nothing is being uploaded.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Drop your DEGIRO Account Statement here
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
              XLSX or CSV · or{' '}
              <span style={{ color: 'var(--accent-cta)', fontWeight: 600, textDecoration: 'underline' }}>
                browse your files
              </span>
            </div>

            {phase === 'error' && detail && (
              <div style={{
                margin: '18px auto 0', maxWidth: 520, textAlign: 'left',
                border: '1px solid var(--negative)', borderRadius: 8,
                padding: '12px 14px', background: 'rgba(248,81,73,0.06)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--negative)' }}>
                  {errorContent(detail).title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  {errorContent(detail).body}
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
