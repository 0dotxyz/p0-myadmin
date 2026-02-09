"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./use-auth";
import type { ProgramId } from "@/lib/config";

export interface AccountResult {
  pubkey: string;
  label?: string;
}

interface UseAccountsResult {
  accounts: AccountResult[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  refetch: () => Promise<void>;
  isSearching: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Hook for fetching account pubkeys by type, with search support
 *
 * - When search is empty: fetches from account_state table via /api/accounts
 * - When search has 3+ chars: searches via /api/search (pubkeys + labels)
 * - Includes debouncing for search queries
 * - Returns FULL list (no pagination) - pagination is handled in page.tsx
 */
export function useAccounts(
  programId: ProgramId,
  accountType: string | null,
  search?: string
): UseAccountsResult {
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<AccountResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Cache for pubkeys per account type (only used when not searching)
  const cacheRef = useRef<Map<string, AccountResult[]>>(new Map());

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Track the latest search to avoid race conditions
  const latestSearchRef = useRef<string>("");

  // Fetch accounts (either from /api/accounts or /api/search)
  const fetchAccounts = useCallback(async () => {
    const searchQuery = search?.trim() || "";
    const isSearch = searchQuery.length >= 3;

    // Update latest search ref
    latestSearchRef.current = searchQuery;

    // No account type and no search = nothing to fetch
    if (!accountType && !isSearch) {
      setAccounts([]);
      setIsSearching(false);
      return;
    }

    // Check cache for non-search queries
    if (!isSearch && accountType) {
      const cacheKey = `${programId}:${accountType}`;
      const cached = cacheRef.current.get(cacheKey);

      if (cached) {
        setAccounts(cached);
        setIsSearching(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setIsSearching(isSearch);

    try {
      let fetchedAccounts: AccountResult[] = [];

      if (isSearch) {
        // Search mode - call /api/search
        const token = await getToken();
        const headers: HeadersInit = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        const params = new URLSearchParams({
          program: programId,
          q: searchQuery,
          limit: "100",
        });

        const res = await fetch(`/api/search?${params.toString()}`, {
          headers,
        });

        if (!res.ok) {
          throw new Error("Search failed");
        }

        const data = await res.json();

        // Check if this is still the latest search
        if (latestSearchRef.current !== searchQuery) {
          return; // Stale result, ignore
        }

        fetchedAccounts = (data.results || []).map(
          (r: { pubkey: string; label?: string }) => ({
            pubkey: r.pubkey,
            label: r.label,
          })
        );
      } else if (accountType) {
        // Normal mode - call /api/accounts
        const res = await fetch(
          `/api/accounts?program=${programId}&type=${encodeURIComponent(accountType)}`
        );

        if (!res.ok) {
          throw new Error("Failed to fetch accounts");
        }

        const data = await res.json();
        const pubkeys: string[] = data.pubkeys || [];

        fetchedAccounts = pubkeys.map((pubkey) => ({ pubkey }));

        // Cache the results
        const cacheKey = `${programId}:${accountType}`;
        cacheRef.current.set(cacheKey, fetchedAccounts);
      }

      setAccounts(fetchedAccounts);
    } catch (e) {
      // Only set error if this is still the latest search
      if (latestSearchRef.current === searchQuery) {
        setError(e instanceof Error ? e.message : "Unknown error");
        setAccounts([]);
      }
    } finally {
      // Only update loading if this is still the latest search
      if (latestSearchRef.current === searchQuery) {
        setLoading(false);
      }
    }
  }, [programId, accountType, search, getToken]);

  // Debounced fetch for search
  useEffect(() => {
    // Clear any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const searchQuery = search?.trim() || "";
    const isSearch = searchQuery.length >= 3;

    if (isSearch) {
      // Debounce search queries
      setLoading(true); // Show loading immediately
      debounceRef.current = setTimeout(() => {
        fetchAccounts();
      }, SEARCH_DEBOUNCE_MS);
    } else {
      // No debounce for non-search (account type change)
      fetchAccounts();
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [programId, accountType, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear cache when program changes
  useEffect(() => {
    cacheRef.current.clear();
  }, [programId]);

  return {
    accounts,
    loading,
    error,
    totalCount: accounts.length,
    refetch: fetchAccounts,
    isSearching,
  };
}
