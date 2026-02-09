/**
 * Data Service
 *
 * Provides methods for fetching account data from RPC and the database.
 */

import { Idl } from "@coral-xyz/anchor";

// Define return types that match our existing API/State structures
export interface AccountInfoResult {
  value: ({
    data: [string, string];
    executable: boolean;
    lamports: number;
    owner: string;
    rentEpoch: number;
  } | null)[];
}

export class DataService {
  /**
   * Fetch account info for a list of pubkeys from RPC.
   * Used by the enricher for token balance lookups.
   */
  static async fetchAccountInfo(
    pubkeys: string[]
  ): Promise<AccountInfoResult> {
    // Return empty result for empty input instead of hitting the API
    if (!pubkeys || pubkeys.length === 0) {
      return { value: [] };
    }

    const res = await fetch("/api/rpc/account-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkeys }),
    });

    if (!res.ok) throw new Error("Failed to fetch account info");
    return await res.json();
  }

  /**
   * Fetch list of accounts for a given program and type from the database.
   *
   * This queries the account_state table which is populated by the indexer.
   * Supports filtering by discriminator (account type) and search.
   *
   * @param programId - Solana program address
   * @param type - Account type name from IDL
   * @param idl - Anchor IDL for the program
   * @param authToken - Optional auth token for user-specific label search
   * @param options.search - Optional search query (pubkey prefix or label text)
   * @param options.program - Program key (marginfi or marginfi-staging) for label search
   */
  static async fetchProgramAccounts(
    programId: string,
    type: string,
    idl: Idl,
    authToken?: string | null,
    options?: {
      search?: string;
      program?: string;
    }
  ): Promise<string[]> {
    const { search, program } = options || {};

    // Get discriminator for the account type
    const accountDef = idl.accounts?.find((a) => a.name === type);
    if (!accountDef) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discriminator = (accountDef as any).discriminator;
    const discriminatorHex = discriminator
      ? Buffer.from(discriminator).toString("hex")
      : null;

    // Handle label search via /api/search
    // If search is short (< 32 chars) and looks like a label, use search API
    if (search && program && search.length < 32) {
      try {
        const headers: HeadersInit = {};
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const params = new URLSearchParams({
          program,
          q: search,
          limit: "100",
        });

        const res = await fetch(`/api/search?${params.toString()}`, { headers });

        if (res.ok) {
          const data = await res.json();
          // Return pubkeys that match the label search
          return (data.results || []).map((r: { pubkey: string }) => r.pubkey);
        }
      } catch (e) {
        console.error("Label search error:", e);
      }
      return [];
    }

    // Build query params for the accounts endpoint
    const params = new URLSearchParams({ programId });

    if (discriminatorHex) {
      params.set("discriminator", discriminatorHex);
    }

    // Handle pubkey prefix search
    if (search) {
      params.set("search", search);
    }

    // Query the database via API
    const res = await fetch(`/api/accounts?${params.toString()}`);

    if (!res.ok) {
      console.error("Failed to fetch accounts from database");
      return [];
    }

    const data = await res.json();
    return data.pubkeys || [];
  }
}
