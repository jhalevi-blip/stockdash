"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const LivePreview = dynamic(() => import("../../components/LivePreview"), { ssr: false });

const FEATURES = [
  { icon: "📊", title: "Dashboard",           desc: "P&L, price charts, earnings calendar, and live news for your holdings.",                    link: "/dashboard" },
  { icon: "📈", title: "Performance",          desc: "Portfolio vs SPY mirror, EUR/USD currency impact, beta-adjusted returns.",                   link: "/performance" },
  { icon: "🌐", title: "Macro",                desc: "S&P 500, NASDAQ, VIX, fear & greed, treasury yields, commodities, and FX.",                 link: "/macro" },
  { icon: "🔍", title: "Insider Transactions", desc: "See what executives are buying and selling across your portfolio stocks.",                   link: "/insider" },
  { icon: "🏛️", title: "Ownership & 13F",     desc: "Institutional ownership % and holdings from Ackman, Einhorn, Druckenmiller & more.",        link: "/institutional" },
  { icon: "⚖️", title: "Peer Comparison",     desc: "Side-by-side valuation multiples and financial metrics vs industry peers.",                  link: "/peers" },
  { icon: "📁", title: "SEC Research",         desc: "Browse 10-K, 10-Q, and 8-K filings directly for any stock in your portfolio.",              link: "/research" },
  { icon: "💰", title: "Valuation",            desc: "P/E, P/S, P/B, EV/EBITDA, ROE, margins — sortable across all your positions.",             link: "/valuation" },
  { icon: "📅", title: "Earnings",             desc: "EPS history, beat/miss streaks, estimate vs actual charts going back years.",               link: "/earnings" },
  { icon: "🎯", title: "Analyst Targets",      desc: "Consensus price targets, upside %, and analyst count.",                                     link: "/analyst" },
];

const PAIN_SOURCES = [
  "Yahoo Finance", "Seeking Alpha", "WhaleWisdom", "EDGAR", "Finviz", "Koyfin",
];

export default function LandingPage() {
  const liveRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  const scrollToLive = () => {
    liveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const wrap = { maxWidth: 1100, margin: "0 auto", padding: "0 24px" };

  return (
    <div style={{
      minHeight: "100vh", background: "#0d1117", color: "#e6edf3",
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* ── HERO ── */}
      <section style={{ ...wrap, textAlign: "center", paddingTop: 88, paddingBottom: 56 }}>
        <h1 style={{
          fontSize: "clamp(32px, 5vw, 60px)", fontWeight: 700, lineHeight: 1.1,
          letterSpacing: "-0.03em", margin: "0 0 20px",
          color: "#e6edf3",
        }}>
          Stop switching between 10 tabs.
          <br />
          <span style={{ color: "#3b82f6" }}>Everything you check as an investor,</span>
          <br />
          in one dashboard.
        </h1>

        <p style={{
          fontSize: 17, color: "rgba(230,237,243,0.55)", lineHeight: 1.65,
          maxWidth: 580, margin: "0 auto 36px",
        }}>
          Earnings, insider trades, fund holdings, peer comparisons, macro data — all free, no ads.
        </p>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/sign-up" style={{
            padding: "13px 30px", borderRadius: 10, border: "none", textDecoration: "none",
            background: "#3b82f6", color: "#fff",
            fontWeight: 700, fontSize: 16, fontFamily: "inherit",
            boxShadow: "0 0 36px rgba(59,130,246,0.35)",
          }}>
            Get Started — It's Free
          </a>
          <button
            onClick={scrollToLive}
            style={{
              padding: "13px 30px", borderRadius: 10, cursor: "pointer",
              border: "1px solid rgba(230,237,243,0.18)", background: "transparent",
              color: "#e6edf3", fontWeight: 600, fontSize: 16, fontFamily: "inherit",
            }}
          >
            See It Live ↓
          </button>
        </div>

        <p style={{ color: "rgba(230,237,243,0.28)", fontSize: 13, marginTop: 18 }}>
          No credit card · No ads · Portfolio stays on your device
        </p>
      </section>

      {/* ── PAIN STRIP ── */}
      <section style={{ borderTop: "1px solid #1e2530", borderBottom: "1px solid #1e2530", padding: "14px 24px" }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexWrap: "wrap", gap: "0 0",
        }}>
          {PAIN_SOURCES.map((src, i) => (
            <span key={src} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ color: "rgba(230,237,243,0.38)", fontSize: 13, fontWeight: 500 }}>{src}</span>
              {i < PAIN_SOURCES.length - 1 && (
                <span style={{ color: "rgba(230,237,243,0.2)", margin: "0 10px", fontSize: 13 }}>+</span>
              )}
            </span>
          ))}
          <span style={{ color: "rgba(230,237,243,0.2)", margin: "0 10px", fontSize: 13 }}>→</span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: "#3b82f6",
            background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 6, padding: "2px 10px",
          }}>1 dashboard</span>
        </div>
      </section>

      {/* ── DEMO VIDEO ── */}
      <section style={{ ...wrap, paddingTop: 56, paddingBottom: 56 }}>
        <div style={{
          maxWidth: 900, margin: "0 auto",
          borderRadius: 12, overflow: "hidden",
          border: "1px solid #1e2530",
          boxShadow: "0 0 60px rgba(59,130,246,0.08), 0 20px 50px rgba(0,0,0,0.5)",
        }}>
          <video
            src="/demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            style={{ width: "100%", display: "block" }}
          />
        </div>
      </section>

      {/* ── LIVE MINI-DASHBOARD ── */}
      <section ref={liveRef} style={{ ...wrap, paddingBottom: 64 }} id="live-preview">
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            See what's moving right now
          </h2>
          <p style={{ color: "rgba(230,237,243,0.45)", fontSize: 15, margin: 0 }}>
            Live market data, no login required.
          </p>
        </div>
        <LivePreview />
      </section>

      {/* ── FEATURE GRID ── */}
      <section style={{ ...wrap, paddingBottom: 64 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            Everything in one place
          </h2>
          <p style={{ color: "rgba(230,237,243,0.45)", fontSize: 15, margin: 0 }}>
            Add your tickers once. Every page updates automatically.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {FEATURES.map((f, i) => (
            <a key={i} href={f.link} style={{
              padding: "22px 24px", borderRadius: 12, textDecoration: "none",
              border: "1px solid #1e2530", background: "rgba(255,255,255,0.015)",
              display: "block", transition: "border-color 0.2s, background 0.2s, transform 0.2s",
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.35)";
                e.currentTarget.style.background = "rgba(59,130,246,0.04)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#1e2530";
                e.currentTarget.style.background = "rgba(255,255,255,0.015)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "#e6edf3" }}>{f.title}</h3>
              <p style={{ color: "rgba(230,237,243,0.45)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ ...wrap, textAlign: "center", paddingBottom: 100 }}>
        <div style={{
          padding: "56px 32px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.03) 100%)",
          border: "1px solid rgba(59,130,246,0.15)",
        }}>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 16px" }}>
            Start researching your portfolio today
          </h2>
          <p style={{ color: "rgba(230,237,243,0.45)", fontSize: 15, margin: "0 auto 32px", maxWidth: 440 }}>
            Free to get started. No credit card required. Your data stays on your device.
          </p>
          <a href="/sign-up" style={{
            display: "inline-block", padding: "14px 36px", borderRadius: 10,
            background: "#3b82f6", color: "#fff", textDecoration: "none",
            fontWeight: 700, fontSize: 16, fontFamily: "inherit",
            boxShadow: "0 0 36px rgba(59,130,246,0.35)",
          }}>
            Get Started — It's Free
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid #1e2530", padding: "32px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 16,
        color: "rgba(230,237,243,0.25)", fontSize: 13, maxWidth: 1100, margin: "0 auto",
      }}>
        <span style={{ fontWeight: 800, letterSpacing: "0.06em", color: "rgba(230,237,243,0.4)" }}>
          STOCKDASH
        </span>
        <span>Free &amp; open · No ads · stockdashes.com</span>
      </footer>
    </div>
  );
}
