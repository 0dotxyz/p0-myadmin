/**
 * Cleanup job for pruning old account changes
 *
 * Keeps only the last N changes per account (default: 10)
 * Run via cron: daily at 3 AM
 *
 * Uses a PostgreSQL function with window functions to delete all excess
 * records in a single query, rather than iterating through accounts.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAX_CHANGES_PER_ACCOUNT = parseInt(
  process.env.MAX_CHANGES_PER_ACCOUNT || "10"
);

async function main() {
  console.log("=".repeat(50));
  console.log("SolanaMyAdmin Cleanup Job");
  console.log("=".repeat(50));
  console.log(`Max changes per account: ${MAX_CHANGES_PER_ACCOUNT}`);

  // Validate config
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const startTime = Date.now();

  try {
    console.log("\nCalling cleanup_account_states()...");

    const { data, error } = await supabase.rpc("cleanup_account_states", {
      max_changes: MAX_CHANGES_PER_ACCOUNT,
    });

    if (error) {
      throw error;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "=".repeat(50));
    console.log("Cleanup complete");
    console.log(`Records deleted: ${data}`);
    console.log(`Time elapsed: ${elapsed}s`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("Cleanup job failed:", error);
    process.exit(1);
  }
}

// Run the cleanup
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
