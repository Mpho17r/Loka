import type {
  Ad, Campaign, CampaignInput, HqData, NewProduct, NewService, Placement, Product, Profile, Quote, Service,
  ServiceRequest, Verification,
} from '../types';

export interface QuoteRequest {
  placement: Placement;
  city: string;
  impressions: number;
  useCredit: boolean;
}

export interface MineData {
  campaigns: Campaign[];
  requests: ServiceRequest[];
  balance: number;
}

export type HqDecision = 'approve' | 'reject' | 'changes';

/** Everything the app needs from a backend. Two implementations: Supabase (real) and demo (in memory). */
export interface Api {
  mode: 'supabase' | 'demo';

  // auth
  getProfile(): Promise<Profile | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;

  // catalogue
  loadCatalog(): Promise<{ products: Product[]; services: Service[] }>;
  createProduct(input: NewProduct, profile: Profile): Promise<void>;
  createService(input: NewService, profile: Profile): Promise<void>;

  // the signed-in user's own data
  loadMine(profile: Profile): Promise<MineData>;
  submitRequest(input: { serviceId: string; serviceTitle: string; details: string; city: string; budget?: number; preferredDate: string }, profile: Profile): Promise<void>;
  cancelRequest(id: string): Promise<void>;

  // Promote: advertiser
  quote(req: QuoteRequest, profile: Profile, balance: number): Promise<Quote>;
  createCampaign(input: CampaignInput, profile: Profile, balance: number): Promise<string>;
  campaignAction(id: string, action: 'pause' | 'resume' | 'cancel'): Promise<void>;
  declarePayment(invoiceId: string, reference: string): Promise<void>;
  reportAd(campaignId: string, reason: string, profile: Profile): Promise<void>;
  requestManaged(brief: string, budget: number | undefined, profile: Profile): Promise<void>;

  // Promote: serving and tracking (works for signed-out visitors)
  getAds(placement: Placement, city: string): Promise<Ad[]>;
  recordImpression(campaignId: string): Promise<boolean>;
  recordClick(campaignId: string): Promise<boolean>;

  // Saccharum HQ
  hqLoad(profile: Profile): Promise<HqData>;
  hqReview(campaignId: string, decision: HqDecision, rule: string, reason: string): Promise<void>;
  hqVerifyPayment(invoiceId: string, reference: string): Promise<void>;
  hqSetState(campaignId: string, action: 'pause' | 'resume' | 'terminate', reason: string): Promise<void>;
  hqResolveReport(reportId: string, status: 'investigating' | 'actioned' | 'dismissed', resolution: string): Promise<void>;
  hqAdjustCredit(accountId: string, amount: number, reason: string): Promise<void>;
  hqRefund(invoiceId: string, amount: number, reason: string): Promise<void>;
  hqUpdateManaged(requestId: string, status: 'in_progress' | 'campaign_created' | 'declined'): Promise<void>;
  hqSetFlags(userId: string, flags: { verification?: Verification; premium?: boolean }, reason: string): Promise<void>;
}
