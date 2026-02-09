/**
 * Database utilities for the indexer
 * 
 * Simplified for the two hardcoded marginfi programs.
 */

import dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// Load environment variables
dotenv.config({ path: ".env.local" });

// Configuration
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
  );
}

// Program configuration - must match src/lib/config/programs.ts
export const PROGRAMS = {
  marginfi: {
    id: "marginfi",
    programId: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  },
  "marginfi-staging": {
    id: "marginfi-staging",
    programId: "stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct",
  },
} as const;

export type ProgramKey = keyof typeof PROGRAMS;

export interface AccountStateInput {
  pubkey: string;
  program_id: string;
  discriminator: string | null;
  slot: number;
  change_type: "create" | "update" | "delete";
  data: string; // base64 encoded
  data_hash: string;
}

// Singleton client
let supabase: SupabaseClient;

/**
 * Initialize and get the Supabase client
 */
export function getDb(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  }
  return supabase;
}

/**
 * Get all existing pubkeys for a program from account_state
 */
export async function getExistingPubkeys(
  programId: string,
): Promise<Set<string>> {
  const pubkeys = new Set<string>();
  let offset = 0;
  const batchSize = 1000;

  console.log(`[DB] Fetching existing pubkeys for ${programId.slice(0, 8)}...`);

  while (true) {
    const { data, error } = await getDb()
      .from("account_state")
      .select("pubkey")
      .eq("program_id", programId)
      .range(offset, offset + batchSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      pubkeys.add(row.pubkey);
    }

    // Log progress every 10k pubkeys
    if (pubkeys.size % 10000 === 0) {
      console.log(`[DB] Fetched ${pubkeys.size} pubkeys so far...`);
    }

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`[DB] Found ${pubkeys.size} existing pubkeys`);
  return pubkeys;
}

/**
 * Store account baselines in account_state
 * @param programId - The program ID (Solana address)
 * @param accounts - Array of { pubkey, data } objects where data is a Buffer
 */
export async function storeBaselines(
  programId: string,
  accounts: Array<{ pubkey: string; data: Buffer }>,
): Promise<void> {
  if (accounts.length === 0) return;

  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);

    const rows: AccountStateInput[] = batch.map((account) => {
      // Extract discriminator (first 8 bytes as hex)
      const discriminator =
        account.data.length >= 8
          ? account.data.subarray(0, 8).toString("hex")
          : null;

      // Compute hash
      const dataHash = createHash("sha256").update(account.data).digest("hex");

      return {
        pubkey: account.pubkey,
        program_id: programId,
        discriminator,
        slot: 0, // 0 indicates indexer-created baseline
        change_type: "create",
        data: account.data.toString("base64"),
        data_hash: dataHash,
      };
    });

    const { error } = await getDb().from("account_state").insert(rows);

    if (error) {
      console.error(`[DB] Error inserting batch at offset ${i}:`, error);
      throw error;
    }

    inserted += batch.length;
    console.log(`[DB] Inserted ${inserted}/${accounts.length} baselines`);
  }
}
