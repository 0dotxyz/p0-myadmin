/**
 * Cleanup job for pruning old account changes
 *
 * Keeps only the last N changes per account (default: 10)
 * Run via cron: hourly or daily depending on volume
 *
 * Schema note: account_state has composite PK (program_id, pubkey, created_at)
 */

import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { PROGRAMS } from "./config";

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_CHANGES_PER_ACCOUNT = parseInt(
  process.env.MAX_CHANGES_PER_ACCOUNT || "10"
);
const BATCH_SIZE = 1000; // Process this many accounts per batch

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

async function main() {
  console.log("=".repeat(50));
  console.log("SolanaMyAdmin Cleanup Job");
  console.log("=".repeat(50));
  console.log(`Max changes per account: ${MAX_CHANGES_PER_ACCOUNT}`);
  console.log(`Programs: ${Object.keys(PROGRAMS).join(", ")}`);

  // Validate config
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const startTime = Date.now();
  let totalDeleted = 0;
  let totalAccountsProcessed = 0;

  try {
    // Process each program
    for (const program of Object.values(PROGRAMS)) {
      console.log(`\nProcessing program: ${program.id}`);
      const { deleted, accounts } = await cleanupProgram(
        supabase,
        program.programId
      );
      totalDeleted += deleted;
      totalAccountsProcessed += accounts;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "=".repeat(50));
    console.log("Cleanup complete");
    console.log(`Accounts processed: ${totalAccountsProcessed}`);
    console.log(`Records deleted: ${totalDeleted}`);
    console.log(`Time elapsed: ${elapsed}s`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("Cleanup job failed:", error);
    process.exit(1);
  }
}

/**
 * Cleanup a single program's account states
 */
async function cleanupProgram(
  supabase: AnySupabaseClient,
  programId: string
): Promise<{ deleted: number; accounts: number }> {
  let totalDeleted = 0;
  let totalAccounts = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Get distinct pubkeys for this program with pagination
    const { data: pubkeys, error: queryError } = await supabase
      .from("account_state")
      .select("pubkey")
      .eq("program_id", programId)
      .order("pubkey")
      .range(offset, offset + BATCH_SIZE - 1);

    if (queryError) {
      throw queryError;
    }

    if (!pubkeys || pubkeys.length === 0) {
      hasMore = false;
      continue;
    }

    // Deduplicate pubkeys (there may be multiple rows per pubkey)
    const uniquePubkeys = [...new Set(pubkeys.map((r) => r.pubkey))];

    console.log(
      `  Batch offset ${offset}: checking ${uniquePubkeys.length} accounts`
    );

    for (const pubkey of uniquePubkeys) {
      const deleted = await pruneAccountChanges(supabase, programId, pubkey);
      if (deleted > 0) {
        totalDeleted += deleted;
        totalAccounts++;
      }
    }

    hasMore = pubkeys.length >= BATCH_SIZE;
    offset += BATCH_SIZE;
  }

  console.log(
    `  Program ${programId.slice(0, 8)}...: pruned ${totalAccounts} accounts, deleted ${totalDeleted} records`
  );
  return { deleted: totalDeleted, accounts: totalAccounts };
}

/**
 * Prune a single account to keep only the latest N changes
 * 
 * Optimized: Uses a single delete with lt() comparison on the cutoff timestamp
 * instead of deleting each row individually.
 */
async function pruneAccountChanges(
  supabase: AnySupabaseClient,
  programId: string,
  pubkey: string
): Promise<number> {
  // Get the Nth newest timestamp (the cutoff point)
  const { data: keepStates, error: selectError } = await supabase
    .from("account_state")
    .select("created_at")
    .eq("program_id", programId)
    .eq("pubkey", pubkey)
    .order("created_at", { ascending: false })
    .limit(MAX_CHANGES_PER_ACCOUNT);

  if (selectError) {
    console.error(`Error selecting changes for ${pubkey}:`, selectError);
    return 0;
  }

  if (!keepStates || keepStates.length < MAX_CHANGES_PER_ACCOUNT) {
    // Account doesn't have more than max, nothing to delete
    return 0;
  }

  // The oldest timestamp we want to keep
  const cutoffTimestamp = keepStates[keepStates.length - 1].created_at;

  // Delete all states older than the cutoff in a single query
  const { error: deleteError, count } = await supabase
    .from("account_state")
    .delete({ count: "exact" })
    .eq("program_id", programId)
    .eq("pubkey", pubkey)
    .lt("created_at", cutoffTimestamp);

  if (deleteError) {
    console.error(`Error deleting old states for ${pubkey}:`, deleteError);
    return 0;
  }

  const deleted = count || 0;
  if (deleted > 0) {
    console.log(
      `    Pruned ${pubkey.slice(0, 8)}...: deleted ${deleted} old states`
    );
  }
  return deleted;
}

// Run the cleanup
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
