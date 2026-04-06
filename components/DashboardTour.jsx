'use client';
import { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';

const STEPS = [
  {
    target: '[data-tour="summary-cards"]',
    title: 'Portfolio at a glance',
    content: 'Your portfolio at a glance. P&L, market value and upcoming earnings all in one place.',
    disableBeacon: true,
    placement: 'bottom',
  },
  {
    target: '[data-tour="holdings-table"]',
    title: 'Your holdings',
    content: 'All your positions in one place. Click any row to dive into full stock intel below.',
    disableBeacon: true,
    placement: 'top',
  },
  {
    target: '[data-tour="price-chart"]',
    title: 'Price history',
    content: 'Interactive price history for any holding. Toggle 1M, 3M, 6M, YTD and 1Y.',
    disableBeacon: true,
    placement: 'top',
  },
  {
    target: '[data-tour="stock-intel"]',
    title: 'Stock Intel',
    content: 'Institutional-grade data per stock — valuation, insider activity, earnings, news and SEC filings.',
    disableBeacon: true,
    placement: 'top',
  },
  {
    target: '[data-tour="insider-link"]',
    title: 'Insider Transactions',
    content: 'Track every insider buy and sell across your portfolio in real time.',
    disableBeacon: true,
    placement: 'bottom',
  },
  {
    target: '[data-tour="ownership-link"]',
    title: 'Institutional Ownership',
    content: 'Follow the biggest funds — Ackman, Druckenmiller, Einhorn and more.',
    disableBeacon: true,
    placement: 'bottom',
  },
  {
    target: '[data-tour="macro-link"]',
    title: 'Macro',
    content: 'Monitor the macro environment — yields, VIX, fear & greed and commodities.',
    disableBeacon: true,
    placement: 'bottom',
  },
];

function CompletionModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        background: '#1a1f2e',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: '40px 32px',
        maxWidth: 400,
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>🎉</div>
        <h2 style={{
          color: '#e6edf3', fontSize: 20, fontWeight: 700,
          margin: '0 0 12px',
        }}>
          Ready to track your own portfolio?
        </h2>
        <p style={{
          color: '#8b949e', fontSize: 14,
          lineHeight: 1.7, margin: '0 0 28px',
        }}>
          Create a free account and get everything you just saw — for your own holdings. No credit card, no ads.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <a
            href="/sign-up"
            style={{
              background: '#1f6feb', color: '#fff',
              padding: '10px 24px', borderRadius: 6,
              fontSize: 14, fontWeight: 600,
              textDecoration: 'none', display: 'inline-block',
            }}
          >
            Sign Up Free
          </a>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #30363d',
              color: '#8b949e',
              padding: '10px 20px',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTour({ run, onStop }) {
  const [showModal, setShowModal] = useState(false);

  // Reset modal when a new run starts
  useEffect(() => {
    console.log('[DashboardTour] run prop changed:', run);
    if (run) setShowModal(false);
  }, [run]);

  function handleCallback({ status }) {
    if (status === STATUS.FINISHED) {
      localStorage.setItem('tour_completed', 'true');
      onStop();
      setShowModal(true);
    } else if (status === STATUS.SKIPPED) {
      localStorage.setItem('tour_completed', 'true');
      onStop();
    }
  }

  return (
    <>
      <Joyride
        steps={STEPS}
        run={run}
        continuous
        showProgress
        showSkipButton
        scrollToFirstStep
        callback={handleCallback}
        styles={{
          options: {
            backgroundColor: '#1a1f2e',
            textColor: '#ffffff',
            primaryColor: '#1f6feb',
            arrowColor: '#1a1f2e',
            overlayColor: 'rgba(0,0,0,0.55)',
            zIndex: 9000,
          },
          tooltip: {
            borderRadius: 8,
            border: '1px solid #30363d',
            fontSize: 14,
          },
          tooltipTitle: {
            color: '#e6edf3',
            fontSize: 14,
            fontWeight: 700,
          },
          tooltipContent: {
            color: '#c9d1d9',
            paddingTop: 8,
          },
          buttonNext: {
            backgroundColor: '#1f6feb',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
          },
          buttonBack: {
            color: '#8b949e',
            fontSize: 13,
          },
          buttonSkip: {
            color: '#4b5563',
            fontSize: 13,
          },
          buttonClose: {
            color: '#8b949e',
          },
        }}
      />
      {showModal && <CompletionModal onClose={() => setShowModal(false)} />}
    </>
  );
}
