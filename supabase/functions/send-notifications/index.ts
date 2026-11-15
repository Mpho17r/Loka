// Supabase Edge Function (Deno). Delivers a notification by push and email.
// Trigger: a Database Webhook on INSERT into public.notifications that sends the header  x-webhook-secret: <WEBHOOK_SECRET>.
// Secrets to set:  WEBHOOK_SECRET, RESEND_API_KEY, EMAIL_FROM   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided).
// NOT yet exercised against real Expo or Resend accounts; the logic in logic.ts is unit tested.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildEmail, buildPushMessages, secretMatches, tokensToRemove, type NotificationRow } from './logic.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!secretMatches(req.headers.get('x-webhook-secret'), Deno.env.get('WEBHOOK_SECRET'))) return json(401, { error: 'unauthorized' });

  const payload = await req.json().catch(() => null);
  const n = payload?.record as NotificationRow | undefined;
  if (!n?.id || !n.user_id) return json(400, { error: 'bad_payload' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Re-read the row so a replayed webhook cannot send twice.
  const { data: row } = await db.from('notifications').select('id, user_id, title, body, campaign_id, delivered_at').eq('id', n.id).maybeSingle();
  if (!row) return json(404, { error: 'not_found' });
  if (row.delivered_at) return json(200, { skipped: 'already_delivered' });

  const { data: prof } = await db.from('profiles').select('push_enabled, email_enabled').eq('id', row.user_id).maybeSingle();
  const result: Record<string, unknown> = {};

  if (prof?.push_enabled) {
    const { data: tokens } = await db.from('push_tokens').select('token').eq('user_id', row.user_id);
    const messages = buildPushMessages(row as NotificationRow, (tokens ?? []).map((t: { token: string }) => t.token));
    if (messages.length > 0) {
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(messages),
        });
        const body = await res.json();
        const stale = tokensToRemove(messages, body?.data ?? []);
        if (stale.length) await db.from('push_tokens').delete().eq('user_id', row.user_id).in('token', stale);
        result.push = { sent: messages.length, removed: stale.length, ok: res.ok };
      } catch (e) { result.push = { error: String(e) }; }
    }
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (prof?.email_enabled && resendKey) {
    const { data: u } = await db.auth.admin.getUserById(row.user_id);
    const to = u?.user?.email;
    if (to) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${resendKey}` },
          body: JSON.stringify(buildEmail(row as NotificationRow, Deno.env.get('EMAIL_FROM') ?? 'Loka <no-reply@example.com>', to)),
        });
        result.email = { ok: res.ok, status: res.status };
      } catch (e) { result.email = { error: String(e) }; }
    }
  }

  await db.from('notifications').update({ delivered_at: new Date().toISOString() }).eq('id', row.id);
  return json(200, result);
});
