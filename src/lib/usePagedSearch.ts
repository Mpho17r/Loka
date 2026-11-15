import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '../data/api';
import { friendlyError } from './errors';

/**
 * Debounced, paged server search. Pass a stable `key` that changes whenever the query changes (search text, filters).
 * Responses to an older query are ignored, so fast typing can never show stale results.
 */
export function usePagedSearch<T extends { id: string }>(
  fetchPage: (offset: number) => Promise<Page<T>>,
  key: string,
  debounceMs = 300,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const itemsRef = useRef<T[]>([]);
  itemsRef.current = items;

  const load = useCallback((immediate: boolean) => {
    const gen = ++generation.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const page = await fetchRef.current(0);
        if (gen !== generation.current) return;
        setItems(page.items);
        setHasMore(page.hasMore);
      } catch (e) {
        if (gen === generation.current) setError(friendlyError(e));
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    }, immediate ? 0 : debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(false), [key]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const page = await fetchRef.current(itemsRef.current.length);
      if (gen !== generation.current) return;
      // new listings can arrive between pages, so drop anything we already have
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...page.items.filter((x) => !seen.has(x.id))];
      });
      setHasMore(page.hasMore);
    } catch (e) {
      if (gen === generation.current) setError(friendlyError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore]);

  const retry = useCallback(() => { load(true); }, [load]);

  return { items, loading, loadingMore, hasMore, error, loadMore, retry };
}
