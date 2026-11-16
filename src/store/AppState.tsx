import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Api } from '../data/api';
import { createDemoApi } from '../data/demoApi';
import { supabaseApi } from '../data/supabaseApi';
import { BACKEND_ENABLED } from '../lib/config';
import { friendlyError } from '../lib/errors';
import type { AppNotification, Campaign, HqData, Product, Profile, Service, ServiceRequest } from '../types';

export interface AppState {
  api: Api;
  mode: 'supabase' | 'demo';
  ready: boolean;
  profile: Profile | null;
  isStaff: boolean;
  /** Cache of listings seen so far (newest page, search results, listings opened by id, and the user's own). */
  products: Product[];
  services: Service[];
  /** The signed-in user's own listings (all of them, whatever their age). */
  myProducts: Product[];
  myServices: Service[];
  /** Adds listings fetched by search or by id to the cache so detail screens and adverts can find them. */
  cacheListings: (products?: Product[], services?: Service[]) => void;
  campaigns: Campaign[];
  requests: ServiceRequest[];
  balance: number;
  notifications: AppNotification[];
  unread: number;
  /** Listing ids the person has hearted. Kept on this phone. */
  favourites: string[];
  toggleFavourite: (id: string) => void;
  hq: HqData | null;
  refresh: () => Promise<void>;
  refreshHq: () => Promise<void>;
  /** Runs an action, refreshes data afterwards, and returns an error message instead of throwing. */
  run: (fn: () => Promise<unknown>) => Promise<string | null>;
}

const Ctx = createContext<AppState | null>(null);

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((x) => [x.id, x]));
  incoming.forEach((x) => byId.set(x.id, x));
  return [...byId.values()];
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo<Api>(() => (BACKEND_ENABLED ? supabaseApi : createDemoApi()), []);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [myServices, setMyServices] = useState<Service[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [balance, setBalance] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hq, setHq] = useState<HqData | null>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem('loka.favourites').then((v) => { if (v) { try { const a = JSON.parse(v); if (Array.isArray(a)) setFavourites(a.filter((x) => typeof x === 'string').slice(0, 200)); } catch { /* ignore */ } } }).catch(() => undefined);
  }, []);
  const toggleFavourite = useCallback((id: string) => {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 200);
      AsyncStorage.setItem('loka.favourites', JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);
  const profileRef = useRef<Profile | null>(null);

  const isStaff = !!profile && profile.roles.length > 0;

  const cacheListings = useCallback((p: Product[] = [], s: Service[] = []) => {
    if (p.length) setProducts((prev) => mergeById(prev, p));
    if (s.length) setServices((prev) => mergeById(prev, s));
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [p, catalog] = await Promise.all([api.getProfile(), api.loadCatalog()]);
      profileRef.current = p;
      setProfile(p);
      setProducts((prev) => mergeById(prev, catalog.products));
      setServices((prev) => mergeById(prev, catalog.services));
      if (p) {
        const mine = await api.loadMine(p);
        setMyProducts(mine.products);
        setMyServices(mine.services);
        setProducts((prev) => mergeById(prev, mine.products));
        setServices((prev) => mergeById(prev, mine.services));
        setCampaigns(mine.campaigns);
        setRequests(mine.requests);
        setBalance(mine.balance);
        setNotifications(await api.loadNotifications().catch(() => []));
      } else {
        setMyProducts([]); setMyServices([]); setCampaigns([]); setRequests([]); setBalance(0); setNotifications([]); setHq(null);
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
    api, mode: api.mode, ready, profile, isStaff, products, services, myProducts, myServices, cacheListings, campaigns, requests, balance, notifications, unread: notifications.filter((n) => !n.read).length, favourites, toggleFavourite, hq, refresh, refreshHq, run,
  }), [api, ready, profile, isStaff, products, services, myProducts, myServices, cacheListings, campaigns, requests, balance, notifications, favourites, toggleFavourite, hq, refresh, refreshHq, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
