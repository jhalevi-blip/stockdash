import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Link from 'next/link';

export const metadata = {
  title: 'Blog | StockDashes',
  description: 'Guides on stock portfolio analysis, diversification, risk, and AI-powered investing.',
  alternates: { canonical: 'https://stockdashes.com/blog' },
};

const POSTS_DIR = path.join(process.cwd(), 'content/blog');

function getAllPosts() {
  const files = fs.readdirSync(POSTS_DIR);
  return files
    .map(f => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
      const { data } = matter(raw);
      return { ...data, slug: f.replace(/\.md$/, '') };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>Blog</h1>
      <p style={{ color: '#8b949e', fontSize: 15, marginBottom: 40, lineHeight: 1.5 }}>
        Guides on portfolio analysis and AI-powered investing.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {posts.map(post => (
          <li key={post.slug} style={{ borderBottom: '1px solid #21262d', paddingBottom: 28, marginBottom: 28 }}>
            <time style={{ fontSize: 12, color: '#6e7681', display: 'block', marginBottom: 6 }}>
              {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
            <Link href={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3', marginBottom: 8, lineHeight: 1.3 }}>
                {post.title}
              </h2>
            </Link>
            <p style={{ color: '#8b949e', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
              {post.description}
            </p>
            <Link href={`/blog/${post.slug}`} style={{ color: '#58a6ff', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
              Read more →
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
