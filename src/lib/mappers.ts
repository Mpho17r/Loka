import { ALL_CITIES } from './pricing';
import type {
  Campaign, CampaignStatus, Invoice, Placement, Product, Profile, Quote, Role, Service, ServiceRequest, Verification,
} from '../types';

// Loosely typed database rows: the shapes are defined by supabase/migrations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const STATUS_LABEL: Record<string, CampaignStatus> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
  approved_awaiting_payment: 'Approved, awaiting payment',
  scheduled: 'Scheduled',
  live: 'Live',
  paused: 'Paused',
  completed: 'Completed',
  terminated: 'Terminated',
  cancelled: 'Cancelled',
};
export const statusLabel = (s: string): CampaignStatus => STATUS_LABEL[s] ?? 'Draft';

const EMOJI: Record<string, string> = {
  Electronics: '📱', Home: '🛋️', Fashion: '👗', 'Food & Farm': '🥭', Tools: '🔧',
  'Home services': '🛠️', Digital: '💻', Transport: '🚚', 'Business admin': '📄', Education: '📚', Events: '🎉',
};
export const emojiFor = (category: string) => EMOJI[category] ?? '📦';

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export function mapProduct(r: Row): Product {
  return {
    id: r.id, ownerId: r.owner_id ?? null, title: r.title, price: num(r.price), condition: r.condition,
    category: r.category, city: r.city, seller: r.seller_name, verification: r.seller_verification as Verification,
    description: r.description ?? '', emoji: emojiFor(r.category),
  };
}

export function mapService(r: Row): Service {
  return {
    id: r.id, ownerId: r.owner_id ?? null, title: r.title, category: r.category, provider: r.provider_name,
    verification: r.provider_verification as Verification, city: r.city, pricingModel: r.pricing_model,
    fromPrice: r.from_price === null || r.from_price === undefined ? undefined : num(r.from_price),
    delivery: r.delivery, providedByLoka: !!r.provided_by_loka, rating: num(r.rating), jobs: num(r.jobs_done),
    description: r.description ?? '', emoji: emojiFor(r.category),
  };
}

export function mapProfile(p: Row, roles: Row[]): Profile {
  return {
    id: p.id, fullName: p.full_name ?? '', verification: p.verification, isPremium: !!p.is_premium,
    countryCode: p.country_code, roles: roles.map((r) => r.role as Role),
  };
}

export function mapQuote(q: Row): Quote {
  return {
    gross: num(q.gross), geoMultiplier: num(q.geo_multiplier), premiumDiscount: num(q.premium_discount),
    creditApplied: num(q.credit_applied), managementFee: num(q.management_fee), net: num(q.net),
    taxName: q.tax_name, taxRate: num(q.tax_rate), vat: num(q.vat), total: num(q.total), cpm: num(q.cpm),
    currency: q.currency,
  };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

/** A campaign row joined with its quote, invoice and revisions (select '*, quotes(*), invoices(*), campaign_revisions(*)'). */
export function mapCampaign(c: Row, titleFor: (type: 'product' | 'service', id: string) => string, advertiser?: string): Campaign {
  const quote = Array.isArray(c.quotes) ? c.quotes[0] : c.quotes;
  const inv = Array.isArray(c.invoices) ? c.invoices[0] : c.invoices;
  const revs: Row[] = c.campaign_revisions ?? [];
  const live = revs.find((r) => r.is_live) ?? revs[0];
  const invoice: Invoice = { id: inv.id, number: inv.number, status: inv.status, total: num(inv.total) };
  return {
    id: c.id, accountId: c.account_id, advertiser, targetType: c.target_type, targetId: c.target_id,
    targetTitle: titleFor(c.target_type, c.target_id), headline: live?.headline ?? '',
    placement: c.placement as Placement, city: c.city ?? ALL_CITIES, impressions: c.impressions_bought,
    delivered: c.impressions_delivered, clicks: c.clicks, days: dayDiff(c.start_date, c.end_date),
    startDate: c.start_date, endDate: c.end_date, status: statusLabel(c.status), pausedByHq: !!c.paused_by_hq,
    quote: mapQuote(quote), invoice, createdAt: String(c.created_at).slice(0, 10),
  };
}

export function mapRequest(r: Row): ServiceRequest {
  return {
    id: r.id, serviceId: r.service_id, serviceTitle: r.services?.title ?? 'Service', details: r.details, city: r.city,
    budget: r.budget === null || r.budget === undefined ? undefined : num(r.budget),
    preferredDate: r.preferred_date ?? 'Flexible', status: r.status, createdAt: String(r.created_at).slice(0, 10),
  };
}
