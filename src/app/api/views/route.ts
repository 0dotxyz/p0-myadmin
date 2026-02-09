import { NextRequest, NextResponse } from "next/server";
import { supabase, createAuthenticatedClient } from "@/lib/db/supabase";
import { isValidProgram } from "@/lib/config";
import { authenticateRequest, isAuthError } from "@/lib/auth/api-auth";
import { apiErrorResponse } from "@/lib/utils/validation";

interface ViewWithAccounts {
  id: string;
  name: string;
  program: string;
  isDefault: boolean;
  isEditable: boolean;
  accounts: { pubkey: string; type: string | null }[];
}

/**
 * GET /api/views?program=marginfi
 * 
 * Returns default views (read-only) + user views (editable) for a program.
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

    // Fetch default views with accounts
    const { data: defaultViews, error: defaultsError } = await supabase
      .from("default_views")
      .select(`
        id,
        name,
        program,
        default_view_accounts (
          pubkey,
          type
        )
      `)
      .eq("program", program);

    if (defaultsError) {
      console.error("Error fetching default views:", defaultsError);
      throw defaultsError;
    }

    // Transform default views
    const defaults: ViewWithAccounts[] = (defaultViews || []).map((v) => ({
      id: v.id,
      name: v.name,
      program: v.program,
      isDefault: true,
      isEditable: false,
      accounts: v.default_view_accounts || [],
    }));

    // Check for auth token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    let userViews: ViewWithAccounts[] = [];

    if (token) {
      const authClient = createAuthenticatedClient(token);
      
      // Verify token is valid
      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      
      if (!authError && user) {
        const { data: user_views, error: userError } = await authClient
          .from("user_views")
          .select(`
            id,
            name,
            program,
            user_view_accounts (
              pubkey,
              type
            )
          `)
          .eq("program", program);

        if (userError) {
          console.error("Error fetching user views:", userError);
        } else {
          userViews = (user_views || []).map((v) => ({
            id: v.id,
            name: v.name,
            program: v.program,
            isDefault: false,
            isEditable: true,
            accounts: v.user_view_accounts || [],
          }));
        }
      }
    }

    return NextResponse.json({
      views: [...defaults, ...userViews],
    });
  } catch (e: unknown) {
    return apiErrorResponse("Views GET error", e);
  }
}

/**
 * POST /api/views
 * 
 * Create a new user view.
 * Body: { program, name }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;
    const { user, client } = auth;

    const body = await req.json();
    const { program, name } = body;

    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Invalid view name", code: "invalid_input" },
        { status: 400 }
      );
    }

    // Create view
    const { data: view, error } = await client
      .from("user_views")
      .insert({
        user_id: user.id,
        program,
        name: name.trim(),
      })
      .select("id, name, program")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        return NextResponse.json(
          { error: "A view with this name already exists", code: "duplicate" },
          { status: 400 }
        );
      }
      console.error("Error creating view:", error);
      throw error;
    }

    return NextResponse.json({
      view: {
        ...view,
        isDefault: false,
        isEditable: true,
        accounts: [],
      },
    });
  } catch (e: unknown) {
    return apiErrorResponse("Views POST error", e);
  }
}
