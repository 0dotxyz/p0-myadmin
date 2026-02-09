/**
 * RPC Proxy - Account Info
 *
 * Proxies getMultipleAccounts requests to the Solana RPC.
 * Used by the enricher for token balance lookups.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/utils/validation";

const RPC_URL = process.env.RPC_URL;

export async function POST(req: NextRequest) {
  try {
    if (!RPC_URL) {
      return NextResponse.json(
        { error: "RPC_URL not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { pubkeys } = body;

    if (!pubkeys || !Array.isArray(pubkeys) || pubkeys.length === 0) {
      return NextResponse.json(
        { error: "pubkeys array is required" },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    if (pubkeys.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 pubkeys per request" },
        { status: 400 }
      );
    }

    // Call Solana RPC
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [
          pubkeys,
          { encoding: "base64" },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || "RPC error");
    }

    return NextResponse.json(data.result);
  } catch (e: unknown) {
    return apiErrorResponse("RPC proxy error", e);
  }
}
