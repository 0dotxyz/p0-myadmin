import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Only warn if not in build/test environment
  if (process.env.NODE_ENV !== 'test') {
      console.warn("Supabase credentials missing. DB features will fail.");
  }
}

// Use anon key only - service role key should never be in shared client
// Service role bypasses RLS and should only be used in specific server-only contexts
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Create a per-request Supabase client with the user's JWT forwarded.
 * This ensures auth.uid() resolves correctly in RLS policies.
 * Use this in API routes instead of the shared singleton for authenticated operations.
 */
export function createAuthenticatedClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * Create a Supabase client with the service role key (bypasses RLS).
 * Use only for server-side system operations (e.g. indexer, worker).
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(SUPABASE_URL, serviceKey);
}


