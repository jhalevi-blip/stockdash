"use client";
import { useState, useEffect, useRef } from "react";

const HOLDINGS = [
  { ticker: "NVDA", name: "Nvidia", shares: 200, price: 177.39, change: 1.64, changePercent: 0.93, costBasis: 10000, sector: "Technology" },
  { ticker: "ASML", name: "ASML", shares: 200, price: 1317.23, change: -42.53, changePercent: -3.13, costBasis: 80000, sector: "Technology" },
  { ticker: "AMD", name: "AMD", shares: 50, price: 217.50, change: 7.30, changePercent: 3.47, costBasis: 5000, sector: "Technology" },
  { ticker: "SOFI", name: "SoFi", shares: 4000, price: 15.85, change: 0.22, changePercent: 1.41, costBasis: 60000, sector: "Financials" },
  { ticker: "AMZN", name: "Amazon", shares: 100, price: 209.77, change: -0.80, changePercent: -0.38, costBasis: 10000, sector: "Technology" },
  { ticker: "NKE", name: "Nike", shares: 100, price: 44.19, change: -0.44, changePercent: -0.99, costBasis: 5000, sector: "Consumer" },
];

const FEATURES = [
  { icon: "📊", title: "Dashboard", desc: "P&L, price charts, earnings calendar, and live news for your holdings.", link: "/dashboard" },
  { icon: "📈", title: "Performance", desc: "Portfolio vs SPY mirror, EUR/USD currency impact, beta-adjusted returns.", link: "/performance" },
  { icon: "🌐", title: "Macro", desc: "S&P 500, NASDAQ, VIX, fear & greed, treasury yields, commodities, and FX.", link: "/macro" },
  { icon: "🔍", title: "Insider Transactions", desc: "See what executives are buying and selling across your portfolio stocks.", link: "/insider" },
  { icon: "🏛️", title: "Ownership & 13F", desc: "Institutional ownership % and holdings from Ackman, Einhorn, Druckenmiller & more.", link: "/institutional" },
  { icon: "⚖️", title: "Peer Comparison", desc: "Side-by-side valuation multiples and financial metrics vs industry peers.", link: "/peers" },
  { icon: "📁", title: "SEC Research", desc: "Browse 10-K, 10-Q, and 8-K filings directly for any stock in your portfolio.", link: "/research" },
  { icon: "💰", title: "Valuation", desc: "P/E, P/S, P/B, EV/EBITDA, ROE, margins — sortable across all your positions.", link: "/valuation" },
  { icon: "📅", title: "Earnings", desc: "EPS history, beat/miss streaks, estimate vs actual charts going back years.", link: "/earnings" },
  { icon: "🎯", title: "Analyst Targets", desc: "Consensus price targets, upside %, and analyst count.", link: "/analyst" },
];

const STATS = [
  { value: "10", label: "Pages of research tools" },
  { value: "4", label: "Live data sources" },
  { value: "5", label: "Fund manager 13F portfolios" },
  { value: "100%", label: "Free, forever" },
];


function SortIcon({ direction }) {
  if (!direction) return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.3 }}>
      <path d="M6 2L9 5H3L6 2Z" fill="currentColor"/>
      <path d="M6 10L3 7H9L6 10Z" fill="currentColor"/>
    </svg>
  );
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      {direction === "asc" ? (
        <path d="M6 2L9 5H3L6 2Z" fill="currentColor"/>
      ) : (
        <path d="M6 10L3 7H9L6 10Z" fill="currentColor"/>
      )}
    </svg>
  );
}

function HoldingsTable() {
  const [sortKey, setSortKey] = useState("ticker");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...HOLDINGS].sort((a, b) => {
    let valA, valB;
    if (sortKey === "mktValue") {
      valA = a.shares * a.price; valB = b.shares * b.price;
    } else if (sortKey === "pnl") {
      valA = a.shares * a.price - a.costBasis; valB = b.shares * b.price - b.costBasis;
    } else if (sortKey === "pnlPct") {
      valA = (a.shares * a.price - a.costBasis) / a.costBasis; valB = (b.shares * b.price - b.costBasis) / b.costBasis;
    } else {
      valA = a[sortKey]; valB = b[sortKey];
    }
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (valA < valB) return sortDir === "asc" ? -1 : 1;
    if (valA > valB) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalValue = sorted.reduce((s, h) => s + h.shares * h.price, 0);
  const totalCost = sorted.reduce((s, h) => s + h.costBasis, 0);
  const totalPnl = totalValue - totalCost;

  const columns = [
    { key: "ticker", label: "Ticker", align: "left" },
    { key: "name", label: "Name", align: "left" },
    { key: "shares", label: "Shares", align: "right" },
    { key: "price", label: "Price", align: "right" },
    { key: "changePercent", label: "Chg %", align: "right" },
    { key: "costBasis", label: "Cost Basis", align: "right" },
    { key: "mktValue", label: "Mkt Value", align: "right" },
    { key: "pnl", label: "P&L $", align: "right" },
    { key: "pnlPct", label: "P&L %", align: "right" },
  ];

  return (
    <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,12,18,0.9)", backdropFilter: "blur(20px)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace" }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{
                  padding: "14px 16px", textAlign: col.align, cursor: "pointer", userSelect: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  color: sortKey === col.key ? "#22d3ee" : "rgba(255,255,255,0.45)",
                  fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
                  whiteSpace: "nowrap", transition: "color 0.2s",
                  background: sortKey === col.key ? "rgba(34,211,238,0.04)" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {col.label}
                  <SortIcon direction={sortKey === col.key ? sortDir : null} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const mktValue = h.shares * h.price;
            const pnl = mktValue - h.costBasis;
            const pnlPct = ((pnl / h.costBasis) * 100).toFixed(2);
            return (
              <tr
                key={h.ticker}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s", cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(34,211,238,0.03)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td style={{ padding: "12px 16px", fontWeight: 700, color: "#22d3ee" }}>{h.ticker}</td>
                <td style={{ padding: "12px 16px", color: "rgba(255,255,255,0.8)" }}>{h.name}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{h.shares.toLocaleString()}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "#fff", fontWeight: 600 }}>${h.price.toFixed(2)}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: h.changePercent >= 0 ? "#34d399" : "#f87171", fontWeight: 600 }}>
                  {h.changePercent >= 0 ? "+" : ""}{h.changePercent.toFixed(2)}%
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>${h.costBasis.toLocaleString()}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "#fff", fontWeight: 600 }}>${mktValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: pnl >= 0 ? "#34d399" : "#f87171", fontWeight: 600 }}>
                  {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <span style={{
                    background: pnl >= 0 ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                    color: pnl >= 0 ? "#34d399" : "#f87171",
                    padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  }}>{pnl >= 0 ? "+" : ""}{pnlPct}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid rgba(34,211,238,0.15)" }}>
            <td colSpan={5} style={{ padding: "14px 16px", fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" }}>Portfolio Total</td>
            <td style={{ padding: "14px 16px", textAlign: "right", color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>${totalCost.toLocaleString()}</td>
            <td style={{ padding: "14px 16px", textAlign: "right", color: "#fff", fontWeight: 700 }}>${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
            <td style={{ padding: "14px 16px", textAlign: "right", color: totalPnl >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
              {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </td>
            <td style={{ padding: "14px 16px", textAlign: "right" }}>
              <span style={{ color: totalPnl >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
                {totalPnl >= 0 ? "+" : ""}{((totalPnl / totalCost) * 100).toFixed(2)}%
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function VideoSection() {
  const videoRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen();
    } else if (video.mozRequestFullScreen) {
      video.mozRequestFullScreen();
    } else if (video.msRequestFullscreen) {
      video.msRequestFullscreen();
    }
  };

  return (
    <div
      style={{
        position: "relative", borderRadius: 16, overflow: "hidden",
        width: "100%",
        boxShadow: "0 0 80px rgba(34,211,238,0.12), 0 20px 60px rgba(0,0,0,0.6)",
        border: "1px solid rgba(34,211,238,0.12)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video
        ref={videoRef}
        style={{ width: "100%", display: "block" }}
        autoPlay
        muted
        loop
        playsInline
        controls
      >
        <source src="/demo.mp4" type="video/mp4" />
      </video>
      <button
        onClick={handleFullscreen}
        style={{
          position: "absolute", bottom: 14, right: 14,
          width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hovered ? 1 : 0, transition: "opacity 0.2s",
          padding: 0,
        }}
        aria-label="Fullscreen"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 6V1H6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M15 6V1H10" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 10V15H6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M15 10V15H10" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Space+Mono:wght@400;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  const sectionStyle = { maxWidth: 1200, margin: "0 auto", padding: "0 24px" };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>

      {/* HERO */}
      <section style={{ ...sectionStyle, textAlign: "center", paddingTop: 100, paddingBottom: 80, position: "relative" }}>
        <div style={{
          position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)",
          width: 800, height: 600,
          background: "radial-gradient(ellipse, rgba(34,211,238,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}/>

        <div style={{
          display: "inline-block", padding: "6px 16px", borderRadius: 20,
          background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)",
          color: "#22d3ee", fontSize: 13, fontWeight: 600, marginBottom: 32,
        }}>
          Free · Open · No Ads
        </div>

        <h1 style={{
          fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 700, lineHeight: 1.1,
          letterSpacing: "-0.03em", margin: "0 0 24px", maxWidth: 800, marginLeft: "auto", marginRight: "auto",
        }}>
          Research your portfolio
          <br/><span style={{ color: "#22d3ee" }}>like a professional</span>
        </h1>

        <p style={{
          fontSize: 18, color: "rgba(255,255,255,0.5)", lineHeight: 1.6,
          maxWidth: 620, margin: "0 auto 48px",
        }}>
          StockDashes brings institutional-grade research tools to retail investors — earnings history, insider transactions, fund holdings, peer comparisons, and macro data. All free.
        </p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/dashboard" style={{
            padding: "14px 32px", borderRadius: 10, border: "none", textDecoration: "none",
            background: "#22d3ee", color: "#0a0a0a",
            fontWeight: 700, fontSize: 16, fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 0 40px rgba(34,211,238,0.25), 0 4px 20px rgba(0,0,0,0.3)",
          }}>Try Live Demo</a>
          <a href="/sign-up" style={{
            padding: "14px 32px", borderRadius: 10, textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff",
            fontWeight: 600, fontSize: 16, fontFamily: "'DM Sans', sans-serif",
          }}>Get Started — It's Free</a>
        </div>

        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 20 }}>
          No credit card required · Portfolio stays on your device
        </p>
      </section>

      {/* SEE IT IN ACTION */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", paddingBottom: 100 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>See it in action</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Built for <span style={{ color: "#22d3ee" }}>serious investors</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, maxWidth: 480, margin: "0 auto" }}>
            Watch how StockDashes turns your portfolio into a full research workstation.
          </p>
        </div>
        <VideoSection />
      </section>

      {/* LIVE PREVIEW — HOLDINGS TABLE */}
      <section style={{ ...sectionStyle, paddingBottom: 100 }} id="dashboard">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Live preview</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Looks exactly <span style={{ color: "#22d3ee" }}>like this</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, maxWidth: 520, margin: "0 auto" }}>
            Dark, data-dense, built for serious investors. Click any column header to sort.
          </p>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Portfolio Value", value: `$${HOLDINGS.reduce((s, h) => s + h.shares * h.price, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, sub: `+$${(HOLDINGS.reduce((s, h) => s + h.shares * h.price, 0) - HOLDINGS.reduce((s, h) => s + h.costBasis, 0)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "#34d399" },
            { label: "Cost Basis", value: `$${HOLDINGS.reduce((s, h) => s + h.costBasis, 0).toLocaleString()}`, sub: `${HOLDINGS.length} positions`, color: "rgba(255,255,255,0.6)" },
            { label: "Total P&L", value: `+${(((HOLDINGS.reduce((s, h) => s + h.shares * h.price, 0) - HOLDINGS.reduce((s, h) => s + h.costBasis, 0)) / HOLDINGS.reduce((s, h) => s + h.costBasis, 0)) * 100).toFixed(2)}%`, sub: "All time", color: "#34d399" },
            { label: "Status", value: "Live", sub: "Updated now", color: "#22d3ee" },
          ].map((card, i) => (
            <div key={i} style={{
              padding: "20px 24px", borderRadius: 12,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: "'Space Mono', monospace" }}>{card.value}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        <HoldingsTable />

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <a href="/dashboard" style={{
            display: "inline-block", padding: "12px 28px", borderRadius: 8,
            background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)",
            color: "#22d3ee", textDecoration: "none", fontWeight: 600, fontSize: 14,
          }}>Open This Dashboard →</a>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>No account needed · Demo loads in seconds</p>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section style={{ ...sectionStyle, paddingBottom: 100 }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>What's inside</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Everything in <span style={{ color: "#22d3ee" }}>one place</span>
          </h2>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, maxWidth: 480, margin: "0 auto 48px" }}>
            Add your tickers once. Every page updates automatically.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {FEATURES.map((f, i) => (
            <a key={i} href={f.link} style={{
              padding: 28, borderRadius: 14, textDecoration: "none",
              border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)",
              transition: "all 0.3s", cursor: "pointer", display: "block",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.2)"; e.currentTarget.style.background = "rgba(34,211,238,0.03)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div style={{ fontSize: 26, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>{f.title}</h3>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ ...sectionStyle, paddingBottom: 100 }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>How it works</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
            Up and running in <span style={{ color: "#22d3ee" }}>60 seconds</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, maxWidth: 900, margin: "0 auto" }}>
          {[
            { step: "1", title: "Create a free account", desc: "Sign up with email. No credit card, no trial period." },
            { step: "2", title: "Enter your tickers", desc: "Add your stocks via the onboarding modal. Portfolio saves to your device." },
            { step: "3", title: "Start researching", desc: "Every page populates instantly with live data for your holdings." },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: 32 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", margin: "0 auto 20px",
                background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 700, color: "#22d3ee", fontFamily: "'Space Mono', monospace",
              }}>{s.step}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>{s.title}</h3>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section style={{ ...sectionStyle, paddingBottom: 100 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 20, textAlign: "center", padding: 48, borderRadius: 20,
          background: "linear-gradient(135deg, rgba(34,211,238,0.05) 0%, rgba(52,211,153,0.03) 100%)",
          border: "1px solid rgba(34,211,238,0.08)",
        }}>
          {STATS.map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 42, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#22d3ee", letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...sectionStyle, textAlign: "center", paddingBottom: 120 }}>
        <h2 style={{ fontSize: "clamp(28px, 3.5vw, 48px)", fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 20px" }}>
          Start researching your
          <br/><span style={{ color: "#22d3ee" }}>portfolio today</span>
        </h2>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, maxWidth: 480, margin: "0 auto 40px" }}>
          Free to get started. No credit card required. Your data stays on your device.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/sign-up" style={{
            padding: "16px 40px", borderRadius: 12, border: "none", textDecoration: "none",
            background: "#22d3ee", color: "#0a0a0a",
            fontWeight: 700, fontSize: 17, fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 0 60px rgba(34,211,238,0.2), 0 4px 30px rgba(0,0,0,0.3)",
          }}>Create Free Account</a>
          <a href="/dashboard" style={{
            padding: "16px 40px", borderRadius: 12, textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff",
            fontWeight: 600, fontSize: 17, fontFamily: "'DM Sans', sans-serif",
          }}>Try Demo First</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.06)", padding: "40px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 20, color: "rgba(255,255,255,0.25)", fontSize: 13,
      }}>
        <div>
          <span style={{ fontWeight: 800, letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)" }}>STOCKDASH</span>
          <span style={{ marginLeft: 16 }}>Built for retail investors · stockdashes.com</span>
        </div>
        <span>Free & open · No ads</span>
      </footer>
    </div>
  );
}
