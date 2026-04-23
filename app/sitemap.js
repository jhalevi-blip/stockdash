import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const SITE_URL = 'https://stockdashes.com';
const POSTS_DIR = path.join(process.cwd(), 'content/blog');

export default function sitemap() {
  const files = fs.readdirSync(POSTS_DIR);
  const blogEntries = files.map(f => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { data } = matter(raw);
    return {
      url: `${SITE_URL}/blog/${f.replace(/\.md$/, '')}`,
      lastModified: new Date(data.date),
      changeFrequency: 'monthly',
      priority: 0.7,
    };
  });

  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    ...blogEntries,
  ];
}
