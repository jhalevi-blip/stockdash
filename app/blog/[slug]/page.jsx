import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

const POSTS_DIR = path.join(process.cwd(), 'content/blog');
const SITE_URL = 'https://stockdashes.com';

function getPost(slug) {
  const filePath = path.join(POSTS_DIR, `${slug}.md`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  return { frontmatter: data, content };
}

export async function generateStaticParams() {
  const files = fs.readdirSync(POSTS_DIR);
  return files.map(f => ({ slug: f.replace(/\.md$/, '') }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { frontmatter } = getPost(slug);
  const url = `${SITE_URL}/blog/${slug}`;
  return {
    title: `${frontmatter.title} | StockDashes`,
    description: frontmatter.description,
    alternates: { canonical: url },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      url,
      siteName: 'StockDashes',
      type: 'article',
      publishedTime: frontmatter.date,
      authors: [frontmatter.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: frontmatter.title,
      description: frontmatter.description,
    },
  };
}

function BlogSummaryBox({ summary }) {
  if (!summary) return null;
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid #21262d',
      borderRadius: 10,
      padding: '20px 24px',
      marginBottom: 32,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          color: '#22d3ee', textTransform: 'uppercase',
        }}>
          Claude's TL;DR
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {summary.read_time_minutes && (
            <span style={{ fontSize: 11, color: 'rgba(230,237,243,0.35)', fontWeight: 500 }}>
              {summary.read_time_minutes} min read
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            color: 'rgba(230,237,243,0.45)',
            background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)',
            borderRadius: 100, padding: '3px 10px', textTransform: 'uppercase',
          }}>
            Powered by Claude Opus 4.7
          </span>
        </div>
      </div>

      {/* TL;DR */}
      <p style={{ color: '#c9d1d9', fontSize: 14, lineHeight: 1.7, margin: '0 0 16px' }}>
        {summary.tldr}
      </p>

      {/* Key takeaways */}
      {Array.isArray(summary.key_takeaways) && summary.key_takeaways.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {summary.key_takeaways.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#22d3ee', fontSize: 12, flexShrink: 0, marginTop: 2 }}>•</span>
              <span style={{ fontSize: 13, color: 'rgba(230,237,243,0.6)', lineHeight: 1.55 }}>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const mdComponents = {
  h1: ({ children }) => (
    <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e6edf3', margin: '32px 0 16px', lineHeight: 1.3 }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: 22, fontWeight: 600, color: '#e6edf3', margin: '32px 0 12px', lineHeight: 1.3 }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3', margin: '24px 0 10px', lineHeight: 1.4 }}>{children}</h3>
  ),
  p: ({ children }) => (
    <p style={{ color: '#c9d1d9', fontSize: 15, lineHeight: 1.7, margin: '0 0 18px' }}>{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} style={{ color: '#58a6ff', textDecoration: 'underline' }}>{children}</a>
  ),
  ul: ({ children }) => (
    <ul style={{ color: '#c9d1d9', paddingLeft: 20, margin: '0 0 18px', lineHeight: 1.7 }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ color: '#c9d1d9', paddingLeft: 20, margin: '0 0 18px', lineHeight: 1.7 }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: 6, fontSize: 15 }}>{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid #30363d', paddingLeft: 16, margin: '0 0 18px', color: '#8b949e', fontStyle: 'italic' }}>
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, padding: 16, overflowX: 'auto', margin: '0 0 18px' }}>
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    if (className) {
      return <code style={{ fontFamily: 'monospace', fontSize: 13, color: '#e6edf3' }}>{children}</code>;
    }
    return (
      <code style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '2px 6px', fontSize: 13, fontFamily: 'monospace', color: '#e6edf3' }}>
        {children}
      </code>
    );
  },
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid #21262d', margin: '32px 0' }} />
  ),
  strong: ({ children }) => (
    <strong style={{ color: '#e6edf3', fontWeight: 600 }}>{children}</strong>
  ),
  img: ({ node, ...props }) => (
    <img
      {...props}
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 8,
        border: '1px solid #21262d',
        display: 'block',
        margin: '24px auto',
      }}
    />
  ),
};

export default async function BlogPost({ params }) {
  const { slug } = await params;
  const { frontmatter, content } = getPost(slug);
  const url = `${SITE_URL}/blog/${slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: frontmatter.title,
    description: frontmatter.description,
    datePublished: frontmatter.date,
    author: { '@type': 'Person', name: frontmatter.author },
    publisher: {
      '@type': 'Organization',
      name: 'StockDashes',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/favicon.ico`,
      },
    },
    url,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article style={{ maxWidth: 700, margin: '0 auto' }}>
        <BlogSummaryBox summary={frontmatter.summary ?? null} />
        <div style={{ marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid #21262d' }}>
          <time style={{ fontSize: 12, color: '#6e7681', display: 'block', marginBottom: 10 }}>
            {new Date(frontmatter.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: '#e6edf3', lineHeight: 1.2, margin: '0 0 12px' }}>
            {frontmatter.title}
          </h1>
          <p style={{ color: '#8b949e', fontSize: 16, lineHeight: 1.5 }}>
            {frontmatter.description}
          </p>
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {content}
        </ReactMarkdown>
        <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #21262d' }}>
          <Link href="/blog" style={{ color: '#58a6ff', fontSize: 13, textDecoration: 'none' }}>
            ← Back to Blog
          </Link>
        </footer>
      </article>
    </>
  );
}
