import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { isValidProgram, PROGRAMS } from "@/lib/config";
import { apiErrorResponse, isValidPubkey } from "@/lib/utils/validation";

/**
 * GET /api/accounts/[pubkey]?program=marginfi
 * 
 * Returns the latest account data for a pubkey.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  try {
    const { pubkey } = await params;
    const program = req.nextUrl.searchParams.get("program");
    
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

    // Get the latest entry for this pubkey
    const { data, error } = await supabase
      .from("account_state")
      .select("data, slot, created_at, change_type, discriminator")
      .eq("program_id", programAddress)
      .eq("pubkey", pubkey)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned
        return NextResponse.json(
          { error: "Account not found", code: "not_found" },
          { status: 404 }
        );
      }
      console.error("Error fetching account:", error);
      throw error;
    }

    // Check if account was deleted
    if (data.change_type === "delete") {
      return NextResponse.json(
        { error: "Account has been deleted", code: "deleted" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: data.data,
      slot: data.slot,
      createdAt: data.created_at,
      discriminator: data.discriminator,
    });
  } catch (e: unknown) {
    return apiErrorResponse("Account GET error", e);
  }
}
