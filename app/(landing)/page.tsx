"use client";

import MostTradedWidget from "./MostTradedWidget";
import { startDemo } from "@/lib/startDemo";

export default function LandingPage() {
  return (
    <div style={{ background: "#0d1117", color: "#e2e8f0", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* HERO */}
      <section style={{ textAlign: "center", padding: "5rem 2rem 4rem", maxWidth: "760px", margin: "0 auto" }}>
        <div style={{
          display: "inline-block", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em",
          color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)",
          padding: "4px 14px", borderRadius: "100px", marginBottom: "1.5rem", textTransform: "uppercase",
        }}>
          Free · Open · No Ads
        </div>
        <h1 style={{
          fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700, lineHeight: 1.15,
          color: "#f1f5f9", marginBottom: "1.25rem", letterSpacing: "-0.02em",
        }}>
          Research your portfolio<br />like a <span style={{ color: "#38bdf8" }}>professional</span>
        </h1>
        <p style={{ fontSize: "16px", color: "#94a3b8", lineHeight: 1.7, maxWidth: "560px", margin: "0 auto 2.5rem" }}>
          StockDashes brings institutional-grade research tools to retail investors — earnings history,
          insider transactions, fund holdings, peer comparisons, and macro data. All free.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/sign-up" style={{
            background: "#3b82f6", color: "#fff", border: "none",
            padding: "12px 30px", borderRadius: "5px", fontSize: "14px", fontWeight: 500,
            cursor: "pointer", textDecoration: "none", display: "inline-block",
          }}>
            Get Started — It&apos;s Free
          </a>
          <button onClick={() => startDemo("/dashboard")} style={{
            background: "#0d1117", color: "#e6edf3",
            border: "1px solid #58a6ff",
            padding: "12px 24px", borderRadius: "5px", fontSize: "14px",
            cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: "8px",
          }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
            Try Live Demo
          </button>
        </div>
        <p style={{ marginTop: "1rem", fontSize: "12px", color: "#4b5563" }}>
          No credit card required &nbsp;·&nbsp; Portfolio stays on your device
        </p>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #1e2530" }} />

      {/* SOCIAL PROOF */}
      <div style={{ background: "#0a0d12", borderTop: "1px solid #1e2530", borderBottom: "1px solid #1e2530", padding: "2.5rem 2rem", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "4rem", flexWrap: "wrap" }}>
          {[
            { num: "10", label: "Pages of research tools" },
            { num: "4", label: "Live data sources" },
            { num: "5", label: "Fund manager 13F portfolios" },
            { num: "100%", label: "Free, forever" },
          ].map((item) => (
            <div key={item.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#38bdf8" }}>{item.num}</div>
              <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "2px" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <MostTradedWidget />

      {/* FEATURES */}
      <section style={{ padding: "3.5rem 2rem", maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#38bdf8", marginBottom: "0.5rem" }}>
          What&apos;s inside
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", marginBottom: "0.5rem" }}>Everything in one place</div>
        <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "2rem" }}>Add your tickers once. Every page updates automatically.</div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "1px", background: "#1e2530", border: "1px solid #1e2530", borderRadius: "8px", overflow: "hidden",
        }}>
          {[
            { icon: "📊", title: "Dashboard", desc: "P&L, price charts, earnings calendar, and live news for your holdings." },
            { icon: "🌐", title: "Macro", desc: "S&P 500, NASDAQ, VIX, fear & greed, treasury yields, commodities, and FX." },
            { icon: "🔍", title: "Insider Transactions", desc: "See what executives are buying and selling across your portfolio stocks." },
            { icon: "🏛️", title: "Ownership & 13F", desc: "Institutional ownership % and latest holdings from Ackman, Einhorn, Druckenmiller & more." },
            { icon: "⚖️", title: "Peer Comparison", desc: "Side-by-side valuation multiples and financial metrics vs industry peers." },
            { icon: "📁", title: "SEC Research", desc: "Browse 10-K, 10-Q, and 8-K filings directly for any stock in your portfolio." },
            { icon: "💰", title: "Valuation", desc: "P/E, P/S, P/B, EV/EBITDA, ROE, margins — sortable across all your positions." },
            { icon: "📅", title: "Earnings", desc: "EPS history, beat/miss streaks, estimate vs actual charts going back years." },
            { icon: "🎯", title: "Analyst Targets", desc: "Consensus price targets, upside %, and analyst count from FMP data." },
          ].map((f) => (
            <div key={f.title} style={{ background: "#0d1117", padding: "1.5rem 1.25rem" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "6px",
                background: "rgba(56,189,248,0.1)", display: "flex", alignItems: "center",
                justifyContent: "center", marginBottom: "1rem", fontSize: "15px",
              }}>{f.icon}</div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", marginBottom: "0.4rem" }}>{f.title}</div>
              <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #1e2530" }} />

      {/* DASHBOARD PREVIEW */}
      <section style={{ padding: "3.5rem 2rem", maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#38bdf8", marginBottom: "0.5rem" }}>
          Live preview
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", marginBottom: "0.5rem" }}>Looks exactly like this</div>
        <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "2rem" }}>
          Dark, data-dense, built for serious investors — not generic finance apps.
        </div>

        <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: "8px", overflow: "hidden" }}>
          {/* Fake nav tabs */}
          <div style={{ display: "flex", background: "#0a0d12", borderBottom: "1px solid #1e2530", padding: "0 1rem", overflowX: "auto" }}>
            {["Dashboard", "Macro", "Insider", "Ownership", "Peers", "Analyst"].map((tab, i) => (
              <div key={tab} style={{
                fontSize: "12px", padding: "10px 14px", whiteSpace: "nowrap",
                color: i === 0 ? "#38bdf8" : "#64748b",
                borderBottom: i === 0 ? "2px solid #38bdf8" : "2px solid transparent",
              }}>{tab}</div>
            ))}
          </div>

          <div style={{ padding: "1.5rem" }}>
            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              {[
                { label: "Portfolio Value", val: "$398,594.70", sub: "+$228,594 · +134%", subColor: "#22c55e" },
                { label: "Cost Basis", val: "$170,000.00", sub: "6 positions", subColor: "#4b5563" },
                { label: "Total P&L", val: "$228,594.70", sub: "+134.47%", subColor: "#22c55e" },
                { label: "Status", val: "Live", sub: "Updated now", subColor: "#4b5563", dot: true },
              ].map((m) => (
                <div key={m.label} style={{ background: "#141920", border: "1px solid #1e2530", borderRadius: "6px", padding: "1rem" }}>
                  <div style={{ fontSize: "10px", color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{m.label}</div>
                  <div style={{ fontSize: "18px", fontWeight: 600, color: "#f1f5f9", display: "flex", alignItems: "center", gap: "6px" }}>
                    {m.dot && <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#22c55e", borderRadius: "50%" }} />}
                    {m.val}
                  </div>
                  <div style={{ fontSize: "11px", color: m.subColor, marginTop: "2px" }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Holdings table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "64px" }} />  {/* Ticker */}
                <col style={{ width: "80px" }} />  {/* Name */}
                <col style={{ width: "60px" }} />  {/* Shares */}
                <col style={{ width: "80px" }} />  {/* Price */}
                <col style={{ width: "62px" }} />  {/* Chg % */}
                <col style={{ width: "84px" }} />  {/* Cost Basis */}
                <col style={{ width: "84px" }} />  {/* Mkt Value */}
                <col style={{ width: "84px" }} />  {/* P&L $ */}
                <col />                            {/* P&L % — fills remainder */}
              </colgroup>
              <thead>
                <tr>
                  {(["Ticker", "Name", "Shares", "Price", "Chg %", "Cost Basis", "Mkt Value", "P&L $", "P&L %"] as const).map((h, i) => (
                    <th key={h} style={{
                      textAlign: i < 2 ? "left" : "right",
                      color: "#4b5563", fontWeight: 500, fontSize: "10px",
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "6px 8px", borderBottom: "1px solid #1e2530",
                      overflow: "hidden", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { ticker: "NVDA", name: "Nvidia",  shares: "200",   price: "$177.39",   chg: "+0.93%", basis: "$10,000", mkt: "$35,478",  pnl: "+$25,478",  pnlp: "+254.78%", pos: true },
                  { ticker: "ASML", name: "ASML",    shares: "200",   price: "$1,317.23", chg: "-3.13%", basis: "$80,000", mkt: "$263,446", pnl: "+$183,446", pnlp: "+229.31%", pos: true },
                  { ticker: "AMD",  name: "AMD",     shares: "50",    price: "$217.50",   chg: "+3.47%", basis: "$5,000",  mkt: "$10,875",  pnl: "+$5,875",   pnlp: "+117.50%", pos: true },
                  { ticker: "SOFI", name: "SoFi",    shares: "4,000", price: "$15.85",    chg: "+1.41%", basis: "$60,000", mkt: "$63,400",  pnl: "+$3,400",   pnlp: "+5.67%",   pos: true },
                  { ticker: "AMZN", name: "Amazon",  shares: "100",   price: "$209.77",   chg: "-0.38%", basis: "$10,000", mkt: "$20,977",  pnl: "+$10,977",  pnlp: "+109.77%", pos: true },
                  { ticker: "NKE",  name: "Nike",    shares: "100",   price: "$44.19",    chg: "-0.99%", basis: "$5,000",  mkt: "$4,419",   pnl: "-$581",     pnlp: "-11.62%",  pos: false },
                ].map((row) => (
                  <tr key={row.ticker} style={{ borderBottom: "1px solid #141920" }}>
                    <td style={{ padding: "8px", color: "#38bdf8", fontWeight: 600, overflow: "hidden" }}>{row.ticker}</td>
                    <td style={{ padding: "8px", color: "#94a3b8", overflow: "hidden" }}>{row.name}</td>
                    <td style={{ padding: "8px", color: "#94a3b8", textAlign: "right" }}>{row.shares}</td>
                    <td style={{ padding: "8px", color: "#f1f5f9", textAlign: "right" }}>{row.price}</td>
                    <td style={{ padding: "8px", color: row.chg.startsWith("+") ? "#22c55e" : "#ef4444", textAlign: "right" }}>{row.chg}</td>
                    <td style={{ padding: "8px", color: "#94a3b8", textAlign: "right" }}>{row.basis}</td>
                    <td style={{ padding: "8px", color: "#94a3b8", textAlign: "right" }}>{row.mkt}</td>
                    <td style={{ padding: "8px", color: row.pos ? "#22c55e" : "#ef4444", textAlign: "right" }}>{row.pnl}</td>
                    <td style={{ padding: "8px", color: row.pos ? "#22c55e" : "#ef4444", textAlign: "right" }}>{row.pnlp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <button onClick={() => startDemo("/dashboard")} style={{
            background: "#161b22", color: "#e6edf3",
            border: "1px solid #58a6ff",
            padding: "11px 26px", borderRadius: "5px", fontSize: "14px", fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: "8px",
          }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
            Open This Dashboard →
          </button>
          <span style={{ fontSize: "12px", color: "#4b5563" }}>No account needed · Demo loads in seconds</span>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #1e2530" }} />

      {/* HOW IT WORKS */}
      <section style={{ padding: "3.5rem 2rem", maxWidth: "860px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#38bdf8", marginBottom: "0.5rem" }}>
          How it works
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", marginBottom: "2.5rem" }}>Up and running in 60 seconds</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2rem" }}>
          {[
            { step: "1", title: "Create a free account", desc: "Sign up with email. No credit card, no trial period." },
            { step: "2", title: "Enter your tickers", desc: "Add your stocks via the onboarding modal. Portfolio saves to your device." },
            { step: "3", title: "Start researching", desc: "Every page populates instantly with live data for your holdings." },
          ].map((s) => (
            <div key={s.step} style={{ textAlign: "center" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "50%",
                background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#38bdf8", fontWeight: 700, fontSize: "16px",
                margin: "0 auto 1rem",
              }}>{s.step}</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#f1f5f9", marginBottom: "0.4rem" }}>{s.title}</div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid #1e2530" }} />

      {/* FINAL CTA */}
      <section style={{ textAlign: "center", padding: "5rem 2rem", background: "#0a0d12" }}>
        <h2 style={{ fontSize: "28px", fontWeight: 700, color: "#f1f5f9", marginBottom: "0.75rem" }}>
          Start researching your portfolio today
        </h2>
        <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "2rem" }}>
          Free to get started. No credit card required. Your data stays on your device.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
          <a href="/sign-up" style={{
            background: "#3b82f6", color: "#fff", border: "none",
            padding: "13px 36px", borderRadius: "5px", fontSize: "15px", fontWeight: 500,
            cursor: "pointer", textDecoration: "none", display: "inline-block",
          }}>
            Create Free Account
          </a>
          <button onClick={() => startDemo("/dashboard")} style={{
            background: "#0d1117", color: "#e6edf3",
            border: "1px solid #58a6ff",
            padding: "13px 28px", borderRadius: "5px", fontSize: "15px", fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: "8px",
          }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
            Try Demo First
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: "1px solid #1e2530", padding: "1.5rem 2rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "1rem",
        fontSize: "12px", color: "#374151",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#4b5563" }}>
          STOCK<span style={{ color: "#2563eb" }}>DASH</span>
        </div>
        <div>Built for retail investors &nbsp;·&nbsp; stockdashes.com</div>
        <div>Free &amp; open · No ads</div>
      </footer>

    </div>
  );
}
