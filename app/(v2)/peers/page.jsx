import { redirect } from 'next/navigation';

// Peers is folded into Stock Research as a tab. This route is kept only as a
// redirect so old links (and any ?ticker=) never break.
export default async function PeersRedirect({ searchParams }) {
  const sp = await searchParams;
  const raw = sp?.ticker;
  const t = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
  redirect(`/research?tab=peers${t ? `&ticker=${encodeURIComponent(t)}` : ''}`);
}
