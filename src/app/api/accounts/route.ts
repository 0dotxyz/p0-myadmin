import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { isValidProgram, PROGRAMS, getDiscriminator } from "@/lib/config";
import { apiErrorResponse } from "@/lib/utils/validation";

/**
 * GET /api/accounts?program=marginfi&type=Bank
 * 
 * Returns account pubkeys for a program and account type.
 * Uses the account_state table which is populated by the indexer.
 */
export async function GET(req: NextRequest) {
  try {
    const program = req.nextUrl.searchParams.get("program");
    const type = req.nextUrl.searchParams.get("type");
    
    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { error: "Missing account type", code: "invalid_input" },
        { status: 400 }
      );
    }

    // Get program address
    const programAddress = PROGRAMS[program].programId;

    // Get discriminator for the account type
    const discriminatorBuffer = getDiscriminator(program, type);
    if (!discriminatorBuffer) {
      return NextResponse.json(
        { error: "Unknown account type", code: "invalid_input" },
        { status: 400 }
      );
    }

    const discriminatorHex = discriminatorBuffer.toString("hex");

    // Query account_state for distinct pubkeys with this discriminator
    // We use DISTINCT ON (pubkey) to get unique pubkeys from the latest entries
    const { data, error } = await supabase
      .from("account_state")
      .select("pubkey")
      .eq("program_id", programAddress)
      .eq("discriminator", discriminatorHex)
      .order("pubkey")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching accounts:", error);
      throw error;
    }

    // Deduplicate pubkeys (get most recent entry for each)
    const seen = new Set<string>();
    const pubkeys: string[] = [];
    for (const row of data || []) {
      if (!seen.has(row.pubkey)) {
        seen.add(row.pubkey);
        pubkeys.push(row.pubkey);
      }
    }

    return NextResponse.json({ pubkeys });
  } catch (e: unknown) {
    return apiErrorResponse("Accounts GET error", e);
  }
}
