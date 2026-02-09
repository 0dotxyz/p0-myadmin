"use client";

import React from "react";
import { EnrichedPubkey } from "@/lib/utils/enricher";

export const TokenBadge = ({ value }: { value: EnrichedPubkey }) => {
  const isToken = value.__type === "token";
  const hasLabel = !!value.label;

  // If it's a labeled non-token, show just the label prominently
  if (!isToken && hasLabel) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50 font-mono text-xs border border-border/50 align-middle">
        <span className="font-semibold text-foreground">{value.label}</span>
        <span className="opacity-40 text-[10px] ml-1">[{value.pubkey}]</span>
      </div>
    );
  }

  // Token display (with optional label)
  const iconUrl = value.logoURI;
  const displayName = hasLabel ? value.label : value.symbol;

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50 font-mono text-xs border border-border/50 align-middle">
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={value.symbol || displayName}
          className="w-4 h-4 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : value.symbol ? (
        <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
          <span className="text-[8px] font-bold">{value.symbol[0]}</span>
        </div>
      ) : null}

      {hasLabel && value.symbol ? (
        <>
          <span className="font-semibold text-foreground">{value.label}</span>
          <span className="text-muted-foreground">({value.symbol})</span>
        </>
      ) : (
        <span className="font-semibold text-foreground">
          {displayName || "Unknown"}
        </span>
      )}

      {value.balance && (
        <span className="text-muted-foreground">Balance: {value.balance}</span>
      )}

      <span className="opacity-40 text-[10px] ml-1">[{value.pubkey}]</span>
    </div>
  );
};
