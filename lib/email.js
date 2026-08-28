// Shared transactional email via Resend — the same setup the API-usage alerts use
// (lib/apiUsage.ts): sender alerts@stockdashes.com, domain verified in the Resend
// dashboard. Returns { ok } rather than throwing so a caller (e.g. a cron) can
// record the failure and carry on; every failure path is logged, never swallowed.

/**
 * @param {{ to: string|string[], subject: string, html: string, label?: string }} args
 * @returns {Promise<{ ok:true, id?:string } | { ok:false, error:string }>}
 */
export async function sendEmail({ to, subject, html, label = 'email' }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error(`[${label}] RESEND_API_KEY not configured — email not sent`);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      // Must be a verified domain in Resend (swap to onboarding@resend.dev to test).
      from: 'alerts@stockdashes.com',
      to,
      subject,
      html,
    });
    if (error) {
      console.error(`[${label}] Resend error: ${error.message ?? error}`);
      return { ok: false, error: error.message ?? String(error) };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error(`[${label}] send failed: ${e?.message ?? e}`);
    return { ok: false, error: e?.message ?? String(e) };
  }
}
