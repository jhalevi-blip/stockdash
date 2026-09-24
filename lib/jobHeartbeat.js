import { getSupabaseAdmin } from '@/lib/supabase';

// Record that a scheduled job COMPLETED normally. The crons call this only after the
// job body returns (a success or a benign skip — weekend / market-closed / no work),
// never when the body throws. So a fresh heartbeat means "fired AND ran to completion",
// which lets the watchdog catch a job that fires but crashes, not just a dead scheduler.
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
