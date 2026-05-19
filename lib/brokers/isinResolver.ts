/**
 * Client-side helper. Calls the internal /api/brokers/resolve-isin route
 * (which proxies to OpenFIGI) so the fetch runs server-side and the
 * endpoint is future-proofed for an OpenFIGI API key without a client deploy.
 *
 * Only call this from browser context (client components / FileReader callbacks).
 * Relative URLs do not resolve in server-only execution paths.
 */
export async function resolveBatchIsins(isins: string[]): Promise<Map<string, string>> {
  if (isins.length === 0) return new Map();

  const unique = [...new Set(isins)];

  try {
    const res = await fetch('/api/brokers/resolve-isin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isins: unique }),
    });

    if (!res.ok) return new Map();

    const { resolved } = (await res.json()) as { resolved: Record<string, string> };
    return new Map(Object.entries(resolved ?? {}));
  } catch {
    // Network failure or parse error — treat all ISINs as unresolved
    return new Map();
  }
}
