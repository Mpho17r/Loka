import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Api } from '../data/api';
import { createDemoApi } from '../data/demoApi';
import { supabaseApi } from '../data/supabaseApi';
import { BACKEND_ENABLED } from '../lib/config';
import { friendlyError } from '../lib/errors';
import type { Campaign, HqData, Product, Profile, Service, ServiceRequest } from '../types';

export interface AppState {
  api: Api;
  mode: 'supabase' | 'demo';
  ready: boolean;
  profile: Profile | null;
  isStaff: boolean;
  products: Product[];
  services: Service[];
  campaigns: Campaign[];
  requests: ServiceRequest[];
  balance: number;
  hq: HqData | null;
  refresh: () => Promise<void>;
  refreshHq: () => Promise<void>;
  /** Runs an action, refreshes data afterwards, and returns an error message instead of throwing. */
  run: (fn: () => Promise<unknown>) => Promise<string | null>;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo<Api>(() => (BACKEND_ENABLED ? supabaseApi : createDemoApi()), []);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [balance, setBalance] = useState(0);
  const [hq, setHq] = useState<HqData | null>(null);
  const profileRef = useRef<Profile | null>(null);

  const isStaff = !!profile && profile.roles.length > 0;

  const loadAll = useCallback(async () => {
    try {
      const [p, catalog] = await Promise.all([api.getProfile(), api.loadCatalog()]);
      profileRef.current = p;
      setProfile(p);
      setProducts(catalog.products);
      setServices(catalog.services);
      if (p) {
        const mine = await api.loadMine(p);
        setCampaigns(mine.campaigns);
        setRequests(mine.requests);
        setBalance(mine.balance);
      } else {
        setCampaigns([]); setRequests([]); setBalance(0); setHq(null);
      }
    } catch {
      // Keep whatever is on screen; individual actions surface their own errors.
    } finally {
      setReady(true);
    }
  }, [api]);

  const refreshHq = useCallback(async () => {
    const p = profileRef.current;
    if (!p || p.roles.length === 0) { setHq(null); return; }
    try { setHq(await api.hqLoad(p)); } catch { /* shown as empty */ }
  }, [api]);

  const refresh = useCallback(async () => { await loadAll(); await refreshHq(); }, [loadAll, refreshHq]);

  useEffect(() => {
    void refresh();
    return api.onAuthChange(() => { void refresh(); });
  }, [api, refresh]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
      return null;
    } catch (e) {
      return friendlyError(e);
    }
  }, [refresh]);

  const value = useMemo<AppState>(() => ({
    api, mode: api.mode, ready, profile, isStaff, products, services, campaigns, requests, balance, hq, refresh, refreshHq, run,
  }), [api, ready, profile, isStaff, products, services, campaigns, requests, balance, hq, refresh, refreshHq, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
