/**
 * Supabase database client and queries for the streaming worker
 *
 * Simplified for internal tool - no subscription management, just account_state operations.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let supabase: SupabaseClient;

export function initDb(): SupabaseClient {
  supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  return supabase;
}

export function getDb(): SupabaseClient {
  if (!supabase) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return supabase;
}

// Types

export interface AccountState {
  program_id: string;
  pubkey: string;
  created_at?: string;
  slot: number;
  discriminator: string | null;
  change_type: "create" | "update" | "delete";
  data: string;
  data_hash: string;
}

// Queries

/**
 * Get the latest data hash for each pubkey (for change detection)
 * Uses the get_latest_hashes RPC function
 */
export async function getLatestHashes(
  programId: string,
  pubkeys: string[]
): Promise<Map<string, string>> {
  if (pubkeys.length === 0) return new Map();

  const { data, error } = await getDb().rpc("get_latest_hashes", {
    p_program_id: programId,
    p_pubkeys: pubkeys,
  });

  if (error) throw error;

  const hashMap = new Map<string, string>();
  for (const row of data || []) {
    hashMap.set(row.pubkey, row.data_hash);
  }
  return hashMap;
}

/**
 * Insert new account states (historical snapshots)
 */
export async function insertAccountStates(
  states: AccountState[]
): Promise<void> {
  if (states.length === 0) return;

  const { error } = await getDb().from("account_state").insert(states);

  if (error) throw error;
}
