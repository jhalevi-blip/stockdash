// Three-step "how it works" section, directly under the hero.
//
// Step images live in /public/landing. Steps 1 & 2 are real screenshots;
// step 3 is a labelled placeholder until the result screenshot is supplied
// (drop it at /public/landing/stockdashes-step3-real-return.png and swap the
// placeholder <div> for the commented-out <img> below).
//
// Step 2's annotation (arrow + label pointing at DEGIRO's download icon) is
// rendered in CSS over the screenshot — NOT baked into the PNG — so it stays
// sharp and restyleable, and collapses to a compact label on narrow screens.

const STEP2_IMG = '/landing/degiro-step2-rekeningoverzicht.png';

export default function DTStepsWalkthrough() {
  return (
    <section style={{ padding: '72px 24px', borderTop: '1px solid #1e2530' }}>
      <style>{`
        .dt-steps-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 860px) {
          .dt-steps-grid { grid-template-columns: 1fr; gap: 40px; }
        }
        .dt-step-imgwrap {
          position: relative;
          margin-top: 16px;
          border: 1px solid #1e2530;
          border-radius: 8px;
          overflow: hidden;
          background: #0d1117;
        }
        .dt-step-img { display: block; width: 100%; height: auto; }
        /* Step-2 annotation: sits over the top-right download icon */
        .dt-step2-annotation {
          position: absolute;
          top: 8%;
          right: 4%;
          max-width: 62%;
          display: flex;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }
        .dt-step2-annotation .dt-arrow {
          font-size: 22px;
          line-height: 1;
          color: #3b82f6;
          transform: translateY(-2px);
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
        }
        .dt-step2-annotation .dt-label {
          background: #3b82f6;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.3;
          padding: 6px 10px;
          border-radius: 6px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        }
        @media (max-width: 500px) {
          /* Degrade on mobile: drop the arrow, shrink + anchor the label so it
             never overflows the screenshot. */
          .dt-step2-annotation { top: 4%; right: 3%; left: 3%; max-width: none; justify-content: flex-end; }
          .dt-step2-annotation .dt-arrow { display: none; }
          .dt-step2-annotation .dt-label { font-size: 10px; padding: 4px 7px; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto 40px', textAlign: 'center' }}>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          color: '#3b82f6', textTransform: 'uppercase', marginBottom: 12,
        }}>
          From export to insight in three steps
        </div>
        <h2 style={{
          fontSize: 34, fontWeight: 800, color: '#e6edf3',
          letterSpacing: '-0.02em', margin: 0,
        }}>
          One file. No broker login.
        </h2>
      </div>

      <div className="dt-steps-grid">
        {/* STEP 01 — export from DEGIRO */}
        <Step
          num="01"
          title="Export from DEGIRO"
          body={<>Inbox → <strong>Rekeningoverzicht</strong> (Account Statement), pick your full date range, export as XLSX or CSV.</>}
        >
          <div className="dt-step-imgwrap">
            <img
              className="dt-step-img"
              src="/landing/degiro-step1-inbox.png"
              alt="DEGIRO Inbox navigation with the Rekeningoverzicht (Account Statement) tab highlighted"
              loading="lazy"
            />
          </div>
        </Step>

        {/* STEP 02 — drop the file in (annotation bridges DEGIRO download → StockDashes) */}
        <Step
          num="02"
          title="Drop the file in"
          body={<>We parse it: ISINs resolved, deposits split from trades, historical FX applied, same-day trades ordered.</>}
        >
          <div className="dt-step-imgwrap">
            <img
              className="dt-step-img"
              src={STEP2_IMG}
              alt="DEGIRO Rekeningoverzicht (Account Statement) view showing the date range and the export/download icon in the top-right"
              loading="lazy"
            />
            {/* CSS-overlaid annotation — points at DEGIRO's top-right download icon */}
            <div className="dt-step2-annotation" aria-hidden="true">
              <span className="dt-label">Export here</span>
              <span className="dt-arrow">↗</span>
            </div>
          </div>
        </Step>

        {/* STEP 03 — see your real return (placeholder until result screenshot supplied) */}
        <Step
          num="03"
          title="See your real return"
          body={<>Time-weighted return vs benchmark, per-position P&amp;L, and an AI research brief on every holding.</>}
        >
          {/* Swap for: <img className="dt-step-img" src="/landing/stockdashes-step3-real-return.png" alt="StockDashes dashboard showing time-weighted return vs MSCI World" loading="lazy" /> */}
          <div
            className="dt-step-imgwrap"
            style={{
              aspectRatio: '16 / 10',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 8, border: '1px dashed #30363d',
              color: '#6e7681', textAlign: 'center', padding: 16,
            }}
          >
            <div style={{ fontSize: 24 }}>📷</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8b949e' }}>Result screenshot</div>
            <code style={{ fontSize: 11, color: '#6e7681' }}>/landing/stockdashes-step3-real-return.png</code>
          </div>
        </Step>
      </div>
    </section>
  );
}

function Step({ num, title, body, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 13, fontWeight: 800, color: '#3b82f6',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em',
          border: '1px solid rgba(59,130,246,0.35)', borderRadius: 6,
          padding: '2px 8px', background: 'rgba(59,130,246,0.08)',
        }}>{num}</span>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#e6edf3', margin: 0 }}>{title}</h3>
      </div>
      <p style={{ fontSize: 14, color: 'rgba(230,237,243,0.6)', lineHeight: 1.55, margin: '10px 0 0' }}>
        {body}
      </p>
      {children}
    </div>
  );
}
