'use client';
import { useEffect } from 'react';
import { gatePostHogOnConsent } from '@/lib/posthog';

export default function PostHogProvider() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_VERCEL_ENV) return;
    gatePostHogOnConsent();
  }, []);
  return null;
}
