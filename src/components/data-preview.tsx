"use client";

import { useState, useEffect, useCallback } from "react";
import { Idl, BorshAccountsCoder } from "@coral-xyz/anchor";
import { parseData } from "@/lib/utils/formatter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JsonViewer, defineDataType, safeStringify } from "@textea/json-viewer";
import { TokenBadge } from "@/components/token-badge";
import { EnrichedPubkey } from "@/lib/utils/enricher";
import { DiffDialog } from "@/components/diff-dialog";
import { useTheme } from "next-themes";
import {
  History,
  ChevronDown,
  Clock,
  X,
  Eye,
  GitCompare,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { AccountHistoryEntry } from "@/hooks/use-account-data";

// Define custom data type for Enriched Pubkeys (tokens and labeled)
const enrichedPubkeyDataType = defineDataType({
  is: (value) =>
    !!(
      value &&
      typeof value === "object" &&
      "__isEnriched" in value &&
      (value as EnrichedPubkey).__isEnriched === true
    ),
  Component: (props) => <TokenBadge value={props.value as EnrichedPubkey} />,
});

interface DataPreviewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decodedData: any;
  loading: boolean;
  pubkey?: string;
  accountType?: string;
  idl?: Idl;
  history?: AccountHistoryEntry[];
  historyLoading?: boolean;
}

export function DataPreview({
  decodedData,
  loading,
  pubkey,
  accountType,
  idl,
  history = [],
  historyLoading = false,
}: DataPreviewProps) {
  const [viewMode, setViewMode] = useState<"tree" | "raw">("tree");
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // History state
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<{
    data: string; // base64
    label: string;
  } | null>(null);

  // Historic view state (viewing a snapshot, not a diff)
  const [historicViewData, setHistoricViewData] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    label: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset historic view when account changes
  useEffect(() => {
    setHistoricViewData(null);
    setSelectedHistoryEntry(null);
  }, [pubkey]);

  const handleCopy = async (
    path: (string | number)[],
    value: unknown,
    copy: (v: string) => Promise<void>,
  ) => {
    if (
      value &&
      typeof value === "object" &&
      "__isEnriched" in value &&
      (value as EnrichedPubkey).__isEnriched
    ) {
      await copy((value as EnrichedPubkey).pubkey);
    } else {
      await copy(safeStringify(value, 2));
    }
  };

  // Handle viewing diff (opens dialog)
  const handleViewDiff = (entry: AccountHistoryEntry) => {
    const dateLabel = format(new Date(entry.createdAt), "MMM d, yyyy HH:mm");
    setSelectedHistoryEntry({ data: entry.data, label: dateLabel });
    setDiffDialogOpen(true);
  };

  // Handle viewing historic data directly in the preview panel
  const handleViewHistoricData = useCallback(
    (entry: AccountHistoryEntry) => {
      if (!idl || !accountType) return;

      try {
        const dataBuffer = Buffer.from(entry.data, "base64");
        const coder = new BorshAccountsCoder(idl);
        const decoded = coder.decode(accountType, dataBuffer);
        const formatted = parseData(decoded);

        const dateLabel = format(
          new Date(entry.createdAt),
          "MMM d, yyyy HH:mm",
        );
        setHistoricViewData({ data: formatted, label: dateLabel });
      } catch (e) {
        console.error("Error decoding historic data:", e);
      }
    },
    [idl, accountType],
  );

  // Exit historic view mode
  const handleExitHistoricView = () => {
    setHistoricViewData(null);
  };

  // History entries are sorted newest first from API
  // Skip the most recent entry since comparing it to Live would show no diff
  const comparableHistoryEntries = history.slice(1);

  // Should show history button?
  const showHistoryButton =
    pubkey &&
    idl &&
    accountType &&
    comparableHistoryEntries.length >= 1 &&
    !historicViewData;

  if (!decodedData && !loading) {
    return (
      <div className="flex flex-1 flex-col bg-background h-full overflow-hidden">
        <div className="flex h-16 items-center justify-end border-b border-border px-6 shrink-0" />
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Select an account to view data
        </div>
      </div>
    );
  }

  // Show historic data when viewing snapshot, otherwise show live data
  const dataToDisplay = historicViewData?.data || decodedData;

  return (
    <div className="flex flex-1 flex-col bg-background h-full overflow-hidden">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6 shrink-0">
        <h2 className="text-lg font-semibold">Account Data</h2>
        <div className="flex items-center gap-2">
          {/* History Dropdown */}
          {showHistoryButton && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-3">
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  History
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                  Account changes
                </DropdownMenuLabel>
                {historyLoading ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    Loading history...
                  </div>
                ) : (
                  comparableHistoryEntries.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded-sm"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-2">
                        <span className="font-medium text-sm truncate">
                          {format(new Date(entry.createdAt), "MMM d, yyyy HH:mm")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewHistoricData(entry);
                          }}
                          title="View snapshot data"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDiff(entry);
                          }}
                          title="Compare with current"
                        >
                          <GitCompare className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* View Mode Toggle */}
          <div className="flex gap-1 rounded-md border border-border p-1">
            <Button
              variant={viewMode === "raw" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("raw")}
              className="h-7 px-3"
            >
              RAW
            </Button>
            <Button
              variant={viewMode === "tree" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("tree")}
              className="h-7 px-3"
            >
              TREE
            </Button>
          </div>
        </div>
      </div>

      {/* Historic View Banner */}
      {historicViewData && (
        <div className="flex items-center justify-between bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 shrink-0">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              Viewing snapshot from {historicViewData.label}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/20"
            onClick={handleExitHistoricView}
          >
            <X className="h-4 w-4 mr-1" />
            Exit
          </Button>
        </div>
      )}

      {/* Data Display */}
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="p-4 h-full overflow-auto border-none shadow-none bg-transparent">
          {loading && !decodedData ? (
            <div className="space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : viewMode === "tree" ? (
            <div className="text-sm">
              <JsonViewer
                value={dataToDisplay}
                valueTypes={[enrichedPubkeyDataType]}
                theme={mounted && resolvedTheme === "dark" ? "dark" : "light"}
                displayDataTypes={false}
                defaultInspectDepth={2}
                onCopy={handleCopy}
                rootName={false}
                style={{
                  backgroundColor: "transparent",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.875rem",
                }}
              />
            </div>
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(dataToDisplay, null, 2)}
            </pre>
          )}
        </Card>
      </div>

      {/* Diff Dialog */}
      {selectedHistoryEntry && idl && accountType && (
        <DiffDialog
          open={diffDialogOpen}
          onOpenChange={setDiffDialogOpen}
          currentData={decodedData}
          currentLabel="Live"
          comparisonBase64Data={selectedHistoryEntry.data}
          comparisonLabel={selectedHistoryEntry.label}
          accountType={accountType}
          idl={idl}
        />
      )}
    </div>
  );
}
