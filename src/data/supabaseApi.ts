import type { Api, HqDecision, ListingFilter, MineData, Page, QuoteRequest } from './api';
import { getViewerKey, supabase } from '../lib/supabase';
import { ALL_CITIES } from '../lib/pricing';
import { uploadImage, uploadVideo } from '../lib/media';
import { mapCampaign, mapProduct, mapProfile, mapQuote, mapRequest, mapService } from '../lib/mappers';
import type { Ad, AppNotification, Campaign, HqData, HqReport, Placement, Product, Quote } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function client() {
  if (!supabase) throw new Error('Backend is not configured');
  return supabase;
}

function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** UTC date, matching the database's current_date. */
const utcDate = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const CAMPAIGN_SELECT = '*, quotes(*), invoices(*), campaign_revisions(*, media_scans(*))';

async function titleLookup(rows: Row[]): Promise<(type: 'product' | 'service', id: string) => string> {
  const sb = client();
  const pIds = [...new Set(rows.filter((r) => r.target_type === 'product').map((r) => r.target_id))];
  const sIds = [...new Set(rows.filter((r) => r.target_type === 'service').map((r) => r.target_id))];
  const titles = new Map<string, string>();
  if (pIds.length) ok<Row[]>(await sb.from('products').select('id, title').in('id', pIds)).forEach((r) => titles.set(r.id, r.title));
  if (sIds.length) ok<Row[]>(await sb.from('services').select('id, title').in('id', sIds)).forEach((r) => titles.set(r.id, r.title));
  return (_type, id) => titles.get(id) ?? 'Listing';
}

/** Strip characters that have a meaning inside a PostgREST filter string or an ILIKE pattern. */
const clean = (s: string) => s.replace(/[%,()*\\_:"']/g, ' ').replace(/\s+/g, ' ').trim();

export const supabaseApi: Api = {
  mode: 'supabase',

  async getProfile() {
    const sb = client();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const p = ok<Row | null>(await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
    if (!p) return null;
    const roles = ok<Row[]>(await sb.from('user_roles').select('role, country_code').eq('user_id', session.user.id));
    return mapProfile(p, roles);
  },

  onAuthChange(cb) {
    const { data } = client().auth.onAuthStateChange(() => cb());
    return () => data.subscription.unsubscribe();
  },

  async signIn(email, password) {
    const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
  },

  async signUp(email, password, fullName) {
    const { data, error } = await client().auth.signUp({
      email: email.trim(), password, options: { data: { full_name: fullName.trim() } },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  },

  async signOut() {
    const { error } = await client().auth.signOut();
    if (error) throw new Error(error.message);
  },

  async loadCatalog() {
    const sb = client();
    // Only the newest listings: screens page and search on the server, and fetch single listings by id when needed.
    const [products, services] = await Promise.all([
      sb.from('products').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(30),
      sb.from('services').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(30),
    ]);
    return { products: ok<Row[]>(products).map(mapProduct), services: ok<Row[]>(services).map(mapService) };
  },

  async searchProducts(f: ListingFilter): Promise<Page<Product>> {
    let query = client().from('products').select('*').eq('status', 'active');
    const q = clean(f.q);
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,seller_name.ilike.%${q}%`);
    if (f.category !== 'All') query = query.eq('category', f.category);
    if (f.city !== ALL_CITIES) query = query.eq('city', f.city);
    const rows = ok<Row[]>(await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(f.offset, f.offset + f.limit));
    return { items: rows.slice(0, f.limit).map(mapProduct), hasMore: rows.length > f.limit };
  },

  async searchServices(f: ListingFilter) {
    let query = client().from('services').select('*').eq('status', 'active');
    const q = clean(f.q);
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,provider_name.ilike.%${q}%`);
    if (f.category !== 'All') query = query.eq('category', f.category);
    // remote and "both" services can serve anyone, so they match every city
    if (f.city !== ALL_CITIES) query = query.or(`city.eq.${clean(f.city)},delivery.neq.On-site`);
    const rows = ok<Row[]>(await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(f.offset, f.offset + f.limit));
    return { items: rows.slice(0, f.limit).map(mapService), hasMore: rows.length > f.limit };
  },

  async getProduct(id) {
    const r = ok<Row | null>(await client().from('products').select('*').eq('id', id).maybeSingle());
    return r ? mapProduct(r) : null;
  },

  async getService(id) {
    const r = ok<Row | null>(await client().from('services').select('*').eq('id', id).maybeSingle());
    return r ? mapService(r) : null;
  },

  async createProduct(input, profile) {
    ok(await client().from('products').insert({
      owner_id: profile.id, seller_name: profile.fullName || 'Seller', title: input.title.trim(),
      description: input.description.trim(), price: input.price, condition: input.condition,
      category: input.category, city: input.city, country_code: profile.countryCode,
    }));
  },

  async createService(input, profile) {
    ok(await client().from('services').insert({
      owner_id: profile.id, provider_name: profile.fullName || 'Provider', title: input.title.trim(),
      description: input.description.trim(), category: input.category, city: input.city,
      country_code: profile.countryCode, pricing_model: input.pricingModel,
      from_price: input.fromPrice ?? null, delivery: input.delivery,
    }));
  },

  async loadMine(profile): Promise<MineData> {
    const sb = client();
    const acct = ok<Row | null>(await sb.from('ad_accounts').select('id').eq('owner_id', profile.id).maybeSingle());
    let campaigns: Campaign[] = [];
    let balance = 0;
    if (acct) {
      const rows = ok<Row[]>(await sb.from('campaigns').select(CAMPAIGN_SELECT).eq('account_id', acct.id).order('created_at', { ascending: false }));
      const titleFor = await titleLookup(rows);
      campaigns = rows.map((r) => mapCampaign(r, titleFor, profile.fullName));
      balance = Number(ok<number | null>(await sb.rpc('ad_balance', { p_account: acct.id })) ?? 0);
    }
    const [myP, myS] = await Promise.all([
      sb.from('products').select('*').eq('owner_id', profile.id).neq('status', 'removed').order('created_at', { ascending: false }),
      sb.from('services').select('*').eq('owner_id', profile.id).neq('status', 'removed').order('created_at', { ascending: false }),
    ]);
    const reqs = ok<Row[]>(await sb.from('service_requests').select('*, services(title)').eq('requester_id', profile.id).order('created_at', { ascending: false }));
    return { products: ok<Row[]>(myP).map(mapProduct), services: ok<Row[]>(myS).map(mapService), campaigns, requests: reqs.map(mapRequest), balance };
  },

  async submitRequest(input, profile) {
    ok(await client().from('service_requests').insert({
      service_id: input.serviceId, requester_id: profile.id, details: input.details, city: input.city,
      budget: input.budget ?? null, preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate) ? input.preferredDate : null,
    }));
  },

  async loadNotifications(): Promise<AppNotification[]> {
    const rows = ok<Row[]>(await client().from('notifications').select('*').order('created_at', { ascending: false }).limit(50));
    return rows.map((n) => ({
      id: n.id, title: n.title, body: n.body ?? '', read: !!n.read, createdAt: String(n.created_at).slice(0, 10),
      campaignId: n.campaign_id ?? undefined, conversationId: n.conversation_id ?? undefined,
    }));
  },

  async startConversation(type, listingId, firstMessage) {
    return ok<string>(await client().rpc('start_conversation', { p_type: type, p_listing: listingId, p_first: firstMessage ?? null }));
  },

  async loadConversations() {
    const sb = client();
    const { data } = await sb.auth.getUser();
    const me = data.user?.id;
    if (!me) return [];
    const rows = ok<Row[]>(await sb.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(100));
    const blocks = ok<Row[]>(await sb.from('user_blocks').select('blocked_id'));
    const blocked = new Set(blocks.map((b) => b.blocked_id));
    return rows.map((c) => {
      const iAmBuyer = c.buyer_id === me;
      const otherUserId = iAmBuyer ? c.seller_id : c.buyer_id;
      const myRead = Date.parse(iAmBuyer ? c.buyer_read_at : c.seller_read_at);
      return {
        id: c.id, listingType: c.listing_type, listingId: c.listing_id, listingTitle: c.listing_title,
        otherName: (iAmBuyer ? c.seller_name : c.buyer_name) || 'User', otherUserId,
        lastPreview: c.last_preview ?? '', lastAt: String(c.last_message_at),
        unread: !!c.last_sender_id && c.last_sender_id !== me && Date.parse(c.last_message_at) > myRead,
        blockedByMe: blocked.has(otherUserId),
      };
    });
  },

  async loadMessages(conversationId) {
    const sb = client();
    const { data } = await sb.auth.getUser();
    const me = data.user?.id;
    const rows = ok<Row[]>(await sb.from('messages').select('*').eq('conversation_id', conversationId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(300));
    return rows.reverse().map((m) => ({ id: m.id, mine: m.sender_id === me, body: m.body, createdAt: String(m.created_at) }));
  },

  async sendMessage(conversationId, body) {
    ok(await client().rpc('send_message', { p_conv: conversationId, p_body: body }));
  },

  async markConversationRead(conversationId) {
    ok(await client().rpc('mark_conversation_read', { p_conv: conversationId }));
  },

  async blockUser(userId) { ok(await client().rpc('block_user', { p_user: userId })); },
  async unblockUser(userId) { ok(await client().rpc('unblock_user', { p_user: userId })); },
  async reportMessage(messageId, reason) { ok(await client().rpc('report_message', { p_message: messageId, p_reason: reason })); },

  async registerPushToken(token, platform) {
    const { data } = await client().auth.getUser();
    if (!data.user) throw new Error('not_signed_in');
    ok(await client().from('push_tokens').upsert({ user_id: data.user.id, token, platform }, { onConflict: 'user_id,token', ignoreDuplicates: true }));
  },

  async setDeliveryPrefs(prefs) {
    const { data } = await client().auth.getUser();
    if (!data.user) throw new Error('not_signed_in');
    const patch: Record<string, boolean> = {};
    if (prefs.push !== undefined) patch.push_enabled = prefs.push;
    if (prefs.email !== undefined) patch.email_enabled = prefs.email;
    ok(await client().from('profiles').update(patch).eq('id', data.user.id));
  },

  async markNotificationsRead() {
    ok(await client().from('notifications').update({ read: true }).eq('read', false));
  },

  async cancelRequest(id) {
    ok(await client().from('service_requests').update({ status: 'Cancelled' }).eq('id', id));
  },

  async quote(req: QuoteRequest, profile, balance): Promise<Quote> {
    const q = ok<Row>(await client().rpc('compute_quote', {
      p_country: profile.countryCode, p_placement: req.placement, p_format: req.format,
      p_city: req.city === ALL_CITIES ? null : req.city, p_impressions: req.impressions,
      p_is_premium: profile.isPremium, p_credit: req.useCredit ? balance : 0, p_fee: 0,
    }));
    return mapQuote(q);
  },

  async createCampaign(input, profile, _balance) {
    if (input.format === 'video' && !input.video) throw new Error('video_required');
    const mediaPath = input.format === 'video' && input.video
      ? await uploadVideo(profile.id, input.video)
      : input.media ? await uploadImage('ad-media', profile.id, input.media) : null;
    const id = ok<string>(await client().rpc('create_campaign', {
      p_target_type: input.targetType, p_target_id: input.targetId, p_headline: input.headline, p_description: '',
      p_cta: 'View', p_placement: input.placement, p_format: input.format,
      p_city: input.city === ALL_CITIES ? null : input.city, p_impressions: input.impressions,
      p_start: utcDate(0), p_end: utcDate(input.days - 1), p_use_credit: input.useCredit, p_accept_terms: true, p_media_path: mediaPath,
    }));
    return id;
  },

  async campaignAction(id, action) {
    ok(await client().rpc('advertiser_set_state', { p_campaign: id, p_action: action }));
  },

  async declarePayment(invoiceId, reference, proof) {
    const { data } = await client().auth.getUser();
    if (proof && !data.user) throw new Error('not_signed_in');
    const proofPath = proof && data.user ? await uploadImage('payment-proofs', data.user.id, proof) : null;
    ok(await client().rpc('advertiser_declare_payment', { p_invoice: invoiceId, p_proof_path: proofPath, p_reference: reference }));
  },

  async reportAd(campaignId, reason, profile) {
    ok(await client().from('ad_reports').insert({ campaign_id: campaignId, reporter_id: profile.id, reason }));
  },

  async requestManaged(brief, budget, profile) {
    ok(await client().from('managed_requests').insert({
      requester_id: profile.id, country_code: profile.countryCode, brief: brief.trim(), budget: budget ?? null,
    }));
  },

  async getAds(placement: Placement, city: string): Promise<Ad[]> {
    const rows = ok<Row[]>(await client().rpc('get_ads', {
      p_placement: placement, p_city: city === ALL_CITIES ? null : city, p_viewer_key: await getViewerKey(), p_limit: 1,
    }));
    return rows.map((r) => ({
      campaignId: r.campaign_id, headline: r.headline, description: r.description ?? '', mediaPath: r.media_path ?? undefined, format: r.format === 'video' ? 'video' : 'image',
      targetType: r.target_type, targetId: r.target_id, placement: r.placement,
    }));
  },

  async recordImpression(campaignId) {
    return !!ok<boolean>(await client().rpc('record_impression', { p_campaign: campaignId, p_viewer_key: await getViewerKey() }));
  },

  async recordClick(campaignId) {
    return !!ok<boolean>(await client().rpc('record_click', { p_campaign: campaignId, p_viewer_key: await getViewerKey() }));
  },

  async hqLoad(profile): Promise<HqData> {
    const sb = client();
    const rows = ok<Row[]>(await sb.from('campaigns').select(CAMPAIGN_SELECT).order('created_at', { ascending: false }).limit(300));
    const titleFor = await titleLookup(rows);
    const accountIds = [...new Set(rows.map((r) => r.account_id))];
    const names = new Map<string, string>();
    if (accountIds.length) {
      const accts = ok<Row[]>(await sb.from('ad_accounts').select('id, owner_id').in('id', accountIds));
      const owners = [...new Set(accts.map((a) => a.owner_id))];
      const profs = owners.length ? ok<Row[]>(await sb.from('profiles').select('id, full_name').in('id', owners)) : [];
      const byOwner = new Map(profs.map((p) => [p.id, p.full_name || 'Unnamed']));
      accts.forEach((a) => names.set(a.id, byOwner.get(a.owner_id) ?? 'Unnamed'));
    }
    const campaigns = rows.map((r) => mapCampaign(r, titleFor, names.get(r.account_id)));

    const repRows = ok<Row[]>(await sb.from('ad_reports').select('*').order('created_at', { ascending: false }).limit(100));
    const headline = new Map(campaigns.map((c) => [c.id, c.headline]));
    const reports: HqReport[] = repRows.map((r) => ({
      id: r.id, campaignId: r.campaign_id, headline: headline.get(r.campaign_id) ?? 'Campaign', reason: r.reason, status: r.status,
    }));

    let revenue: HqData['revenue'] = [];
    const rev = await sb.rpc('hq_revenue', { p_country: profile.countryCode, p_from: utcDate(-90), p_to: utcDate(1) });
    if (!rev.error) {
      revenue = (rev.data as Row[]).map((r) => ({
        placement: r.placement, campaigns: Number(r.campaigns), impressions: Number(r.impressions), clicks: Number(r.clicks),
        billedNet: Number(r.billed_net), billedTotal: Number(r.billed_total),
      }));
    }  // not finance or owner: revenue stays hidden

    const profRows = await sb.from('profiles').select('id, full_name, verification, is_premium').order('created_at', { ascending: false }).limit(200);
    const accounts = profRows.error ? [] : (profRows.data as Row[]).map((p) => ({
      id: p.id, name: p.full_name || 'Unnamed', verification: p.verification, isPremium: !!p.is_premium,
    }));
    const mgd = await sb.from('managed_requests').select('*').order('created_at', { ascending: false }).limit(100);
    const nameById = new Map(accounts.map((a) => [a.id, a.name]));
    const managed = mgd.error ? [] : (mgd.data as Row[]).map((m) => ({
      id: m.id, requester: nameById.get(m.requester_id) ?? 'Advertiser', brief: m.brief,
      budget: m.budget === null ? undefined : Number(m.budget), status: m.status,
    }));
    const mr = await sb.from('message_reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100);
    const messageReports = mr.error ? [] : (mr.data as Row[]).map((r) => ({
      id: r.id, reason: r.reason, reporterName: r.reporter_name || 'User', reportedName: r.reported_name || 'User',
      context: ((r.context ?? []) as Row[]).map((c) => ({ fromReported: !!c.from_reported, body: String(c.body), at: String(c.at) })),
    }));
    const rr = await sb.from('refund_requests').select('*, invoices(number)').eq('status', 'pending').order('created_at', { ascending: false });
    const refunds = rr.error ? [] : (rr.data as Row[]).map((r) => ({
      id: r.id, invoiceNumber: r.invoices?.number ?? '', amount: Number(r.amount), reason: r.reason, requestedByMe: r.requested_by === profile.id,
    }));
    return { campaigns, reports, revenue, accounts, managed, refunds, messageReports };
  },

  async hqReview(campaignId, decision: HqDecision, rule, reason) {
    ok(await client().rpc('hq_review_campaign', {
      p_campaign: campaignId, p_decision: decision, p_policy_rule: rule || null, p_reason: reason || null,
    }));
  },

  async hqVerifyPayment(invoiceId, reference) {
    ok(await client().rpc('hq_verify_payment', { p_invoice: invoiceId, p_reference: reference || null }));
  },

  async hqSetState(campaignId, action, reason) {
    ok(await client().rpc('hq_set_state', { p_campaign: campaignId, p_action: action, p_reason: reason, p_forfeit: false }));
  },

  async hqResolveReport(reportId, status, resolution) {
    ok(await client().rpc('hq_resolve_report', { p_report: reportId, p_status: status, p_resolution: resolution }));
  },

  async hqAdjustCredit(accountId, amount, reason) {
    ok(await client().rpc('hq_adjust_credit', { p_account: accountId, p_amount: amount, p_reason: reason }));
  },

  async hqRefund(invoiceId, amount, reason) {
    const r = ok<string>(await client().rpc('hq_refund', { p_invoice: invoiceId, p_amount: amount, p_reason: reason, p_revoke_credit: true }));
    return r === 'pending_approval' ? 'pending_approval' : 'refunded';
  },

  async hqDecideRefund(requestId, approve, reason) {
    ok(await client().rpc('hq_decide_refund', { p_request: requestId, p_approve: approve, p_reason: reason || null }));
  },

  async hqUpdateManaged(requestId, status) {
    ok(await client().rpc('hq_update_managed_request', { p_request: requestId, p_status: status, p_assigned_to: null }));
  },

  async hqClearScan(campaignId, reason) {
    ok(await client().rpc('hq_clear_media_scan', { p_campaign: campaignId, p_reason: reason }));
  },

  async hqBlockMedia(campaignId, reason) {
    ok(await client().rpc('hq_block_media', { p_campaign: campaignId, p_reason: reason }));
  },

  async hqResolveMessageReport(reportId, status, resolution) {
    ok(await client().rpc('hq_resolve_message_report', { p_report: reportId, p_status: status, p_resolution: resolution }));
  },

  async hqSetFlags(userId, flags, reason) {
    ok(await client().rpc('hq_set_profile_flags', {
      p_user: userId, p_verification: flags.verification ?? null, p_premium: flags.premium ?? null, p_reason: reason,
    }));
  },
};
