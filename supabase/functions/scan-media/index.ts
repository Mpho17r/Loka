// Supabase Edge Function (Deno). Scans an advert's image or video after upload and records the result with record_media_scan.
// Trigger: Database Webhook on INSERT into public.media_scans, sending the header  x-webhook-secret: <WEBHOOK_SECRET>.
// Secrets:  WEBHOOK_SECRET   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided)
// Optional: MODERATION_URL and MODERATION_TOKEN  - your content classifier (see docs/BACKEND.md for the request and answer shapes).
// Without a classifier this checks the FILE (real type, size, dimensions, known-banned files) but cannot judge CONTENT, and says so.
// NOT yet exercised against a real project or classifier; the checks in logic.ts are unit tested.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { checkFile, extensionOf, interpretModeration, secretMatches, toHex, IMAGE_TYPES, sniffType } from './logic.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!secretMatches(req.headers.get('x-webhook-secret'), Deno.env.get('WEBHOOK_SECRET'))) return json(401, { error: 'unauthorized' });

  const payload = await req.json().catch(() => null);
  const rec = payload?.record as { id?: string; revision_id?: string; media_path?: string } | undefined;
  if (!rec?.id || !rec.revision_id || !rec.media_path) return json(400, { error: 'bad_payload' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: row } = await db.from('media_scans').select('status').eq('id', rec.id).maybeSingle();
  if (!row) return json(404, { error: 'not_found' });
  if (row.status !== 'pending') return json(200, { skipped: 'already_scanned' });

  const record = (status: 'passed' | 'flagged' | 'error', sha: string | null, reasons: string[], detail: Record<string, unknown>) =>
    db.rpc('record_media_scan', { p_revision: rec.revision_id, p_status: status, p_sha256: sha, p_reasons: reasons, p_detail: detail });

  const dl = await db.storage.from('ad-media').download(rec.media_path);
  if (dl.error || !dl.data) {
    await record('error', null, ['download_failed'], { message: dl.error?.message ?? 'no data' });
    return json(200, { status: 'error' });
  }
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const sha = toHex(await crypto.subtle.digest('SHA-256', bytes));

  const verdict = checkFile(rec.media_path, bytes);
  let status: 'passed' | 'flagged' | 'error' = verdict.status;
  const reasons = [...verdict.reasons];
  const detail: Record<string, unknown> = { ...verdict.detail, classifier: 'not_configured' };

  const modUrl = Deno.env.get('MODERATION_URL');
  if (modUrl && verdict.status === 'passed') {
    try {
      const type = sniffType(bytes);
      const res = await fetch(modUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('MODERATION_TOKEN') ?? ''}` },
        body: JSON.stringify({
          url: `${url}/storage/v1/object/public/ad-media/${rec.media_path}`,
          kind: type && IMAGE_TYPES.includes(type) ? 'image' : 'video', extension: extensionOf(rec.media_path),
        }),
      });
      const answer = res.ok ? interpretModeration(await res.json().catch(() => null)) : null;
      if (!answer) { status = 'error'; reasons.push('classifier_failed'); detail.classifier = 'failed'; }
      else { detail.classifier = 'ok'; if (answer.flagged) { status = 'flagged'; reasons.push(...(answer.reasons.length ? answer.reasons : ['flagged_by_classifier'])); } }
    } catch (e) { status = 'error'; reasons.push('classifier_failed'); detail.classifier = String(e).slice(0, 100); }
  } else if (status === 'passed') {
    reasons.push('no_content_classifier');
  }

  const out = await record(status, sha, reasons, detail);
  return json(200, { status: out.data ?? status, reasons });
});
