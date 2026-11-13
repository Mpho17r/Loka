import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_CITIES, calculateQuote } from '../src/lib/pricing';

test('spec worked example: 20,000 search impressions, national, premium, R100 credit = R713.00', () => {
  const q = calculateQuote({ placement: 'search', city: ALL_CITIES, impressions: 20000, isPremium: true, creditBalance: 100 });
  assert.equal(q.gross, 800);
  assert.equal(q.premiumDiscount, 80);
  assert.equal(q.creditApplied, 100);
  assert.equal(q.net, 620);
  assert.equal(q.vat, 93);
  assert.equal(q.total, 713);
});

test('local city targeting is 30% cheaper than national', () => {
  const nat = calculateQuote({ placement: 'search', city: ALL_CITIES, impressions: 10000, isPremium: false, creditBalance: 0 });
  const loc = calculateQuote({ placement: 'search', city: 'Thohoyandou', impressions: 10000, isPremium: false, creditBalance: 0 });
  assert.equal(nat.gross, 400);
  assert.equal(loc.gross, 280);
});

test('credit never exceeds the amount payable and never goes negative', () => {
  const q = calculateQuote({ placement: 'listing', city: ALL_CITIES, impressions: 1000, isPremium: false, creditBalance: 500 });
  assert.equal(q.creditApplied, 20);
  assert.equal(q.net, 0);
  assert.equal(q.total, 0);
  const neg = calculateQuote({ placement: 'listing', city: ALL_CITIES, impressions: 1000, isPremium: false, creditBalance: -50 });
  assert.equal(neg.creditApplied, 0);
});

test('total is always net plus VAT', () => {
  for (const imp of [1000, 3333, 12500, 99999]) {
    const q = calculateQuote({ placement: 'homepage', city: 'Polokwane', impressions: imp, isPremium: true, creditBalance: 37.5 });
    assert.equal(Math.round((q.net + q.vat) * 100) / 100, q.total);
  }
});
