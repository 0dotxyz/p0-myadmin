import { NextRequest, NextResponse } from "next/server";
import { supabase, createAuthenticatedClient } from "@/lib/db/supabase";
import { isValidProgram } from "@/lib/config";
import { authenticateRequest, isAuthError } from "@/lib/auth/api-auth";
import { apiErrorResponse } from "@/lib/utils/validation";

/**
 * GET /api/labels?program=marginfi
 * 
 * Returns merged default + user labels for a program.
 * Anonymous users get defaults only. Authenticated users get merged.
 */
export async function GET(req: NextRequest) {
  try {
    const program = req.nextUrl.searchParams.get("program");
    
    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    // Fetch default labels (no auth required)
    const { data: defaults, error: defaultsError } = await supabase
      .from("default_labels")
      .select("pubkey, label")
      .eq("program", program);

    if (defaultsError) {
      console.error("Error fetching default labels:", defaultsError);
      throw defaultsError;
    }

    // Check for auth token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    let userLabels: { pubkey: string; label: string }[] = [];

    if (token) {
      const authClient = createAuthenticatedClient(token);
      
      // Verify token is valid
      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      
      if (!authError && user) {
        const { data: user_labels, error: userError } = await authClient
          .from("user_labels")
          .select("pubkey, label")
          .eq("program", program);

        if (userError) {
          console.error("Error fetching user labels:", userError);
        } else {
          userLabels = user_labels || [];
        }
      }
    }

    // Return both sets for client-side merging
    return NextResponse.json({
      defaults: defaults || [],
      user: userLabels,
    });
  } catch (e: unknown) {
    return apiErrorResponse("Labels GET error", e);
  }
}

/**
 * POST /api/labels
 * 
 * Create or update a user label.
 * Body: { program, pubkey, label }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;
    const { user, client } = auth;

    const body = await req.json();
    const { program, pubkey, label } = body;

    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    if (!pubkey || typeof pubkey !== "string") {
      return NextResponse.json(
        { error: "Invalid pubkey", code: "invalid_input" },
        { status: 400 }
      );
    }

    if (!label || typeof label !== "string") {
      return NextResponse.json(
        { error: "Invalid label", code: "invalid_input" },
        { status: 400 }
      );
    }

    // Upsert label
    const { error } = await client
      .from("user_labels")
      .upsert(
        {
          user_id: user.id,
          program,
          pubkey,
          label,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,program,pubkey" }
      );

    if (error) {
      console.error("Error upserting label:", error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiErrorResponse("Labels POST error", e);
  }
}

/**
 * DELETE /api/labels?program=X&pubkey=Y
 * 
 * Delete a user label.
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;
    const { user, client } = auth;

    const program = req.nextUrl.searchParams.get("program");
    const pubkey = req.nextUrl.searchParams.get("pubkey");

    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    if (!pubkey) {
      return NextResponse.json(
        { error: "Missing pubkey", code: "invalid_input" },
        { status: 400 }
      );
    }

    const { error } = await client
      .from("user_labels")
      .delete()
      .eq("user_id", user.id)
      .eq("program", program)
      .eq("pubkey", pubkey);

    if (error) {
      console.error("Error deleting label:", error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiErrorResponse("Labels DELETE error", e);
  }
}
