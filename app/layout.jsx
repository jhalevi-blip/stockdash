import './globals.css';
import Script from 'next/script';
import NavBar from '@/components/NavBar';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';

export const metadata = { title: 'StockDash' };

export default function RootLayout({ children }) {
  return (
    <ClerkProvider appearance={{
      variables: {
        colorBackground: '#161b22',
        colorText: '#e6edf3',
        colorPrimary: '#58a6ff',
        colorInputBackground: '#0d1117',
        colorInputText: '#e6edf3',
        colorNeutral: '#8b949e',
        borderRadius: '6px',
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
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
