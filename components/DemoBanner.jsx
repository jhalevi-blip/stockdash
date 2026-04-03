'use client';
import { useState, useEffect } from 'react';
import { SignUpButton, useUser } from '@clerk/nextjs';

export default function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);
  const { isSignedIn } = useUser();

  useEffect(() => {
    setIsDemo(localStorage.getItem('stockdash_demo') === 'true');
  }, []);

  // Clear demo mode automatically when user signs in
  useEffect(() => {
    if (isSignedIn) {
      localStorage.removeItem('stockdash_demo');
      setIsDemo(false);
    }
  }, [isSignedIn]);

  if (!isDemo) return null;

  return (
    <div style={{
      background: '#78350f',
      borderBottom: '1px solid #92400e',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      fontSize: 13,
      color: '#fde68a',
    }}>
      <span>You&apos;re viewing a demo portfolio — sign up to track your own holdings</span>
      <SignUpButton mode="modal">
        <button
          onClick={() => localStorage.removeItem('stockdash_demo')}
          style={{
            background: '#f59e0b',
            border: 'none',
            borderRadius: 5,
            color: '#1c1917',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            padding: '4px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          Sign Up Free →
        </button>
      </SignUpButton>
    </div>
  );
}
