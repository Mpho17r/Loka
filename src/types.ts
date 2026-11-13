export type Verification = 'unverified' | 'identity' | 'business';

export interface Product {
  id: string;
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
  title: string;
  category: string;
  provider: string;
  verification: Verification;
  city: string;
  pricingModel: PricingModel;
  fromPrice?: number; // ZAR
  delivery: 'On-site' | 'Remote' | 'Both';
  rating: number;
  jobs: number;
  description: string;
  emoji: string;
}

export type Placement = 'homepage' | 'search' | 'category' | 'listing';

export type CampaignStatus =
  | 'Draft'
  | 'Pending review'
  | 'Approved, awaiting payment'
  | 'Scheduled'
  | 'Live'
  | 'Paused'
  | 'Completed'
  | 'Rejected'
  | 'Terminated'
  | 'Cancelled';

export interface Quote {
  gross: number;
  geoMultiplier: number;
  premiumDiscount: number;
  creditApplied: number;
  net: number;
  vat: number;
  total: number;
  cpm: number;
}

export interface Campaign {
  id: string;
  targetType: 'product' | 'service';
  targetId: string;
  targetTitle: string;
  headline: string;
  placement: Placement;
  city: string; // 'All cities' for national
  impressions: number;
  delivered: number;
  clicks: number;
  days: number;
  status: CampaignStatus;
  quote: Quote;
  createdAt: string;
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
