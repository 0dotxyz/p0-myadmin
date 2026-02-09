import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { isValidProgram, PROGRAMS } from "@/lib/config";
import { apiErrorResponse, isValidPubkey } from "@/lib/utils/validation";

/**
 * GET /api/accounts/[pubkey]/history?program=marginfi
 * 
 * Returns historical snapshots for an account, ordered newest first.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  try {
    const { pubkey } = await params;
    const program = req.nextUrl.searchParams.get("program");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    
    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    if (!pubkey || !isValidPubkey(pubkey)) {
      return NextResponse.json(
        { error: "Invalid pubkey", code: "invalid_input" },
        { status: 400 }
      );
    }

    // Get program address
    const programAddress = PROGRAMS[program].programId;

    // Fetch history entries
    const { data, error } = await supabase
      .from("account_state")
      .select("data, slot, created_at, change_type")
      .eq("program_id", programAddress)
      .eq("pubkey", pubkey)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching account history:", error);
      throw error;
    }

    // Transform to history format
    const history = (data || []).map((entry) => ({
      slot: entry.slot,
      createdAt: entry.created_at,
      changeType: entry.change_type,
      data: entry.data,
    }));

    return NextResponse.json({ history });
  } catch (e: unknown) {
    return apiErrorResponse("Account history GET error", e);
  }
}
