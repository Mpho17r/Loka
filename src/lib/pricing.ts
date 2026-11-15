import type { AdFormat, Placement, Quote } from '../types';

/**
 * Loka Promote pricing engine.
 * Rates are ILLUSTRATIVE TEST RATES (see Loka Promote spec, section 4), not approved prices.
 * This local copy is used for DEMO mode only. With a backend, prices come from the server
 * (public.compute_quote reading price_books and tax_rules), so HQ can change them without a release.
 */
export const PLACEMENTS: { id: Placement; label: string; cpm: number; note: string }[] = [
  { id: 'homepage', label: 'Homepage banner', cpm: 60, note: 'Top of the home page' },
  { id: 'search', label: 'Search results', cpm: 40, note: 'Sponsored card among results' },
  { id: 'category', label: 'Category page', cpm: 30, note: 'Banner on category pages' },
  { id: 'listing', label: 'Listing detail', cpm: 20, note: 'Related strip on listing pages' },
];

export const ALL_CITIES = 'All cities';

/** Local city targeting is cheaper than national exposure. */
export const GEO_MULTIPLIER_CITY = 0.7;
export const GEO_MULTIPLIER_NATIONAL = 1;

export const VAT_RATE = 0.15; // South Africa; confirm with an accountant before launch.
export const PREMIUM_DISCOUNT = 0.1;
export const MIN_IMPRESSIONS = 1000;
export const IMPRESSION_STEP = 1000;

export interface QuoteInput {
  placement: Placement;
  city: string;
  impressions: number;
  isPremium: boolean;
  creditBalance: number;
  format?: AdFormat;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Video is sold only on Home and Category (same as the seed price book). Test prices. */
export const VIDEO_CPM: Partial<Record<Placement, number>> = { homepage: 90, category: 45 };

export function cpmFor(placement: Placement, format: AdFormat = 'image'): number {
  const p = PLACEMENTS.find((x) => x.id === placement);
  if (!p) throw new Error(`Unknown placement: ${placement}`);
  if (format === 'video') {
    const v = VIDEO_CPM[placement];
    if (v === undefined) throw new Error('no_price_for_placement');
    return v;
  }
  return p.cpm;
}

export function calculateQuote(input: QuoteInput): Quote {
  const cpm = cpmFor(input.placement, input.format);
  const impressions = Math.max(0, Math.floor(input.impressions));
  const geoMultiplier = input.city === ALL_CITIES ? GEO_MULTIPLIER_NATIONAL : GEO_MULTIPLIER_CITY;

  const gross = round2((impressions / 1000) * cpm * geoMultiplier);
  const premiumDiscount = input.isPremium ? round2(gross * PREMIUM_DISCOUNT) : 0;
  const afterDiscount = round2(gross - premiumDiscount);
  // Credit can never exceed what is payable, and never be negative.
  const creditApplied = round2(Math.min(Math.max(0, input.creditBalance), afterDiscount));
  const net = round2(afterDiscount - creditApplied);
  const vat = round2(net * VAT_RATE);
  const total = round2(net + vat);

  return {
    gross, geoMultiplier, premiumDiscount, creditApplied, managementFee: 0, net,
    taxName: 'VAT', taxRate: VAT_RATE, vat, total, cpm, currency: 'ZAR',
  };
}

/** Rough reach estimate to warn about under-delivery. Illustrative only. */
export function estimateDailyReach(placement: Placement, city: string): number {
  const base: Record<Placement, number> = { homepage: 4000, search: 3000, category: 2000, listing: 1500 };
  return Math.round(base[placement] * (city === ALL_CITIES ? 1 : 0.35));
}

export const formatZAR = (n: number) =>
  'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ');
