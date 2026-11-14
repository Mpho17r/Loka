import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoApi } from '../src/data/demoApi';
import { ALL_CITIES } from '../src/lib/pricing';
import { friendlyError } from '../src/lib/errors';

const input = {
  targetType: 'product' as const, targetId: 'p3', targetTitle: 'Basket set', headline: 'Handwoven baskets', placement: 'search' as const,
  city: ALL_CITIES, impressions: 20000, days: 14, useCredit: true,
};

async function setup() {
  const api = createDemoApi();
  const profile = (await api.getProfile())!;
  await api.hqSetFlags(profile.id, { premium: true }, 'test');
  const p = (await api.getProfile())!;
  return { api, p };
}

test('campaign lifecycle: nothing serves until approved AND payment verified', async () => {
  const { api, p } = await setup();
  const id = await api.createCampaign(input, p, 100);
  let mine = await api.loadMine(p);
  assert.equal(mine.campaigns[0].status, 'Pending review');
  assert.equal(mine.campaigns[0].quote.total, 713); // same as the SQL test and the spec example
  assert.equal(mine.balance, 0);
  assert.equal((await api.getAds('search', 'Thohoyandou')).length, 0);

  await api.hqReview(id, 'approve', 'ok', '');
  assert.equal((await api.getAds('search', 'Thohoyandou')).length, 0, 'approved but unpaid must not serve');

  await api.declarePayment(mine.campaigns[0].invoice.id, 'EFT-1');
  assert.equal((await api.getAds('search', 'Thohoyandou')).length, 0, 'declared is not verified');

  await api.hqVerifyPayment(mine.campaigns[0].invoice.id, 'bank');
  assert.equal((await api.getAds('search', 'Thohoyandou')).length, 1);
  mine = await api.loadMine(p);
  assert.equal(mine.campaigns[0].status, 'Live');
});

test('frequency cap of 3 and impressions never exceed purchased', async () => {
  const { api, p } = await setup();
  const id = await api.createCampaign({ ...input, impressions: 1000, useCredit: false }, p, 0);
  await api.hqReview(id, 'approve', 'ok', '');
  const inv = (await api.loadMine(p)).campaigns[0].invoice.id;
  await api.hqVerifyPayment(inv, '');
  assert.deepEqual([await api.recordImpression(id), await api.recordImpression(id), await api.recordImpression(id), await api.recordImpression(id)], [true, true, true, false]);
  assert.equal((await api.loadMine(p)).campaigns[0].delivered, 3);
});

test('cancelling returns the unused share as credit; rejection returns credit', async () => {
  const { api, p } = await setup();
  const id = await api.createCampaign(input, p, 100);
  await api.hqReview(id, 'reject', 'misleading', 'Price not shown');
  assert.equal((await api.loadMine(p)).balance, 100);
  assert.equal((await api.loadMine(p)).campaigns[0].status, 'Rejected');
  await assert.rejects(() => api.campaignAction(id, 'cancel'), /action_not_allowed/);
});

test('HQ actions need a reason and advertisers cannot override an HQ pause', async () => {
  const { api, p } = await setup();
  const id = await api.createCampaign({ ...input, useCredit: false }, p, 0);
  await api.hqReview(id, 'approve', 'ok', '');
  await api.hqVerifyPayment((await api.loadMine(p)).campaigns[0].invoice.id, '');
  await assert.rejects(() => api.hqSetState(id, 'pause', ''), /reason_required/);
  await api.hqSetState(id, 'pause', 'complaint');
  await assert.rejects(() => api.campaignAction(id, 'resume'), /action_not_allowed/);
  await api.hqSetState(id, 'resume', 'dismissed');
  assert.equal((await api.loadMine(p)).campaigns[0].status, 'Live');
});

test('unverified accounts cannot advertise', async () => {
  const { api, p } = await setup();
  await api.hqSetFlags(p.id, { verification: 'unverified' }, 'test');
  const p2 = (await api.getProfile())!;
  await assert.rejects(() => api.createCampaign(input, p2, 0), /account_not_verified/);
});

test('database error codes become readable sentences', () => {
  assert.match(friendlyError(new Error('account_not_verified')), /verified/);
  assert.match(friendlyError(new Error('Invalid login credentials')), /Wrong email or password/);
  assert.match(friendlyError(new Error('boom')), /boom/);
});
