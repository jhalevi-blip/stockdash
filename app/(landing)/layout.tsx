import '../globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import DevModeAnalytics from './DevModeAnalytics';

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
      <html lang="en">
        <body>
          {children}
          <DevModeAnalytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
