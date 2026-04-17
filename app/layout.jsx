import './globals.css';
import Script from 'next/script';
import AppShell from '@/components/AppShell';
import DevMode from '@/components/DevMode';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';
import { GoogleAnalytics } from '@next/third-parties/google';

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
        <body>
          <AppShell />
          {children}
          <Analytics />
          <DevMode />
          <GoogleAnalytics gaId="G-NK5GB4WDZ1" />
        </body>
      </html>
    </ClerkProvider>
  );
}
