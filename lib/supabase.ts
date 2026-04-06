import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ─── Chunked SecureStore Adapter ─────────────────────────────────────────────
// SecureStore has a hard 2048-byte limit per key.
// Supabase session tokens frequently exceed this limit.
// Solution: split large values across numbered keys (key.0, key.1, key.2 ...)
// and reassemble them on read. Fully transparent to Supabase.

const CHUNK_SIZE = 1800; // Safe margin under the 2048 limit

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const chunks: string[] = [];
    let index = 0;
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}.${index}`);
      if (chunk === null) break;
      chunks.push(chunk);
      index++;
    }
    return chunks.length > 0 ? chunks.join('') : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    // Write all chunks in parallel for speed
    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk))
    );
    // Clean up leftover chunks if a previous value was longer
    let cleanupIndex = chunks.length;
    while (true) {
      const leftover = await SecureStore.getItemAsync(`${key}.${cleanupIndex}`);
      if (leftover === null) break;
      await SecureStore.deleteItemAsync(`${key}.${cleanupIndex}`);
      cleanupIndex++;
    }
  },

  async removeItem(key: string): Promise<void> {
    let index = 0;
    while (true) {
      const exists = await SecureStore.getItemAsync(`${key}.${index}`);
      if (exists === null) break;
      await SecureStore.deleteItemAsync(`${key}.${index}`);
      index++;
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
