'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import Card from '@/app/(v2)/_components/Card';
import DemoPrompt from '@/components/DemoPrompt';
import { useHoldings } from '@/lib/useHoldings';
import { DEFAULT_WORLDVIEW } from '@/app/(v2)/themes/_lib/theses';

const NEWS_LIMIT = 8; // per-ticker cap sent to /api/news

// Relative time from an epoch-ms instant. Mirrors dashboard NewsFeed's timeAgo,
// generalized to take ms so it also formats the ISO rankedAt timestamp.
function relTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Score → badge palette. 8–10 high-visibility accent, 5–7 neutral outline,
// 1–4 muted. null (unranked / fallback) → no badge.
function scoreStyle(score) {
  if (score >= 8) return { color: '#fff', background: 'var(--accent)', border: 'var(--accent)' };
  if (score >= 5) return { color: 'var(--text-secondary)', background: 'transparent', border: 'var(--border-strong, var(--border-color))' };
  return { color: 'var(--text-muted)', background: 'transparent', border: 'var(--border-color)' };
}

function ScoreBadge({ score }) {
  if (score == null) return null;
  const s = scoreStyle(score);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 26, height: 22, padding: '0 6px',
      borderRadius: 6, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      color: s.color, background: s.background, border: `1px solid ${s.border}`,
      flexShrink: 0,
    }}>
      {score}
    </span>
  );
}

function ArticleRow({ a }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '12px', border: '1px solid var(--border-color)', borderRadius: 6,
        background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        textDecoration: 'none', color: 'var(--text-primary)', transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover, rgba(255,255,255,0.05))'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary, rgba(255,255,255,0.02))'}
    >
      <ScoreBadge score={a.score} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--accent, #58a6ff)' }}>{a.ticker}</span>
          <span>·</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.source}
          </span>
          <span>{relTime(a.time * 1000)}</span>
        </div>
        <div style={{
          fontSize: 13, fontWeight: 500, lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {a.headline}
        </div>
        {a.why && (
          <div style={{ marginTop: 5, fontSize: 12, fontStyle: 'italic', lineHeight: 1.45, color: 'var(--text-muted)' }}>
            {a.why}
          </div>
        )}
      </div>
    </a>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          height: 72,
          background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
          border: '1px solid var(--border-color)', borderRadius: 6,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  );
}

export default function NewsPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { holdings } = useHoldings();

  const [articles,  setArticles]  = useState(null);   // Article[] | null (not loaded)
  const [rankMap,   setRankMap]   = useState(null);   // { [id]: { score, why } } | null
  const [rankedAt,  setRankedAt]  = useState(null);   // ISO string | null
  const [rankError, setRankError] = useState(false);  // ranking 502/network → time-sorted fallback
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [worldview, setWorldview] = useState(null);

  const tickerList = useMemo(
    () => (Array.isArray(holdings) ? holdings.map(h => h.t).join(',') : ''),
    [holdings],
  );
  const ready = isSignedIn && Array.isArray(holdings) && holdings.length > 0;

  // Worldview for the header (display only; the ranking route reads it server-side).
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetch('/api/user-settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (!cancelled) setWorldview(j?.worldview || DEFAULT_WORLDVIEW); })
      .catch(() => { if (!cancelled) setWorldview(DEFAULT_WORLDVIEW); });
    return () => { cancelled = true; };
  }, [ready]);

  // POST the article batch to the ranking route. Any failure → rankError (fallback).
  const rankArticles = useCallback(async (list, force) => {
    try {
      const res = await fetch('/api/news-rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          force,
          articles: list.map(a => ({
            id: a.id, ticker: a.ticker, headline: a.headline,
            summary: a.summary, source: a.source, time: a.time,
          })),
        }),
      });
      if (!res.ok) throw new Error('rank failed');
      const json = await res.json();
      if (!Array.isArray(json?.rankings)) throw new Error('bad shape');
      const map = {};
      json.rankings.forEach(r => { if (r?.id != null) map[String(r.id)] = { score: r.score, why: r.why }; });
      setRankMap(map);
      setRankedAt(json.rankedAt ?? null);
      setRankError(false);
    } catch {
      setRankMap(null);
      setRankError(true);
    }
  }, []);

  // Initial load: fetch news, then rank.
  useEffect(() => {
    if (!ready || !tickerList) return;
    let cancelled = false;
    setLoading(true);
    setRankError(false);
    (async () => {
      let list = [];
      try {
        const arr = await fetch(`/api/news?tickers=${tickerList}&limit=${NEWS_LIMIT}`).then(r => r.json());
        list = Array.isArray(arr) ? arr : [];
      } catch { list = []; }
      if (cancelled) return;
      setArticles(list);
      if (list.length) await rankArticles(list, false);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ready, tickerList, rankArticles]);

  async function handleRefresh() {
    if (!articles?.length || refreshing) return;
    setRefreshing(true);
    await rankArticles(articles, true);
    setRefreshing(false);
  }

  // Ranked (score desc) with unranked/fallback articles by time desc at the bottom.
  const sorted = useMemo(() => {
    if (!Array.isArray(articles)) return [];
    const withScores = articles.map(a => {
      const r = (!rankError && rankMap) ? rankMap[String(a.id)] : null;
      return { ...a, score: r?.score ?? null, why: r?.why ?? null };
    });
    return withScores.sort((a, b) => {
      if (a.score == null && b.score == null) return b.time - a.time;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      if (b.score !== a.score) return b.score - a.score;
      return b.time - a.time;
    });
  }, [articles, rankMap, rankError]);

  // ── Gate: signed-out or no holdings → demo prompt (matches other v2 pages) ──
  if (!isLoaded || holdings === null) {
    return (
      <div style={{ padding: '18px 20px' }}>
        <SkeletonList />
      </div>
    );
  }
  if (!ready) {
    return (
      <div style={{ padding: '18px 20px' }}>
        <DemoPrompt message="Sign in and add a portfolio to rank news against your worldview" />
      </div>
    );
  }

  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Heading */}
      <div style={{ marginBottom: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
          Analysis
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>News</h1>
      </div>

      {/* Worldview panel + refresh */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-cyan)', marginBottom: 6 }}>
              Ranked against your worldview
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {worldview ?? '…'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading || !articles?.length}
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
                border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
                cursor: (refreshing || loading || !articles?.length) ? 'not-allowed' : 'pointer',
                opacity: (refreshing || loading || !articles?.length) ? 0.6 : 1,
                fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              {refreshing ? 'Refreshing…' : 'Refresh ranking'}
            </button>
            {rankedAt && !rankError && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Ranked {relTime(Date.parse(rankedAt))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ranking-unavailable notice */}
      {!loading && rankError && articles?.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Ranking unavailable — showing latest first.
        </div>
      )}

      {/* List */}
      <Card title="News" eyebrow={rankError ? 'Latest' : 'Ranked'}>
        {loading ? (
          <SkeletonList />
        ) : sorted.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent news for your holdings.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map(a => <ArticleRow key={a.id} a={a} />)}
          </div>
        )}
      </Card>
    </div>
  );
}
