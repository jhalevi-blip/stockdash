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

    // Defer to idle so the posthog-js chunk downloads + inits after first paint.
    // gatePostHogOnConsent → initPostHog() dynamically imports posthog-js, so the
    // chunk is never fetched on the critical path. requestIdleCallback with a
    // setTimeout fallback for Safari (which historically lacked rIC).
    const start = () => gatePostHogOnConsent();
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = setTimeout(start, 1);
    return () => clearTimeout(id);
  }, []);

  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
