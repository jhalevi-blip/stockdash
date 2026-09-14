import './globals.css';
import Script from 'next/script';
import AppShell from '@/components/AppShell';
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
        <head>
          {/* theme-init runs synchronously during head parse — before first paint, so
              no flash — and lives inside <head> rather than being a direct <script>
              child of <html> (which Next 16 / React 19 warns about). */}
          <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('stockdash_theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}try{if(localStorage.getItem('dev_mode')==='true')document.documentElement.setAttribute('data-va-disable','true')}catch(e){}` }} />
        </head>
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
            <Script src="https://www.googletagmanager.com/gtag/js?id=G-NK5GB4WDZL" strategy="afterInteractive" />
            {/* navigator.webdriver skips GA4 init for headless automation (our own
                verification runs hit production aliases). The env gate stays; this is
                an added condition. The external gtag/js above still loads but stays
                inert without the config() call below. */}
            <Script id="ga4-init" strategy="afterInteractive">{`if(!navigator.webdriver){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-NK5GB4WDZL');}`}</Script>
          </>
        )}
        {process.env.VERCEL_ENV === 'production' && (
          /* Clarity is gated on CookieHub's analytics consent, so no clarity.ms request
             fires before the visitor accepts. Mechanism: CookieHub v2's documented DOM
             events (cookiehub_onInitialise / _onStatusChange / _onAllow, emitted by the
             auto-initialising widget from v2.8.13+), each re-checking
             hasConsented('analytics'). We do NOT use the cpm callback object — that must
             be passed to cookiehub.load(), which we removed, so it isn't reachable on the
             auto-init widget. We also avoid Clarity's own consent API, which injects the
             tag immediately (hitting clarity.ms) and only withholds cookies. A fresh
             accept injects via onStatusChange/onAllow with no reload; the immediate
             hasConsented check covers returning visitors who already consented.
             navigator.webdriver still skips Clarity for headless automation; the
             VERCEL_ENV gate is unchanged. If a cookiehub_* event fires but
             window.cookiehub.hasConsented isn't a function (wrong event name or API
             shape), we console.error — silent non-loading is the failure mode here, and
             a normal "not granted" outcome stays quiet so it isn't noise on every load. */
          <Script id="microsoft-clarity" strategy="afterInteractive">{`(function(){if(navigator.webdriver)return;var loaded=false;function inject(){if(loaded)return;loaded=true;(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","wdrpz8u02q");}function ready(){return window.cookiehub&&typeof window.cookiehub.hasConsented==='function';}function onEvent(){if(!ready()){console.error('[clarity-consent] CookieHub consent event fired but window.cookiehub.hasConsented is unavailable — Clarity will not load; verify the cookiehub_* event names / API.');return;}if(window.cookiehub.hasConsented('analytics'))inject();}document.addEventListener('cookiehub_onInitialise',onEvent);document.addEventListener('cookiehub_onStatusChange',onEvent);document.addEventListener('cookiehub_onAllow',onEvent);if(ready()&&window.cookiehub.hasConsented('analytics'))inject();})();`}</Script>
        )}
        <body>
          <GuestDataGuard />
          <AppShell />
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
