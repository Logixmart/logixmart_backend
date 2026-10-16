import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './index';

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client (service role / secret key).
 * Use only in backend — never expose SUPABASE_SECRET_KEY to the frontend.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.'
    );
  }

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseSecretKey);
}

export const SUPABASE_IMAGE_BUCKET =
  process.env.SUPABASE_IMAGE_BUCKET?.trim() || 'user-images';
