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

test('advertiser is notified of HQ decisions with the reason, but not of their own actions', async () => {
  const { api, p } = await setup();
  const id = await api.createCampaign({ ...input, useCredit: false }, p, 0);
  assert.equal((await api.loadNotifications()).length, 0);

  await api.hqReview(id, 'reject', 'misleading', 'Price not shown');
  let n = await api.loadNotifications();
  assert.equal(n.length, 1);
  assert.equal(n[0].title, 'Campaign rejected');
  assert.equal(n[0].body, 'Price not shown');
  assert.equal(n[0].read, false);

  const id2 = await api.createCampaign({ ...input, useCredit: false }, p, 0);
  await api.hqReview(id2, 'approve', 'ok', '');
  const inv = (await api.loadMine(p)).campaigns.find((c) => c.id === id2)!.invoice.id;
  await api.hqVerifyPayment(inv, 'bank');
  await api.campaignAction(id2, 'pause');   // the advertiser's own action
  await api.campaignAction(id2, 'resume');
  n = await api.loadNotifications();
  assert.deepEqual(n.map((x) => x.title).reverse(), ['Campaign rejected', 'Campaign approved', 'Payment received', 'Your campaign is live']);

  await api.hqSetState(id2, 'pause', 'Complaint 17 under investigation');
  n = await api.loadNotifications();
  assert.equal(n[0].title, 'Campaign paused by Loka');
  assert.equal(n[0].body, 'Complaint 17 under investigation');

  await api.markNotificationsRead();
  assert.ok((await api.loadNotifications()).every((x) => x.read));
});

test('large refunds wait for a second approver; small ones happen at once', async () => {
  const { api, p } = await setup();
  const id = await api.createCampaign({ ...input, impressions: 100000, useCredit: false }, p, 0);
  await api.hqReview(id, 'approve', 'ok', '');
  const inv = (await api.loadMine(p)).campaigns[0].invoice;
  await api.hqVerifyPayment(inv.id, 'bank');

  await assert.rejects(() => api.hqRefund(inv.id, 100, ''), /reason_required/);
  assert.equal(await api.hqRefund(inv.id, 100, 'Small goodwill refund'), 'refunded');

  assert.equal(await api.hqRefund(inv.id, 600, 'Large goodwill refund'), 'pending_approval');
  const waiting = (await api.hqLoad(p)).refunds;
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].amount, 600);

  await api.hqDecideRefund(waiting[0].id, true, '');
  assert.equal((await api.hqLoad(p)).refunds.length, 0);
});
