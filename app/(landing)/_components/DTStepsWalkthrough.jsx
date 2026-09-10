// Three-step "how it works" section, directly under the hero.
//
// Step images live in /public/landing — all three are real screenshots.
//
// Step 2's annotation (arrow + label pointing at DEGIRO's download icon) is
// rendered in CSS over the screenshot — NOT baked into the PNG — so it stays
// sharp and restyleable, and collapses to a compact label on narrow screens.

import { UI_STRINGS } from '@/lib/landing/brokerConfigs';

const STEP2_IMG = '/landing/degiro-step2-rekeningoverzicht.png';

export default function DTStepsWalkthrough({ lang = 'en' }) {
  // English stays inline below (to keep its bold emphasis and leave the homepage
  // byte-identical); non-English pulls plain strings from the config.
  const t = lang !== 'en' ? UI_STRINGS[lang]?.steps ?? null : null;
  return (
    <section id="how-it-works" style={{ padding: '72px 24px', borderTop: '1px solid #1e2530' }}>
      <style>{`
        .dt-steps-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: auto auto;   /* row 1: captions, row 2: images */
          gap: 16px 24px;                  /* row gap = caption→image; col gap between steps */
        }
        /* Each step spans both rows as a subgrid, so every caption shares row 1's
           height and the images line up on row 2 — no matter how many lines a
           caption wraps to at a given column width. (A fixed em reserve broke
           around 900px, where step 1's Saxo line wraps to an extra line.) */
        .dt-step {
          display: grid;
          grid-row: span 2;
          grid-template-rows: subgrid;
        }
        @media (max-width: 860px) {
          .dt-steps-grid { grid-template-columns: 1fr; grid-template-rows: none; gap: 40px; }
          .dt-step { display: block; }
          .dt-step .dt-step-imgwrap { margin-top: 16px; }
        }
        /* Images render at their natural proportions — no cropping. Different
           aspect ratios leave the row a little ragged at the bottom; align-self:
           start keeps each image its natural height, pinned to the row top. */
        .dt-step-imgwrap {
          position: relative;
          align-self: start;
          border: 1px solid #1e2530;
          border-radius: 8px;
          overflow: hidden;
          background: #0d1117;
        }
        .dt-step-img { display: block; width: 100%; height: auto; }
        /* Step-2 annotation points at the export/download icon in the filter bar
           (~40% down the crop, far right). The label rides in the empty gap just
           left of the icon. */
        .dt-step2-annotation {
          position: absolute;
          top: 40%;
          right: 3%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 6px;
          pointer-events: none;
        }
        .dt-step2-annotation .dt-arrow {
          font-size: 22px;
          line-height: 1;
          color: #3b82f6;
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
          white-space: nowrap;
        }
        @media (max-width: 500px) {
          /* Degrade on mobile: shrink the label/arrow; the focal crop keeps the
             icon in the same relative spot, so the annotation still lands. */
          .dt-step2-annotation .dt-arrow { font-size: 18px; }
          .dt-step2-annotation .dt-label { font-size: 10px; padding: 4px 7px; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto 40px', textAlign: 'center' }}>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          color: '#3b82f6', textTransform: 'uppercase', marginBottom: 12,
        }}>
          {t ? t.eyebrow : 'From export to insight in three steps'}
        </div>
        <h2 style={{
          fontSize: 34, fontWeight: 800, color: '#e6edf3',
          letterSpacing: '-0.02em', margin: 0,
        }}>
          {t ? t.heading : 'One file. No broker login.'}
        </h2>
      </div>

      <div className="dt-steps-grid">
        {/* STEP 01 — export from DEGIRO */}
        <Step
          num="01"
          title={t ? t.s1.title : 'Export from DEGIRO'}
          body={t ? t.s1.body : <>Inbox → <strong>Rekeningoverzicht</strong> (Account Statement). Set the range to your <strong>full history</strong>, not just the last year — a partial export makes the return wrong. Export as XLSX or CSV.<span style={{ display: 'block', marginTop: 6, color: 'rgba(230,237,243,0.4)' }}>Using Saxo? The same works with your Saxo account statement.</span></>}
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
          title={t ? t.s2.title : 'Drop the file in'}
          body={t ? t.s2.body : <>We parse it: ISINs resolved, deposits split from trades, historical FX applied, same-day trades ordered.</>}
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
              <span className="dt-label">{t ? t.s2.annotation : 'Export here'}</span>
              <span className="dt-arrow">→</span>
            </div>
          </div>
        </Step>

        {/* STEP 03 — see your real return */}
        <Step
          num="03"
          title={t ? t.s3.title : 'See your real return'}
          body={t ? t.s3.body : <>Time-weighted return vs benchmark, per-position P&amp;L, and an AI research brief on every holding.</>}
        >
          <div className="dt-step-imgwrap">
            <img
              className="dt-step-img"
              src="/landing/stockdashes-step3-real-return.png"
              alt="StockDashes dashboard showing time-weighted return vs MSCI World, per-position P&L and an AI research brief"
              loading="lazy"
            />
          </div>
        </Step>
      </div>
    </section>
  );
}

function Step({ num, title, body, children }) {
  return (
    <div className="dt-step">
      {/* caption block = subgrid row 1 (all captions share its height) */}
      <div className="dt-step-caption">
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
      </div>
      {/* image = subgrid row 2 */}
      {children}
    </div>
  );
}
