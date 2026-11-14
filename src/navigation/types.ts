export type RootStackParamList = {
  Tabs: undefined;
  ProductDetail: { id: string };
  ServiceDetail: { id: string };
  RequestQuote: { serviceId: string };
  CampaignBuilder: { targetType?: 'product' | 'service'; targetId?: string };
  CampaignDetail: { id: string };
  CreateListing: { type: 'product' | 'service' };
};

export type TabParamList = {
  Home: undefined;
  Market: undefined;
  Services: undefined;
  Promote: undefined;
  Account: undefined;
  HQ: undefined;
};
