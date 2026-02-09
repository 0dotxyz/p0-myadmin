import { utils } from "@coral-xyz/anchor";
import BN from "bn.js";
import { DataService } from "@/lib/solana/data-service";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface EnrichedPubkey {
  __isEnriched: true;
  pubkey: string;
  // Token-specific fields (if __type === 'token')
  __type?: "token" | "labeled";
  mint?: string;
  symbol?: string;
  decimals?: number;
  balance?: string;
  logoURI?: string;
  name?: string;
  // Label-specific field (if __type === 'labeled' or label exists on token)
  label?: string;
}

// Backward compatibility alias
export type TokenValue = EnrichedPubkey;

function base64ToBytes(base64: string): Uint8Array {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decode error", e);
    return new Uint8Array(0);
  }
}

// Extract all valid Pubkeys from the decoded data
export function extractPubkeys(data: unknown): Set<string> {
  const pubkeys = new Set<string>();

  function traverse(obj: unknown) {
    if (typeof obj === "string") {
      if (BASE58_REGEX.test(obj)) {
        pubkeys.add(obj);
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    if (typeof obj === "object" && obj !== null) {
      Object.values(obj as Record<string, unknown>).forEach(traverse);
    }
  }

  traverse(data);
  return pubkeys;
}

// Helper to format amount with decimals
function formatAmount(amount: BN, decimals: number): string {
  if (decimals === 0) return amount.toString();

  const divisor = new BN(10).pow(new BN(decimals));
  const integerPart = amount.div(divisor);
  const fractionalPart = amount.mod(divisor);

  let fracStr = fractionalPart.toString().padStart(decimals, "0");
  fracStr = fracStr.replace(/0+$/, "");

  if (fracStr.length > 0) {
    return `${integerPart.toString()}.${fracStr}`;
  }
  return integerPart.toString();
}

// Fetch account info and decode token balances
export async function fetchEnrichmentMap(
  pubkeys: Set<string>,
  getLabel?: (pubkey: string) => string | undefined
): Promise<Map<string, EnrichedPubkey>> {
  const enrichmentMap = new Map<string, EnrichedPubkey>();
  const keys = Array.from(pubkeys);

  if (keys.length === 0) return enrichmentMap;

  // Process in chunks of 100 potential keys
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    
    let chunkInfos: ({ data: [string, string]; owner: string } | null)[] = [];

    try {
       const { value } = await DataService.fetchAccountInfo(chunk);
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       chunkInfos = value as any;
    } catch (e) {
        console.error("Enrichment fetch failed", e);
        chunkInfos = new Array(chunk.length).fill(null);
    }

    interface TokenAccountData {
      pubkey: string;
      mint: string;
      amount: BN;
    }

    const tokenAccounts: TokenAccountData[] = [];
    const mintAccounts: string[] = [];
    const uniqueMints = new Set<string>();

    // Identify Token Accounts vs Mint Accounts
    for (let j = 0; j < chunkInfos.length; j++) {
      const info = chunkInfos[j];
      const pubkeyStr = chunk[j];

      if (!info) continue;

      const owner = info.owner;
      if (owner === TOKEN_PROGRAM_ID || owner === TOKEN_2022_PROGRAM_ID) {
        // DataService ensures data is [base64_string, "base64"]
        const dataBase64 = info.data[0];
        const dataBuf = base64ToBytes(dataBase64);
        const len = dataBuf.length;

        let isTokenAccount = false;
        let isMint = false;

        if (len === 165) {
          isTokenAccount = true;
        } else if (len === 82) {
          isMint = true;
        } else if (owner === TOKEN_2022_PROGRAM_ID) {
          // Token 2022 can have variable lengths due to extensions
          if (len >= 82 && len < 165) {
            // Mint is min 82, Account is min 165. So this must be a Mint.
            isMint = true;
          } else if (len > 165) {
            // Could be Account or Mint. Check MintAuthorityOption heuristic.
            // MintAuthorityOption (u32) is at offset 0. Values: 0 (None) or 1 (Some).
            // Safe u32 read
            const opt =
              dataBuf[0] |
              (dataBuf[1] << 8) |
              (dataBuf[2] << 16) |
              (dataBuf[3] << 24);

            const isMintOption =
              (opt === 0 || opt === 1) &&
              // Extra safety: bytes 1,2,3 must be 0 if val is 0 or 1
              dataBuf[1] === 0 &&
              dataBuf[2] === 0 &&
              dataBuf[3] === 0;

            if (isMintOption) {
              isMint = true;
            } else {
              isTokenAccount = true;
            }
          }
        }

        if (isTokenAccount) {
          // It's a Token Account
          const mintBuf = dataBuf.subarray(0, 32);
          // Use as any because bs58 types might expect Buffer but we have Uint8Array/Buffer
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mint = utils.bytes.bs58.encode(mintBuf as any);

          const amountBuf = dataBuf.subarray(64, 72);
          const amount = new BN(Array.from(amountBuf), "le");

          tokenAccounts.push({ pubkey: pubkeyStr, mint, amount });
          uniqueMints.add(mint);
        } else if (isMint) {
          // It's a Mint Account
          mintAccounts.push(pubkeyStr);
          uniqueMints.add(pubkeyStr);
        }
      }
    }

    if (uniqueMints.size === 0) continue;

    // Fetch Metadata from Birdeye API
    const mintsList = Array.from(uniqueMints);
    const mintInfoMap = new Map<
      string,
      { symbol: string; decimals: number; logoURI?: string; name?: string }
    >();

    // Batch calls to API (Birdeye limit 50)
    const apiChunks: string[][] = [];
    for (let k = 0; k < mintsList.length; k += 50) {
      apiChunks.push(mintsList.slice(k, k + 50));
    }

    for (const apiChunk of apiChunks) {
      try {
        const query = apiChunk.join(",");
        const res = await fetch(`/api/token-metadata?list=${query}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            for (const mint of apiChunk) {
              const meta = json.data[mint];
              if (meta) {
                mintInfoMap.set(mint, {
                  symbol: meta.symbol || "Unknown",
                  decimals: meta.decimals || 0,
                  logoURI: meta.logo_uri || meta.logoURI,
                  name: meta.name,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch metadata from API", e);
      }
    }

    // Enrich Token Accounts (Symbol Balance)
    for (const ta of tokenAccounts) {
      let info = mintInfoMap.get(ta.mint);
      if (!info) {
        info = { symbol: "Unknown", decimals: 0, logoURI: undefined };
      }

      const amountStr = formatAmount(ta.amount, info.decimals);

      const s = String(amountStr);
      const dotIndex = s.indexOf(".");
      let intPart = s;
      let fracPart = "";

      if (dotIndex !== -1) {
        intPart = s.substring(0, dotIndex);
        fracPart = s.substring(dotIndex + 1);
      }

      const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const finalAmt = fracPart
        ? `${intWithCommas}.${fracPart}`
        : intWithCommas;

      const label = getLabel ? getLabel(ta.pubkey) : undefined;
      enrichmentMap.set(ta.pubkey, {
        __isEnriched: true,
        __type: "token",
        mint: ta.mint,
        pubkey: ta.pubkey,
        symbol: info.symbol,
        decimals: info.decimals,
        balance: finalAmt,
        logoURI: info.logoURI,
        name: info.name,
        label,
      });
    }

    // Enrich Mint Accounts (Symbol Only)
    for (const mintPubkey of mintAccounts) {
      let info = mintInfoMap.get(mintPubkey);
      if (!info) {
        info = { symbol: "Unknown", decimals: 0, logoURI: undefined };
      }

      const label = getLabel ? getLabel(mintPubkey) : undefined;
      enrichmentMap.set(mintPubkey, {
        __isEnriched: true,
        __type: "token",
        mint: mintPubkey,
        pubkey: mintPubkey,
        symbol: info.symbol,
        decimals: info.decimals,
        logoURI: info.logoURI,
        name: info.name,
        label,
      });
    }
  }

  // Enrich labeled pubkeys that aren't tokens
  if (getLabel) {
    for (const pubkey of pubkeys) {
      if (!enrichmentMap.has(pubkey)) {
        const label = getLabel(pubkey);
        if (label) {
          enrichmentMap.set(pubkey, {
            __isEnriched: true,
            __type: "labeled",
            pubkey,
            label,
          });
        }
      } else {
        // Token already enriched, but check if it also has a label
        const existing = enrichmentMap.get(pubkey);
        if (existing) {
          const label = getLabel(pubkey);
          if (label) {
            existing.label = label;
          }
        }
      }
    }
  }

  return enrichmentMap;
}

// Strip enrichment from data, converting enriched objects back to plain pubkey strings
// Useful for diff comparison where we want to compare raw values without enrichment metadata
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripEnrichment(data: any): any {
  if (data === null || data === undefined) return data;

  // Check if this is an enriched pubkey object
  if (
    typeof data === "object" &&
    data !== null &&
    "__isEnriched" in data &&
    data.__isEnriched === true &&
    "pubkey" in data
  ) {
    // Return just the pubkey string
    return data.pubkey;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => stripEnrichment(item));
  }

  // Handle objects
  if (typeof data === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: any = {};
    for (const key in data) {
      newObj[key] = stripEnrichment(data[key]);
    }
    return newObj;
  }

  return data;
}

// Inject enrichment strings into the data
// We use 'any' here because the data structure is recursive and dynamic (parsed IDL data)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function injectEnrichment(data: any, map: Map<string, EnrichedPubkey>): any {
  if (typeof data === "string") {
    if (map.has(data)) {
      // Return the TokenValue object directly for custom rendering
      return map.get(data);
    }

    // Handle cases where data might have been pre-formatted
    const match = data.match(/\((.*)\)$/);
    if (match && map.has(match[1])) {
      return map.get(match[1]);
    }

    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => injectEnrichment(item, map));
  }

  if (typeof data === "object" && data !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: any = {};
    for (const key in data) {
      newObj[key] = injectEnrichment(data[key], map);
    }
    return newObj;
  }

  return data;
}
