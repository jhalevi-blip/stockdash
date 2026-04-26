import './globals.css';
import Script from 'next/script';
import AppShell from '@/components/AppShell';
import DevMode from '@/components/DevMode';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';

export const metadata = { title: 'StockDashes' };

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
        <Script id="theme-init" strategy="beforeInteractive">{`try{var t=localStorage.getItem('stockdash_theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}try{if(localStorage.getItem('dev_mode')==='true')document.documentElement.setAttribute('data-va-disable','true')}catch(e){}`}</Script>
        <Script id="gcm-default" strategy="beforeInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied','functionality_storage':'granted','security_storage':'granted','wait_for_update':500});`}</Script>
        <Script id="cookiehub" strategy="beforeInteractive" src="https://cdn.cookiehub.eu/c2/9cb2f0a8.js" />
        <Script id="cookiehub-init" strategy="afterInteractive">{`document.addEventListener("DOMContentLoaded",function(){var cpm={};window.cookiehub.load(cpm);});`}</Script>
        {process.env.VERCEL_ENV === 'production' && (
          <>
            <Script src="https://www.googletagmanager.com/gtag/js?id=G-NK5GB4WDZL" strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-NK5GB4WDZL');`}</Script>
          </>
        )}
        {process.env.VERCEL_ENV === 'production' && (
          <Script id="microsoft-clarity" strategy="afterInteractive">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","wdrpz8u02q");`}</Script>
        )}
        <body>
          <AppShell />
          {children}
          <Analytics />
          <DevMode />
        </body>
      </html>
    </ClerkProvider>
  );
}
