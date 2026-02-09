/**
 * API route authentication helper
 *
 * Provides a reusable pattern for authenticating API requests
 * via Bearer token and Supabase auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient, User } from "@supabase/supabase-js";
import { createAuthenticatedClient } from "@/lib/db/supabase";

export interface AuthResult {
  user: User;
  client: SupabaseClient;
}

interface AuthError {
  error: string;
  code: string;
}

/**
 * Extracts and validates the Bearer token from a request.
 * Returns the authenticated user and Supabase client, or an error response.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthResult | NextResponse<AuthError>> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required", code: "unauthorized" },
      { status: 401 }
    );
  }

  const authClient = createAuthenticatedClient(token);

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid token", code: "unauthorized" },
      { status: 401 }
    );
  }

  return { user, client: authClient };
}

/**
 * Type guard to check if the auth result is an error response.
 */
export function isAuthError(
  result: AuthResult | NextResponse<AuthError>
): result is NextResponse<AuthError> {
  return result instanceof NextResponse;
}
