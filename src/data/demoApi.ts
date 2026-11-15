import type { Api, HqDecision, ListingFilter, Page, QuoteRequest } from './api';
import { ALL_CITIES, calculateQuote } from '../lib/pricing';
import { PRODUCTS, SERVICES } from './sample';
import { emojiFor } from '../lib/mappers';
import type {
  Ad, AppNotification, Campaign, CampaignStatus, Conversation, HqManaged, HqMessageReport, HqReport, Message, Product, Profile, Service, ServiceRequest,
} from '../types';

/**
 * In-memory implementation used when no Supabase project is configured. It mirrors the rules enforced by the real
 * database (supabase/migrations) closely enough to demo every flow, but nothing is persisted.
 */
export function createDemoApi(): Api {
  let signedIn = true;
  let profile: Profile = { id: 'demo-user', fullName: 'Demo User', verification: 'business', isPremium: false, countryCode: 'ZA', roles: ['owner'], pushEnabled: true, emailEnabled: true };
  let products: Product[] = [...PRODUCTS];
  let services: Service[] = [...SERVICES];
  let campaigns: Campaign[] = [];
  let requests: ServiceRequest[] = [];
  let reports: HqReport[] = [];
  let managed: HqManaged[] = [];
  let notifications: AppNotification[] = [];
  let refundRequests: { id: string; invoiceId: string; invoiceNumber: string; amount: number; reason: string }[] = [];
  let conversations: Conversation[] = [];
  const thread = new Map<string, Message[]>();
  let messageReports: HqMessageReport[] = [];
  let lastReason = '';
  const REFUND_LIMIT = 500; // above this a second finance user must approve (demo lets the same person approve)
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
  // Mirrors the database trigger: advertisers are told about HQ and schedule decisions, not their own actions.
  const notice = (old: Campaign, c: Campaign): [string, string] | null => {
    switch (c.status) {
      case 'Approved, awaiting payment': return ['Campaign approved', `Please pay invoice ${c.invoice.number} so it can go live.`];
      case 'Scheduled': return ['Payment received', `Your campaign starts on ${c.startDate}.`];
      case 'Live': return old.status === 'Scheduled' ? ['Your campaign is live', 'Impressions are now being delivered.'] : null;
      case 'Rejected': return ['Campaign rejected', lastReason || 'It did not meet the advertising policy.'];
      case 'Changes requested': return ['Changes needed', lastReason || 'Please update your advert and resubmit.'];
      case 'Paused': return c.pausedByHq ? ['Campaign paused by Loka', lastReason || 'We are reviewing it.'] : null;
      case 'Terminated': return ['Campaign stopped', lastReason || 'It was stopped for a policy reason.'];
      case 'Completed': return ['Campaign finished', 'All purchased impressions were delivered or the end date was reached.'];
      default: return null;
    }
  };
  const set = (id: string, patch: Partial<Campaign>) => {
    const old = campaigns.find((x) => x.id === id);
    campaigns = campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c));
    const now = campaigns.find((x) => x.id === id);
    if (old && now && patch.status && patch.status !== old.status) {
      const n = notice(old, now);
      if (n) notifications = [{ id: 'n' + ++counter, title: n[0], body: n[1], read: false, createdAt: today(), campaignId: id }, ...notifications];
    }
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const release = (c: Campaign) => {
    const f = (c.impressions - c.delivered) / c.impressions;
    let back = round2(f * c.quote.creditApplied);
    if (c.invoice.status === 'verified') back += round2(f * c.quote.net);
    balance = round2(balance + back);
  };
  const executeRefund = (invoiceId: string, amount: number) => {
    const c = campaigns.find((x) => x.invoice.id === invoiceId);
    if (!c) return;
    balance = Math.max(0, round2(balance - Math.min(amount, balance)));
    if (amount >= c.invoice.total) set(c.id, { invoice: { ...c.invoice, status: 'refunded' } });
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

    async loadCatalog() { return { products: products.slice(0, 30), services: services.slice(0, 30) }; },
    async searchProducts(f: ListingFilter): Promise<Page<Product>> {
      const q = f.q.trim().toLowerCase();
      const hits = products.filter((p) =>
        (f.category === 'All' || p.category === f.category) && (f.city === ALL_CITIES || p.city === f.city)
        && (q === '' || `${p.title} ${p.description} ${p.seller}`.toLowerCase().includes(q)));
      return { items: hits.slice(f.offset, f.offset + f.limit), hasMore: hits.length > f.offset + f.limit };
    },
    async searchServices(f: ListingFilter): Promise<Page<Service>> {
      const q = f.q.trim().toLowerCase();
      const hits = services.filter((s) =>
        (f.category === 'All' || s.category === f.category)
        && (f.city === ALL_CITIES || s.city === f.city || s.delivery !== 'On-site') // remote services serve every city
        && (q === '' || `${s.title} ${s.description} ${s.provider}`.toLowerCase().includes(q)));
      return { items: hits.slice(f.offset, f.offset + f.limit), hasMore: hits.length > f.offset + f.limit };
    },
    async getProduct(id) { return products.find((p) => p.id === id) ?? null; },
    async getService(id) { return services.find((s) => s.id === id) ?? null; },
    async createProduct(input, p) {
      products = [{ id: 'p' + ++counter, ownerId: p.id, title: input.title, price: input.price, condition: input.condition, category: input.category,
        city: input.city, seller: p.fullName, verification: p.verification, description: input.description, emoji: emojiFor(input.category) }, ...products];
    },
    async createService(input, p) {
      services = [{ id: 's' + ++counter, ownerId: p.id, title: input.title, category: input.category, provider: p.fullName, verification: p.verification,
        city: input.city, pricingModel: input.pricingModel, fromPrice: input.fromPrice, delivery: input.delivery, providedByLoka: false, rating: 0,
        jobs: 0, description: input.description, emoji: emojiFor(input.category) }, ...services];
    },

    async loadMine() { return { products, services, campaigns: campaigns.filter((c) => c.accountId === 'demo-acct'), requests, balance }; },
    async submitRequest(input) {
      requests = [{ id: 'r' + ++counter, serviceId: input.serviceId, serviceTitle: input.serviceTitle, details: input.details, city: input.city,
        budget: input.budget, preferredDate: input.preferredDate, status: 'Submitted', createdAt: today() }, ...requests];
    },
    async loadNotifications() { return notifications; },
    async markNotificationsRead() { notifications = notifications.map((n) => ({ ...n, read: true })); },
    async hqClearScan(id, reason) {
      needReason(reason);
      const c = find(id);
      if (!c.scan) throw new Error('scan_not_found');
      set(id, { scan: { status: 'passed', reasons: c.scan.reasons, clearedReason: reason } });
    },
    async hqBlockMedia(id, reason) {
      needReason(reason);
      const c = find(id);
      if (!c.scan) throw new Error('scan_not_found');
      set(id, { scan: { status: 'flagged', reasons: [...c.scan.reasons, 'blocked_file'] } });
    },
    async hqResolveMessageReport(id) { messageReports = messageReports.filter((r) => r.id !== id); },

    async startConversation(type, listingId, first) {
      const listing = type === 'product' ? products.find((x) => x.id === listingId) : services.find((x) => x.id === listingId);
      if (!listing) throw new Error('listing_not_found');
      if (listing.ownerId === profile.id) throw new Error('cannot_message_yourself');
      let conv = conversations.find((c) => c.listingType === type && c.listingId === listingId);
      if (!conv) {
        conv = {
          id: 'conv' + ++counter, listingType: type, listingId, listingTitle: listing.title,
          otherName: 'seller' in listing ? listing.seller : listing.provider, otherUserId: 'seller-' + listingId,
          lastPreview: '', lastAt: new Date().toISOString(), unread: false, blockedByMe: false,
        };
        conversations = [conv, ...conversations];
        thread.set(conv.id, []);
      }
      if (first && first.trim()) await this.sendMessage(conv.id, first);
      return conv.id;
    },
    async loadConversations() { return conversations; },
    async loadMessages(id) { return thread.get(id) ?? []; },
    async sendMessage(id, body) {
      const conv = conversations.find((c) => c.id === id);
      const text = body.trim();
      if (!conv) throw new Error('conversation_not_found');
      if (text.length < 1 || text.length > 2000) throw new Error('invalid_message');
      if (conv.blockedByMe) throw new Error('blocked');
      const msgs = thread.get(id) ?? [];
      const add = (mine: boolean, b: string) => msgs.push({ id: 'm' + ++counter, mine, body: b, createdAt: new Date().toISOString() });
      add(true, text);
      // demo only: the "seller" answers the first message so the screens can be tried
      if (msgs.length === 1) add(false, 'Thanks for your message. This is an automatic demo reply; real sellers answer in their own time.');
      thread.set(id, msgs);
      conversations = conversations.map((c) => (c.id === id ? { ...c, lastPreview: msgs[msgs.length - 1].body.slice(0, 80), lastAt: new Date().toISOString() } : c));
    },
    async markConversationRead(id) { conversations = conversations.map((c) => (c.id === id ? { ...c, unread: false } : c)); },
    async blockUser(userId) { conversations = conversations.map((c) => (c.otherUserId === userId ? { ...c, blockedByMe: true } : c)); },
    async unblockUser(userId) { conversations = conversations.map((c) => (c.otherUserId === userId ? { ...c, blockedByMe: false } : c)); },
    async reportMessage(messageId, reason) {
      for (const [cid, msgs] of thread) {
        const i = msgs.findIndex((m) => m.id === messageId);
        if (i < 0) continue;
        if (msgs[i].mine) throw new Error('cannot_report_own_message');
        const conv = conversations.find((c) => c.id === cid);
        messageReports = [{
          id: 'mr' + ++counter, reason, reporterName: profile.fullName, reportedName: conv?.otherName ?? 'User',
          context: msgs.slice(Math.max(0, i - 5), i + 1).map((m) => ({ fromReported: !m.mine, body: m.body, at: m.createdAt })),
        }, ...messageReports];
        return;
      }
      throw new Error('message_not_found');
    },

    async registerPushToken() { /* demo: nothing to register */ },
    async setDeliveryPrefs(prefs) {
      profile = { ...profile, pushEnabled: prefs.push ?? profile.pushEnabled, emailEnabled: prefs.email ?? profile.emailEnabled };
    },
    async cancelRequest(id) { requests = requests.map((r) => (r.id === id ? { ...r, status: 'Cancelled' } : r)); },

    async quote(req: QuoteRequest, p, bal) {
      return calculateQuote({ placement: req.placement, city: req.city, impressions: req.impressions, isPremium: p.isPremium, creditBalance: req.useCredit ? bal : 0, format: req.format });
    },
    async createCampaign(input, p, bal) {
      if (p.verification === 'unverified') throw new Error('account_not_verified');
      if (input.format === 'video' && !input.video) throw new Error('video_required');
      const quote = calculateQuote({ placement: input.placement, city: input.city, impressions: input.impressions, isPremium: p.isPremium, creditBalance: input.useCredit ? bal : 0, format: input.format });
      const mediaPath = input.format === 'video' ? input.video?.uri : input.media?.uri;
      const id = 'c' + ++counter;
      const free = quote.total === 0;
      const end = new Date(); end.setUTCDate(end.getUTCDate() + input.days - 1);
      campaigns = [{
        id, accountId: 'demo-acct', advertiser: p.fullName, targetType: input.targetType, targetId: input.targetId, targetTitle: input.targetTitle, mediaPath, format: input.format,
        // demo only: a real scan runs in the scan-media function
        scan: mediaPath ? { status: 'passed', reasons: [] } : undefined,
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
    async declarePayment(invoiceId, _reference, proof) {
      const c = campaigns.find((x) => x.invoice.id === invoiceId);
      if (!c || c.invoice.status !== 'issued') throw new Error('invoice_not_awaiting_payment');
      set(c.id, { invoice: { ...c.invoice, status: 'paid_declared', proofPath: proof?.uri } });
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
        .map((c) => ({ campaignId: c.id, headline: c.headline, description: '', mediaPath: c.mediaPath, format: c.format, targetType: c.targetType, targetId: c.targetId, placement: c.placement }));
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
        campaigns, reports, managed, messageReports,
        refunds: refundRequests.map((r) => ({ id: r.id, invoiceNumber: r.invoiceNumber, amount: r.amount, reason: r.reason, requestedByMe: false })),
        revenue: [...byPlacement.entries()].map(([placement, r]) => ({ placement, ...r })),
        accounts: [{ id: profile.id, name: profile.fullName, verification: profile.verification, isPremium: profile.isPremium }],
      };
    },
    async hqReview(id, decision: HqDecision, _rule, reason) {
      lastReason = reason;
      const c = find(id);
      if (c.status !== 'Pending review') throw new Error('not_pending_review');
      if (decision === 'approve') {
        if (c.scan?.status === 'flagged') throw new Error('media_flagged');
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
      lastReason = reason;
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
      if (amount > REFUND_LIMIT) {
        refundRequests = [{ id: 'rf' + ++counter, invoiceId, invoiceNumber: c.invoice.number, amount, reason }, ...refundRequests];
        return 'pending_approval';
      }
      executeRefund(invoiceId, amount);
      return 'refunded';
    },
    async hqDecideRefund(requestId, approve, reason) {
      const r = refundRequests.find((x) => x.id === requestId);
      if (!r) throw new Error('request_not_found');
      if (!approve) needReason(reason);
      refundRequests = refundRequests.filter((x) => x.id !== requestId);
      if (approve) executeRefund(r.invoiceId, r.amount);
    },
    async hqUpdateManaged(id, status) { managed = managed.map((m) => (m.id === id ? { ...m, status } : m)); },
    async hqSetFlags(_userId, flags) {
      profile = { ...profile, verification: flags.verification ?? profile.verification, isPremium: flags.premium ?? profile.isPremium };
      changed();
    },
  };
}
