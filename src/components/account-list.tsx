"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Star,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Edit2,
  X,
  Check,
  Copy,
  ExternalLink,
  Plus,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { View } from "@/types";
import { CreateViewDialog } from "./create-view-dialog";
import { SignInAlertDialog } from "./sign-in-alert-dialog";

export interface AccountMeta {
  pubkey: string;
  label?: string;
  isFavorite: boolean;
  /** Whether the label is a default (non-editable) label */
  isLabelDefault?: boolean;
}

export interface AccountListProps {
  programName: string;
  accounts: AccountMeta[];
  selectedAccount: string | null;
  onSelectAccount: (pubkey: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  accountType: string | null;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onToggleFavorite: (pubkey: string) => void;
  onSaveLabel: (pubkey: string, label: string) => void;
  loading: boolean;
  userViews?: View[];
  onAddToView?: (viewId: string, pubkey: string) => Promise<boolean>;
  onCreateView?: (name: string, pubkey?: string) => Promise<View | null>;
  selectedViewId?: string | null;
  selectedViewName?: string;
  /** Index where favorites end in current page (-1 if no favorites at start) */
  favoritesEndIndex?: number;
  /** Whether the current view is a default (read-only) view */
  isDefaultView?: boolean;
}

export function AccountList({
  programName,
  accounts,
  selectedAccount,
  onSelectAccount,
  searchQuery,
  onSearchChange,
  accountType,
  currentPage,
  totalPages,
  onPageChange,
  onToggleFavorite,
  onSaveLabel,
  loading,
  userViews = [],
  onAddToView,
  onCreateView,
  selectedViewId,
  selectedViewName,
  favoritesEndIndex = -1,
  isDefaultView = false,
}: AccountListProps) {
  const { user } = useAuth();
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Create View State
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false);
  const [pendingAccountToAdd, setPendingAccountToAdd] = useState<string | null>(
    null,
  );

  // Sign-in dialog state
  const [isSignInDialogOpen, setIsSignInDialogOpen] = useState(false);

  // Whether editing is allowed (not in a default view)
  const canEdit = !isDefaultView;

  const handleEdit = (pubkey: string, currentLabel?: string) => {
    setEditingAccount(pubkey);
    setEditLabel(currentLabel || "");
  };

  const handleSaveEdit = () => {
    if (editingAccount) {
      onSaveLabel(editingAccount, editLabel);
      setEditingAccount(null);
      setEditLabel("");
    }
  };

  const handleCreateView = async (name: string) => {
    if (onCreateView && pendingAccountToAdd) {
      try {
        // Pass the pending account directly - it will be added during view creation
        await onCreateView(name, pendingAccountToAdd);
      } catch (e) {
        console.error("Failed to create view:", e);
      } finally {
        setPendingAccountToAdd(null);
      }
    }
  };

  // Helper to generate explorer URL
  const getExplorerUrl = (pubkey: string) => {
    return `https://explorer.solana.com/address/${pubkey}`;
  };

  const AccountItem = ({ account }: { account: AccountMeta }) => {
    const isEditing = editingAccount === account.pubkey;
    
    // Can edit label only if: not in default view AND label is not a default label
    const canEditLabel = canEdit && !account.isLabelDefault;

    const handleFavoriteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEdit) return; // Disabled for default views
      if (!user) {
        setIsSignInDialogOpen(true);
        return;
      }
      onToggleFavorite(account.pubkey);
    };

    const handleEditClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEditLabel) return; // Disabled for default views or default labels
      if (!user) {
        setIsSignInDialogOpen(true);
        return;
      }
      handleEdit(account.pubkey, account.label);
    };

    return (
      <div
        className={cn(
          "group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-all",
          selectedAccount === account.pubkey
            ? "border-primary bg-accent"
            : "border-transparent hover:border-border hover:bg-accent/50",
        )}
        onClick={() => !isEditing && onSelectAccount(account.pubkey)}
      >
        <button
          className={cn(
            "shrink-0 transition-colors",
            canEdit
              ? "text-muted-foreground hover:text-primary"
              : "text-muted-foreground/50 cursor-not-allowed"
          )}
          onClick={handleFavoriteClick}
          disabled={!canEdit}
          title={!canEdit ? "Cannot edit accounts in default views" : undefined}
        >
          <Star
            className={cn(
              "h-4 w-4",
              account.isFavorite && "fill-primary text-primary",
            )}
          />
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-start cursor-pointer">
          {isEditing ? (
            <div
              className="flex w-full items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setEditingAccount(null);
                }}
                className="h-7 flex-1"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-success"
                onClick={handleSaveEdit}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={() => setEditingAccount(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : account.label ? (
            <>
              <span className="font-medium">{account.label}</span>
              <span className="truncate text-xs text-muted-foreground font-mono">
                {account.pubkey}
              </span>
            </>
          ) : (
            <span className="truncate font-mono text-sm">{account.pubkey}</span>
          )}
        </div>

        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleEditClick}
                disabled={!canEditLabel}
                className={!canEditLabel ? "opacity-50 cursor-not-allowed" : ""}
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit label
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(account.pubkey);
                  } catch (err) {
                    console.error("Failed to copy", err);
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy address
              </DropdownMenuItem>

              {user && onAddToView && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <List className="mr-2 h-4 w-4" />
                    Add to View
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      {userViews
                        .filter((v) => v.isEditable)
                        .map((view) => (
                          <DropdownMenuItem
                            key={view.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onAddToView) {
                                onAddToView(view.id, account.pubkey);
                              }
                            }}
                          >
                            {view.name}
                          </DropdownMenuItem>
                        ))}
                      {userViews.filter((v) => v.isEditable).length > 0 && (
                        <DropdownMenuSeparator />
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingAccountToAdd(account.pubkey);
                          setIsCreateViewOpen(true);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create new view...
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    getExplorerUrl(account.pubkey),
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Explorer
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    `https://solscan.io/account/${account.pubkey}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Solscan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  // Favorites are sorted to the top across all pages by page.tsx
  // favoritesEndIndex tells us where favorites end in the current page
  const hasFavoritesSection = favoritesEndIndex > 0;
  // If favoritesEndIndex is -1, it means no favorites at start of page (could be a later page)
  const showFavoritesHeader = hasFavoritesSection;
  
  // Split accounts for rendering
  const favs = hasFavoritesSection ? accounts.slice(0, favoritesEndIndex) : [];
  const rest = hasFavoritesSection ? accounts.slice(favoritesEndIndex) : accounts;

  return (
    <div className="flex w-[540px] flex-col border-r border-border bg-card h-full">
      <CreateViewDialog
        open={isCreateViewOpen}
        onOpenChange={(open) => {
          setIsCreateViewOpen(open);
          if (!open) setPendingAccountToAdd(null);
        }}
        onCreate={handleCreateView}
      />

      <SignInAlertDialog
        open={isSignInDialogOpen}
        onOpenChange={setIsSignInDialogOpen}
        title="Sign in required"
        description="Sign in with Google to favorite accounts and add custom labels."
      />

      {/* Header */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-4 shrink-0">
        <div className="font-semibold text-lg truncate flex-1">
          {programName}
        </div>

        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search pubkey or label..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Account List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {searchQuery
                ? "Search Results"
                : selectedViewId
                  ? selectedViewName || "View"
                  : accountType || "Select Type"}
            </h2>
          </div>

          <Card className="p-4 border-none shadow-none bg-transparent">
            {loading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 w-full animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            ) : (
              <>
                {showFavoritesHeader && favs.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Favorites
                    </div>
                    <div className="space-y-1">
                      {favs.map((account) => (
                        <AccountItem key={account.pubkey} account={account} />
                      ))}
                    </div>
                  </div>
                )}

                {showFavoritesHeader && rest.length > 0 && (
                  <div className="mt-6">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Other Accounts
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {rest.length > 0 ? (
                    rest.map((account) => (
                      <AccountItem key={account.pubkey} account={account} />
                    ))
                  ) : favs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {searchQuery
                        ? "No matching accounts found"
                        : accountType
                          ? "No accounts found"
                          : "Select an account type to view accounts"}
                    </div>
                  ) : null}
                </div>

                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onPageChange(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
