'use client';
import { useState } from 'react';

export default function SearchBar({ onSearch }) {
  const [val, setVal] = useState('');
  return (
    <input
      className="search-input"
      placeholder="Search ticker…"
      value={val}
      onChange={e => { setVal(e.target.value); onSearch(e.target.value.toUpperCase()); }}
    />
  );
}