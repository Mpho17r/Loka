import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Campaign, CampaignStatus, ServiceRequest } from '../types';

/**
 * In-memory state for the prototype. Everything here maps to a backend table
 * in the Loka specs (campaigns, service_requests, ad_credits, ad_accounts).
 */
interface AppState {
  isPremium: boolean;
  setPremium: (v: boolean) => void;
  creditBalance: number;
  campaigns: Campaign[];
  requests: ServiceRequest[];
  submitCampaign: (c: Omit<Campaign, 'id' | 'createdAt' | 'status' | 'delivered' | 'clicks'>) => Campaign;
  setCampaignStatus: (id: string, status: CampaignStatus) => void;
  addRequest: (r: Omit<ServiceRequest, 'id' | 'createdAt' | 'status'>) => ServiceRequest;
  cancelRequest: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

let counter = 100;
const nextId = (prefix: string) => `${prefix}${++counter}`;
const today = () => new Date().toISOString().slice(0, 10);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setPremium] = useState(false);
  const [creditBalance, setCreditBalance] = useState(100); // demo starting credit (R100)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);

  const submitCampaign: AppState['submitCampaign'] = useCallback((c) => {
    const campaign: Campaign = {
      ...c,
      id: nextId('c'),
      createdAt: today(),
      status: 'Pending review',
      delivered: 0,
      clicks: 0,
    };
    setCampaigns((prev) => [campaign, ...prev]);
    // Credit is reserved on submission and returned if the campaign is rejected or cancelled.
    setCreditBalance((b) => Math.max(0, Math.round((b - c.quote.creditApplied) * 100) / 100));
    return campaign;
  }, []);

  const setCampaignStatus: AppState['setCampaignStatus'] = useCallback((id, status) => {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const returning =
          (status === 'Rejected' || status === 'Cancelled') &&
          c.status !== 'Rejected' &&
          c.status !== 'Cancelled';
        if (returning) {
          setCreditBalance((b) => Math.round((b + c.quote.creditApplied) * 100) / 100);
        }
        // Demo only: going Live simulates some delivery so reports have something to show.
        if (status === 'Live' && c.delivered === 0) {
          const delivered = Math.round(c.impressions * 0.12);
          return { ...c, status, delivered, clicks: Math.round(delivered * 0.021) };
        }
        return { ...c, status };
      }),
    );
  }, []);

  const addRequest: AppState['addRequest'] = useCallback((r) => {
    const req: ServiceRequest = { ...r, id: nextId('r'), createdAt: today(), status: 'Submitted' };
    setRequests((prev) => [req, ...prev]);
    return req;
  }, []);

  const cancelRequest = useCallback((id: string) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'Cancelled' } : r)));
  }, []);

  const value = useMemo(
    () => ({
      isPremium,
      setPremium,
      creditBalance,
      campaigns,
      requests,
      submitCampaign,
      setCampaignStatus,
      addRequest,
      cancelRequest,
    }),
    [isPremium, creditBalance, campaigns, requests, submitCampaign, setCampaignStatus, addRequest, cancelRequest],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
