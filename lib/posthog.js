import posthog from 'posthog-js';

// Pre-init event queue — holds track/identify calls made before posthog.init() completes
const preInitQueue = [];

export function initPostHog() {
  if (typeof window === 'undefined') return;
  if (posthog.__loaded) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    loaded: (ph) => {
      const pending = preInitQueue.splice(0);
      for (const { type, args } of pending) {
        if (type === 'capture') ph.capture(...args);
        else if (type === 'identify') ph.identify(...args);
      }
    },
  });
}

export function gatePostHogOnConsent() {
  if (typeof window === 'undefined') return;
  let fastAttempts = 0;
  function waitForCookieHub() {
    if (!window.cookiehub) {
      if (fastAttempts++ < 100) setTimeout(waitForCookieHub, 50);
      return;
    }
    if (window.cookiehub.hasConsented('analytics')) {
      initPostHog();
      return;
    }
    let slowAttempts = 0;
    function pollConsent() {
      if (window.cookiehub.hasConsented('analytics')) {
        initPostHog();
        return;
      }
      if (slowAttempts++ < 60) setTimeout(pollConsent, 1000);
    }
    pollConsent();
  }
  waitForCookieHub();
}

export function track(eventName, properties) {
  if (typeof window === 'undefined') return;
  if (!posthog.__loaded) { preInitQueue.push({ type: 'capture', args: [eventName, properties] }); return; }
  posthog.capture(eventName, properties);
}

export function identifyUser(userId, properties) {
  if (typeof window === 'undefined') return;
  if (!posthog.__loaded) { preInitQueue.push({ type: 'identify', args: [userId, properties] }); return; }
  posthog.identify(userId, properties);
}
