import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  console.log('[Supabase] init — url present:', !!url, '| key present:', !!key, '| key length:', key?.length);
  if (!url || !key) {
    console.warn('[Supabase] missing env vars, client not created');
    return null;
  }
  _client = createClient(url, key);
  return _client;
}

// Server-side client using the secret key — only call from API routes
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  console.log('[Supabase] admin init — url present:', !!url, '| secret present:', !!key);
  if (!url || !key) return null;
  return createClient(url, key);
}
