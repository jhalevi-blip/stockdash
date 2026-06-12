'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

// Convert a base64url-encoded VAPID public key into the Uint8Array that
// PushManager.subscribe expects as applicationServerKey.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Small Topbar control to opt into web push. Renders nothing unless the
// browser supports push, permission isn't already denied, and the user is
// signed in.
export default function PushOptIn() {
  const { isSignedIn } = useUser();
  const [supported, setSupported]   = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [failed, setFailed]         = useState(false);

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    // Reflect an already-active subscription as the quiet "on" state.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  if (!supported || permission === 'denied' || !isSignedIn) return null;

  async function enable() {
    if (busy || subscribed) return;
    setBusy(true);
    setFailed(false);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      const res = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error('save failed');
      setSubscribed(true);
    } catch (e) {
      console.error('[push] enable failed', e);
      setFailed(true);
    }
    setBusy(false);
  }

  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: subscribed ? 'default' : 'pointer',
  };

  if (subscribed) {
    return (
      <span style={{ ...baseStyle, opacity: 0.6 }} aria-label="Notifications enabled">
        🔔 Notifications on
      </span>
    );
  }

  return (
    <button onClick={enable} disabled={busy} style={baseStyle} aria-label="Enable notifications">
      {busy ? '…' : failed ? '🔕 Try again' : '🔔 Enable notifications'}
    </button>
  );
}
