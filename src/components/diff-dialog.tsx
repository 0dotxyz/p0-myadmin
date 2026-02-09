"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Idl, BorshAccountsCoder } from "@coral-xyz/anchor";
import * as jsondiffpatch from "jsondiffpatch";
import * as htmlFormatter from "jsondiffpatch/formatters/html";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { parseData } from "@/lib/utils/formatter";
import { stripEnrichment } from "@/lib/utils/enricher";
import { useTheme } from "next-themes";

interface DiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentData: any;
  currentLabel: string;
  // For new account_changes system: pass base64 data directly
  comparisonBase64Data?: string;
  comparisonLabel: string;
  accountType: string;
  idl: Idl;
}

export function DiffDialog({
  open,
  onOpenChange,
  currentData,
  currentLabel,
  comparisonBase64Data,
  comparisonLabel,
  accountType,
  idl,
}: DiffDialogProps) {
  const { resolvedTheme } = useTheme();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  // Decode the comparison data when dialog opens or data changes
  useEffect(() => {
    if (!open || !comparisonBase64Data) {
      setComparisonData(null);
      setError(null);
      return;
    }

    try {
      // Decode the base64 data directly
      const dataBuffer = Buffer.from(comparisonBase64Data, "base64");
      const coder = new BorshAccountsCoder(idl);
      const decoded = coder.decode(accountType, dataBuffer);
      const formatted = parseData(decoded);

      setComparisonData(formatted);
      setError(null);
    } catch (e) {
      console.error("Error decoding comparison data:", e);
      setError(e instanceof Error ? e.message : "Failed to decode data");
      setComparisonData(null);
    }
  }, [open, comparisonBase64Data, accountType, idl]);

  // Compute diff and generate HTML
  const { diffHtml, hasDifferences } = useMemo(() => {
    if (!currentData || !comparisonData) {
      return { diffHtml: "", hasDifferences: false };
    }

    try {
      // Strip enrichment from current data for fair comparison
      const strippedCurrent = stripEnrichment(currentData);

      // Create diff instance
      const diffpatcher = jsondiffpatch.create({
        objectHash: (obj: unknown) => {
          if (obj && typeof obj === "object" && "pubkey" in obj) {
            return (obj as { pubkey: string }).pubkey;
          }
          return JSON.stringify(obj);
        },
        arrays: {
          detectMove: true,
          includeValueOnMove: false,
        },
      });

      // Compute delta (comparison -> current)
      const delta = diffpatcher.diff(comparisonData, strippedCurrent);

      if (!delta) {
        return { diffHtml: "", hasDifferences: false };
      }

      // Generate HTML using jsondiffpatch's HTML formatter
      const rawHtml = htmlFormatter.format(delta, comparisonData);

      // Sanitize HTML to prevent XSS — allow only the tags/attributes
      // that jsondiffpatch's HTML formatter produces
      const html = DOMPurify.sanitize(rawHtml || "", {
        ALLOWED_TAGS: ["ul", "li", "pre", "div", "span"],
        ALLOWED_ATTR: ["class", "data-key"],
      });

      return { diffHtml: html, hasDifferences: true };
    } catch (e) {
      console.error("Error computing diff:", e);
      return { diffHtml: "", hasDifferences: false };
    }
  }, [currentData, comparisonData]);

  // Toggle unchanged fields visibility by adding/removing CSS class
  useEffect(() => {
    if (diffContainerRef.current) {
      if (showUnchanged) {
        diffContainerRef.current.classList.add(
          "jsondiffpatch-unchanged-showing",
        );
        diffContainerRef.current.classList.remove(
          "jsondiffpatch-unchanged-hidden",
        );
      } else {
        diffContainerRef.current.classList.remove(
          "jsondiffpatch-unchanged-showing",
        );
        diffContainerRef.current.classList.add(
          "jsondiffpatch-unchanged-hidden",
        );
      }
    }
  }, [showUnchanged, diffHtml]);

  const isDark = resolvedTheme === "dark";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col pb-4">
        <DialogHeader>
          <DialogTitle>Comparing Changes</DialogTitle>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-6">
            <span className="font-medium">{comparisonLabel}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
            <span className="font-medium">{currentLabel}</span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          {error ? (
            <div className="flex items-center justify-center py-12 text-destructive">
              {error}
            </div>
          ) : !hasDifferences ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No differences found between these versions.
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div
                ref={diffContainerRef}
                className={`jsondiffpatch-diff-container p-4 ${isDark ? "dark-theme" : "light-theme"}`}
                dangerouslySetInnerHTML={{ __html: diffHtml }}
              />
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        {hasDifferences && (
          <div className="flex items-center justify-end pt-3 border-t border-border text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUnchanged(!showUnchanged)}
              className="h-7 px-2 text-xs"
            >
              {showUnchanged ? (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Hide unchanged
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Show unchanged
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>

      {/* Styles for jsondiffpatch HTML output */}
      <style jsx global>{`
        .jsondiffpatch-diff-container {
          font-family:
            ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas,
            monospace;
          font-size: 12px;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-delta {
          margin: 0;
          padding: 0 0 0 12px;
          display: inline-block;
        }

        .jsondiffpatch-diff-container ul.jsondiffpatch-delta {
          list-style-type: none;
          padding: 0 0 0 20px;
          margin: 0;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-delta ul {
          list-style-type: none;
          padding: 0 0 0 20px;
          margin: 0;
        }

        /* Added (green) */
        .jsondiffpatch-diff-container
          .jsondiffpatch-added
          .jsondiffpatch-property-name,
        .jsondiffpatch-diff-container
          .jsondiffpatch-added
          .jsondiffpatch-value
          pre,
        .jsondiffpatch-diff-container
          .jsondiffpatch-modified
          .jsondiffpatch-right-value
          pre,
        .jsondiffpatch-diff-container .jsondiffpatch-textdiff-added {
          background: rgba(34, 197, 94, 0.2);
          border-radius: 2px;
        }

        /* Deleted (red) */
        .jsondiffpatch-diff-container
          .jsondiffpatch-deleted
          .jsondiffpatch-property-name,
        .jsondiffpatch-diff-container .jsondiffpatch-deleted pre,
        .jsondiffpatch-diff-container
          .jsondiffpatch-modified
          .jsondiffpatch-left-value
          pre,
        .jsondiffpatch-diff-container .jsondiffpatch-textdiff-deleted {
          background: rgba(239, 68, 68, 0.2);
          text-decoration: line-through;
          border-radius: 2px;
        }

        /* Unchanged - hidden by default */
        .jsondiffpatch-diff-container .jsondiffpatch-unchanged,
        .jsondiffpatch-diff-container .jsondiffpatch-movedestination {
          color: #6b7280;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-unchanged,
        .jsondiffpatch-diff-container
          .jsondiffpatch-movedestination
          > .jsondiffpatch-value {
          transition:
            max-height 0.3s ease-out,
            opacity 0.3s ease-out;
          overflow-y: hidden;
          max-height: 0;
          opacity: 0;
        }

        /* Show unchanged when class is added */
        .jsondiffpatch-diff-container.jsondiffpatch-unchanged-showing
          .jsondiffpatch-unchanged,
        .jsondiffpatch-diff-container.jsondiffpatch-unchanged-showing
          .jsondiffpatch-movedestination
          > .jsondiffpatch-value {
          max-height: 500px;
          opacity: 1;
        }

        /* Explicitly hide when hidden class */
        .jsondiffpatch-diff-container.jsondiffpatch-unchanged-hidden
          .jsondiffpatch-unchanged,
        .jsondiffpatch-diff-container.jsondiffpatch-unchanged-hidden
          .jsondiffpatch-movedestination
          > .jsondiffpatch-value {
          max-height: 0;
          opacity: 0;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-value {
          display: inline-block;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-property-name {
          display: inline-block;
          padding-right: 5px;
          vertical-align: top;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-property-name:after {
          content: ": ";
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-child-node-type-array
          > .jsondiffpatch-property-name:after {
          content: ": [";
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-child-node-type-array:after {
          content: "],";
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-child-node-type-object
          > .jsondiffpatch-property-name:after {
          content: ": {";
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-child-node-type-object:after {
          content: "},";
        }

        .jsondiffpatch-diff-container .jsondiffpatch-value pre {
          margin: 0;
          padding: 1px 4px;
          display: inline-block;
          font-family: inherit;
          font-size: inherit;
        }

        .jsondiffpatch-diff-container .jsondiffpatch-value pre:after {
          content: ",";
        }

        .jsondiffpatch-diff-container
          li:last-child
          > .jsondiffpatch-value
          pre:after,
        .jsondiffpatch-diff-container
          .jsondiffpatch-modified
          > .jsondiffpatch-left-value
          pre:after {
          content: "";
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-modified
          .jsondiffpatch-value {
          display: inline-block;
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-modified
          .jsondiffpatch-right-value {
          margin-left: 5px;
        }

        .jsondiffpatch-diff-container
          .jsondiffpatch-modified
          .jsondiffpatch-right-value:before {
          content: " → ";
        }

        /* Dark theme adjustments */
        .jsondiffpatch-diff-container.dark-theme {
          color: #e5e7eb;
        }

        .jsondiffpatch-diff-container.dark-theme
          .jsondiffpatch-added
          .jsondiffpatch-property-name,
        .jsondiffpatch-diff-container.dark-theme
          .jsondiffpatch-added
          .jsondiffpatch-value
          pre,
        .jsondiffpatch-diff-container.dark-theme
          .jsondiffpatch-modified
          .jsondiffpatch-right-value
          pre,
        .jsondiffpatch-diff-container.dark-theme .jsondiffpatch-textdiff-added {
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
        }

        .jsondiffpatch-diff-container.dark-theme
          .jsondiffpatch-deleted
          .jsondiffpatch-property-name,
        .jsondiffpatch-diff-container.dark-theme .jsondiffpatch-deleted pre,
        .jsondiffpatch-diff-container.dark-theme
          .jsondiffpatch-modified
          .jsondiffpatch-left-value
          pre,
        .jsondiffpatch-diff-container.dark-theme
          .jsondiffpatch-textdiff-deleted {
          background: rgba(248, 113, 113, 0.2);
          color: #f87171;
        }

        .jsondiffpatch-diff-container.dark-theme .jsondiffpatch-unchanged {
          color: #6b7280;
        }

        /* Light theme */
        .jsondiffpatch-diff-container.light-theme {
          color: #1f2937;
        }

        .jsondiffpatch-diff-container.light-theme
          .jsondiffpatch-added
          .jsondiffpatch-property-name,
        .jsondiffpatch-diff-container.light-theme
          .jsondiffpatch-added
          .jsondiffpatch-value
          pre,
        .jsondiffpatch-diff-container.light-theme
          .jsondiffpatch-modified
          .jsondiffpatch-right-value
          pre {
          background: rgba(34, 197, 94, 0.15);
          color: #16a34a;
        }

        .jsondiffpatch-diff-container.light-theme
          .jsondiffpatch-deleted
          .jsondiffpatch-property-name,
        .jsondiffpatch-diff-container.light-theme .jsondiffpatch-deleted pre,
        .jsondiffpatch-diff-container.light-theme
          .jsondiffpatch-modified
          .jsondiffpatch-left-value
          pre {
          background: rgba(239, 68, 68, 0.15);
          color: #dc2626;
        }
      `}</style>
    </Dialog>
  );
}
