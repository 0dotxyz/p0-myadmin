"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Idl, BorshAccountsCoder } from "@coral-xyz/anchor";
import { parseData } from "@/lib/utils/formatter";
import {
  extractPubkeys,
  fetchEnrichmentMap,
  injectEnrichment,
  EnrichedPubkey,
} from "@/lib/utils/enricher";
import type { ProgramId } from "@/lib/config";
import { getAccountTypeFromDiscriminator } from "@/lib/config/idl";

/**
 * Historical snapshot of account state
 */
export interface AccountHistoryEntry {
  slot: number;
  createdAt: string;
  changeType: "create" | "update" | "delete";
  data: string; // base64 encoded
}

/**
 * Decoded account data with metadata
 */
export interface DecodedAccountData {
  // Raw decoded data (before enrichment)
  raw: unknown;
  // Enriched data (with token/label info injected)
  enriched: unknown;
  // Account type from IDL
  accountType: string;
  // Slot when this data was captured
  slot?: number;
  // When this snapshot was captured
  capturedAt?: string;
}

interface UseAccountDataResult {
  // Current account data (latest)
  data: DecodedAccountData | null;
  // Historical snapshots
  history: AccountHistoryEntry[];
  // Loading states
  loading: boolean;
  historyLoading: boolean;
  // Error state
  error: string | null;
  // Refetch current data
  refetch: () => Promise<void>;
  // Decode a historical snapshot
  decodeHistoricData: (entry: AccountHistoryEntry) => DecodedAccountData | null;
  // Enrichment map for labels
  enrichmentMap: Map<string, EnrichedPubkey>;
}

/**
 * Hook for fetching and decoding a single account's data
 * 
 * Fetches the latest account state from the database, decodes it using
 * the IDL's BorshAccountsCoder, and enriches pubkeys with token/label info.
 * Also supports fetching and decoding historical snapshots.
 * 
 * If accountType is not provided, it will be auto-detected from the discriminator.
 */
export function useAccountData(
  programId: ProgramId,
  pubkey: string | null,
  accountType: string | null,
  idl: Idl,
  getLabel?: (pubkey: string) => string | undefined
): UseAccountDataResult {
  const [data, setData] = useState<DecodedAccountData | null>(null);
  const [history, setHistory] = useState<AccountHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichmentMap, setEnrichmentMap] = useState<Map<string, EnrichedPubkey>>(
    new Map()
  );
  // Track the detected account type when not provided
  const [detectedType, setDetectedType] = useState<string | null>(null);
  
  // Use provided type or detected type
  const effectiveType = accountType || detectedType;

  // Create coder from IDL
  const coder = useMemo(() => {
    try {
      return new BorshAccountsCoder(idl);
    } catch (e) {
      console.error("Failed to create BorshAccountsCoder:", e);
      return null;
    }
  }, [idl]);

  // Decode raw base64 data into structured account data
  const decodeData = useCallback(
    (base64Data: string, type: string): unknown | null => {
      if (!coder) return null;

      try {
        const dataBuffer = Buffer.from(base64Data, "base64");
        const decoded = coder.decode(type, dataBuffer);
        return parseData(decoded);
      } catch (e) {
        console.error("Failed to decode account data:", e);
        return null;
      }
    },
    [coder]
  );

  // Fetch and enrich data
  const fetchAccountData = useCallback(async () => {
    if (!pubkey || !coder) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/accounts/${pubkey}?program=${programId}`
      );

      if (!res.ok) {
        if (res.status === 404) {
          setData(null);
          setError("Account not found");
          return;
        }
        throw new Error("Failed to fetch account data");
      }

      const result = await res.json();
      
      if (!result.data) {
        setData(null);
        setError("No data available");
        return;
      }

      // Determine account type - use provided or detect from discriminator
      let typeToUse = accountType;
      if (!typeToUse && result.discriminator) {
        const discBuffer = Buffer.from(result.discriminator, "hex");
        typeToUse = getAccountTypeFromDiscriminator(programId, discBuffer);
        if (typeToUse) {
          setDetectedType(typeToUse);
        }
      }

      if (!typeToUse) {
        setError("Could not determine account type");
        return;
      }

      // Decode the data
      const raw = decodeData(result.data, typeToUse);
      if (!raw) {
        setError("Failed to decode account data");
        return;
      }

      // Extract pubkeys and fetch enrichment
      const pubkeys = extractPubkeys(raw);
      const enrichMap = await fetchEnrichmentMap(pubkeys, getLabel);
      setEnrichmentMap(enrichMap);

      // Inject enrichment into data
      const enriched = injectEnrichment(raw, enrichMap);

      setData({
        raw,
        enriched,
        accountType: typeToUse,
        slot: result.slot,
        capturedAt: result.createdAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [programId, pubkey, accountType, coder, decodeData, getLabel]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!pubkey) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);

    try {
      const res = await fetch(
        `/api/accounts/${pubkey}/history?program=${programId}`
      );

      if (!res.ok) {
        console.error("Failed to fetch history");
        setHistory([]);
        return;
      }

      const result = await res.json();
      setHistory(result.history || []);
    } catch (e) {
      console.error("Error fetching history:", e);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [programId, pubkey]);

  // Decode a historical snapshot
  const decodeHistoricData = useCallback(
    (entry: AccountHistoryEntry): DecodedAccountData | null => {
      if (!effectiveType || !coder) return null;

      const raw = decodeData(entry.data, effectiveType);
      if (!raw) return null;

      // Use existing enrichment map (don't refetch for historic data)
      const enriched = injectEnrichment(raw, enrichmentMap);

      return {
        raw,
        enriched,
        accountType: effectiveType,
        slot: entry.slot,
        capturedAt: entry.createdAt,
      };
    },
    [effectiveType, coder, decodeData, enrichmentMap]
  );

  // Fetch data when pubkey/type changes
  useEffect(() => {
    setData(null);
    setHistory([]);
    setEnrichmentMap(new Map());
    setDetectedType(null);
    
    if (pubkey) {
      // Fetch data - type will be detected from discriminator if not provided
      fetchAccountData();
      fetchHistory();
    }
  }, [programId, pubkey, accountType]); // Intentionally not including fetch functions

  return {
    data,
    history,
    loading,
    historyLoading,
    error,
    refetch: fetchAccountData,
    decodeHistoricData,
    enrichmentMap,
  };
}
