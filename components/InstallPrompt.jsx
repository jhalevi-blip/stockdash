'use client';
import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';

// Dismissible "install the app" nudge for signed-in users on mobile web.
// Never shown when already running as an installed PWA. Two branches:
//   - iOS: no beforeinstallprompt exists, so we show manual instructions.
//   - Chromium: we capture beforeinstallprompt and drive the native prompt.
//
// Starts with a null render and evaluates every visibility condition inside a
// useEffect after mount (deliberately NOT useIsMobile — that hook has known iOS
// Safari hydration issues). Dismissal is a per-user localStorage flag; it is
// intentionally not on clearAllForeignData's preserve-list, so signing out
// clears it (fine — this is a signed-in-only banner).
export default function InstallPrompt() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [visible, setVisible]         = useState(false);
  const [platform, setPlatform]       = useState(null); // 'ios' | 'chromium' | null
  const [promptReady, setPromptReady] = useState(false);
  const deferredPrompt                = useRef(null);

  // Capture beforeinstallprompt as early as possible (it can fire on load).
  // preventDefault() suppresses Chrome's mini-infobar so our banner owns the UX.
  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      deferredPrompt.current = e;
      setPromptReady(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  // Evaluate all visibility gates after mount. Any failing gate → stay hidden.
  // Re-runs when auth resolves or a Chromium install event is captured.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (window.innerWidth >= 768) return; // mobile web only
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true; // iOS-specific
    if (standalone) return; // already installed
    if (localStorage.getItem('install_prompt_dismissed_' + user.id)) return;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setPlatform('ios');
      setVisible(true); // manual instructions, no event needed
    } else {
      setPlatform('chromium');
      if (promptReady) setVisible(true); // only once an install event exists
    }
  }, [isLoaded, isSignedIn, user?.id, promptReady]);

  async function install() {
    const evt = deferredPrompt.current;
    if (!evt) return;
    evt.prompt();
    try { await evt.userChoice; } catch {}
    // Clear the stash and hide regardless of accept/dismiss — the event is
    // single-use and cannot be re-prompted.
    deferredPrompt.current = null;
    setPromptReady(false);
    setVisible(false);
  }

  function dismiss() {
    if (user?.id) localStorage.setItem('install_prompt_dismissed_' + user.id, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      background: '#78350f',
      borderBottom: '1px solid #92400e',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      fontSize: 13,
      color: '#fde68a',
    }}>
      {platform === 'ios' ? (
        <span>Install StockDashes: tap Share, then &apos;Add to Home Screen&apos;</span>
      ) : (
        <>
          <span>Get the StockDashes app</span>
          <button
            onClick={install}
            style={{
              background: '#f59e0b',
              border: 'none',
              borderRadius: 5,
              color: '#1c1917',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '4px 14px',
              whiteSpace: 'nowrap',
            }}
          >
            Install
          </button>
        </>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        style={{
          background: 'none',
          border: 'none',
          color: '#fde68a',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0 4px',
          opacity: 0.7,
        }}
      >×</button>
    </div>
  );
}
