import './globals.css';
import Script from 'next/script';
import NavBar from '@/components/NavBar';
import UsageBanner from '@/components/UsageBanner';
import DemoBanner from '@/components/DemoBanner';
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
        <Script id="theme-init" strategy="beforeInteractive">{`try{var t=localStorage.getItem('stockdash_theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}`}</Script>
        <body>
          <div className="app-header">
            <div className="app-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1"  y="14" width="4" height="6" rx="0.5" fill="#c49a1a" />
                <rect x="8"  y="9"  width="4" height="11" rx="0.5" fill="#c49a1a" />
                <rect x="15" y="4"  width="4" height="16" rx="0.5" fill="#c49a1a" />
                <path d="M2 12 L10 6 L17.5 0.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M13.5 0.5 L17.5 0.5 L17.5 4.5" stroke="#c49a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span style={{ color: '#c49a1a' }}>STOCK</span><span style={{ color: '#2563eb' }}>DASHES</span>
            </div>
          </div>
          <NavBar />
          <DemoBanner />
          <UsageBanner />
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
