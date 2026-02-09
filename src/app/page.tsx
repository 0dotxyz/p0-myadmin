"use client";

import { useState, useCallback, useMemo, Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { AccountList, AccountMeta } from "@/components/account-list";
import { DataPreview } from "@/components/data-preview";
import { ProgramSwitcher } from "@/components/program-switcher";
import { GoogleSignIn } from "@/components/google-sign-in";
import { ThemeToggle } from "@/components/theme-toggle";
import { useProgram } from "@/hooks/use-program";
import { useLabels } from "@/hooks/use-labels";
import { useFavorites } from "@/hooks/use-favorites";
import { useViews } from "@/hooks/use-views";
import { useAccounts } from "@/hooks/use-accounts";
import { useAccountData } from "@/hooks/use-account-data";
import { View } from "@/types";

const ITEMS_PER_PAGE = 50;

function ExplorerContent() {
  // Program selection (from URL)
  const { programId, program, idl, accountTypes, setProgram } = useProgram();

  // UI state
  const [selectedAccountType, setSelectedAccountType] = useState<string | null>(null);
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Data hooks
  const { getLabel, isLabelDefault, setLabel, loading: labelsLoading } = useLabels(programId);
  const { isFavorite, toggleFavorite, loading: favoritesLoading } = useFavorites(programId);
  const { views, createView, updateView, loading: viewsLoading, refetch: refetchViews } = useViews(programId);
  
  // Pass search query to useAccounts for integrated search (returns full unpaginated list)
  const { 
    accounts: fetchedAccounts,
    loading: accountsLoading, 
    totalCount, 
    isSearching,
  } = useAccounts(programId, selectedAccountType, searchQuery);
  
  const { 
    data: accountData, 
    history, 
    loading: accountDataLoading,
    historyLoading 
  } = useAccountData(
    programId, 
    selectedPubkey, 
    selectedAccountType, 
    idl,
    getLabel
  );

  // Get the selected view object
  const selectedView = useMemo(() => {
    return views.find((v) => v.id === selectedViewId) || null;
  }, [views, selectedViewId]);

  // Build full list with labels and favorites, then sort: favorites first (alphabetically), then non-favorites (alphabetically)
  // This happens BEFORE pagination so favorites are always at the top across all pages
  const sortedAccounts: AccountMeta[] = useMemo(() => {
    let accountList: AccountMeta[];

    // If searching, use search results directly
    if (isSearching) {
      accountList = fetchedAccounts.map((account) => ({
        pubkey: account.pubkey,
        label: account.label || getLabel(account.pubkey),
        isFavorite: isFavorite(account.pubkey),
        isLabelDefault: isLabelDefault(account.pubkey),
      }));
    }
    // If a view is selected, show view accounts
    else if (selectedViewId && selectedView) {
      const viewPubkeys = selectedView.accounts?.map((a) => a.pubkey) || [];
      accountList = viewPubkeys.map((pubkey) => ({
        pubkey,
        label: getLabel(pubkey),
        isFavorite: isFavorite(pubkey),
        isLabelDefault: isLabelDefault(pubkey),
      }));
    }
    // Otherwise show fetched accounts (by type from useAccounts)
    else {
      accountList = fetchedAccounts.map((account) => ({
        pubkey: account.pubkey,
        label: account.label || getLabel(account.pubkey),
        isFavorite: isFavorite(account.pubkey),
        isLabelDefault: isLabelDefault(account.pubkey),
      }));
    }

    // Sort: favorites first, then alphabetically by label (or pubkey if no label)
    return accountList.sort((a, b) => {
      // Favorites come first
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      // Within same favorite status, sort alphabetically by label (or pubkey if no label)
      const aKey = (a.label || a.pubkey).toLowerCase();
      const bKey = (b.label || b.pubkey).toLowerCase();
      return aKey.localeCompare(bKey);
    });
  }, [fetchedAccounts, isSearching, selectedViewId, selectedView, getLabel, isFavorite, isLabelDefault]);

  // Calculate pagination
  const totalPages = Math.ceil(sortedAccounts.length / ITEMS_PER_PAGE) || 1;

  // Get the current page of accounts
  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedAccounts.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedAccounts, currentPage]);

  // Compute whether the page has favorites at the start (for section headers)
  const pageHasFavoritesAtStart = paginatedAccounts.length > 0 && paginatedAccounts[0].isFavorite;
  
  // Find the index where favorites end in the current page
  const favoritesEndIndex = useMemo(() => {
    if (!pageHasFavoritesAtStart) return -1;
    const idx = paginatedAccounts.findIndex((a) => !a.isFavorite);
    return idx === -1 ? paginatedAccounts.length : idx;
  }, [paginatedAccounts, pageHasFavoritesAtStart]);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  // Handle account type selection - deselects view (mutually exclusive)
  const handleSelectAccountType = useCallback((type: string) => {
    setSelectedAccountType(type);
    setSelectedViewId(null); // Deselect view - they're mutually exclusive
    setSelectedPubkey(null);
    setSearchQuery("");
    setCurrentPage(1);
  }, []);

  // Handle view selection
  const handleSelectView = useCallback((viewId: string | null) => {
    setSelectedViewId(viewId);
    setSelectedAccountType(null);
    setSelectedPubkey(null);
    setSearchQuery(""); // Clear search when changing view
    setCurrentPage(1);
  }, []);

  // Handle account selection
  const handleSelectAccount = useCallback((pubkey: string) => {
    setSelectedPubkey(pubkey);
    
    // If we don't have an account type selected, try to infer from the view
    if (!selectedAccountType && selectedView) {
      const viewAccount = selectedView.accounts?.find((a) => a.pubkey === pubkey);
      if (viewAccount?.type) {
        setSelectedAccountType(viewAccount.type);
      }
    }
  }, [selectedAccountType, selectedView]);

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(async (pubkey: string) => {
    await toggleFavorite(pubkey);
  }, [toggleFavorite]);

  // Handle save label
  const handleSaveLabel = useCallback(async (pubkey: string, label: string) => {
    await setLabel(pubkey, label);
  }, [setLabel]);

  // Handle add to view
  const handleAddToView = useCallback(async (viewId: string, pubkey: string): Promise<boolean> => {
    const type = selectedAccountType || undefined;
    const success = await updateView(viewId, { 
      add: [{ pubkey, type }] 
    });
    return success;
  }, [updateView, selectedAccountType]);

  // Handle create view
  const handleCreateView = useCallback(async (name: string): Promise<View | null> => {
    const view = await createView(name);
    if (view) {
      await refetchViews();
    }
    return view;
  }, [createView, refetchViews]);

  // Search handler - debouncing is handled in useAccounts
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to page 1 when search changes
  }, []);

  // Loading state
  const isLoading = labelsLoading || favoritesLoading || viewsLoading;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-10 flex h-14 items-center justify-between border-b border-border px-4 bg-background">
        <ProgramSwitcher 
          currentProgram={programId} 
          onProgramChange={setProgram} 
        />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <GoogleSignIn />
        </div>
      </div>

      {/* Main Content - offset for fixed header */}
      <div className="flex w-full pt-14">
        {/* Sidebar */}
        <Sidebar
          accountTypes={accountTypes}
          selectedAccountType={selectedAccountType}
          onSelectAccountType={handleSelectAccountType}
          loading={isLoading}
          views={views}
          selectedViewId={selectedViewId}
          onSelectView={handleSelectView}
        />

        {/* Account List */}
        <AccountList
          programName={program.name}
          accounts={paginatedAccounts}
          selectedAccount={selectedPubkey}
          onSelectAccount={handleSelectAccount}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          accountType={selectedAccountType}
          totalItems={isSearching || selectedViewId ? sortedAccounts.length : totalCount}
          currentPage={currentPage}
          totalPages={isSearching || selectedViewId ? Math.ceil(sortedAccounts.length / ITEMS_PER_PAGE) || 1 : totalPages}
          onPageChange={handlePageChange}
          onToggleFavorite={handleToggleFavorite}
          onSaveLabel={handleSaveLabel}
          loading={accountsLoading}
          userViews={views}
          onAddToView={handleAddToView}
          onCreateView={handleCreateView}
          selectedViewId={selectedViewId}
          selectedViewName={selectedView?.name}
          favoritesEndIndex={favoritesEndIndex}
          isDefaultView={selectedView?.isDefault ?? false}
        />

        {/* Data Preview */}
        <DataPreview
          decodedData={accountData?.enriched}
          loading={accountDataLoading}
          pubkey={selectedPubkey || undefined}
          accountType={selectedAccountType || undefined}
          idl={idl}
          history={history}
          historyLoading={historyLoading}
        />
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ExplorerContent />
    </Suspense>
  );
}
