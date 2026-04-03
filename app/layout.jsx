import './globals.css';
import Script from 'next/script';
import NavBar from '@/components/NavBar';
import UsageBanner from '@/components/UsageBanner';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';

export const metadata = { title: 'StockDash' };

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
        <Script id="theme-init" strategy="beforeInteractive">{`try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`}</Script>
        <body>
          <div className="app-header">
            <div className="app-logo">
              STOCK<span>DASH</span>
            </div>
          </div>
          <NavBar />
          <UsageBanner />
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
