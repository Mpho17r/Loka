import { useEffect, useState } from 'react';
import { useApp } from '../store/AppState';
import type { Product, Service } from '../types';

/** A product from the cache, or fetched by id (for example when opened from an advert or a link). */
export function useProduct(id: string | undefined): { item: Product | undefined; loading: boolean } {
  const { api, products, cacheListings } = useApp();
  const cached = id ? products.find((p) => p.id === id) : undefined;
  const [loading, setLoading] = useState(!cached && !!id);
  useEffect(() => {
    if (!id || cached) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    api.getProduct(id).then((p) => { if (live && p) cacheListings([p]); }).catch(() => undefined).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, id, cached, cacheListings]);
  return { item: cached, loading };
}

export function useService(id: string | undefined): { item: Service | undefined; loading: boolean } {
  const { api, services, cacheListings } = useApp();
  const cached = id ? services.find((s) => s.id === id) : undefined;
  const [loading, setLoading] = useState(!cached && !!id);
  useEffect(() => {
    if (!id || cached) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    api.getService(id).then((s) => { if (live && s) cacheListings(undefined, [s]); }).catch(() => undefined).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, id, cached, cacheListings]);
  return { item: cached, loading };
}
