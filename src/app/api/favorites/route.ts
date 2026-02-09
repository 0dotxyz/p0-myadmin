import { NextRequest, NextResponse } from "next/server";
import { supabase, createAuthenticatedClient } from "@/lib/db/supabase";
import { isValidProgram } from "@/lib/config";
import { authenticateRequest, isAuthError } from "@/lib/auth/api-auth";
import { apiErrorResponse } from "@/lib/utils/validation";

/**
 * GET /api/favorites?program=marginfi
 * 
 * Returns merged default + user favorites for a program.
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

    // Fetch default favorites (no auth required)
    const { data: defaults, error: defaultsError } = await supabase
      .from("default_favorites")
      .select("pubkey")
      .eq("program", program);

    if (defaultsError) {
      console.error("Error fetching default favorites:", defaultsError);
      throw defaultsError;
    }

    // Check for auth token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    let userFavorites: { pubkey: string }[] = [];

    if (token) {
      const authClient = createAuthenticatedClient(token);
      
      // Verify token is valid
      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      
      if (!authError && user) {
        const { data: user_favorites, error: userError } = await authClient
          .from("user_favorites")
          .select("pubkey")
          .eq("program", program);

        if (userError) {
          console.error("Error fetching user favorites:", userError);
        } else {
          userFavorites = user_favorites || [];
        }
      }
    }

    // Return both sets for client-side merging
    return NextResponse.json({
      defaults: (defaults || []).map((f) => f.pubkey),
      user: userFavorites.map((f) => f.pubkey),
    });
  } catch (e: unknown) {
    return apiErrorResponse("Favorites GET error", e);
  }
}

/**
 * POST /api/favorites
 * 
 * Add a user favorite.
 * Body: { program, pubkey }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;
    const { user, client } = auth;

    const body = await req.json();
    const { program, pubkey } = body;

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

    // Insert favorite (ignore if exists)
    const { error } = await client
      .from("user_favorites")
      .upsert(
        {
          user_id: user.id,
          program,
          pubkey,
        },
        { onConflict: "user_id,program,pubkey", ignoreDuplicates: true }
      );

    if (error) {
      console.error("Error inserting favorite:", error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiErrorResponse("Favorites POST error", e);
  }
}

/**
 * DELETE /api/favorites?program=X&pubkey=Y
 * 
 * Remove a user favorite.
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
      .from("user_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("program", program)
      .eq("pubkey", pubkey);

    if (error) {
      console.error("Error deleting favorite:", error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiErrorResponse("Favorites DELETE error", e);
  }
}
