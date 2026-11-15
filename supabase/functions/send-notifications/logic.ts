// Pure helpers for the send-notifications function. No Deno or network code here, so they can be unit tested with Node.

export interface NotificationRow {
  id: string; user_id: string; title: string; body: string; campaign_id: string | null;
}

export interface ExpoMessage {
  to: string; title: string; body: string; sound: 'default'; data: { notificationId: string; campaignId?: string };
}

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isExpoToken(t: string): boolean { return EXPO_TOKEN.test(t); }

export function buildPushMessages(n: NotificationRow, tokens: string[]): ExpoMessage[] {
  return [...new Set(tokens)].filter(isExpoToken).map((to) => ({
    to, title: n.title, body: n.body, sound: 'default',
    data: { notificationId: n.id, ...(n.campaign_id ? { campaignId: n.campaign_id } : {}) },
  }));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildEmail(n: NotificationRow, from: string, to: string) {
  return {
    from, to: [to], subject: n.title,
    text: `${n.body}\n\nOpen the Loka app to see the details.\nYou can switch off email notifications in Account.`,
    html: `<p><strong>${esc(n.title)}</strong></p><p>${esc(n.body)}</p><p>Open the Loka app to see the details.</p>` +
      `<p style="color:#666;font-size:12px">You can switch off email notifications in Account.</p>`,
  };
}

/** Expo answers with one ticket per message. Tokens reported as unregistered should be deleted. */
export function tokensToRemove(messages: ExpoMessage[], tickets: Array<{ status: string; details?: { error?: string } }>): string[] {
  const out: string[] = [];
  tickets.forEach((t, i) => {
    if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && messages[i]) out.push(messages[i].to);
  });
  return out;
}

/** Constant-time comparison so the webhook secret cannot be guessed by timing. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
