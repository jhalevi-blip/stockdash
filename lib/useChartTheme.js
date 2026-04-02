'use client';
import { useState, useEffect } from 'react';

const DARK = {
  grid:          '#21262d',
  axis:          '#8b949e',
  tooltipBg:     '#161b22',
  tooltipBorder: '#30363d',
  tooltipLabel:  '#8b949e',
  legend:        '#8b949e',
};

const LIGHT = {
  grid:          '#e2e6ed',
  axis:          '#6b7280',
  tooltipBg:     '#ffffff',
  tooltipBorder: '#e2e6ed',
  tooltipLabel:  '#6b7280',
  legend:        '#6b7280',
};

export function useChartTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark ? DARK : LIGHT;
}
