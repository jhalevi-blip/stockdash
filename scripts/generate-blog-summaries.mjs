import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const POSTS_DIR = path.join(process.cwd(), 'content/blog');
const FORCE     = process.argv.includes('--force');
const API_KEY   = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not found in environment.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a blog post analyst for StockDashes, a free AI-powered portfolio analysis tool powered by Claude Opus 4.7.

Your job: summarize a blog post using the generate_summary tool.

TL;DR guidelines:
- 3-5 sentences, plain text
- Capture the main practical insight, not a generic topic overview
- Direct, specific, no marketing language
- Match the tone of a knowledgeable friend explaining the post

Key takeaways guidelines:
- Exactly 3 items
- Each is one actionable sentence a reader can apply
- Prioritize specific thresholds, rules of thumb, or mental models over vague advice
- No generic "always diversify" type statements — be concrete

Use information from the post only. Do not invent numbers or claims.`;

const TOOL = {
  name: 'generate_summary',
  description: 'Generate a structured summary of a blog post.',
  input_schema: {
    type: 'object',
    properties: {
      tldr: {
        type: 'string',
        description: '3-5 sentence plain-text summary of the post.',
      },
      key_takeaways: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 3,
        description: 'Exactly 3 short-sentence takeaways.',
      },
    },
    required: ['tldr', 'key_takeaways'],
  },
};

function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

async function generateSummary(postBody) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'generate_summary' },
      messages: [
        { role: 'user', content: postBody },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const toolUse = data.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use block in response');
  return toolUse.input;
}

async function processFile(filename) {
  const filePath = path.join(POSTS_DIR, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data: frontmatter, content } = matter(raw);

  if (frontmatter.summary && !FORCE) {
    console.log(`  skip  ${filename} (summary exists; use --force to regenerate)`);
    return;
  }

  console.log(`  gen   ${filename}`);

  const { tldr, key_takeaways } = await generateSummary(content);
  const read_time_minutes = Math.ceil(wordCount(content) / 200);

  frontmatter.summary = { tldr, key_takeaways, read_time_minutes };

  const updated = matter.stringify(content, frontmatter);
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`  done  ${filename} (${read_time_minutes} min read)`);
}

const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
console.log(`Found ${files.length} post(s). FORCE=${FORCE}\n`);

for (const file of files) {
  await processFile(file);
}

console.log('\nDone.');
