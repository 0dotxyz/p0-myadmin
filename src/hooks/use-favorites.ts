"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./use-auth";
import type { ProgramId } from "@/lib/config";

interface UseFavoritesResult {
  favorites: Set<string>;
  defaultFavorites: Set<string>;
  userFavorites: Set<string>;
  loading: boolean;
  error: string | null;
  isFavorite: (pubkey: string) => boolean;
  isDefaultFavorite: (pubkey: string) => boolean;
  toggleFavorite: (pubkey: string) => Promise<void>;
  addFavorite: (pubkey: string) => Promise<void>;
  removeFavorite: (pubkey: string) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook for managing favorites (merged defaults + user favorites)
 * 
 * - Anonymous users see only default favorites
 * - Authenticated users see defaults + their own favorites (union)
 * - Users cannot remove default favorites, only their own
 */
export function useFavorites(programId: ProgramId): UseFavoritesResult {
  const { user, getToken } = useAuth();
  const [defaultFavorites, setDefaultFavorites] = useState<Set<string>>(new Set());
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Combined favorites (union of defaults + user) - memoized to prevent recreation
  const favorites = useMemo(
    () => new Set([...defaultFavorites, ...userFavorites]),
    [defaultFavorites, userFavorites]
  );

  // Fetch favorites from API
  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const headers: HeadersInit = token 
        ? { Authorization: `Bearer ${token}` } 
        : {};

      const res = await fetch(`/api/favorites?program=${programId}`, { headers });
      
      if (!res.ok) {
        throw new Error("Failed to fetch favorites");
      }

      const data = await res.json();
      
      setDefaultFavorites(new Set(data.defaults || []));
      setUserFavorites(new Set(data.user || []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [programId, getToken]);

  // Fetch on mount and when program changes
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Check if a pubkey is favorited
  const isFavorite = useCallback((pubkey: string): boolean => {
    return favorites.has(pubkey);
  }, [favorites]);

  // Check if a pubkey is a default favorite
  const isDefaultFavorite = useCallback((pubkey: string): boolean => {
    return defaultFavorites.has(pubkey);
  }, [defaultFavorites]);

  // Add a favorite
  const addFavorite = useCallback(async (pubkey: string) => {
    if (!user) {
      throw new Error("Must be authenticated to add favorites");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("No auth token");
    }

    // Optimistic update
    setUserFavorites(prev => new Set([...prev, pubkey]));

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ program: programId, pubkey }),
      });

      if (!res.ok) {
        throw new Error("Failed to add favorite");
      }
    } catch (e) {
      // Rollback on error
      setUserFavorites(prev => {
        const next = new Set(prev);
        next.delete(pubkey);
        return next;
      });
      throw e;
    }
  }, [user, programId, getToken]);

  // Remove a favorite (only user favorites can be removed)
  const removeFavorite = useCallback(async (pubkey: string) => {
    if (!user) {
      throw new Error("Must be authenticated to remove favorites");
    }

    // Can't remove default favorites
    if (defaultFavorites.has(pubkey) && !userFavorites.has(pubkey)) {
      throw new Error("Cannot remove default favorites");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("No auth token");
    }

    // Optimistic update
    const oldUserFavorites = new Set(userFavorites);
    setUserFavorites(prev => {
      const next = new Set(prev);
      next.delete(pubkey);
      return next;
    });

    try {
      const res = await fetch(
        `/api/favorites?program=${programId}&pubkey=${encodeURIComponent(pubkey)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to remove favorite");
      }
    } catch (e) {
      // Rollback on error
      setUserFavorites(oldUserFavorites);
      throw e;
    }
  }, [user, programId, defaultFavorites, userFavorites, getToken]);

  // Toggle favorite status
  const toggleFavorite = useCallback(async (pubkey: string) => {
    if (userFavorites.has(pubkey)) {
      await removeFavorite(pubkey);
    } else if (!defaultFavorites.has(pubkey)) {
      // Only add if not already a default favorite
      await addFavorite(pubkey);
    }
    // If it's a default favorite and user hasn't added it, do nothing
    // (can't toggle off default favorites)
  }, [userFavorites, defaultFavorites, addFavorite, removeFavorite]);

  return {
    favorites,
    defaultFavorites,
    userFavorites,
    loading,
    error,
    isFavorite,
    isDefaultFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    refetch: fetchFavorites,
  };
}
