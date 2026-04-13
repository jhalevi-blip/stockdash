"use client";
import { useEffect, useState } from "react";
import { startDemo } from "../lib/startDemo";

const FALLBACK = [
  { symbol: "AAPL", name: "Apple",    price: 223.19, change: -1.23 },
  { symbol: "NVDA", name: "Nvidia",   price: 106.73, change: -2.15 },
  { symbol: "TSLA", name: "Tesla",    price: 247.07, change: -5.41 },
  { symbol: "AMZN", name: "Amazon",   price: 196.35, change: -2.88 },
  { symbol: "MSFT", name: "Microsoft",price: 415.50, change:  0.82 },
];

function SkeletonRow() {
  return (
    <tr>
      {[60, 100, 70, 60].map((w, i) => (
        <td key={i} style={{ padding: "12px 16px" }}>
          <div style={{
            height: 14, width: w, borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            animation: "pulse 1.4s ease-in-out infinite",
          }} />
        </td>
      ))}
    </tr>
  );
}

export default function LivePreview() {
  const [rows, setRows]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/most-traded")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length) {
          setRows(data.slice(0, 5));
        } else {
          setRows(FALLBACK);
        }
      })
      .catch(() => setRows(FALLBACK))
      .finally(() => setLoading(false));
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        .lp-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      {/* Live label */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: 12,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 6px #22c55e",
          animation: "blink 1.8s ease-in-out infinite",
          display: "inline-block",
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live</span>
      </div>

      {/* Table */}
      <div style={{
        borderRadius: 12,
        border: "1px solid #1e2530",
        background: "#0d1117",
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2530" }}>
              <th style={thStyle("left")}>Ticker</th>
              <th className="hide-mobile" style={thStyle("left")}>Name</th>
              <th style={thStyle("right")}>Price</th>
              <th style={thStyle("right")}>Change %</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              : (rows ?? FALLBACK).map((r) => {
                  const up = r.change >= 0;
                  return (
                    <tr
                      key={r.symbol}
                      className="lp-row"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        transition: "background 0.15s",
                        background: "transparent",
                      }}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#e6edf3", fontFamily: "monospace" }}>{r.symbol}</td>
                      <td className="hide-mobile" style={{ padding: "12px 16px", color: "rgba(230,237,243,0.6)" }}>{r.name}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", color: "#e6edf3", fontWeight: 600 }}>${r.price.toFixed(2)}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: up ? "#4ade80" : "#f87171" }}>
                        {up ? "+" : ""}{r.change.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center", marginTop: 28 }}>
        <button
          onClick={() => startDemo("/dashboard")}
          style={{
            padding: "14px 36px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "#3b82f6", color: "#fff",
            fontWeight: 700, fontSize: 16, fontFamily: "inherit",
            boxShadow: "0 0 30px rgba(59,130,246,0.35)",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          Open This Dashboard →
        </button>
        <p style={{ color: "rgba(230,237,243,0.35)", fontSize: 12, marginTop: 10 }}>
          No account needed · Loads in seconds
        </p>
      </div>

      {/* Mobile: hide name column via inline style override */}
      <style>{`
        @media (max-width: 640px) {
          .hide-mobile { display: none !important; }
          table td, table th { padding: 10px 12px !important; }
        }
      `}</style>
    </div>
  );
}

function thStyle(align) {
  return {
    padding: "11px 16px",
    textAlign: align,
    color: "rgba(230,237,243,0.4)",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    whiteSpace: "nowrap",
  };
}
