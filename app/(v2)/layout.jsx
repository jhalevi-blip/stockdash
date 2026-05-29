'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import Sidebar from './_components/Sidebar';
import Topbar from './_components/Topbar';
import MobileNavDrawer from './_components/MobileNavDrawer';
import PortfolioModal from '@/components/PortfolioModal';
import { loadUserHoldings, saveUserHoldings } from '@/lib/holdingsStorage';

// V2 layout — owns its own chrome (Sidebar + Topbar) and the
// Edit Portfolio modal. Mirrors NavBar's portfolio load/save
// logic exactly so behavior matches across both layouts.
export default function DashboardV2Layout({ children }) {
  const { user, isSignedIn } = useUser();
  const [modalOpen, setModalOpen] = useState(false);
  const [savedHoldings, setSavedHoldings] = useState([]);
  const [savedCash, setSavedCash] = useState(null);

  function openModal() {
    const h = loadUserHoldings(user?.id);
    if (h) setSavedHoldings(h);
    const cashAmt = parseFloat(localStorage.getItem('stockdash_cash_amount') || '0') || 0;
    const cashCcy = localStorage.getItem('stockdash_cash_currency') || 'USD';
    setSavedCash(cashAmt > 0 ? { amount: cashAmt, currency: cashCcy } : null);
    setModalOpen(true);
  }

  async function savePortfolio(holdings, cash) {
    saveUserHoldings(user?.id, holdings);
    setSavedHoldings(holdings);
    if (cash?.amount > 0) {
      localStorage.setItem('stockdash_cash_amount', String(cash.amount));
      localStorage.setItem('stockdash_cash_currency', cash.currency ?? 'USD');
    } else {
      localStorage.removeItem('stockdash_cash_amount');
      localStorage.removeItem('stockdash_cash_currency');
    }
    setSavedCash(cash?.amount > 0 ? cash : null);
    if (!isSignedIn) {
      window.dispatchEvent(new CustomEvent('portfolio-saved'));
      setModalOpen(false);
      return;
    }
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings, cash: cash?.amount > 0 ? cash : null }),
      });
      if (!res.ok) throw new Error('Save failed');
      window.dispatchEvent(new CustomEvent('portfolio-saved'));
    } catch (e) {
      console.error('Failed to save portfolio to API:', e);
    }
    setModalOpen(false);
  }

  // Allow child pages (e.g. dashboard empty state) to open the editor via event
  useEffect(() => {
    function onOpenEditor() { openModal(); }
    window.addEventListener('open-portfolio-editor', onOpenEditor);
    return () => window.removeEventListener('open-portfolio-editor', onOpenEditor);
  }, [user?.id]);

  function handleCommand(cmd) {
    if (cmd === 'editPortfolio') openModal();
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
    }}>
      <Sidebar />
      <MobileNavDrawer />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar onCommand={handleCommand} />
        {children}
      </div>
      {modalOpen && (
        <PortfolioModal
          holdings={savedHoldings}
          cash={savedCash}
          onSave={savePortfolio}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
