import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthError } from "@/lib/auth/api-auth";
import { apiErrorResponse, isValidUuid } from "@/lib/utils/validation";

/**
 * DELETE /api/views/[id]
 * 
 * Delete a user view (and its accounts via cascade).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;
    const { client } = auth;

    const { id } = await params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid view ID", code: "invalid_input" },
        { status: 400 }
      );
    }

    // Delete view (RLS will prevent deleting others' views)
    const { error, count } = await client
      .from("user_views")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      console.error("Error deleting view:", error);
      throw error;
    }

    if (count === 0) {
      return NextResponse.json(
        { error: "View not found or not authorized", code: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return apiErrorResponse("Views DELETE error", e);
  }
}

/**
 * POST /api/views/[id]
 * 
 * Update a user view: rename and/or add/remove accounts.
 * Body: { name?, add?: { pubkey, type? }[], remove?: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (isAuthError(auth)) return auth;
    const { client } = auth;

    const { id } = await params;
    const body = await req.json();
    const { name, add, remove } = body as {
      name?: string;
      add?: { pubkey: string; type?: string }[];
      remove?: string[];
    };

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid view ID", code: "invalid_input" },
        { status: 400 }
      );
    }

    // Verify view exists and belongs to user
    const { data: view, error: viewError } = await client
      .from("user_views")
      .select("id")
      .eq("id", id)
      .single();

    if (viewError || !view) {
      return NextResponse.json(
        { error: "View not found or not authorized", code: "not_found" },
        { status: 404 }
      );
    }

    // Update name if provided
    if (name && typeof name === "string" && name.trim().length > 0) {
      const { error: updateError } = await client
        .from("user_views")
        .update({ 
          name: name.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        if (updateError.code === "23505") {
          return NextResponse.json(
            { error: "A view with this name already exists", code: "duplicate" },
            { status: 400 }
          );
        }
        throw updateError;
      }
    }

    // Remove accounts if specified
    if (remove && Array.isArray(remove) && remove.length > 0) {
      const { error: removeError } = await client
        .from("user_view_accounts")
        .delete()
        .eq("view_id", id)
        .in("pubkey", remove);

      if (removeError) {
        console.error("Error removing accounts from view:", removeError);
        throw removeError;
      }
    }

    // Add accounts if specified
    if (add && Array.isArray(add) && add.length > 0) {
      const inserts = add.map((a) => ({
        view_id: id,
        pubkey: a.pubkey,
        type: a.type || null,
      }));

      const { error: addError } = await client
        .from("user_view_accounts")
        .upsert(inserts, { onConflict: "view_id,pubkey", ignoreDuplicates: true });

      if (addError) {
        console.error("Error adding accounts to view:", addError);
        throw addError;
      }
    }

    // Fetch updated view
    const { data: updatedView, error: fetchError } = await client
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
      .eq("id", id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    return NextResponse.json({
      view: {
        id: updatedView.id,
        name: updatedView.name,
        program: updatedView.program,
        isDefault: false,
        isEditable: true,
        accounts: updatedView.user_view_accounts || [],
      },
    });
  } catch (e: unknown) {
    return apiErrorResponse("Views POST update error", e);
  }
}
