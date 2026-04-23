"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { startDemo } from "../../lib/startDemo";

const LivePreview        = dynamic(() => import("../../components/LivePreview"),        { ssr: false });
const StockIntelPreview  = dynamic(() => import("../../components/StockIntelPreview"),  { ssr: false });

const PAIN_SOURCES = ["Live market data", "Fundamentals", "Insider filings", "13F data"];

export default function LandingPage() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  const wrap = { maxWidth: 760, margin: "0 auto", padding: "0 24px" };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 48,
        borderBottom: "1px solid #1e2530",
        maxWidth: "100%",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <rect x="1"  y="14" width="4" height="6" rx="0.5" fill="#c49a1a" />
            <rect x="8"  y="9"  width="4" height="11" rx="0.5" fill="#c49a1a" />
            <rect x="15" y="4"  width="4" height="16" rx="0.5" fill="#c49a1a" />
            <path d="M2 12 L10 6 L17.5 0.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span style={{ color: '#c49a1a', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em' }}>STOCK</span>
          <span style={{ color: '#2563eb', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em' }}>DASHES</span>
        </Link>
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

      {/* ── HERO + LIVE TABLE ── */}
      <section style={{ ...wrap, paddingTop: 40, paddingBottom: 0, textAlign: "center" }}>
        <h1 style={{
          fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, lineHeight: 1.1,
          letterSpacing: "-0.02em", margin: "0 0 12px", color: "#e6edf3",
        }}>
          Your portfolio, analyzed by AI.
        </h1>
        <p style={{
          fontSize: 16, color: "rgba(230,237,243,0.5)", lineHeight: 1.5,
          margin: "0 0 24px",
        }}>
          AI-powered summaries for every stock and your entire portfolio. Plus all the data you need — earnings, insider trades, macro — all free.
        </p>

        {/* Live table — the CTA */}
        <LivePreview />

        {/* Stock Intel Preview */}
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: "rgba(230,237,243,0.3)", textAlign: "center", margin: "0 0 12px", letterSpacing: "0.03em" }}>
            More than just prices — AI-powered research for every stock
          </p>
          <StockIntelPreview />
        </div>
      </section>

      {/* ── AI FEATURE CARDS ── */}
      <section style={{ ...wrap, paddingTop: 40, paddingBottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>

          {/* Card 1 — Stock AI Summary */}
          <div style={{
            padding: "20px 22px", borderRadius: 10,
            border: "1px solid rgba(34,211,238,0.2)", background: "rgba(34,211,238,0.03)",
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#22d3ee",
              background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)",
              borderRadius: 4, padding: "2px 7px", display: "inline-block", marginBottom: 10,
            }}>PER STOCK</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px", color: "#e6edf3" }}>Stock AI Summary</h3>
            <p style={{ color: "rgba(230,237,243,0.45)", fontSize: 13, lineHeight: 1.55, margin: "0 0 14px" }}>
              Claude analyzes bull/bear case, valuation, insider activity, earnings history and your position size — then writes a personalized investment summary.
            </p>
            <div style={{
              background: "#0d1117", border: "1px solid #1e2530", borderRadius: 8,
              padding: "12px 14px", fontSize: 12, color: "rgba(230,237,243,0.6)", lineHeight: 1.6,
              fontStyle: "italic",
            }}>
              "NVDA offers strong AI tailwinds but trades at a premium valuation. Given your 45-share position at $198 avg cost, you're currently up 26%. Watch the next earnings report — any guidance cut would be the key risk to monitor."
            </div>
          </div>

          {/* Card 2 — Portfolio AI Summary */}
          <div style={{
            padding: "20px 22px", borderRadius: 10,
            border: "1px solid rgba(34,211,238,0.2)", background: "rgba(34,211,238,0.03)",
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#22d3ee",
              background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)",
              borderRadius: 4, padding: "2px 7px", display: "inline-block", marginBottom: 10,
            }}>FULL PORTFOLIO</span>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 6px", color: "#e6edf3" }}>Portfolio AI Summary</h3>
            <p style={{ color: "rgba(230,237,243,0.45)", fontSize: 13, lineHeight: 1.55, margin: "0 0 14px" }}>
              One click gives you a complete portfolio health check — performance, concentration risk, diversification, and one actionable insight based on your actual holdings.
            </p>
            <div style={{
              background: "#0d1117", border: "1px solid #1e2530", borderRadius: 8,
              padding: "12px 14px", fontSize: 12, color: "rgba(230,237,243,0.6)", lineHeight: 1.6,
              fontStyle: "italic",
            }}>
              "Your 5-stock portfolio is led by TSLA (+7.62%) and SNAP (+7.86%) today. NVDA is your largest position and biggest long-term driver. Concentration in tech and consumer discretionary is high — adding a defensive or energy position could reduce sector risk."
            </div>
          </div>

        </div>
      </section>

      {/* ── PAIN STRIP ── */}
      <section style={{ borderTop: "1px solid #1e2530", borderBottom: "1px solid #1e2530", padding: "13px 24px", marginTop: 40 }}>
        <div style={{
          maxWidth: 760, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap",
        }}>
          {PAIN_SOURCES.map((src, i) => (
            <span key={src} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ color: "rgba(230,237,243,0.35)", fontSize: 13 }}>{src}</span>
              {i < PAIN_SOURCES.length - 1 && (
                <span style={{ color: "rgba(230,237,243,0.18)", margin: "0 9px", fontSize: 13 }}>·</span>
              )}
            </span>
          ))}
          <span style={{ color: "rgba(230,237,243,0.18)", margin: "0 9px", fontSize: 13 }}>→</span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: "#3b82f6",
            background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 6, padding: "2px 10px",
          }}>1 dashboard</span>
        </div>
      </section>

{/* ── FINAL CTA ── */}
      <section style={{ ...wrap, textAlign: "center", paddingBottom: 80 }}>
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
        <span style={{ fontWeight: 800, letterSpacing: "0.06em", color: "rgba(230,237,243,0.35)" }}>STOCKDASH</span>
        <span>Free &amp; open · No ads · stockdashes.com</span>
      </footer>
    </div>
  );
}
