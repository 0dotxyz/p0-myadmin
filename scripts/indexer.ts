/**
 * Indexer Script
 *
 * Seeds account baselines for the marginfi programs into the account_state table.
 *
 * First run: Fetches all accounts with full data
 * Subsequent runs: Only fetches and stores new accounts
 *
 * Usage:
 *   pnpm indexer                          # Index all programs
 *   pnpm indexer --program=marginfi       # Index specific program
 *   pnpm indexer --dry-run                # Report what would be indexed
 */

import "dotenv/config";
import { fetchProgramAccountKeys, fetchAccountData } from "./lib/rpc";
import {
  PROGRAMS,
  ProgramKey,
  getExistingPubkeys,
  storeBaselines,
} from "./lib/db";

// Parse CLI arguments
function parseArgs(): { program?: ProgramKey; dryRun: boolean } {
  const args = process.argv.slice(2);
  let program: ProgramKey | undefined;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith("--program=")) {
      const value = arg.split("=")[1] as ProgramKey;
      if (value in PROGRAMS) {
        program = value;
      } else {
        console.error(`Invalid program: ${value}`);
        console.error(`Valid programs: ${Object.keys(PROGRAMS).join(", ")}`);
        process.exit(1);
      }
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { program, dryRun };
}

/**
 * Index a single program
 */
async function indexProgram(
  programKey: ProgramKey,
  dryRun: boolean,
): Promise<{ added: number; total: number }> {
  const config = PROGRAMS[programKey];
  const programId = config.programId;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Indexing: ${programKey}`);
  console.log(`Program ID: ${programId}`);
  console.log(`${"=".repeat(60)}`);

  // Check existing baselines
  const existingPubkeys = await getExistingPubkeys(programId);
  const isFirstRun = existingPubkeys.size === 0;

  console.log(`Existing accounts in DB: ${existingPubkeys.size}`);
  console.log(`Mode: ${isFirstRun ? "Initial seed" : "Incremental update"}`);

  // Fetch all pubkeys from RPC
  console.log(`Fetching current pubkeys from RPC...`);
  const currentPubkeys = await fetchProgramAccountKeys(programId);
  console.log(`Found ${currentPubkeys.length} accounts on-chain`);

  // Find accounts we need to index
  const pubkeysToIndex = isFirstRun
    ? currentPubkeys
    : currentPubkeys.filter((pk) => !existingPubkeys.has(pk));

  console.log(
    `Accounts to index: ${pubkeysToIndex.length}${isFirstRun ? " (initial seed)" : " (new accounts)"}`,
  );

  if (pubkeysToIndex.length === 0) {
    console.log(`No accounts to index`);
    return { added: 0, total: currentPubkeys.length };
  }

  if (dryRun) {
    console.log(`[Dry Run] Would index ${pubkeysToIndex.length} accounts`);
    return { added: pubkeysToIndex.length, total: currentPubkeys.length };
  }

  // Fetch data for accounts in batches
  const accountData = await fetchAccountData(pubkeysToIndex);
  console.log(`Fetched data for ${accountData.length} accounts`);

  if (accountData.length > 0) {
    await storeBaselines(programId, accountData);
    console.log(`Stored ${accountData.length} baselines`);
  }

  return { added: accountData.length, total: currentPubkeys.length };
}

/**
 * Main entry point
 */
async function main() {
  console.log("=".repeat(60));
  console.log("SolanaMyAdmin Indexer");
  console.log("=".repeat(60));

  const { program, dryRun } = parseArgs();

  if (dryRun) {
    console.log(">>> DRY RUN MODE - No changes will be made <<<\n");
  }

  // Determine which programs to index
  const programsToIndex: ProgramKey[] = program
    ? [program]
    : (Object.keys(PROGRAMS) as ProgramKey[]);

  console.log(`Programs to index: ${programsToIndex.join(", ")}`);

  const results: Array<{
    program: string;
    added: number;
    total: number;
    error?: string;
  }> = [];

  for (const programKey of programsToIndex) {
    try {
      const result = await indexProgram(programKey, dryRun);
      results.push({
        program: programKey,
        added: result.added,
        total: result.total,
      });
    } catch (error) {
      console.error(`Error indexing program ${programKey}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      results.push({
        program: programKey,
        added: 0,
        total: 0,
        error: errorMessage,
      });
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("INDEXING SUMMARY");
  console.log("=".repeat(60));

  let totalAdded = 0;
  let totalAccounts = 0;
  let errors = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`${result.program}: ERROR - ${result.error}`);
      errors++;
    } else {
      console.log(
        `${result.program}: +${result.added} new (${result.total} total)`,
      );
      totalAdded += result.added;
      totalAccounts += result.total;
    }
  }

  console.log("---");
  console.log(`Programs processed: ${programsToIndex.length}`);
  console.log(`Total accounts indexed: ${totalAdded}`);
  console.log(`Total accounts tracked: ${totalAccounts}`);
  console.log(`Errors: ${errors}`);

  if (dryRun) {
    console.log("\n>>> DRY RUN COMPLETE - No changes were made <<<");
  }

  console.log("=".repeat(60));
}

// Run
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
