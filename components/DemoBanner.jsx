'use client';
import { useState, useEffect } from 'react';
import { SignUpButton, useUser } from '@clerk/nextjs';

export default function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);
  const { isSignedIn } = useUser();

  useEffect(() => {
    setIsDemo(localStorage.getItem('stockdash_demo') === 'true');
  }, []);

  // Hide banner when user signs in — NavBar's sign-in effect is the
  // sole authority for removing stockdash_demo from localStorage.
  useEffect(() => {
    if (isSignedIn) {
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
      <button
        onClick={() => {
          localStorage.setItem('stockdash_demo_dismissed', 'true');
          localStorage.removeItem('stockdash_demo');
          setIsDemo(false);
        }}
        aria-label="Exit demo"
        style={{
          background: 'none',
          border: 'none',
          color: '#fde68a',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0 4px',
          opacity: 0.7,
        }}
      >×</button>
    </div>
  );
}
