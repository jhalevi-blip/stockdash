'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { getCachedHoldings, getCacheOwner, clearHoldingsCache, saveUserHoldings } from '@/lib/holdingsStorage';

/** Read the shared cache for a guest viewer — ownership-checked (returns [] for a foreign cache). */
function getLocalHoldings() {
  return getCachedHoldings(null);
}

/**
 * Loads the current user's portfolio holdings.
 *
 * Signed-in users: always fetch /api/portfolio (Supabase source of truth).
 *   - holdings === null  → loading
 *   - holdings === []    → signed in, no portfolio yet
 *   - holdings === [...] → data ready
 *   - error !== null     → fetch failed; never falls back to localStorage
 *
 * Anonymous users: read from shared localStorage cache synchronously, no fetch.
 *
 * Refresh triggers:
 *   - Clerk auth state changes (isLoaded, isSignedIn, user.id)
 *   - 'portfolio-saved' CustomEvent dispatched by NavBar/layout after save
 *   - refresh() called directly (e.g. UnifiedUpload on /performance)
 */
export function useHoldings() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [holdings,   setHoldings]   = useState(null);
  const [cash,       setCash]       = useState(null); // { amount, currency } | null
  const [error,      setError]      = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Main fetch effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return; // wait for Clerk to resolve — avoids transient anonymous state

    let cancelled = false;

    if (isSignedIn && user?.id) {
      setHoldings(null);  // loading state until fetch resolves
      setError(null);

      fetch('/api/portfolio')
        .then((r) => {
          if (!r.ok) throw new Error(`Portfolio request failed (${r.status})`);
          return r.json();
        })
        .then((data) => {
          if (cancelled) return;
          if (data.signedIn && data.holdings?.length) {
            setHoldings(data.holdings);
            saveUserHoldings(user.id, data.holdings); // write-through to localStorage
          } else {
            setHoldings([]); // signed in but no portfolio yet
          }
          setCash(data.cash ?? null); // { amount, currency } | null
        })
        .catch((err) => {
          if (cancelled) return;
          // Never fall back to localStorage — stale data is worse than an error state
          setError(err?.message ?? 'Failed to load portfolio');
        });
    } else {
      // Anonymous: shared localStorage cache (ownership-checked), no fetch.
      // Defense-in-depth: if a real signed-in user's cache was left on this
      // device, wipe the raw bytes — the getter already refuses to show it.
      // Only when Clerk has loaded AND the viewer is confirmed signed out, so a
      // signed-in user's own cache is never wiped during the auth-loading window.
      const owner = getCacheOwner();
      if (isLoaded && !isSignedIn && owner && owner !== 'demo' && owner !== 'anonymous') {
        clearHoldingsCache();
      }
      setHoldings(getLocalHoldings());
      setCash(null);
      setError(null);
    }

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id, refreshKey]);

  // ── portfolio-saved event listener ─────────────────────────────────────────
  // NavBar and layout dispatch this after every successful savePortfolio call.
  // Incrementing refreshKey re-runs the fetch effect to pull the latest data.
  useEffect(() => {
    function onSaved() { setRefreshKey((k) => k + 1); }
    window.addEventListener('portfolio-saved', onSaved);
    return () => window.removeEventListener('portfolio-saved', onSaved);
  }, []);

  return {
    holdings,
    cash,    // { amount: number, currency: string } | null — from Supabase, re-fetched on portfolio-saved
    error,
    /** Force an immediate re-fetch. Use after a direct upload (e.g. UnifiedUpload). */
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
