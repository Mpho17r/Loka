import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail, buildPushMessages, isExpoToken, secretMatches, tokensToRemove } from '../supabase/functions/send-notifications/logic';

const n = { id: 'n1', user_id: 'u1', title: 'Your advert is live', body: 'It <b>starts</b> now', campaign_id: 'c1' };

test('push messages: only valid Expo tokens, no duplicates, carries campaign id', () => {
  const m = buildPushMessages(n, ['ExponentPushToken[abc]', 'ExponentPushToken[abc]', 'garbage', 'ExpoPushToken[xyz]']);
  assert.deepEqual(m.map((x) => x.to), ['ExponentPushToken[abc]', 'ExpoPushToken[xyz]']);
  assert.equal(m[0].data.campaignId, 'c1');
  assert.equal(buildPushMessages({ ...n, campaign_id: null }, ['ExpoPushToken[a]'])[0].data.campaignId, undefined);
  assert.equal(isExpoToken('x'), false);
});

test('email escapes markup in user-visible text', () => {
  const e = buildEmail(n, 'Loka <a@b.co>', 'me@x.co');
  assert.equal(e.to[0], 'me@x.co');
  assert.ok(e.html.includes('&lt;b&gt;starts&lt;/b&gt;'));
  assert.ok(!e.html.includes('<b>starts'));
});

test('unregistered devices are reported for removal by position', () => {
  const msgs = buildPushMessages(n, ['ExpoPushToken[a]', 'ExpoPushToken[b]', 'ExpoPushToken[c]']);
  const gone = tokensToRemove(msgs, [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'MessageRateExceeded' } }]);
  assert.deepEqual(gone, ['ExpoPushToken[b]']);
});

test('webhook secret check', () => {
  assert.equal(secretMatches('abc', 'abc'), true);
  assert.equal(secretMatches('abd', 'abc'), false);
  assert.equal(secretMatches('ab', 'abc'), false);
  assert.equal(secretMatches(null, 'abc'), false);
  assert.equal(secretMatches('abc', undefined), false);
});
