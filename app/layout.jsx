import './globals.css';
import Script from 'next/script';
import DevMode from '@/components/DevMode';
import PostHogProvider from '@/components/PostHogProvider';
import PwaSetup from '@/components/PwaSetup';
import GuestDataGuard from '@/components/GuestDataGuard';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';

// app/manifest.ts wires <link rel="manifest"> automatically — no manual link.
// iOS ignores manifest icons, so apple-touch-icon + apple web-app meta are set
// explicitly here.
export const metadata = {
  title: 'StockDashes',
  appleWebApp: {
    capable: true,
    title: 'StockDashes',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/icon-192.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d1117',
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider appearance={{
      variables: {
        colorBackground: '#ffffff',
        colorText: '#1a1a1a',
        colorPrimary: '#58a6ff',
        colorInputBackground: '#f5f5f5',
        colorInputText: '#1a1a1a',
        colorNeutral: '#444444',
        borderRadius: '8px',
      },
      elements: {
        cardBox: { background: '#ffffff' },
      },
    }}>
      <html lang="en">
        {/* theme-init as a beforeInteractive Script. This is the ONLY layout that
            renders <html>/<body>; route groups nest inside it and never emit their own
            document (that double-root previously flipped React's html/body hoisting and
            leaked app chrome onto the marketing pages). Chrome is now decided by folder:
            (v2)/layout and financials/layout add their own; everything here is shared and
            renders exactly once. The beforeInteractive Script warning is accepted. */}
        <Script id="theme-init" strategy="beforeInteractive">{`try{var t=localStorage.getItem('stockdash_theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}try{if(localStorage.getItem('dev_mode')==='true')document.documentElement.setAttribute('data-va-disable','true')}catch(e){}`}</Script>
        {/* Consent Mode defaults. afterInteractive (was beforeInteractive, which made it
            an <html> child) and positioned before the gtag scripts below so the denied
            defaults are queued on dataLayer before gtag('config') runs. */}
        <Script id="gcm-default" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied','functionality_storage':'granted','security_storage':'granted','wait_for_update':500});`}</Script>
        {/* CookieHub v2 widget — self-initialises from dashboard config. The old
            .load(config) call was removed: it was a v1 API that threw against v2, and
            the cookieDomain it set (.stockdashes.com) is now handled in the dashboard. */}
        <Script id="cookiehub" strategy="afterInteractive" src="https://cdn.cookiehub.eu/c2/9cb2f0a8.js" />
        {process.env.VERCEL_ENV === 'production' && (
          <>
            {/* GA4/GTM deferred to lazyOnload so its ~172KB script + execution no longer
                competes for the main thread during initial render (the homepage LCP is
                main-thread-bound). Consent ordering is preserved: gcm-default above is
                afterInteractive, which always runs before any lazyOnload script, so the
                denied consent defaults are queued on dataLayer before gtag('config')
                below initialises GA4. The VERCEL_ENV production gate and the
                navigator.webdriver guard are unchanged. */}
            <Script src="https://www.googletagmanager.com/gtag/js?id=G-NK5GB4WDZL" strategy="lazyOnload" />
            <Script id="ga4-init" strategy="lazyOnload">{`if(!navigator.webdriver){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-NK5GB4WDZL');}`}</Script>
          </>
        )}
        {process.env.VERCEL_ENV === 'production' && (
          /* Clarity is gated on CookieHub's analytics consent, so no clarity.ms request
             fires before the visitor accepts. hasConsented is invoked from exactly one
             place — consented() — and only after a typeof==='function' check, so no path
             can throw "hasConsented is not a function" (the bug this replaces: window.
             cookiehub existed but hasConsented wasn't attached yet when our code ran).
             Two triggers: (1) the documented CookieHub v2 DOM events
             (cookiehub_onInitialise / _onStatusChange / _onAllow) for a fresh accept —
             injects with no reload; (2) a bounded, silent poll for a returning visitor
             whose consent is already stored, because cookiehub_onInitialise is dispatched
             conditionally by the widget and can be missed (fires before our listener
             attaches, or not at all on a silent re-init) — the old one-shot immediate
             check raced that and left Clarity never loading. The poll stays quiet until
             CookieHub is ready (a cold load with hasConsented not yet attached is normal,
             not an error) and gives up after ~10s. We do NOT use the cpm callback object
             (it must be passed to cookiehub.load(), which we removed) or Clarity's own
             consent API (it injects immediately, hitting clarity.ms pre-consent). The
             console.error is kept for the genuine failure: an event fires but hasConsented
             still isn't callable (wrong event name / API shape). navigator.webdriver still
             skips headless; the VERCEL_ENV gate is unchanged. */
          <Script id="microsoft-clarity" strategy="afterInteractive">{`(function(){if(navigator.webdriver)return;var loaded=false;function inject(){if(loaded)return;loaded=true;(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","wdrpz8u02q");}function canEval(){return window.cookiehub&&typeof window.cookiehub.hasConsented==='function';}function consented(){return canEval()&&window.cookiehub.hasConsented('analytics');}function onEvent(){if(!canEval()){console.error('[clarity-consent] CookieHub consent event fired but window.cookiehub.hasConsented is unavailable — Clarity will not load; verify the cookiehub_* event names / API.');return;}if(consented())inject();}document.addEventListener('cookiehub_onInitialise',onEvent);document.addEventListener('cookiehub_onStatusChange',onEvent);document.addEventListener('cookiehub_onAllow',onEvent);var tries=0;(function poll(){if(loaded)return;if(consented()){inject();return;}if(++tries>40)return;setTimeout(poll,250);})();})();`}</Script>
        )}
        <body>
          <GuestDataGuard />
          {children}
          <Analytics />
          <DevMode />
          <PostHogProvider />
          <PwaSetup />
        </body>
      </html>
    </ClerkProvider>
  );
}
