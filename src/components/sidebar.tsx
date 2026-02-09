"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeft, List, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { View } from "@/types";

interface SidebarProps {
  accountTypes: string[];
  selectedAccountType: string | null;
  onSelectAccountType: (type: string) => void;
  loading?: boolean;
  views?: View[];
  selectedViewId?: string | null;
  onSelectView?: (viewId: string | null) => void;
}

export function Sidebar({
  accountTypes,
  selectedAccountType,
  onSelectAccountType,
  loading = false,
  views = [],
  selectedViewId = null,
  onSelectView,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Separate default and user views
  const defaultViews = views.filter((v) => v.isDefault);
  const userViews = views.filter((v) => !v.isDefault);

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
              Project0MyAdmin
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
              {userViews.map((view) => (
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
                </button>
              ))}
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
              accountTypes.map((type) => (
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
    </div>
  );
}
