"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ProgramId } from "@/lib/config";
import type { PrimitiveType } from "@/lib/utils/idl-schema";

/**
 * Represents an active filter on account fields
 */
export interface AccountFilter {
  fieldPath: string[];      // e.g., ['lending_account', 'balances', '0', 'bank_pk']
  fieldLabel: string;       // e.g., 'lending_account.balances[0].bank_pk'
  value: string;            // User-entered value (base58 pubkey, number, etc.)
  fieldType: PrimitiveType; // The type of the field being filtered
}

interface UseFilteredAccountsResult {
  filter: AccountFilter | null;
  filteredPubkeys: string[] | null;  // null = no filter active
  loading: boolean;
  error: string | null;
  truncated: boolean;
  totalFound: number;
  applyFilter: (filter: AccountFilter) => Promise<void>;
  clearFilter: () => void;
}

interface FilterCacheEntry {
  programId: ProgramId;
  accountType: string;
  fieldPath: string;
  value: string;
  pubkeys: string[];
  truncated: boolean;
  totalFound: number;
}

/**
 * Hook for managing filtered accounts state
 * 
 * - Fetches accounts matching a field filter via API
 * - Auto-clears filter when account type changes
 * - Caches last filter result
 */
export function useFilteredAccounts(
  programId: ProgramId,
  accountType: string | null
): UseFilteredAccountsResult {
  const [filter, setFilter] = useState<AccountFilter | null>(null);
  const [filteredPubkeys, setFilteredPubkeys] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [totalFound, setTotalFound] = useState(0);

  // Cache for avoiding redundant fetches
  const cacheRef = useRef<FilterCacheEntry | null>(null);

  // Clear filter when account type changes
  useEffect(() => {
    setFilter(null);
    setFilteredPubkeys(null);
    setError(null);
    setTruncated(false);
    setTotalFound(0);
  }, [accountType]);

  // Apply a filter
  const applyFilter = useCallback(async (newFilter: AccountFilter) => {
    if (!accountType) {
      setError("No account type selected");
      return;
    }

    // Check cache
    const cacheKey = `${programId}:${accountType}:${newFilter.fieldPath.join(".")}:${newFilter.value}`;
    const cached = cacheRef.current;
    if (
      cached &&
      cached.programId === programId &&
      cached.accountType === accountType &&
      cached.fieldPath === newFilter.fieldPath.join(".") &&
      cached.value === newFilter.value
    ) {
      // Use cached result
      setFilter(newFilter);
      setFilteredPubkeys(cached.pubkeys);
      setTruncated(cached.truncated);
      setTotalFound(cached.totalFound);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fieldPathStr = newFilter.fieldPath.join(".");
      const params = new URLSearchParams({
        program: programId,
        type: accountType,
        field: fieldPathStr,
        value: newFilter.value,
      });

      const res = await fetch(`/api/accounts/filter?${params}`);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to filter accounts");
      }

      const data = await res.json();
      const pubkeys = data.pubkeys as string[];
      const isTruncated = data.truncated as boolean;
      const total = data.total as number;

      // Update cache
      cacheRef.current = {
        programId,
        accountType,
        fieldPath: fieldPathStr,
        value: newFilter.value,
        pubkeys,
        truncated: isTruncated,
        totalFound: total,
      };

      setFilter(newFilter);
      setFilteredPubkeys(pubkeys);
      setTruncated(isTruncated);
      setTotalFound(total);
    } catch (e) {
      console.error("Error applying filter:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
      setFilteredPubkeys(null);
    } finally {
      setLoading(false);
    }
  }, [programId, accountType]);

  // Clear the filter
  const clearFilter = useCallback(() => {
    setFilter(null);
    setFilteredPubkeys(null);
    setError(null);
    setTruncated(false);
    setTotalFound(0);
  }, []);

  return {
    filter,
    filteredPubkeys,
    loading,
    error,
    truncated,
    totalFound,
    applyFilter,
    clearFilter,
  };
}
