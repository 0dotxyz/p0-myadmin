/**
 * RPC utilities for the daily indexer
 */

import "dotenv/config";
import { createSolanaRpc, address } from "@solana/kit";

// Configuration (lazy-loaded to ensure dotenv has run)
function getRpcUrl(): string {
  const url = process.env.RPC_URL;
  if (!url) {
    throw new Error("RPC_URL environment variable is required");
  }
  return url;
}

const BATCH_SIZE = parseInt(process.env.INDEXER_BATCH_SIZE || "100");
const RPC_DELAY_MS = parseInt(process.env.INDEXER_RPC_DELAY_MS || "100");

// Types
export interface AccountData {
  pubkey: string;
  data: Buffer;
  lamports: bigint;
}

/**
 * Create an RPC client
 */
export function getRpc() {
  return createSolanaRpc(getRpcUrl() as Parameters<typeof createSolanaRpc>[0]);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all pubkeys for a program (lightweight, no account data)
 * Uses dataSlice to only fetch pubkeys, not full account data
 */
export async function fetchProgramAccountKeys(
  programId: string
): Promise<string[]> {
  const rpc = getRpc();

  console.log(`[RPC] Fetching pubkeys for program: ${programId}`);

  try {
    const response = await rpc
      .getProgramAccounts(address(programId), {
        encoding: "base64",
        dataSlice: { offset: 0, length: 0 }, // Only fetch pubkeys, no data
      })
      .send();

    const pubkeys = response.map((account) => account.pubkey.toString());
    console.log(`[RPC] Found ${pubkeys.length} accounts for ${programId}`);

    return pubkeys;
  } catch (error) {
    console.error(`[RPC] Error fetching program accounts:`, error);
    throw error;
  }
}

/**
 * Fetch full account data for a list of pubkeys
 * Batches requests to avoid rate limits
 */
export async function fetchAccountData(
  pubkeys: string[]
): Promise<AccountData[]> {
  const rpc = getRpc();
  const results: AccountData[] = [];

  console.log(
    `[RPC] Fetching data for ${pubkeys.length} accounts in batches of ${BATCH_SIZE}`
  );

  // Process in batches
  for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
    const batch = pubkeys.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pubkeys.length / BATCH_SIZE);

    console.log(
      `[RPC] Batch ${batchNum}/${totalBatches}: fetching ${batch.length} accounts`
    );

    try {
      const response = await rpc
        .getMultipleAccounts(
          batch.map((pk) => address(pk)),
          { encoding: "base64" }
        )
        .send();

      for (let j = 0; j < batch.length; j++) {
        const account = response.value[j];
        if (account) {
          // Data comes as [base64String, "base64"]
          const dataArray = account.data as unknown as [string, string];
          const dataBuffer = Buffer.from(dataArray[0], "base64");

          results.push({
            pubkey: batch[j],
            data: dataBuffer,
            lamports: account.lamports,
          });
        }
      }

      // Rate limiting delay between batches
      if (i + BATCH_SIZE < pubkeys.length) {
        await sleep(RPC_DELAY_MS);
      }
    } catch (error) {
      console.error(`[RPC] Error fetching batch ${batchNum}:`, error);
      // Continue with next batch instead of failing entirely
      // Failed accounts won't be in results
    }
  }

  console.log(
    `[RPC] Successfully fetched ${results.length}/${pubkeys.length} accounts`
  );
  return results;
}


