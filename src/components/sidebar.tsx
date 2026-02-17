"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PanelLeftClose,
  PanelLeft,
  List,
  Lock,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { View } from "@/types";

interface SidebarProps {
  accountTypes: string[];
  accountCounts?: Record<string, number>;
  selectedAccountType: string | null;
  onSelectAccountType: (type: string) => void;
  loading?: boolean;
  views?: View[];
  selectedViewId?: string | null;
  onSelectView?: (viewId: string | null) => void;
  onRenameView?: (viewId: string, newName: string) => Promise<void>;
  onDeleteView?: (viewId: string) => Promise<void>;
}

export function Sidebar({
  accountTypes,
  accountCounts,
  selectedAccountType,
  onSelectAccountType,
  loading = false,
  views = [],
  selectedViewId = null,
  onSelectView,
  onRenameView,
  onDeleteView,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Edit mode state for renaming views
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editViewName, setEditViewName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete confirmation state
  const [deleteViewId, setDeleteViewId] = useState<string | null>(null);
  const [deleteViewName, setDeleteViewName] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Separate default and user views
  const defaultViews = views.filter((v) => v.isDefault);
  const userViews = views.filter((v) => !v.isDefault);

  // Filter out account types with 0 accounts (only when counts are loaded)
  const visibleAccountTypes = accountCounts
    ? accountTypes.filter((type) => (accountCounts[type] ?? 0) > 0)
    : accountTypes;

  const handleViewClick = (viewId: string) => {
    if (onSelectView) {
      // Toggle off if clicking the same view
      if (selectedViewId === viewId) {
        onSelectView(null);
      } else {
        onSelectView(viewId);
      }
    }
  };

  const handleRenameClick = (view: View) => {
    setEditingViewId(view.id);
    setEditViewName(view.name);
  };

  const handleSaveRename = async () => {
    if (editingViewId && editViewName.trim() && onRenameView) {
      setIsRenaming(true);
      try {
        await onRenameView(editingViewId, editViewName.trim());
      } catch (e) {
        console.error("Failed to rename view:", e);
        // Still close the edit mode, but the name won't be updated
      } finally {
        setIsRenaming(false);
      }
    }
    setEditingViewId(null);
    setEditViewName("");
  };

  const handleCancelRename = () => {
    setEditingViewId(null);
    setEditViewName("");
  };

  const handleDeleteClick = (view: View) => {
    setDeleteViewId(view.id);
    setDeleteViewName(view.name);
  };

  const handleConfirmDelete = async () => {
    if (deleteViewId && onDeleteView) {
      setIsDeleting(true);
      try {
        await onDeleteView(deleteViewId);
      } catch (e) {
        console.error("Failed to delete view:", e);
        // The optimistic update in use-views.ts will rollback
      } finally {
        setIsDeleting(false);
      }
    }
    setDeleteViewId(null);
    setDeleteViewName("");
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-72",
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Logo size={26} className="text-primary" />
            <span className="text-lg font-semibold text-sidebar-foreground">
              SolanaMyAdmin
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Default Views Section */}
        {defaultViews.length > 0 && (
          <div className="mb-6">
            {!collapsed && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Default Views
              </div>
            )}
            <div className="space-y-1">
              {defaultViews.map((view) => (
                <button
                  key={view.id}
                  onClick={() => handleViewClick(view.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                    selectedViewId === view.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <List className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{view.name}</span>
                    )}
                  </div>
                  {!collapsed && (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User Views Section */}
        {userViews.length > 0 && (
          <div className="mb-6">
            {!collapsed && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                My Views
              </div>
            )}
            <div className="space-y-1">
              {userViews.map((view) => {
                const isEditing = editingViewId === view.id;

                return (
                  <div key={view.id} className="group flex items-center">
                    {isEditing ? (
                      // Edit mode - inline input
                      <div
                        className="flex w-full items-center gap-1 px-1 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={editViewName}
                          onChange={(e) => setEditViewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isRenaming) handleSaveRename();
                            if (e.key === "Escape" && !isRenaming) handleCancelRename();
                          }}
                          className="h-7 flex-1"
                          autoFocus
                          disabled={isRenaming}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={handleSaveRename}
                          disabled={isRenaming}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          onClick={handleCancelRename}
                          disabled={isRenaming}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      // Normal mode - button with dropdown
                      <>
                        <button
                          onClick={() => handleViewClick(view.id)}
                          className={cn(
                            "flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                            selectedViewId === view.id
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                          )}
                        >
                          <List className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="truncate">{view.name}</span>
                          )}
                        </button>

                        {!collapsed && (
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
                                onClick={() => handleRenameClick(view)}
                              >
                                <Edit2 className="mr-2 h-4 w-4" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(view)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Account Types List */}
        <div>
          {!collapsed && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account Types
            </div>
          )}
          <div className="space-y-1">
            {loading ? (
              <>
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center px-3 py-2">
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </>
            ) : (
              visibleAccountTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => onSelectAccountType(type)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                    selectedAccountType === type
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  {collapsed ? (
                    <span className="truncate text-xs">
                      {type.substring(0, 2)}
                    </span>
                  ) : (
                    <span className="truncate">{type}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteViewId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteViewId(null);
            setDeleteViewName("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete view?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the view &quot;{deleteViewName}
              &quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
