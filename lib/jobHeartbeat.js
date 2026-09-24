import { getSupabaseAdmin } from '@/lib/supabase';

// Record that a scheduled job just fired. Called by the crons right after they
// authenticate, so it captures the SCHEDULER FIRING (a weekend / market-closed run
// with nothing to do still counts as "ran on time"), which is exactly what the
// watchdog's "did this job run?" check needs.
//
// Deliberately best-effort and fully self-contained: it makes its own admin client
// and swallows every error, so a heartbeat problem can NEVER break the real job it
// is attached to. A missing table (pre-migration) or a write failure is logged and
// ignored — the cron carries on as before.
export async function recordHeartbeat(job) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const now = new Date().toISOString();
    const { error } = await sb
      .from('job_heartbeats')
      .upsert({ job, last_run_at: now, updated_at: now }, { onConflict: 'job' });
    if (error) console.error(`[heartbeat] ${job}: ${error.message}`);
  } catch (err) {
    console.error(`[heartbeat] ${job}: ${err?.message ?? err}`);
  }
}
