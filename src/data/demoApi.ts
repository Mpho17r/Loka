import type { Api, HqDecision, QuoteRequest } from './api';
import { ALL_CITIES, calculateQuote } from '../lib/pricing';
import { PRODUCTS, SERVICES } from './sample';
import { emojiFor } from '../lib/mappers';
import type { Ad, Campaign, CampaignStatus, HqManaged, HqReport, Product, Profile, Service, ServiceRequest } from '../types';

/**
 * In-memory implementation used when no Supabase project is configured. It mirrors the rules enforced by the real
 * database (supabase/migrations) closely enough to demo every flow, but nothing is persisted.
 */
export function createDemoApi(): Api {
  let signedIn = true;
  let profile: Profile = { id: 'demo-user', fullName: 'Demo User', verification: 'business', isPremium: false, countryCode: 'ZA', roles: ['owner'] };
  let products: Product[] = [...PRODUCTS];
  let services: Service[] = [...SERVICES];
  let campaigns: Campaign[] = [];
  let requests: ServiceRequest[] = [];
  let reports: HqReport[] = [];
  let managed: HqManaged[] = [];
  let balance = 100;
  let counter = 100;
  const listeners = new Set<() => void>();
  const shown = new Map<string, number>(); // campaignId|viewer -> impressions today
  const changed = () => listeners.forEach((l) => l());
  const today = () => new Date().toISOString().slice(0, 10);
  const find = (id: string) => {
    const c = campaigns.find((x) => x.id === id);
    if (!c) throw new Error('campaign_not_found');
    return c;
  };
  const set = (id: string, patch: Partial<Campaign>) => { campaigns = campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)); };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const release = (c: Campaign) => {
    const f = (c.impressions - c.delivered) / c.impressions;
    let back = round2(f * c.quote.creditApplied);
    if (c.invoice.status === 'verified') back += round2(f * c.quote.net);
    balance = round2(balance + back);
  };
  const goLiveIfDue = (id: string) => {
    const c = find(id);
    if (c.status === 'Scheduled' && c.startDate <= today() && c.endDate >= today()) set(id, { status: 'Live' });
  };
  const needReason = (r: string) => { if (!r.trim()) throw new Error('reason_required'); };

  return {
    mode: 'demo',

    async getProfile() { return signedIn ? profile : null; },
    onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    async signIn() { signedIn = true; changed(); },
    async signUp(_e, _p, name) { signedIn = true; profile = { ...profile, fullName: name || 'Demo User' }; changed(); return { needsConfirmation: false }; },
    async signOut() { signedIn = false; changed(); },

    async loadCatalog() { return { products, services }; },
    async createProduct(input, p) {
      products = [{ id: 'p' + ++counter, ownerId: p.id, title: input.title, price: input.price, condition: input.condition, category: input.category,
        city: input.city, seller: p.fullName, verification: p.verification, description: input.description, emoji: emojiFor(input.category) }, ...products];
    },
    async createService(input, p) {
      services = [{ id: 's' + ++counter, ownerId: p.id, title: input.title, category: input.category, provider: p.fullName, verification: p.verification,
        city: input.city, pricingModel: input.pricingModel, fromPrice: input.fromPrice, delivery: input.delivery, providedByLoka: false, rating: 0,
        jobs: 0, description: input.description, emoji: emojiFor(input.category) }, ...services];
    },

    async loadMine() { return { campaigns: campaigns.filter((c) => c.accountId === 'demo-acct'), requests, balance }; },
    async submitRequest(input) {
      requests = [{ id: 'r' + ++counter, serviceId: input.serviceId, serviceTitle: input.serviceTitle, details: input.details, city: input.city,
        budget: input.budget, preferredDate: input.preferredDate, status: 'Submitted', createdAt: today() }, ...requests];
    },
    async cancelRequest(id) { requests = requests.map((r) => (r.id === id ? { ...r, status: 'Cancelled' } : r)); },

    async quote(req: QuoteRequest, p, bal) {
      return calculateQuote({ placement: req.placement, city: req.city, impressions: req.impressions, isPremium: p.isPremium, creditBalance: req.useCredit ? bal : 0 });
    },
    async createCampaign(input, p, bal) {
      if (p.verification === 'unverified') throw new Error('account_not_verified');
      const quote = calculateQuote({ placement: input.placement, city: input.city, impressions: input.impressions, isPremium: p.isPremium, creditBalance: input.useCredit ? bal : 0 });
      const id = 'c' + ++counter;
      const free = quote.total === 0;
      const end = new Date(); end.setUTCDate(end.getUTCDate() + input.days - 1);
      campaigns = [{
        id, accountId: 'demo-acct', advertiser: p.fullName, targetType: input.targetType, targetId: input.targetId, targetTitle: input.targetTitle,
        headline: input.headline, placement: input.placement, city: input.city, impressions: input.impressions, delivered: 0, clicks: 0, days: input.days,
        startDate: today(), endDate: end.toISOString().slice(0, 10), status: 'Pending review', pausedByHq: false, quote,
        invoice: { id: 'i' + counter, number: 'LK-DEMO-' + String(counter).padStart(6, '0'), status: free ? 'verified' : 'issued', total: quote.total },
        createdAt: today(),
      }, ...campaigns];
      balance = Math.max(0, round2(balance - quote.creditApplied));
      return id;
    },
    async campaignAction(id, action) {
      const c = find(id);
      if (action === 'pause' && c.status === 'Live') set(id, { status: 'Paused', pausedByHq: false });
      else if (action === 'resume' && c.status === 'Paused' && !c.pausedByHq) set(id, { status: 'Live' });
      else if (action === 'cancel' && ['Pending review', 'Changes requested', 'Approved, awaiting payment', 'Scheduled', 'Live', 'Paused'].includes(c.status)) {
        set(id, { status: 'Cancelled' }); release(c);
      } else throw new Error('action_not_allowed_in_status');
    },
    async declarePayment(invoiceId) {
      const c = campaigns.find((x) => x.invoice.id === invoiceId);
      if (!c || c.invoice.status !== 'issued') throw new Error('invoice_not_awaiting_payment');
      set(c.id, { invoice: { ...c.invoice, status: 'paid_declared' } });
    },
    async reportAd(campaignId, reason) {
      const c = find(campaignId);
      reports = [{ id: 'rep' + ++counter, campaignId, headline: c.headline, reason, status: 'open' }, ...reports];
    },

    async requestManaged(brief, budget, p) {
      managed = [{ id: 'm' + ++counter, requester: p.fullName, brief, budget, status: 'new' }, ...managed];
    },

    async getAds(placement, city): Promise<Ad[]> {
      return campaigns
        .filter((c) => c.status === 'Live' && c.placement === placement && c.delivered < c.impressions && (c.city === ALL_CITIES || c.city === city)
          && (shown.get(c.id) ?? 0) < 3)
        .slice(0, 1)
        .map((c) => ({ campaignId: c.id, headline: c.headline, description: '', targetType: c.targetType, targetId: c.targetId, placement: c.placement }));
    },
    async recordImpression(campaignId) {
      const c = campaigns.find((x) => x.id === campaignId);
      if (!c || c.status !== 'Live' || c.delivered >= c.impressions) return false;
      if ((shown.get(c.id) ?? 0) >= 3) return false; // frequency cap: 3 per viewer per day
      shown.set(c.id, (shown.get(c.id) ?? 0) + 1);
      const delivered = c.delivered + 1;
      set(c.id, { delivered, status: delivered >= c.impressions ? 'Completed' : c.status });
      return true;
    },
    async recordClick(campaignId) {
      const c = campaigns.find((x) => x.id === campaignId);
      if (!c || !shown.get(c.id)) return false;
      set(c.id, { clicks: c.clicks + 1 });
      return true;
    },

    async hqLoad() {
      const byPlacement = new Map<string, { campaigns: number; impressions: number; clicks: number; billedNet: number; billedTotal: number }>();
      campaigns.filter((c) => c.invoice.status === 'verified').forEach((c) => {
        const r = byPlacement.get(c.placement) ?? { campaigns: 0, impressions: 0, clicks: 0, billedNet: 0, billedTotal: 0 };
        r.campaigns += 1; r.impressions += c.delivered; r.clicks += c.clicks; r.billedNet += c.quote.net; r.billedTotal += c.invoice.total;
        byPlacement.set(c.placement, r);
      });
      return {
        campaigns, reports, managed,
        revenue: [...byPlacement.entries()].map(([placement, r]) => ({ placement, ...r })),
        accounts: [{ id: profile.id, name: profile.fullName, verification: profile.verification, isPremium: profile.isPremium }],
      };
    },
    async hqReview(id, decision: HqDecision, _rule, reason) {
      const c = find(id);
      if (c.status !== 'Pending review') throw new Error('not_pending_review');
      if (decision === 'approve') {
        set(id, { status: c.invoice.status === 'verified' ? 'Scheduled' : 'Approved, awaiting payment' });
        goLiveIfDue(id);
        return;
      }
      needReason(reason);
      const status: CampaignStatus = decision === 'reject' ? 'Rejected' : 'Changes requested';
      set(id, { status });
      if (decision === 'reject') release(c);
    },
    async hqVerifyPayment(invoiceId) {
      const c = campaigns.find((x) => x.invoice.id === invoiceId);
      if (!c || !['issued', 'paid_declared'].includes(c.invoice.status)) throw new Error('invoice_not_payable');
      set(c.id, { invoice: { ...c.invoice, status: 'verified' } });
      if (c.status === 'Approved, awaiting payment') { set(c.id, { status: 'Scheduled' }); goLiveIfDue(c.id); }
    },
    async hqSetState(id, action, reason) {
      needReason(reason);
      const c = find(id);
      if (action === 'pause' && (c.status === 'Live' || c.status === 'Scheduled')) set(id, { status: 'Paused', pausedByHq: true });
      else if (action === 'resume' && c.status === 'Paused') set(id, { status: 'Live', pausedByHq: false });
      else if (action === 'terminate' && !['Rejected', 'Completed', 'Terminated', 'Cancelled', 'Draft'].includes(c.status)) { set(id, { status: 'Terminated' }); release(c); }
      else throw new Error('action_not_allowed_in_status');
    },
    async hqResolveReport(id, status) { reports = reports.map((r) => (r.id === id ? { ...r, status } : r)); },
    async hqAdjustCredit(_account, amount, reason) {
      needReason(reason);
      if (amount < 0 && -amount > balance) throw new Error('revoke_exceeds_balance');
      balance = round2(Math.max(0, balance + amount));
    },
    async hqRefund(invoiceId, amount, reason) {
      needReason(reason);
      const c = campaigns.find((x) => x.invoice.id === invoiceId);
      if (!c || c.invoice.status !== 'verified') throw new Error('invoice_not_refundable');
      if (amount > c.invoice.total) throw new Error('refund_exceeds_invoice');
      balance = Math.max(0, round2(balance - Math.min(amount, balance)));
      if (amount >= c.invoice.total) set(c.id, { invoice: { ...c.invoice, status: 'refunded' } });
    },
    async hqUpdateManaged(id, status) { managed = managed.map((m) => (m.id === id ? { ...m, status } : m)); },
    async hqSetFlags(_userId, flags) {
      profile = { ...profile, verification: flags.verification ?? profile.verification, isPremium: flags.premium ?? profile.isPremium };
      changed();
    },
  };
}
