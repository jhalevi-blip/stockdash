import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const metadata = {
  title: 'Privacy Policy — StockDashes',
  description: 'How StockDashes collects, uses, and protects your personal data. GDPR-compliant privacy policy for stockdashes.com.',
  alternates: { canonical: 'https://stockdashes.com/privacy' },
};

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
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid #21262d', margin: '32px 0' }} />
  ),
  strong: ({ children }) => (
    <strong style={{ color: '#e6edf3', fontWeight: 600 }}>{children}</strong>
  ),
};

export default function PrivacyPage() {
  const raw = fs.readFileSync(path.join(process.cwd(), 'content/legal/privacy.md'), 'utf8');
  const { content } = matter(raw);
  return (
    <article style={{ maxWidth: 700, margin: '0 auto' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
