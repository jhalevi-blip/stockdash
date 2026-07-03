import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Experimental "AI Thesis Signals" refresh. Scheduled by vercel.json (07:00 UTC).
// Reads SEC EDGAR directly (full-text search + latest 10-Q footnotes), classifies
// findings with Claude Haiku, and upserts one row per (signal_key, ticker) into
// thesis_signals. Service-role writes only; no Clerk session, no self-HTTP.
//
// Self-guarded by Authorization: Bearer ${CRON_SECRET} (Vercel injects this on
// cron invocations once CRON_SECRET is set; the same bearer enables curl tests).
//
// Investigation notes (verified against live EDGAR before writing):
//  - FTS endpoint is https://efts.sec.gov/LATEST/search-index with params
//    q (quoted phrase), ciks, forms, startdt, enddt. It is intermittently 500 and
//    500s on broad/unfiltered queries — every query is CIK-scoped and retried.
//  - FTS returns filing METADATA only (no snippet/highlight), so Step A fetches the
//    matched document and extracts a local text window — the same mechanic Steps B/C
//    use for the 10-Q footnotes.

const UNIVERSE = ['ORCL', 'META', 'MSFT', 'GOOGL', 'AMZN', 'CRWV', 'NBIS', 'APLD', 'IREN'];

// Do NOT reuse the legacy PortfolioIntel UA (see app/api/research/route.js).
const SEC_UA = 'StockDashes contact@stockdashes.com';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

const EDGAR_PHRASES = [
  'contract modification',
  'amendment to customer agreement',
  'impairment of equipment',
  'going concern',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── SEC fetch with retry — efts.sec.gov and data.sec.gov are intermittently
//    500/503/429 even on well-formed queries. Returns text|json|null. ─────────────
async function secFetch(url, { json = false } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': SEC_UA, Accept: json ? 'application/json' : 'text/html' } });
      if (res.ok) return json ? res.json() : res.text();
      if (![429, 500, 502, 503].includes(res.status)) return null; // hard failure, don't retry
    } catch {
      // network blip — fall through to retry
    }
    await sleep(600 * (attempt + 1));
  }
  return null;
}

// CIK lookup — same source/shape as app/api/research/route.js (company_tickers.json).
let _cikCache = null;
async function lookupCIK(ticker) {
  if (!_cikCache) {
    _cikCache = await secFetch('https://www.sec.gov/files/company_tickers.json', { json: true });
    if (!_cikCache) return null;
  }
  const entry = Object.values(_cikCache).find((e) => e.ticker === ticker);
  return entry ? String(entry.cik_str).padStart(10, '0') : null;
}

function htmlToText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#[0-9]+;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function archiveUrl(cik, adsh, doc) {
  return `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${adsh.replace(/-/g, '')}/${doc}`;
}

// Single ~2*radius window around the first occurrence of a phrase (Step A snippets).
function windowAround(text, phrase, radius) {
  const i = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return null;
  return text.slice(Math.max(0, i - radius), i + radius);
}

// Merged excerpt around every occurrence of the given phrases, capped at `cap`
// chars (~30k for Steps B/C). Ensures the commitments/backlog footnote is
// included wherever it sits in the document.
function excerptAround(text, phrases, radiusEach = 2500, cap = 30000) {
  const low = text.toLowerCase();
  const spans = [];
  for (const phrase of phrases) {
    const p = phrase.toLowerCase();
    let from = 0;
    let i;
    while ((i = low.indexOf(p, from)) >= 0) {
      spans.push([Math.max(0, i - radiusEach), i + radiusEach]);
      from = i + p.length;
      if (spans.length > 40) break;
    }
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [spans[0]];
  for (const [s, e] of spans.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  let out = '';
  for (const [s, e] of merged) {
    if (out.length >= cap) break;
    out += `${text.slice(s, e)}\n…\n`;
  }
  return out.slice(0, cap);
}

async function latest10Q(cik) {
  const sub = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { json: true });
  const r = sub?.filings?.recent;
  if (!r) return null;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === '10-Q') {
      return { adsh: r.accessionNumber[i], filingDate: r.filingDate[i], doc: r.primaryDocument[i] };
    }
  }
  return null;
}

// Raw fetch to Anthropic — mirrors app/api/ai-summary/route.js (x-api-key,
// anthropic-version, forced tool_use). Returns the tool input object or null.
async function classifyWithClaude({ system, userText, tool }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  let res;
  let raw;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: userText }],
      }),
    });
    raw = await res.json();
  } catch (e) {
    console.error('[thesis-signals] Anthropic fetch failed:', e.message);
    return null;
  }
  if (!res.ok) {
    console.error('[thesis-signals] Anthropic non-200:', JSON.stringify(raw));
    return null;
  }
  const block = raw.content?.find((b) => b.type === 'tool_use' && b.name === tool.name);
  return block?.input ?? null;
}

async function saveSignal(sb, row) {
  const { error } = await sb.from('thesis_signals').upsert(
    { ...row, checked_at: new Date().toISOString() },
    { onConflict: 'signal_key,ticker' },
  );
  if (error) console.error('[thesis-signals] upsert failed:', row.signal_key, row.ticker, error.message);
}

// ── Tool schemas ─────────────────────────────────────────────────────────────
const EDGAR_TOOL = {
  name: 'classify_filing_hit',
  description: 'Classify whether a filing excerpt concerns modification or distress of a customer compute / AI-infrastructure contract.',
  input_schema: {
    type: 'object',
    properties: {
      relevant: {
        type: 'boolean',
        description: 'True ONLY if the excerpt concerns actual modification, cancellation, impairment, or distress of a material customer compute / AI-infrastructure contract. False for routine boilerplate, generic risk-factor language, unrelated accounting, or a phrase that merely appears without substance.',
      },
      reason: { type: 'string', description: 'One short sentence (max ~20 words) explaining the classification.' },
    },
    required: ['relevant', 'reason'],
  },
};

const META_TOOL = {
  name: 'extract_purchase_obligations',
  description: 'Extract total purchase obligations from a Meta 10-Q commitments footnote.',
  input_schema: {
    type: 'object',
    properties: {
      total_obligations_usd_billions: {
        type: ['number', 'null'],
        description: 'Total purchase obligations / unconditional purchase commitments in USD billions (e.g. 42.3). Null if not clearly stated in the excerpt.',
      },
      confidence: { type: 'string', enum: ['high', 'low'], description: 'high if a clear total figure was found; low if inferred or ambiguous.' },
    },
    required: ['total_obligations_usd_billions', 'confidence'],
  },
};

const GOOG_TOOL = {
  name: 'extract_remaining_performance_obligations',
  description: 'Extract remaining performance obligations (revenue backlog) from a Google/Alphabet 10-Q.',
  input_schema: {
    type: 'object',
    properties: {
      total_rpo_usd_billions: {
        type: ['number', 'null'],
        description: 'Total remaining performance obligations / revenue backlog in USD billions (e.g. 467.6). Null if not clearly stated.',
      },
      pct_within_24_months: {
        type: ['number', 'null'],
        description: 'Percentage of the backlog expected to be recognized within the next 24 months (e.g. 50). Null if not stated.',
      },
      confidence: { type: 'string', enum: ['high', 'low'], description: 'high if both figures were clearly stated; low otherwise.' },
    },
    required: ['total_rpo_usd_billions', 'pct_within_24_months', 'confidence'],
  },
};

const EDGAR_SYSTEM =
  'You review SEC filing excerpts for an AI-infrastructure investor. Decide whether the excerpt describes a real modification, cancellation, impairment, or financial distress affecting a material customer compute / AI-infrastructure contract — as opposed to routine boilerplate, generic risk factors, or an incidental mention. Call classify_filing_hit; never answer in prose.';
const META_SYSTEM =
  'You extract structured figures from SEC 10-Q footnotes. Report Meta\'s total purchase obligations (unconditional purchase commitments) in USD billions from the excerpt. Call extract_purchase_obligations; never answer in prose.';
const GOOG_SYSTEM =
  'You extract structured figures from SEC 10-Q filings. Report Alphabet/Google\'s remaining performance obligations (revenue backlog) in USD billions and the percentage expected to be recognized within 24 months. Call extract_remaining_performance_obligations; never answer in prose.';

export async function GET(request) {
  // ── Auth: Vercel-injected (or manual) bearer ────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  const summary = { edgar: 0, meta: null, goog: null, errors: [] };

  const now = Date.now();
  const enddt = new Date(now).toISOString().slice(0, 10);
  const startdt = new Date(now - 7 * 864e5).toISOString().slice(0, 10);

  // ── Step A — EDGAR full-text keyword scan (signal_key 'edgar_keywords') ──────
  for (const ticker of UNIVERSE) {
    try {
      const cik = await lookupCIK(ticker);
      if (!cik) {
        await saveSignal(sb, {
          signal_key: 'edgar_keywords',
          ticker,
          status: 'unparsed',
          value_text: 'CIK lookup failed — check EDGAR manually.',
          source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=8-K&dateb=&owner=include&count=40`,
        });
        continue;
      }

      // Collect hits across all phrases (each query CIK-scoped to avoid 500s).
      const seen = new Set();
      const hits = [];
      for (const phrase of EDGAR_PHRASES) {
        const q = encodeURIComponent(`"${phrase}"`);
        const url = `https://efts.sec.gov/LATEST/search-index?q=${q}&ciks=${cik}&forms=8-K,10-Q,10-K,6-K&startdt=${startdt}&enddt=${enddt}`;
        const data = await secFetch(url, { json: true });
        for (const h of data?.hits?.hits ?? []) {
          if (seen.has(h._id)) continue;
          seen.add(h._id);
          hits.push({
            phrase,
            id: h._id,
            adsh: h._source?.adsh,
            form: h._source?.form || h._source?.root_forms?.[0] || '',
            fileDate: h._source?.file_date ?? null,
          });
        }
      }

      // Classify each hit against the filing text (cap total classifications to bound cost).
      let redHit = null;
      let amberHit = null;
      for (const hit of hits.slice(0, 8)) {
        const doc = hit.id.split(':')[1];
        if (!hit.adsh || !doc) continue;
        const html = await secFetch(archiveUrl(cik, hit.adsh, doc));
        if (!html) continue;
        const snippet = windowAround(htmlToText(html), hit.phrase, 1500);
        if (!snippet) continue; // phrase not locatable in primary doc — skip rather than guess

        const verdict = await classifyWithClaude({
          system: EDGAR_SYSTEM,
          userText: `Form type: ${hit.form}\nMatched phrase: "${hit.phrase}"\nFiling excerpt:\n${snippet}`,
          tool: EDGAR_TOOL,
        });
        if (!verdict?.relevant) continue;

        const link = archiveUrl(cik, hit.adsh, doc);
        if ((hit.form || '').startsWith('8-K')) {
          redHit = { ...hit, reason: verdict.reason, link };
          break; // 8-K distress is the strongest signal — stop here
        }
        if (!amberHit) amberHit = { ...hit, reason: verdict.reason, link };
      }

      const chosen = redHit ?? amberHit;
      await saveSignal(sb, {
        signal_key: 'edgar_keywords',
        ticker,
        status: redHit ? 'red' : amberHit ? 'amber' : 'green',
        value_text: chosen ? chosen.reason : 'No contract-modification or distress language in the last 7 days of filings.',
        source_url: chosen
          ? chosen.link
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=8-K&dateb=&owner=include&count=20`,
        filing_date: chosen?.fileDate ?? null,
      });
      summary.edgar += 1;
    } catch (e) {
      summary.errors.push(`edgar:${ticker}:${e.message}`);
      await saveSignal(sb, {
        signal_key: 'edgar_keywords',
        ticker,
        status: 'unparsed',
        value_text: `Scan failed: ${e.message}. Check EDGAR manually.`,
        source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=8-K&dateb=&owner=include&count=40`,
      });
    }
  }

  // Prior rows for Steps B/C — used for the accession-skip and the delta baseline.
  // The prior accession is recovered from the stored source_url (which is the 10-Q
  // document link, i.e. it contains the dash-stripped accession number).
  const { data: priorRows } = await sb
    .from('thesis_signals')
    .select('signal_key, ticker, value_numeric, source_url')
    .in('signal_key', ['meta_obligations', 'goog_rpo']);
  const priorBy = new Map((priorRows ?? []).map((r) => [`${r.signal_key}:${r.ticker}`, r]));

  // ── Step B — Meta purchase obligations (signal_key 'meta_obligations') ───────
  try {
    const cik = await lookupCIK('META');
    if (!cik) throw new Error('CIK lookup failed');
    const q = await latest10Q(cik);
    if (!q) throw new Error('no 10-Q found');
    const link = archiveUrl(cik, q.adsh, q.doc);
    const adshBare = q.adsh.replace(/-/g, '');
    const prior = priorBy.get('meta_obligations:META');

    if (prior?.source_url?.includes(adshBare)) {
      summary.meta = 'skipped (same accession)';
    } else {
      const html = await secFetch(link);
      if (!html) throw new Error('doc fetch failed');
      const excerpt = excerptAround(htmlToText(html), ['purchase obligations', 'unconditional purchase']);
      if (!excerpt) throw new Error('"purchase obligations" not found in 10-Q');

      const out = await classifyWithClaude({
        system: META_SYSTEM,
        userText: `Latest Meta 10-Q excerpts around "purchase obligations":\n${excerpt}`,
        tool: META_TOOL,
      });

      if (!out || out.total_obligations_usd_billions == null || out.confidence === 'low') {
        await saveSignal(sb, {
          signal_key: 'meta_obligations',
          ticker: 'META',
          status: 'unparsed',
          value_text: 'Could not confidently parse purchase obligations from the latest 10-Q — check manually.',
          source_url: link,
          filing_date: q.filingDate,
        });
        summary.meta = 'unparsed';
      } else {
        const total = out.total_obligations_usd_billions;
        const prev = prior?.value_numeric ?? null;
        const delta = prev == null ? 0 : total - prev;
        const status = delta >= 20 ? 'green' : delta >= 0 ? 'amber' : 'red';
        const narrative = prev == null
          ? `Purchase obligations $${total.toFixed(1)}B (baseline established; no prior filing to compare).`
          : `Purchase obligations $${total.toFixed(1)}B, ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}B vs prior $${prev.toFixed(1)}B.`;
        await saveSignal(sb, {
          signal_key: 'meta_obligations',
          ticker: 'META',
          status,
          value_numeric: total,
          value_text: narrative,
          source_url: link,
          filing_date: q.filingDate,
        });
        summary.meta = status;
      }
    }
  } catch (e) {
    summary.errors.push(`meta:${e.message}`);
    await saveSignal(sb, {
      signal_key: 'meta_obligations',
      ticker: 'META',
      status: 'unparsed',
      value_text: `Extraction failed: ${e.message}. Check the latest Meta 10-Q manually.`,
      source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=META&type=10-Q&dateb=&owner=include&count=10',
    });
    summary.meta = 'unparsed';
  }

  // ── Step C — Google remaining performance obligations (signal_key 'goog_rpo') ─
  try {
    const cik = await lookupCIK('GOOGL');
    if (!cik) throw new Error('CIK lookup failed');
    const q = await latest10Q(cik);
    if (!q) throw new Error('no 10-Q found');
    const link = archiveUrl(cik, q.adsh, q.doc);
    const adshBare = q.adsh.replace(/-/g, '');
    const prior = priorBy.get('goog_rpo:GOOGL');

    if (prior?.source_url?.includes(adshBare)) {
      summary.goog = 'skipped (same accession)';
    } else {
      const html = await secFetch(link);
      if (!html) throw new Error('doc fetch failed');
      const excerpt = excerptAround(htmlToText(html), [
        'remaining performance obligation',
        'revenue backlog',
        'next 24 months',
      ]);
      if (!excerpt) throw new Error('remaining performance obligations not found in 10-Q');

      const out = await classifyWithClaude({
        system: GOOG_SYSTEM,
        userText: `Latest Alphabet 10-Q excerpts around "remaining performance obligations" / "revenue backlog":\n${excerpt}`,
        tool: GOOG_TOOL,
      });

      if (!out || out.total_rpo_usd_billions == null || out.pct_within_24_months == null || out.confidence === 'low') {
        await saveSignal(sb, {
          signal_key: 'goog_rpo',
          ticker: 'GOOGL',
          status: 'unparsed',
          value_text: 'Could not confidently parse remaining performance obligations from the latest 10-Q — check manually.',
          source_url: link,
          filing_date: q.filingDate,
        });
        summary.goog = 'unparsed';
      } else {
        const total = out.total_rpo_usd_billions;
        const pct = out.pct_within_24_months;
        const prev = prior?.value_numeric ?? null;
        const grew = prev != null && total > prev;
        const status = pct < 45 && grew ? 'red' : pct < 50 ? 'amber' : 'green';
        const narrative = `RPO $${total.toFixed(1)}B; ${pct.toFixed(0)}% due within 24 months${prev != null ? ` (prior $${prev.toFixed(1)}B)` : ''}.`;
        await saveSignal(sb, {
          signal_key: 'goog_rpo',
          ticker: 'GOOGL',
          status,
          value_numeric: total,
          value_text: narrative,
          source_url: link,
          filing_date: q.filingDate,
        });
        summary.goog = status;
      }
    }
  } catch (e) {
    summary.errors.push(`goog:${e.message}`);
    await saveSignal(sb, {
      signal_key: 'goog_rpo',
      ticker: 'GOOGL',
      status: 'unparsed',
      value_text: `Extraction failed: ${e.message}. Check the latest Alphabet 10-Q manually.`,
      source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=GOOGL&type=10-Q&dateb=&owner=include&count=10',
    });
    summary.goog = 'unparsed';
  }

  return Response.json(summary);
}
