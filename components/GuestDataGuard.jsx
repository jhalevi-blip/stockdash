'use client';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { clearAllForeignData } from '@/lib/holdingsStorage';

// App-wide private-by-default guard. Mounted once in app/layout.jsx (inside
// ClerkProvider), so it runs on EVERY route — homepage and non-(v2) pages
// included, which the old app/(v2)/layout.jsx effect never reached.
//
// Wipes the prior person's personal localStorage on a confirmed-guest load.
// Strictly gated on isLoaded && !isSignedIn so a signed-in user's data is never
// touched, and never during Clerk's loading window. Renders nothing.
export default function GuestDataGuard() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (isLoaded && !isSignedIn) clearAllForeignData();
  }, [isLoaded, isSignedIn]);

  return null;
}
