'use client';
import { useState, useEffect } from 'react';
import { Joyride } from 'react-joyride';

const STATUS_FINISHED = 'finished';
const STATUS_SKIPPED  = 'skipped';

const STEPS = [
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
    target: '[data-tour="edit-portfolio"]',
    title: 'Edit your portfolio',
    content: 'Add your own tickers here to make every page personal. Your holdings are saved to your device.',
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
        <div style={{ fontSize: 36, marginBottom: 16 }}>🚀</div>
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
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (run) setShowModal(false);
  }, [run]);

  function handleCallback({ status }) {
    if (status === STATUS_FINISHED) {
      localStorage.setItem('tour_completed', 'true');
      onStop();
      setShowModal(true);
    } else if (status === STATUS_SKIPPED) {
      localStorage.setItem('tour_completed', 'true');
      onStop();
    }
  }

  if (!mounted) return null;

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
            backgroundColor: '#161b22',
            textColor: '#e6edf3',
            primaryColor: '#2563eb',
            arrowColor: '#161b22',
            overlayColor: 'rgba(0,0,0,0.6)',
            zIndex: 9000,
          },
          tooltip: {
            borderRadius: 10,
            border: '1px solid #30363d',
            fontSize: 14,
            padding: '20px 24px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          },
          tooltipTitle: {
            color: '#f0f6fc',
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 4,
          },
          tooltipContent: {
            color: '#b1bac4',
            fontSize: 14,
            lineHeight: '1.6',
            paddingTop: 8,
          },
          buttonNext: {
            backgroundColor: '#2563eb',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 18px',
          },
          buttonBack: {
            color: '#8b949e',
            fontSize: 13,
          },
          buttonSkip: {
            color: '#484f58',
            fontSize: 13,
          },
          buttonClose: {
            color: '#8b949e',
          },
          spotlight: {
            borderRadius: 8,
          },
        }}
      />
      {showModal && <CompletionModal onClose={() => setShowModal(false)} />}
    </>
  );
}
