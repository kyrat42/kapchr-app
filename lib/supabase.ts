import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// These values come from your Supabase project dashboard.
// EXPO_PUBLIC_ prefix makes them available in client-side code.
// They are NOT secret (the anon key is safe to expose), but we still
// use env vars so they're easy to swap between dev/staging/production.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Custom storage adapter so Supabase auth tokens are saved in the device's
// encrypted keystore (SecureStore) instead of plain AsyncStorage.
// This is the same security level as banking apps.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,   // silently refreshes the JWT before it expires
    persistSession: true,     // remembers login across app restarts
    detectSessionInUrl: false, // must be false for React Native (no browser URL)
  },
});
