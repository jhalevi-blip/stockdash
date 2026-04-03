"use client";

import { useEffect, useState } from "react";
import type { MostTradedEntry } from "../api/most-traded/route";

export default function MostTradedWidget() {
  const [data, setData] = useState<MostTradedEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/most-traded")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  return (
    <section style={{ padding: "0 2rem 3.5rem", maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "1rem",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#38bdf8" }}>
          Most Traded This Week
        </div>
        <div style={{ fontSize: "11px", color: "#374151" }}>by 10-day avg volume</div>
      </div>

      <div style={{
        background: "#0d1117", border: "1px solid #1e2530", borderRadius: "8px", overflow: "hidden",
      }}>
        {/* Header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "32px 80px 1fr 110px 90px",
          padding: "8px 16px",
          background: "#0a0d12",
          borderBottom: "1px solid #1e2530",
          fontSize: "10px", fontWeight: 500, color: "#4b5563",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          <span>#</span>
          <span>Symbol</span>
          <span>Company</span>
          <span style={{ textAlign: "right" }}>Price</span>
          <span style={{ textAlign: "right" }}>Change</span>
        </div>

        {error && (
          <div style={{ padding: "1.5rem 16px", fontSize: "12px", color: "#4b5563" }}>
            Unable to load data
          </div>
        )}

        {!data && !error && (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "32px 80px 1fr 110px 90px",
              padding: "11px 16px",
              borderBottom: i < 4 ? "1px solid #141920" : undefined,
              gap: "0",
            }}>
              <span style={{ width: "18px", height: "12px", background: "#1e2530", borderRadius: "3px", display: "block" }} />
              <span style={{ width: "48px", height: "12px", background: "#1e2530", borderRadius: "3px", display: "block" }} />
              <span style={{ width: "100px", height: "12px", background: "#1e2530", borderRadius: "3px", display: "block" }} />
              <span style={{ width: "60px", height: "12px", background: "#1e2530", borderRadius: "3px", display: "block", marginLeft: "auto" }} />
              <span style={{ width: "50px", height: "12px", background: "#1e2530", borderRadius: "3px", display: "block", marginLeft: "auto" }} />
            </div>
          ))
        )}

        {data && data.map((row, i) => {
          const positive = row.change >= 0;
          return (
            <div key={row.symbol} style={{
              display: "grid",
              gridTemplateColumns: "32px 80px 1fr 110px 90px",
              padding: "11px 16px",
              borderBottom: i < data.length - 1 ? "1px solid #141920" : undefined,
              alignItems: "center",
              fontSize: "13px",
            }}>
              <span style={{ color: "#374151", fontWeight: 500, fontSize: "11px" }}>{row.rank}</span>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>{row.symbol}</span>
              <span style={{ color: "#64748b" }}>{row.name}</span>
              <span style={{ color: "#f1f5f9", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                ${row.price.toFixed(2)}
              </span>
              <span style={{
                color: positive ? "#22c55e" : "#ef4444",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}>
                {positive ? "+" : ""}{row.change.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
