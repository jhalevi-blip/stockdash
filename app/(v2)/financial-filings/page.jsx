import { redirect } from 'next/navigation';

// Financial Filings is folded into Stock Research as a tab (filings + news +
// earnings-call transcripts). Kept only as a redirect so old links (and any
// ?ticker=) never break.
export default async function FilingsRedirect({ searchParams }) {
  const sp = await searchParams;
  const raw = sp?.ticker;
  const t = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
  redirect(`/research?tab=filings${t ? `&ticker=${encodeURIComponent(t)}` : ''}`);
}
