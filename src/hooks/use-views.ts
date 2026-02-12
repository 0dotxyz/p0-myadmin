"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";
import type { ProgramId } from "@/lib/config";

export interface ViewAccount {
  pubkey: string;
  type?: string;
}

export interface View {
  id: string;
  name: string;
  program: string;
  isDefault: boolean;
  isEditable: boolean;
  accounts?: ViewAccount[];
}

interface UseViewsResult {
  views: View[];
  loading: boolean;
  error: string | null;
  getView: (viewId: string) => View | undefined;
  getViewAccounts: (viewId: string) => Promise<ViewAccount[]>;
  createView: (name: string, initialAccounts?: ViewAccount[]) => Promise<View | null>;
  updateView: (viewId: string, updates: { name?: string; add?: ViewAccount[]; remove?: string[] }) => Promise<boolean>;
  deleteView: (viewId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook for managing views (default views + user views)
 * 
 * - Default views are read-only (isEditable: false)
 * - User views are fully editable
 * - Both are displayed in the sidebar
 */
export function useViews(programId: ProgramId): UseViewsResult {
  const { user, getToken } = useAuth();
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch views from API
  const fetchViews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const headers: HeadersInit = token 
        ? { Authorization: `Bearer ${token}` } 
        : {};

      const res = await fetch(`/api/views?program=${programId}`, { headers });
      
      if (!res.ok) {
        throw new Error("Failed to fetch views");
      }

      const data = await res.json();
      
      // API returns { views: [...] } with isDefault/isEditable already set
      setViews(data.views || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [programId, getToken]);

  // Fetch on mount and when program changes
  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  // Get a specific view
  const getView = useCallback((viewId: string): View | undefined => {
    return views.find(v => v.id === viewId);
  }, [views]);

  // Get accounts for a view
  const getViewAccounts = useCallback(async (viewId: string): Promise<ViewAccount[]> => {
    const token = await getToken();
    const headers: HeadersInit = token 
      ? { Authorization: `Bearer ${token}` } 
      : {};

    const res = await fetch(`/api/views/${viewId}`, { headers });
    
    if (!res.ok) {
      throw new Error("Failed to fetch view accounts");
    }

    const data = await res.json();
    return data.accounts || [];
  }, [getToken]);

  // Create a new user view, optionally with initial accounts
  const createView = useCallback(async (name: string, initialAccounts?: ViewAccount[]): Promise<View | null> => {
    if (!user) {
      console.error("Must be authenticated to create views");
      return null;
    }

    const token = await getToken();
    if (!token) {
      console.error("No auth token");
      return null;
    }

    try {
      const res = await fetch("/api/views", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ program: programId, name }),
      });

      if (!res.ok) {
        console.error("Failed to create view");
        return null;
      }

      const data = await res.json();
      const newView = data.view;
      
      // If initial accounts provided, add them to the view
      if (initialAccounts?.length) {
        try {
          await fetch(`/api/views/${newView.id}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ add: initialAccounts }),
          });
          // Update the newView object with accounts for local state
          newView.accounts = initialAccounts;
        } catch (e) {
          console.error("Error adding initial accounts to view:", e);
          // View was created, just accounts weren't added
        }
      }
      
      // Add to local state
      setViews(prev => [...prev, newView]);
      
      return newView;
    } catch (e) {
      console.error("Error creating view:", e);
      return null;
    }
  }, [user, programId, getToken]);

  // Update a user view
  const updateView = useCallback(async (
    viewId: string, 
    updates: { name?: string; add?: ViewAccount[]; remove?: string[] }
  ): Promise<boolean> => {
    if (!user) {
      console.error("Must be authenticated to update views");
      return false;
    }

    const view = views.find(v => v.id === viewId);
    if (!view) {
      console.error("View not found");
      return false;
    }

    if (!view.isEditable) {
      console.error("Cannot edit default views");
      return false;
    }

    const token = await getToken();
    if (!token) {
      console.error("No auth token");
      return false;
    }

    try {
      const res = await fetch(`/api/views/${viewId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        console.error("Failed to update view");
        return false;
      }

      // Update local state if name changed
      if (updates.name) {
        setViews(prev => prev.map(v => 
          v.id === viewId ? { ...v, name: updates.name! } : v
        ));
      }

      return true;
    } catch (e) {
      console.error("Error updating view:", e);
      return false;
    }
  }, [user, views, getToken]);

  // Delete a user view
  const deleteView = useCallback(async (viewId: string) => {
    if (!user) {
      throw new Error("Must be authenticated to delete views");
    }

    const view = views.find(v => v.id === viewId);
    if (!view) {
      throw new Error("View not found");
    }

    if (!view.isEditable) {
      throw new Error("Cannot delete default views");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("No auth token");
    }

    // Optimistic update
    const oldViews = [...views];
    setViews(prev => prev.filter(v => v.id !== viewId));

    try {
      const res = await fetch(`/api/views/${viewId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to delete view");
      }
    } catch (e) {
      // Rollback on error
      setViews(oldViews);
      throw e;
    }
  }, [user, views, getToken]);

  return {
    views,
    loading,
    error,
    getView,
    getViewAccounts,
    createView,
    updateView,
    deleteView,
    refetch: fetchViews,
  };
}
