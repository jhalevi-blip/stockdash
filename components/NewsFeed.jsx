'use client';
import { useEffect, useState } from 'react';

export default function NewsFeed({ tickers }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const url = tickers?.length ? `/api/news?tickers=${tickers.join(',')}` : '/api/news';
    fetch(url)
      .then(r => r.json())
      .then(data => setArticles(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="news-placeholder">Loading latest news…</div>;
  if (!articles.length) return <div className="news-placeholder">No news available.</div>;

  return (
    <div className="news-feed">
      {articles.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="news-card">
          {a.image && <img src={a.image} alt="" className="news-img" />}
          <div className="news-body">
            <div className="news-meta">
              <span className="news-ticker">{a.ticker}</span>
              <span className="news-source">{a.source}</span>
              <span className="news-time">
                {new Date(a.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="news-headline">{a.headline}</div>
            {a.summary && <div className="news-summary">{a.summary.slice(0, 120)}…</div>}
          </div>
        </a>
      ))}
    </div>
  );
}