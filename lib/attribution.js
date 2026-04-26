export function getAttribution() {
  if (typeof document === 'undefined') return null;
  try {
    const entry = document.cookie.split('; ').find(c => c.startsWith('sd_attribution='));
    if (!entry) return null;
    const idx = entry.indexOf('=');
    return JSON.parse(decodeURIComponent(entry.slice(idx + 1)));
  } catch {
    return null;
  }
}
