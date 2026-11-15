export type Verification = 'unverified' | 'identity' | 'business';
export type Role = 'owner' | 'country_admin' | 'ops' | 'finance' | 'support';

export interface Profile {
  id: string;
  fullName: string;
  verification: Verification;
  isPremium: boolean;
  countryCode: string;
  roles: Role[];
  pushEnabled: boolean;
  emailEnabled: boolean;
}

export interface Product {
  id: string;
  ownerId: string | null;
  title: string;
  price: number; // ZAR
  condition: 'New' | 'Second-hand';
  category: string;
  city: string;
  seller: string;
  verification: Verification;
  description: string;
  emoji: string;
}

export type PricingModel = 'Fixed price' | 'Hourly' | 'Quotation' | 'Free consultation';

export interface Service {
  id: string;
  ownerId: string | null;
  title: string;
  category: string;
  provider: string;
  verification: Verification;
  city: string;
  pricingModel: PricingModel;
  fromPrice?: number; // ZAR
  delivery: 'On-site' | 'Remote' | 'Both';
  providedByLoka: boolean;
  rating: number;
  jobs: number;
  description: string;
  emoji: string;
}

/** An image chosen from the phone's library, ready to upload. */
export interface PickedImage { uri: string; mime: string; base64: string; bytes: number }

/** A short video chosen from the phone's library. Uploaded from its file address, not held in memory as text. */
export interface PickedVideo { uri: string; mime: string; bytes: number; durationMs: number }
export type AdFormat = 'image' | 'video';

export type ScanStatus = 'pending' | 'passed' | 'flagged' | 'error';
export interface MediaScan { status: ScanStatus; reasons: string[]; clearedReason?: string }

export type Placement = 'homepage' | 'search' | 'category' | 'listing';

export type CampaignStatus =
  | 'Draft'
  | 'Pending review'
  | 'Changes requested'
  | 'Approved, awaiting payment'
  | 'Scheduled'
  | 'Live'
  | 'Paused'
  | 'Completed'
  | 'Rejected'
  | 'Terminated'
  | 'Cancelled';

export type InvoiceStatus = 'issued' | 'paid_declared' | 'verified' | 'refund_due' | 'refunded';

export interface Quote {
  gross: number;
  geoMultiplier: number;
  premiumDiscount: number;
  creditApplied: number;
  managementFee: number;
  net: number;
  taxName: string;
  taxRate: number;
  vat: number;
  total: number;
  cpm: number;
  currency: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  total: number;
  proofPath?: string;
}

export interface Campaign {
  id: string;
  accountId: string;
  advertiser?: string;
  targetType: 'product' | 'service';
  targetId: string;
  targetTitle: string;
  headline: string;
  mediaPath?: string;
  format: AdFormat;
  scan?: MediaScan;
  placement: Placement;
  city: string; // 'All cities' for national
  impressions: number;
  delivered: number;
  clicks: number;
  days: number;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  pausedByHq: boolean;
  quote: Quote;
  invoice: Invoice;
  createdAt: string;
}

export interface Ad {
  campaignId: string;
  headline: string;
  description: string;
  mediaPath?: string;
  format: AdFormat;
  targetType: 'product' | 'service';
  targetId: string;
  placement: Placement;
}

export interface CampaignInput {
  targetType: 'product' | 'service';
  targetId: string;
  targetTitle: string;
  headline: string;
  placement: Placement;
  city: string;
  impressions: number;
  days: number;
  useCredit: boolean;
  format: AdFormat;
  media?: PickedImage;
  video?: PickedVideo;
}

export type RequestStatus = 'Submitted' | 'Under review' | 'Quoted' | 'Accepted' | 'Completed' | 'Cancelled';

export interface ServiceRequest {
  id: string;
  serviceId: string;
  serviceTitle: string;
  details: string;
  city: string;
  budget?: number;
  preferredDate: string;
  status: RequestStatus;
  createdAt: string;
}

export interface HqReport {
  id: string;
  campaignId: string;
  headline: string;
  reason: string;
  status: 'open' | 'investigating' | 'actioned' | 'dismissed';
}

export interface HqRevenueRow {
  placement: string;
  campaigns: number;
  impressions: number;
  clicks: number;
  billedNet: number;
  billedTotal: number;
}

export interface HqAccount {
  id: string;
  name: string;
  verification: Verification;
  isPremium: boolean;
}

export interface HqManaged {
  id: string;
  requester: string;
  brief: string;
  budget?: number;
  status: 'new' | 'in_progress' | 'campaign_created' | 'declined';
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  campaignId?: string;
  conversationId?: string;
}

export interface HqRefund {
  id: string;
  invoiceNumber: string;
  amount: number;
  reason: string;
  requestedByMe: boolean;
}

export interface Conversation {
  id: string;
  listingType: 'product' | 'service';
  listingId: string;
  listingTitle: string;
  otherName: string;
  otherUserId: string;
  lastPreview: string;
  lastAt: string;
  unread: boolean;
  blockedByMe: boolean;
}

export interface Message {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface HqMessageReport {
  id: string;
  reason: string;
  reporterName: string;
  reportedName: string;
  context: { fromReported: boolean; body: string; at: string }[];
}

export interface HqData {
  messageReports: HqMessageReport[];
  refunds: HqRefund[];
  managed: HqManaged[];
  campaigns: Campaign[];
  reports: HqReport[];
  revenue: HqRevenueRow[];
  accounts: HqAccount[];
}

export interface NewProduct {
  title: string; description: string; price: number; condition: 'New' | 'Second-hand'; category: string; city: string;
}
export interface NewService {
  title: string; description: string; category: string; city: string; pricingModel: PricingModel;
  fromPrice?: number; delivery: 'On-site' | 'Remote' | 'Both';
}
