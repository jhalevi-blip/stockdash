"use client";
import { useEffect, useState } from "react";

function Skeleton({ width = "100%", height = 16 }) {
  return (
    <div style={{
      width, height, borderRadius: 4,
      background: "rgba(255,255,255,0.06)",
      animation: "sip-pulse 1.4s ease-in-out infinite",
    }} />
  );
}

function BulletRow({ items, color, marker }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((text, i) => (
        <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{marker}</span>
          <span style={{ fontSize: 13, color: "rgba(230,237,243,0.7)", lineHeight: 1.5 }}>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function StockIntelPreview() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/stock-intel-preview").then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/api/most-traded").then(r => r.json()).catch(() => []),
    ])
      .then(([intel, mostTraded]) => {
        if (intel.error) throw new Error(intel.error);
        const nvda = Array.isArray(mostTraded)
          ? mostTraded.find(e => e.symbol === "NVDA")
          : null;
        setData({
          ...intel,
          price:   nvda?.price  ?? null,
          chgPct:  nvda?.change ?? null,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Silent failure — don't show a broken card
  if (error) return null;

  const up      = data?.chgPct != null && data.chgPct >= 0;
  const chgColor = data?.chgPct == null ? "rgba(230,237,243,0.4)" : up ? "#4ade80" : "#f87171";

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <style>{`
        @keyframes sip-pulse { 0%,100%{opacity:.35} 50%{opacity:.7} }
        @media (max-width: 640px) { .sip-columns { flex-direction: column !important; } }
      `}</style>

      <div style={{
        background: "#161b22",
        border: "1px solid #1e2530",
        borderRadius: 12,
        padding: 24,
        textAlign: "left",
      }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: "#e6edf3", fontFamily: "monospace" }}>NVDA</span>
            {loading ? (
              <Skeleton width={80} height={18} />
            ) : (
              <>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3" }}>
                  ${data.price?.toFixed(2) ?? "—"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: chgColor }}>
                  {data.chgPct != null ? `${up ? "+" : ""}${data.chgPct.toFixed(2)}%` : ""}
                </span>
              </>
            )}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            color: "#3b82f6", background: "rgba(59,130,246,0.12)",
            border: "1px solid rgba(59,130,246,0.25)", borderRadius: 6, padding: "3px 10px",
          }}>
            AI-Powered Analysis
          </span>
        </div>

        {/* Analyst target */}
        {!loading && data?.analyst?.avg != null && (
          <div style={{
            display: "flex", gap: 20, marginBottom: 20,
            paddingBottom: 16, borderBottom: "1px solid #1e2530",
            flexWrap: "wrap",
          }}>
            {[
              { label: "Avg Target", val: data.analyst.avg },
              { label: "High",       val: data.analyst.high },
              { label: "Low",        val: data.analyst.low },
            ].filter(t => t.val != null).map(t => (
              <div key={t.label}>
                <div style={{ fontSize: 10, color: "rgba(230,237,243,0.35)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>${t.val.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Bull / Bear columns */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[90, 75, 85, 70].map((w, i) => <Skeleton key={i} width={`${w}%`} />)}
          </div>
        ) : data?.ai ? (
          <>
            <div className="sip-columns" style={{ display: "flex", gap: 24, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Bull Case</div>
                <BulletRow items={data.ai.bullCases.slice(0, 2)} color="#4ade80" marker="▲" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Bear Case</div>
                <BulletRow items={data.ai.bearCases.slice(0, 2)} color="#f87171" marker="▼" />
              </div>
            </div>
            {data.ai.summary && (
              <p style={{
                fontSize: 12, fontStyle: "italic", color: "rgba(230,237,243,0.4)",
                margin: "16px 0 0", paddingTop: 14, borderTop: "1px solid #1e2530", lineHeight: 1.6,
              }}>
                {data.ai.summary}
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "rgba(230,237,243,0.35)", margin: 0 }}>
            AI analysis unavailable — check back soon.
          </p>
        )}
      </div>
    </div>
  );
}
