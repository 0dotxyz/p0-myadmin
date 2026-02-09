"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";
import type { ProgramId } from "@/lib/config";

export interface LabelMeta {
  label: string;
  /** Whether this specific label value is from defaults (false if user overrode it) */
  isDefault: boolean;
  /** Whether a default label exists for this pubkey (even if user overrode it) */
  hasDefaultLabel: boolean;
}

interface UseLabelsResult {
  labels: Map<string, LabelMeta>;
  loading: boolean;
  error: string | null;
  getLabel: (pubkey: string) => string | undefined;
  isLabelDefault: (pubkey: string) => boolean;
  setLabel: (pubkey: string, label: string) => Promise<void>;
  deleteLabel: (pubkey: string) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook for managing labels (merged defaults + user labels)
 * 
 * - Anonymous users see only default labels
 * - Authenticated users see defaults + their own labels
 * - User labels override defaults for the same pubkey
 */
export function useLabels(programId: ProgramId): UseLabelsResult {
  const { user, getToken } = useAuth();
  const [labels, setLabels] = useState<Map<string, LabelMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch labels from API
  const fetchLabels = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const headers: HeadersInit = token 
        ? { Authorization: `Bearer ${token}` } 
        : {};

      const res = await fetch(`/api/labels?program=${programId}`, { headers });
      
      if (!res.ok) {
        throw new Error("Failed to fetch labels");
      }

      const data = await res.json();
      
      // Merge defaults + user labels
      const merged = new Map<string, LabelMeta>();
      
      // Track which pubkeys have default labels
      const defaultPubkeys = new Set<string>();
      
      // Add defaults first (API returns array of { pubkey, label })
      if (data.defaults && Array.isArray(data.defaults)) {
        for (const item of data.defaults) {
          defaultPubkeys.add(item.pubkey);
          merged.set(item.pubkey, { label: item.label, isDefault: true, hasDefaultLabel: true });
        }
      }
      
      // User labels override defaults (but preserve hasDefaultLabel flag)
      if (data.user && Array.isArray(data.user)) {
        for (const item of data.user) {
          const hasDefault = defaultPubkeys.has(item.pubkey);
          merged.set(item.pubkey, { label: item.label, isDefault: false, hasDefaultLabel: hasDefault });
        }
      }

      setLabels(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [programId, getToken]);

  // Fetch on mount and when program changes
  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  // Get label for a pubkey
  const getLabel = useCallback((pubkey: string): string | undefined => {
    return labels.get(pubkey)?.label;
  }, [labels]);

  // Check if a pubkey has a default label (non-editable, even if user overrode it)
  const isLabelDefault = useCallback((pubkey: string): boolean => {
    return labels.get(pubkey)?.hasDefaultLabel ?? false;
  }, [labels]);

  // Set a user label
  const setLabel = useCallback(async (pubkey: string, label: string) => {
    if (!user) {
      throw new Error("Must be authenticated to set labels");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("No auth token");
    }

    // Optimistic update (preserve hasDefaultLabel flag)
    const oldLabels = new Map(labels);
    const existing = labels.get(pubkey);
    setLabels(prev => {
      const next = new Map(prev);
      next.set(pubkey, { label, isDefault: false, hasDefaultLabel: existing?.hasDefaultLabel ?? false });
      return next;
    });

    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ program: programId, pubkey, label }),
      });

      if (!res.ok) {
        throw new Error("Failed to save label");
      }
    } catch (e) {
      // Rollback on error
      setLabels(oldLabels);
      throw e;
    }
  }, [user, programId, labels, getToken]);

  // Delete a user label
  const deleteLabel = useCallback(async (pubkey: string) => {
    if (!user) {
      throw new Error("Must be authenticated to delete labels");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("No auth token");
    }

    // Optimistic update - remove or fall back to default
    const oldLabels = new Map(labels);
    setLabels(prev => {
      const next = new Map(prev);
      // We don't know if there's a default, so just remove for now
      // The refetch will restore the default if one exists
      next.delete(pubkey);
      return next;
    });

    try {
      const res = await fetch(
        `/api/labels?program=${programId}&pubkey=${encodeURIComponent(pubkey)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to delete label");
      }

      // Refetch to get the default back if one exists
      await fetchLabels();
    } catch (e) {
      // Rollback on error
      setLabels(oldLabels);
      throw e;
    }
  }, [user, programId, labels, getToken, fetchLabels]);

  return {
    labels,
    loading,
    error,
    getLabel,
    isLabelDefault,
    setLabel,
    deleteLabel,
    refetch: fetchLabels,
  };
}
