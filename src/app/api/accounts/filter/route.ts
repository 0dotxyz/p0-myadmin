/**
 * Account Filter API
 * 
 * Filters accounts by field value using Solana's getProgramAccounts with memcmp filters.
 * Server-side to protect RPC API key.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSolanaRpc, address } from "@solana/kit";
import { getIdl, getDiscriminator } from "@/lib/config/idl";
import { PROGRAMS, ProgramId } from "@/lib/config/programs";
import {
  calculateFieldOffset,
  getFieldType,
  encodeFilterValue,
  validateFilterValue,
} from "@/lib/utils/idl-schema";

// Max results to return (to prevent timeouts)
const MAX_RESULTS = 1000;

// Discriminator size in bytes
const DISCRIMINATOR_SIZE = 8;

function getRpcUrl(): string {
  const url = process.env.RPC_URL;
  if (!url) {
    throw new Error("RPC_URL environment variable is required");
  }
  return url;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query params
    const programKey = searchParams.get("program") as ProgramId | null;
    const accountType = searchParams.get("type");
    const fieldPathStr = searchParams.get("field");
    const value = searchParams.get("value");

    // Validate required params
    if (!programKey || !accountType || !fieldPathStr || !value) {
      return NextResponse.json(
        { error: "Missing required parameters: program, type, field, value" },
        { status: 400 }
      );
    }

    // Validate program
    if (!(programKey in PROGRAMS)) {
      return NextResponse.json(
        { error: `Invalid program: ${programKey}` },
        { status: 400 }
      );
    }

    const programId = PROGRAMS[programKey].programId;
    const idl = getIdl(programKey);

    // Parse field path (dot-notation, array indices as numbers)
    // e.g., "lending_account.balances.0.bank_pk" => ["lending_account", "balances", "0", "bank_pk"]
    const fieldPath = fieldPathStr.split(".");

    // Calculate byte offset for the field
    const fieldOffset = calculateFieldOffset(idl, accountType, fieldPath);
    if (fieldOffset === null) {
      return NextResponse.json(
        { error: `Invalid field path: ${fieldPathStr}` },
        { status: 400 }
      );
    }

    // Get field type for encoding
    const fieldType = getFieldType(idl, accountType, fieldPath);
    if (!fieldType) {
      return NextResponse.json(
        { error: `Cannot determine type for field: ${fieldPathStr}` },
        { status: 400 }
      );
    }

    // Validate the value
    if (!validateFilterValue(value, fieldType)) {
      return NextResponse.json(
        { error: `Invalid value for type ${fieldType}: ${value}` },
        { status: 400 }
      );
    }

    // Encode the value for memcmp
    const encodedValue = encodeFilterValue(value, fieldType);
    if (!encodedValue) {
      return NextResponse.json(
        { error: `Failed to encode value: ${value}` },
        { status: 400 }
      );
    }

    // Get discriminator for account type
    const discriminator = getDiscriminator(programKey, accountType);
    if (!discriminator) {
      return NextResponse.json(
        { error: `No discriminator found for account type: ${accountType}` },
        { status: 400 }
      );
    }

    // Build memcmp filters
    // Offset for the field value includes the discriminator
    const totalOffset = DISCRIMINATOR_SIZE + fieldOffset;

    // Create RPC client and fetch accounts
    const rpc = createSolanaRpc(getRpcUrl() as Parameters<typeof createSolanaRpc>[0]);

    // Use base58 encoding for bytes to avoid type issues with base64
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bs58 = require("bs58");
    const discriminatorBase58 = bs58.default.encode(discriminator);
    const valueBase58 = bs58.default.encode(encodedValue);

    const response = await rpc
      .getProgramAccounts(address(programId), {
        encoding: "base64",
        dataSlice: { offset: 0, length: 0 }, // Only fetch pubkeys, no data
        filters: [
          // Filter by discriminator (account type)
          {
            memcmp: {
              offset: BigInt(0),
              bytes: discriminatorBase58,
              encoding: "base58" as const,
            },
          },
          // Filter by field value
          {
            memcmp: {
              offset: BigInt(totalOffset),
              bytes: valueBase58,
              encoding: "base58" as const,
            },
          },
        ],
      })
      .send();

    // Extract pubkeys
    const pubkeys = (response as unknown as Array<{ pubkey: { toString(): string } }>)
      .map((account) => account.pubkey.toString());

    // Check if truncated
    const truncated = pubkeys.length > MAX_RESULTS;
    const resultPubkeys = truncated ? pubkeys.slice(0, MAX_RESULTS) : pubkeys;

    return NextResponse.json({
      pubkeys: resultPubkeys,
      truncated,
      total: pubkeys.length,
    });
  } catch (e: unknown) {
    console.error("Error filtering accounts:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
