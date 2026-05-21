"use client";
import { useEffect } from "react";
import Logo from "@/components/Logo";
import { SignInButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { startDemo } from "@/lib/startDemo";
import { track } from "@/lib/posthog";
import { getAttribution } from "@/lib/attribution";
import DTerminalHero from "./_components/DTerminalHero";
import DTCapabilityStrip from "./_components/DTCapabilityStrip";
import DTTrustStrip from "./_components/DTTrustStrip";

export default function LandingPage() {
  useEffect(() => {
    track('landing_view', { attribution: getAttribution() });
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── NAVBAR ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 48, borderBottom: "1px solid #1e2530",
      }}>
        <Logo />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/blog" style={{ color: "#8b949e", fontSize: 13, fontWeight: 500, textDecoration: "none", marginRight: 8 }}>Blog</a>
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
      <DTerminalHero />

      <DTCapabilityStrip />
      <DTTrustStrip />

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
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>Free &amp; open · No ads · stockdashes.com</span>
          <a href="/blog" style={{ color: 'rgba(230,237,243,0.22)', textDecoration: 'none' }}>Blog</a>
          <a href="/privacy" style={{ color: 'rgba(230,237,243,0.22)', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
}
