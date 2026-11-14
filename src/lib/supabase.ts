import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BACKEND_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export const supabase: SupabaseClient | null = BACKEND_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

/** Stable anonymous id used for frequency caps and impression counting. Not linked to the user's identity. */
let viewerKey: string | null = null;
export async function getViewerKey(): Promise<string> {
  if (viewerKey) return viewerKey;
  try {
    const stored = await AsyncStorage.getItem('loka.viewer');
    if (stored && stored.length >= 8) { viewerKey = stored; return stored; }
  } catch { /* storage unavailable: fall through to a session-only key */ }
  const fresh = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  viewerKey = fresh;
  try { await AsyncStorage.setItem('loka.viewer', fresh); } catch { /* ignore */ }
  return fresh;
}
