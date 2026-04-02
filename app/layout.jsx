import './globals.css';
import Script from 'next/script';
import NavBar from '@/components/NavBar';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { Analytics } from '@vercel/analytics/react';

export const metadata = { title: 'StockDash' };

export default function RootLayout({ children }) {
  return (
    <ClerkProvider appearance={{
      baseTheme: dark,
      variables: {
        colorBackground: '#1c2128',
        colorText: '#e6edf3',
        colorPrimary: '#58a6ff',
        colorInputBackground: '#22272e',
        colorInputText: '#e6edf3',
        colorNeutral: '#c9d1d9',
        borderRadius: '6px',
      },
      elements: {
        rootBox: { backgroundColor: '#1c2128' },
        card: { backgroundColor: '#1c2128', boxShadow: 'none', border: '1px solid #30363d' },
        modalContent: { backgroundColor: '#1c2128' },
        modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.7)' },
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
