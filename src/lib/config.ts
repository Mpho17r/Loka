// Set these in a local .env file (see .env.example). With them unset the app runs in DEMO mode on sample data.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const BACKEND_ENABLED = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
export const DEFAULT_COUNTRY = 'ZA';
