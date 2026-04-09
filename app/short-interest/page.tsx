"use client";
import { useState, useEffect, useRef, useMemo } from "react";

const MOCK_DATA = [
  { ticker: "GME", name: "GameStop Corp", sector: "Consumer Cyclical", price: 28.45, priceChg: -1.2, si: 24.3, siChg: 2.1, dtc: 3.2, shortFloat: 21.8, sharesSI: 72400000, avgVol: 22600000, history: [18,19,21,20,22,24,23,22,24,26,25,24.3] },
  { ticker: "AMC", name: "AMC Entertainment", sector: "Communication", price: 5.12, priceChg: 3.4, si: 19.7, siChg: -0.8, dtc: 2.1, shortFloat: 18.4, sharesSI: 98200000, avgVol: 46700000, history: [22,21,20,21,20,19,20,19,20,20,19.5,19.7] },
  { ticker: "BBBY", name: "Bed Bath & Beyond", sector: "Consumer Cyclical", price: 0.12, priceChg: -8.1, si: 41.2, siChg: 5.6, dtc: 5.8, shortFloat: 38.9, sharesSI: 44100000, avgVol: 7600000, history: [28,30,32,34,33,35,36,37,38,39,40,41.2] },
  { ticker: "RIVN", name: "Rivian Automotive", sector: "Consumer Cyclical", price: 14.22, priceChg: -2.7, si: 12.8, siChg: -1.2, dtc: 2.4, shortFloat: 11.5, sharesSI: 120000000, avgVol: 50000000, history: [16,15,14,14.5,14,13.5,13,13.5,13,12.5,13,12.8] },
  { ticker: "TSLA", name: "Tesla Inc", sector: "Consumer Cyclical", price: 248.50, priceChg: -0.5, si: 3.2, siChg: 0.4, dtc: 1.1, shortFloat: 2.9, sharesSI: 102000000, avgVol: 92700000, history: [2.6,2.5,2.7,2.8,2.6,2.9,3.0,2.8,3.1,3.0,3.1,3.2] },
  { ticker: "PLTR", name: "Palantir Tech", sector: "Technology", price: 22.80, priceChg: 4.2, si: 5.1, siChg: 0.9, dtc: 1.7, shortFloat: 4.6, sharesSI: 95000000, avgVol: 55800000, history: [3.8,3.9,4.0,4.2,4.1,4.3,4.5,4.4,4.6,4.8,5.0,5.1] },
  { ticker: "NVDA", name: "NVIDIA Corp", sector: "Technology", price: 875.40, priceChg: 2.3, si: 1.4, siChg: 0.3, dtc: 0.6, shortFloat: 1.2, sharesSI: 34500000, avgVol: 57500000, history: [1.0,1.0,1.1,1.1,1.0,1.2,1.1,1.2,1.3,1.2,1.3,1.4] },
  { ticker: "AAPL", name: "Apple Inc", sector: "Technology", price: 198.30, priceChg: 1.1, si: 0.7, siChg: -0.1, dtc: 0.8, shortFloat: 0.6, sharesSI: 108000000, avgVol: 135000000, history: [0.9,0.8,0.9,0.8,0.8,0.7,0.8,0.7,0.8,0.7,0.7,0.7] },
  { ticker: "MARA", name: "Marathon Digital", sector: "Technology", price: 18.65, priceChg: -3.8, si: 22.1, siChg: 3.4, dtc: 2.9, shortFloat: 20.2, sharesSI: 42000000, avgVol: 14500000, history: [14,15,16,17,16,18,19,18,20,21,21,22.1] },
  { ticker: "SOFI", name: "SoFi Technologies", sector: "Financials", price: 8.44, priceChg: 1.8, si: 10.5, siChg: -0.6, dtc: 1.5, shortFloat: 9.8, sharesSI: 88000000, avgVol: 58600000, history: [12,11.5,11,11.2,11,10.8,11,10.5,10.8,10.5,10.6,10.5] },
  { ticker: "LCID", name: "Lucid Group", sector: "Consumer Cyclical", price: 3.88, priceChg: -5.1, si: 16.3, siChg: 1.8, dtc: 3.1, shortFloat: 15.1, sharesSI: 290000000, avgVol: 93500000, history: [12,13,13.5,14,13.8,14.5,15,14.8,15.2,15.5,16,16.3] },
  { ticker: "COIN", name: "Coinbase Global", sector: "Financials", price: 178.90, priceChg: -1.9, si: 8.7, siChg: 1.1, dtc: 1.3, shortFloat: 7.9, sharesSI: 15600000, avgVol: 12000000, history: [6,6.5,7,7.2,7,7.5,7.8,8,7.5,8.2,8.5,8.7] },
];

function Sparkline({ data, color, width = 80, height = 28 }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const last = data[data.length - 1];
  const lx = width;
  const ly = height - ((last - min) / range) * (height - 4) - 2;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

function MiniBarChart({ data, color, width = 200, height = 80 }) {
  const max = Math.max(...data);
  const barW = (width - (data.length - 1) * 3) / data.length;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {data.map((v, i) => {
        const h = (v / max) * (height - 8);
        const isLast = i === data.length - 1;
        return (
          <rect
            key={i}
            x={i * (barW + 3)}
            y={height - h - 4}
            width={barW}
            height={h}
            rx="2"
            fill={isLast ? color : `${color}55`}
          />
        );
      })}
    </svg>
  );
}

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

const SORT_KEYS = [
  { key: "ticker", label: "Ticker" },
  { key: "si", label: "SI %" },
  { key: "siChg", label: "SI Chg" },
  { key: "dtc", label: "Days to Cover" },
  { key: "shortFloat", label: "Short Float" },
  { key: "price", label: "Price" },
  { key: "priceChg", label: "Price Chg" },
];

const FILTER_OPTIONS = ["All", "> 20% SI", "> 10% SI", "Rising SI", "Falling SI"];

export default function ShortInterestDashboard() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("si");
  const [sortDir, setSortDir] = useState("desc");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [mounted, setMounted] = useState(false);
  const tableRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let d = [...MOCK_DATA];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(r => r.ticker.toLowerCase().includes(s) || r.name.toLowerCase().includes(s));
    }
    if (filter === "> 20% SI") d = d.filter(r => r.si > 20);
    else if (filter === "> 10% SI") d = d.filter(r => r.si > 10);
    else if (filter === "Rising SI") d = d.filter(r => r.siChg > 0);
    else if (filter === "Falling SI") d = d.filter(r => r.siChg < 0);
    d.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return d;
  }, [search, sortKey, sortDir, filter]);

  const detail = selected ? MOCK_DATA.find(r => r.ticker === selected) : null;

  const accent = "#00e5a0";
  const negative = "#ff4d6a";
  const bg = "#0a0e17";
  const card = "#111827";
  const cardBorder = "#1e293b";
  const textPrimary = "#e2e8f0";
  const textSecondary = "#64748b";

  const topShorted = [...MOCK_DATA].sort((a, b) => b.si - a.si).slice(0, 3);
  const biggestMover = [...MOCK_DATA].sort((a, b) => Math.abs(b.siChg) - Math.abs(a.siChg))[0];
  const avgSI = (MOCK_DATA.reduce((s, r) => s + r.si, 0) / MOCK_DATA.length).toFixed(1);

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      background: bg,
      color: textPrimary,
      minHeight: "100vh",
      padding: 0,
      margin: 0,
      overflow: "auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${bg}; }
        ::-webkit-scrollbar-thumb { background: ${cardBorder}; border-radius: 3px; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        .row-hover:hover { background: #1a2236 !important; cursor: pointer; }
        .filter-btn {
          padding: 6px 14px; border-radius: 6px; border: 1px solid ${cardBorder};
          background: transparent; color: ${textSecondary}; font-size: 12px;
          font-family: inherit; cursor: pointer; transition: all .2s;
          white-space: nowrap;
        }
        .filter-btn:hover { border-color: ${accent}44; color: ${textPrimary}; }
        .filter-btn.active { background: ${accent}18; border-color: ${accent}55; color: ${accent}; }
        .sort-header { cursor: pointer; user-select: none; transition: color .15s; }
        .sort-header:hover { color: ${accent}; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "20px 28px",
        borderBottom: `1px solid ${cardBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
        animation: mounted ? "fadeUp .5s ease" : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${accent}, #0891b2)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: bg,
          }}>SI</div>
          <div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>
              Short Interest Monitor
            </div>
            <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
              Real-time short interest data &bull; Updated bi-monthly
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: accent,
            animation: "pulse 2s ease infinite",
          }} />
          <span style={{ fontSize: 11, color: textSecondary }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding: "20px 28px", maxWidth: 1400, margin: "0 auto" }}>

        {/* Summary Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 24,
          animation: mounted ? "fadeUp .6s ease" : "none",
        }}>
          {[
            { label: "Most Shorted", value: topShorted[0].ticker, sub: `${topShorted[0].si}% SI`, color: negative },
            { label: "Biggest SI Move", value: biggestMover.ticker, sub: `${biggestMover.siChg > 0 ? "+" : ""}${biggestMover.siChg}% chg`, color: biggestMover.siChg > 0 ? negative : accent },
            { label: "Avg Short Interest", value: `${avgSI}%`, sub: `across ${MOCK_DATA.length} stocks`, color: "#f59e0b" },
            { label: "Squeeze Candidates", value: MOCK_DATA.filter(r => r.si > 15 && r.dtc > 2).length.toString(), sub: "SI>15% & DTC>2", color: "#8b5cf6" },
          ].map((c, i) => (
            <div key={i} style={{
              background: card,
              border: `1px solid ${cardBorder}`,
              borderRadius: 10,
              padding: "16px 18px",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, width: 3, height: "100%",
                background: c.color, borderRadius: "10px 0 0 10px",
              }} />
              <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                {c.label}
              </div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700, color: c.color, lineHeight: 1.1 }}>
                {c.value}
              </div>
              <div style={{ fontSize: 11, color: textSecondary, marginTop: 4 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Search + Filters */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap",
          animation: mounted ? "fadeUp .7s ease" : "none",
        }}>
          <div style={{ position: "relative", flex: "0 1 260px", minWidth: 180 }}>
            <input
              type="text"
              placeholder="Search ticker or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px 9px 34px",
                background: card, border: `1px solid ${cardBorder}`,
                borderRadius: 8, color: textPrimary, fontSize: 13,
                fontFamily: "inherit", outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = `${accent}55`}
              onBlur={e => e.target.style.borderColor = cardBorder}
            />
            <span style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
              fontSize: 14, color: textSecondary, pointerEvents: "none",
            }}>⌕</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTER_OPTIONS.map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >{f}</button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          display: "grid",
          gridTemplateColumns: detail ? "1fr 340px" : "1fr",
          gap: 16,
          animation: mounted ? "fadeUp .8s ease" : "none",
          transition: "grid-template-columns .3s ease",
        }}>

          {/* Table */}
          <div ref={tableRef} style={{
            background: card,
            border: `1px solid ${cardBorder}`,
            borderRadius: 12,
            overflow: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${cardBorder}` }}>
                  {SORT_KEYS.map(sk => (
                    <th
                      key={sk.key}
                      className="sort-header"
                      onClick={() => handleSort(sk.key)}
                      style={{
                        padding: "12px 14px",
                        textAlign: sk.key === "ticker" ? "left" : "right",
                        fontSize: 11,
                        fontWeight: 500,
                        color: sortKey === sk.key ? accent : textSecondary,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        whiteSpace: "nowrap",
                        position: "sticky", top: 0, background: card, zIndex: 1,
                      }}
                    >
                      {sk.label}
                      {sortKey === sk.key && (
                        <span style={{ marginLeft: 4, fontSize: 10 }}>
                          {sortDir === "desc" ? "▼" : "▲"}
                        </span>
                      )}
                    </th>
                  ))}
                  <th style={{
                    padding: "12px 14px", textAlign: "center", fontSize: 11, fontWeight: 500,
                    color: textSecondary, textTransform: "uppercase", letterSpacing: "0.05em",
                    position: "sticky", top: 0, background: card, zIndex: 1,
                  }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: textSecondary }}>
                    No stocks match your filters.
                  </td></tr>
                )}
                {filtered.map((r, i) => {
                  const isSelected = selected === r.ticker;
                  return (
                    <tr
                      key={r.ticker}
                      className="row-hover"
                      onClick={() => setSelected(isSelected ? null : r.ticker)}
                      style={{
                        borderBottom: `1px solid ${cardBorder}22`,
                        background: isSelected ? `${accent}0a` : "transparent",
                        transition: "background .15s",
                      }}
                    >
                      <td style={{ padding: "11px 14px", fontWeight: 600 }}>
                        <div>{r.ticker}</div>
                        <div style={{ fontSize: 10, color: textSecondary, fontWeight: 400, marginTop: 1 }}>
                          {r.name}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontWeight: 600, color: r.si > 15 ? negative : textPrimary }}>
                        {r.si.toFixed(1)}%
                      </td>
                      <td style={{
                        padding: "11px 14px", textAlign: "right", fontWeight: 500,
                        color: r.siChg > 0 ? negative : r.siChg < 0 ? accent : textSecondary,
                      }}>
                        {r.siChg > 0 ? "+" : ""}{r.siChg.toFixed(1)}%
                      </td>
                      <td style={{
                        padding: "11px 14px", textAlign: "right",
                        color: r.dtc > 3 ? "#f59e0b" : textSecondary,
                        fontWeight: r.dtc > 3 ? 600 : 400,
                      }}>
                        {r.dtc.toFixed(1)}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        {r.shortFloat.toFixed(1)}%
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        ${r.price.toFixed(2)}
                      </td>
                      <td style={{
                        padding: "11px 14px", textAlign: "right",
                        color: r.priceChg > 0 ? accent : r.priceChg < 0 ? negative : textSecondary,
                      }}>
                        {r.priceChg > 0 ? "+" : ""}{r.priceChg.toFixed(1)}%
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        <Sparkline
                          data={r.history}
                          color={r.history[r.history.length - 1] > r.history[0] ? negative : accent}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail Panel */}
          {detail && (
            <div style={{
              background: card,
              border: `1px solid ${cardBorder}`,
              borderRadius: 12,
              padding: 20,
              animation: "fadeUp .3s ease",
              alignSelf: "start",
              position: "sticky",
              top: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 18 }}>
                <div>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700 }}>{detail.ticker}</div>
                  <div style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>{detail.name}</div>
                  <div style={{
                    display: "inline-block", marginTop: 6, fontSize: 10, padding: "3px 8px",
                    borderRadius: 4, background: `${accent}15`, color: accent, fontWeight: 500,
                  }}>{detail.sector}</div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: "transparent", border: "none", color: textSecondary,
                    cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4,
                  }}
                >×</button>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18,
              }}>
                {[
                  { label: "Price", value: `$${detail.price.toFixed(2)}`, color: textPrimary },
                  { label: "Price Chg", value: `${detail.priceChg > 0 ? "+" : ""}${detail.priceChg}%`, color: detail.priceChg > 0 ? accent : negative },
                  { label: "Short Interest", value: `${detail.si}%`, color: detail.si > 15 ? negative : textPrimary },
                  { label: "SI Change", value: `${detail.siChg > 0 ? "+" : ""}${detail.siChg}%`, color: detail.siChg > 0 ? negative : accent },
                  { label: "Days to Cover", value: detail.dtc.toFixed(1), color: detail.dtc > 3 ? "#f59e0b" : textPrimary },
                  { label: "Short Float", value: `${detail.shortFloat}%`, color: textPrimary },
                ].map((m, i) => (
                  <div key={i} style={{
                    background: `${bg}`, borderRadius: 8, padding: "10px 12px",
                    border: `1px solid ${cardBorder}`,
                  }}>
                    <div style={{ fontSize: 10, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  SI % Trend (12 periods)
                </div>
                <MiniBarChart
                  data={detail.history}
                  color={detail.history[detail.history.length - 1] > detail.history[0] ? negative : accent}
                  width={290}
                  height={70}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Shares Short</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{formatNum(detail.sharesSI)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: textSecondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>Avg Volume</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{formatNum(detail.avgVol)}</div>
                </div>
              </div>

              <div style={{
                marginTop: 18, padding: "12px 14px",
                background: detail.si > 15 && detail.dtc > 2 ? `${negative}12` : `${accent}08`,
                border: `1px solid ${detail.si > 15 && detail.dtc > 2 ? `${negative}30` : `${accent}20`}`,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: detail.si > 15 && detail.dtc > 2 ? negative : accent, marginBottom: 4 }}>
                  {detail.si > 15 && detail.dtc > 2 ? "⚠ Squeeze Risk" : "✓ Low Squeeze Risk"}
                </div>
                <div style={{ fontSize: 11, color: textSecondary, lineHeight: 1.5 }}>
                  {detail.si > 15 && detail.dtc > 2
                    ? `High short interest (${detail.si}%) with ${detail.dtc} days to cover creates elevated squeeze potential.`
                    : `Short interest at ${detail.si}% with ${detail.dtc} DTC suggests manageable short positioning.`
                  }
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 20, padding: "14px 0",
          borderTop: `1px solid ${cardBorder}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 11, color: textSecondary, flexWrap: "wrap", gap: 8,
        }}>
          <span>Showing {filtered.length} of {MOCK_DATA.length} stocks &bull; Data is illustrative</span>
          <span>Click any row for detailed analysis</span>
        </div>
      </div>
    </div>
  );
}
