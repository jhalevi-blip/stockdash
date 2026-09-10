'use client';
// One shared, config-driven broker landing page. Adding a broker (or a language)
// is a new entry in lib/landing/brokerConfigs.js — never a new page component.
// Reuses DTCsvDemo, DTStepsWalkthrough and DTTrustStrip as-is (no new demo code).
import { useRef, useEffect } from 'react';
import Logo from '@/components/Logo';
import { SignInButton, SignUpButton, useUser } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { CHROME } from '@/lib/landing/brokerConfigs';
import DTCsvDemo from './DTCsvDemo';
import DTStepsWalkthrough from './DTStepsWalkthrough';
import DTTrustStrip from './DTTrustStrip';

export default function BrokerLanding({ config }) {
  const { isLoaded, isSignedIn } = useUser();
  const demoRef = useRef(null);
  const c = config.copy;
  const chrome = CHROME[config.lang] ?? CHROME.en;

  // Declare the content language (the shared root layout hardcodes <html lang="en">;
  // the wrapper below carries lang in the SSR HTML and this syncs <html> on hydrate).
  useEffect(() => { if (config.lang) document.documentElement.lang = config.lang; }, [config.lang]);

  return (
    <div lang={config.lang} style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── NAV ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 48, borderBottom: '1px solid #1e2530' }}>
        <Logo />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/blog" style={{ color: '#8b949e', fontSize: 13, fontWeight: 500, textDecoration: 'none', marginRight: 8 }}>{chrome.blog}</a>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', visibility: isLoaded ? 'visible' : 'hidden' }}>
            {isSignedIn ? (
              <a href="/dashboard" style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontWeight: 600, padding: '5px 14px', textDecoration: 'none' }}>{chrome.dashboard}</a>
            ) : (
              <>
                <SignInButton mode="modal" forceRedirectUrl="/dashboard" appearance={{ baseTheme: dark }}>
                  <button style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#e6edf3', fontSize: 13, fontWeight: 600, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>{chrome.signIn}</button>
                </SignInButton>
                <a href="/sign-up" style={{ background: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '5px 14px', textDecoration: 'none' }}>{chrome.signUp}</a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section data-theme="dark" style={{ background: '#0d1117' }}>
        <div style={{ padding: '48px 32px 22px', textAlign: 'center', maxWidth: 820, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent-cta)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 4, padding: '3px 9px', textTransform: 'uppercase', marginBottom: 16 }}>
            {c.eyebrow}
          </span>
          <h1 style={{ fontSize: 42, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.06, margin: '0 0 14px' }}>
            {c.h1}
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(230,237,243,0.6)', lineHeight: 1.55, margin: '0 auto', maxWidth: 620 }}>
            {c.subhead}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
            <button onClick={() => demoRef.current?.openPicker()} style={{ padding: '13px 30px', borderRadius: 10, background: 'var(--accent-cta)', border: '1px solid var(--accent-cta)', color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 0 28px rgba(59,130,246,0.3)' }}>
              {c.ctaPrimary}
            </button>
            <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
              <button style={{ padding: '13px 30px', borderRadius: 10, background: 'transparent', border: '1px solid #30363d', color: 'var(--text-primary)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>
                {c.ctaSecondary}
              </button>
            </SignUpButton>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(230,237,243,0.35)', margin: '14px auto 0', maxWidth: 620, lineHeight: 1.5 }}>
            {c.trustFine}
          </p>
        </div>

        {/* The demo, reused (its own dropzone + result view), language-aware. The
            result view is framed as a full-width panel here — unlike the homepage,
            nothing follows it in the hero to give a bare 1200 card context. */}
        <DTCsvDemo ref={demoRef} lang={config.lang} framed />
      </section>

      {/* ── PROBLEM (states it, links out to the blog for the teaching) ── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 8px' }}>
        <h2 style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 16px', textAlign: 'center' }}>
          {c.problemTitle}
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(230,237,243,0.62)', lineHeight: 1.7, margin: '0 0 20px', textAlign: 'center' }}>
          {c.problemLead}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {c.problemLinks.map((l) => (
            <a key={l.href} href={l.href} style={{ color: '#58a6ff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>{l.label}</a>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <DTStepsWalkthrough lang={config.lang} />

      {/* ── TRUST ── */}
      <DTTrustStrip lang={config.lang} />

      {/* ── FAQ (mirrors the FAQPage JSON-LD in the page) ── */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 8px' }}>
        <h2 style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 24px', textAlign: 'center' }}>
          {c.faqTitle}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {config.faq.map((item) => (
            <div key={item.q}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{item.q}</h3>
              <p style={{ fontSize: 14, color: 'rgba(230,237,243,0.58)', lineHeight: 1.6, margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center', padding: '56px 24px 72px' }}>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.025em', margin: '0 0 24px' }}>
          {c.finalTitle}
        </h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', visibility: isLoaded ? 'visible' : 'hidden' }}>
          <a href={isSignedIn ? '/dashboard' : '/sign-up'} style={{ display: 'inline-block', padding: '13px 32px', borderRadius: 10, background: '#3b82f6', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15, boxShadow: '0 0 28px rgba(59,130,246,0.3)' }}>
            {isSignedIn ? chrome.dashboard + ' →' : c.finalCta}
          </a>
        </div>
      </section>

      {/* ── DISCLAIMER ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 24px', textAlign: 'center', fontSize: 11, color: '#6b7280' }}>
        {chrome.disclaimer}
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid #1e2530', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, color: 'rgba(230,237,243,0.22)', fontSize: 12, maxWidth: 760, margin: '0 auto' }}>
        <Logo />
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>{chrome.footerNote}</span>
          <a href="/blog" style={{ color: 'rgba(230,237,243,0.22)', textDecoration: 'none' }}>{chrome.blog}</a>
          <a href="/privacy" style={{ color: 'rgba(230,237,243,0.22)', textDecoration: 'none' }}>{chrome.privacy}</a>
        </div>
      </footer>
    </div>
  );
}
