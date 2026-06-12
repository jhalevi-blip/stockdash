'use client';

import { useEffect } from 'react';

// Registers the service worker once on mount. Silent on failure so a SW
// problem can never surface an error to the user. Renders nothing.
export default function PwaSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    (async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Registration failures are non-fatal — ignore.
      }
    })();
  }, []);

  return null;
}
