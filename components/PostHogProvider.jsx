'use client';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { gatePostHogOnConsent, track } from '@/lib/posthog';

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    track('$pageview');
  }, [pathname, searchParams]);

  return null;
}

export default function PostHogProvider() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VERCEL_ENV) return;
    if (process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== 'true') return;
    gatePostHogOnConsent();
  }, []);

  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
