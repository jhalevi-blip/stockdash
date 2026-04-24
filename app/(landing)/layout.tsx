import '../globals.css';
import { DM_Sans } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import DevModeAnalytics from './DevModeAnalytics';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = { title: 'StockDashes — Research your portfolio like a professional' };

export default function LandingLayout({ children }: { children: React.ReactNode }) {
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
      <html lang="en" data-theme="dark" className={dmSans.className}>
        <body>
          {children}
          <DevModeAnalytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
