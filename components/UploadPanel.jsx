'use client';

import { useState } from 'react';

// Phase G.1 Stage A — shell component, no parsing logic yet.
// Receives onClose to collapse, onImport(rows, cash) to apply parsed data.
export default function UploadPanel({ onClose, onImport }) {
  return (
    <div style={{
      margin: '20px 36px',
      padding: 20,
      background: 'var(--bg-card, #1a1f2e)',
      border: '1px solid var(--border-color, #2a3142)',
      borderRadius: 8,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-cyan, #58a6ff)',
            marginBottom: 4,
          }}>Import</div>
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary, #e6edf3)',
          }}>Upload portfolio from CSV or Excel</h3>
          <p style={{
            margin: '6px 0 0 0',
            fontSize: 13,
            color: 'var(--text-secondary, #8b949e)',
          }}>
            Export from Saxo, DeGiro, Trading 212, or any broker.
            We'll parse the file and let you map columns.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close upload panel"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color, #2a3142)',
            color: 'var(--text-secondary, #8b949e)',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >Cancel</button>
      </div>
      <div style={{
        padding: 32,
        border: '2px dashed var(--border-color, #2a3142)',
        borderRadius: 6,
        textAlign: 'center',
        color: 'var(--text-muted, #6e7681)',
        fontSize: 13,
      }}>
        File picker coming in Stage B
      </div>
    </div>
  );
}
