"use client";
import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Logo from "@/components/Logo";
import { SignInButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { startDemo } from "@/lib/startDemo";
import PortfolioAISummary from "@/components/PortfolioAISummary";
import { heroSummary } from "@/lib/demoAISummary";

const LivePreview       = dynamic(() => import("@/components/LivePreview"),       { ssr: false });
const StockIntelPreview = dynamic(() => import("@/components/StockIntelPreview"), { ssr: false });

// ── Shared style constants ────────────────────────────────────────────────────
const overlinePill = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#22d3ee",
  background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)",
  borderRadius: 4, padding: "2px 7px", display: "inline-block",
  marginBottom: 10, textTransform: "uppercase",
};
const sectionH2Style = {
  fontSize: "clamp(20px, 2.5vw, 28px)", fontWeight: 700,
  margin: "0 0 10px", color: "#e6edf3", letterSpacing: "-0.015em",
};
const sectionDescStyle = {
  fontSize: 14, color: "rgba(230,237,243,0.55)", lineHeight: 1.65, margin: 0,
};
const sectionWrap = { maxWidth: 1100, margin: "0 auto", padding: "0 24px" };

export default function LandingPage() {
  // Fix 5: IntersectionObserver for StockIntelPreview — mounts only when near viewport
  const sipRef = useRef(null);
  const [sipVisible, setSipVisible] = useState(false);

  useEffect(() => {
    const el = sipRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSipVisible(true); // fallback for unsupported browsers
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setSipVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @media (max-width: 639px) {
          .hero-cols   { flex-direction: column !important; }
          .hero-ctas   { flex-direction: column !important; }
          .hero-ctas a, .hero-ctas button { width: 100% !important; box-sizing: border-box !important; justify-content: center !important; }
          .section-row { flex-direction: column !important; }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 48, borderBottom: "1px solid #1e2530",
      }}>
        <Logo />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SignInButton mode="modal" forceRedirectUrl="/dashboard" appearance={{ baseTheme: dark }}>
            <button style={{
              background: "none", border: "1px solid #30363d", borderRadius: 6,
              color: "#e6edf3", fontSize: 13, fontWeight: 600, padding: "5px 14px",
              cursor: "pointer", fontFamily: "inherit",
            }}>Sign In</button>
          </SignInButton>
          <a href="/sign-up" style={{
            background: "#3b82f6", border: "1px solid #3b82f6", borderRadius: 6,
            color: "#fff", fontSize: 13, fontWeight: 600, padding: "5px 14px",
            textDecoration: "none", display: "inline-block",
          }}>Sign Up</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ ...sectionWrap, paddingTop: 56, paddingBottom: 64 }}>
        <div className="hero-cols" style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>

          {/* Left column — ~60% */}
          <div style={{ flex: "0 0 50%", minWidth: 0 }}>
            <h1 style={{
              fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, lineHeight: 1.1,
              letterSpacing: "-0.02em", margin: "0 0 16px", color: "#e6edf3",
            }}>
              Portfolio analysis by Claude Opus 4.7
            </h1>
            <p style={{
              fontSize: 17, color: "rgba(230,237,243,0.6)", lineHeight: 1.65,
              margin: "0 0 28px", maxWidth: 480,
            }}>
              Instant insights on every stock and your entire portfolio. Built on Anthropic's flagship AI model. No signup required to try it.
            </p>

            <div className="hero-ctas" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <button
                onClick={() => startDemo("/dashboard")}
                style={{
                  padding: "13px 28px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15,
                  fontFamily: "inherit", boxShadow: "0 0 28px rgba(59,130,246,0.3)",
                }}
              >
                Try the demo →
              </button>
              <a href="/sign-up" style={{
                padding: "13px 24px", borderRadius: 10,
                border: "1px solid #30363d", background: "none",
                color: "#e6edf3", fontWeight: 600, fontSize: 15,
                textDecoration: "none", display: "inline-flex", alignItems: "center",
              }}>
                Sign up free
              </a>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                color: "rgba(230,237,243,0.45)",
                background: "rgba(88,166,255,0.08)", border: "1px solid rgba(88,166,255,0.2)",
                borderRadius: 100, padding: "3px 12px", textTransform: "uppercase",
              }}>
                Powered by Claude Opus 4.7
              </span>
            </div>

            <p style={{ color: "rgba(230,237,243,0.25)", fontSize: 12, margin: 0 }}>
              No account needed · Loads in seconds · Your data stays on your device
            </p>

            <div style={{ marginTop: 32, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                color: "rgba(230,237,243,0.3)", textTransform: "uppercase", marginBottom: 10,
              }}>
                What Claude looks for:
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "Which position dominates your risk exposure",
                  "Hidden correlation across positions that move as one",
                  "Whether your winners are carrying underperformers",
                  "Sector concentration with no defensive offset",
                  "One concrete action to reduce your biggest vulnerability",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#22d3ee", fontSize: 12, flexShrink: 0, marginTop: 1 }}>•</span>
                    <span style={{ fontSize: 13, color: "rgba(230,237,243,0.45)", lineHeight: 1.5 }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right column — ~40% */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <PortfolioAISummary initialSummary={heroSummary} />
            <p style={{ fontSize: 11, color: "rgba(230,237,243,0.2)", textAlign: "center", marginTop: 6, marginBottom: 0 }}>
              Sample portfolio · Live analysis with your real holdings after sign-up
            </p>
          </div>

        </div>
      </section>

      {/* ── SECTION 1: Research any stock ── */}
      <section style={{ borderTop: "1px solid #1e2530", paddingTop: 64, paddingBottom: 64 }}>
        <div style={sectionWrap}>
          <div className="section-row" style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
            <div ref={sipRef} style={{ flex: 1, minWidth: 0 }}>
              {sipVisible
                ? <StockIntelPreview />
                : <div style={{ minHeight: 340, background: "#161b22", border: "1px solid #1e2530", borderRadius: 12 }} />
              }
            </div>
            <div style={{ flex: "0 0 38%", minWidth: 0, paddingTop: 8 }}>
              <span style={overlinePill}>PER STOCK</span>
              <h2 style={sectionH2Style}>Research any stock</h2>
              <p style={sectionDescStyle}>
                Bull case, bear case, valuation, and what to watch next. Generated by Claude for every position in your portfolio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: Live market data ── */}
      <section style={{ borderTop: "1px solid #1e2530", paddingTop: 64, paddingBottom: 64 }}>
        <div style={sectionWrap}>
          <div className="section-row" style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
            <div style={{ flex: "0 0 38%", minWidth: 0, paddingTop: 8 }}>
              <span style={overlinePill}>MARKET DATA</span>
              <h2 style={sectionH2Style}>Live market data, always free</h2>
              <p style={sectionDescStyle}>
                Earnings history, insider transactions, analyst price targets, institutional holdings. No paywalls, no subscription, no account required to explore.
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <LivePreview showCta={false} />
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: Why Claude Opus 4.7? ── */}
      <section style={{ borderTop: "1px solid #1e2530", padding: "48px 24px", background: "rgba(255,255,255,0.015)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            color: "rgba(230,237,243,0.35)", textTransform: "uppercase", marginBottom: 16,
          }}>
            Why Claude Opus 4.7?
          </div>
          <p style={{ fontSize: 16, color: "rgba(230,237,243,0.6)", lineHeight: 1.7, margin: 0 }}>
            Opus 4.7 is Anthropic's most capable AI model. It's the same technology used in professional research and legal analysis. When you analyze a portfolio on StockDashes, you're getting the best AI available for the job, free.
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ maxWidth: 760, margin: "0 auto", textAlign: "center", padding: "64px 24px 80px" }}>
        <h2 style={{
          fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 700, letterSpacing: "-0.025em",
          margin: "0 0 24px",
        }}>
          Your portfolio, fully researched.
        </h2>
        <a href="/sign-up" style={{
          display: "inline-block", padding: "13px 32px", borderRadius: 10,
          background: "#3b82f6", color: "#fff", textDecoration: "none",
          fontWeight: 700, fontSize: 15, fontFamily: "inherit",
          boxShadow: "0 0 28px rgba(59,130,246,0.3)",
        }}>
          Get Started — It's Free
        </a>
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => startDemo("/dashboard")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(230,237,243,0.4)", fontSize: 13, fontFamily: "inherit",
              textDecoration: "underline", padding: 0,
            }}
          >
            or try the demo
          </button>
        </div>
        <p style={{ color: "rgba(230,237,243,0.25)", fontSize: 12, marginTop: 14 }}>
          No credit card · No ads · Your data stays on your device
        </p>
      </section>

      {/* ── DISCLAIMER ── */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.08)", padding: "12px 24px",
        textAlign: "center", fontSize: 11, color: "#6b7280",
      }}>
        StockDashes is for informational purposes only and does not constitute financial advice. Market data may be delayed or inaccurate. AI-generated summaries are automated and should not be relied upon for investment decisions. Always do your own research.
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid #1e2530", padding: "24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12,
        color: "rgba(230,237,243,0.22)", fontSize: 12,
        maxWidth: 760, margin: "0 auto",
      }}>
        <Logo />
        <span>Free &amp; open · No ads · stockdashes.com</span>
      </footer>
    </div>
  );
}
