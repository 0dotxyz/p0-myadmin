import { NextRequest, NextResponse } from "next/server";
import { supabase, createAuthenticatedClient } from "@/lib/db/supabase";
import { isValidProgram, PROGRAMS } from "@/lib/config";
import { sanitizeSearchQuery, apiErrorResponse } from "@/lib/utils/validation";

interface SearchResult {
  pubkey: string;
  label?: string;
  isDefault?: boolean;
}

/**
 * GET /api/search?program=marginfi&q=SDC
 *
 * Search for accounts by pubkey (contains) or label (contains).
 * Always searches both pubkeys and labels, merges results.
 * Minimum query length: 3 characters.
 */
export async function GET(req: NextRequest) {
  try {
    const program = req.nextUrl.searchParams.get("program");
    const query = req.nextUrl.searchParams.get("q");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);

    if (!program || !isValidProgram(program)) {
      return NextResponse.json(
        { error: "Invalid program", code: "invalid_program" },
        { status: 400 }
      );
    }

    if (!query || query.trim().length < 3) {
      return NextResponse.json({ results: [] });
    }

    // Sanitize search query to escape LIKE metacharacters
    const searchQuery = sanitizeSearchQuery(query);
    if (!searchQuery) {
      return NextResponse.json({ results: [] });
    }
    const programAddress = PROGRAMS[program].programId;

    // Check for auth token
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    const results: SearchResult[] = [];
    const seenPubkeys = new Set<string>();

    // Run all searches in parallel
    const [pubkeyResults, defaultLabelResults, userLabelResults] =
      await Promise.all([
        // 1. Pubkey contains search
        supabase
          .from("account_state")
          .select("pubkey")
          .eq("program_id", programAddress)
          .ilike("pubkey", `%${searchQuery}%`)
          .order("created_at", { ascending: false })
          .limit(limit * 2), // Fetch more to account for deduplication

        // 2. Default labels contains search
        supabase
          .from("default_labels")
          .select("pubkey, label")
          .eq("program", program)
          .ilike("label", `%${searchQuery}%`)
          .limit(limit),

        // 3. User labels contains search (if authenticated)
        token
          ? (async () => {
              const authClient = createAuthenticatedClient(token);
              const {
                data: { user },
                error: authError,
              } = await authClient.auth.getUser(token);

              if (authError || !user) return { data: null, error: null };

              return authClient
                .from("user_labels")
                .select("pubkey, label")
                .eq("program", program)
                .ilike("label", `%${searchQuery}%`)
                .limit(limit);
            })()
          : Promise.resolve({ data: null, error: null }),
      ]);

    // Process label results first (they have more context)
    // Default labels
    if (!defaultLabelResults.error && defaultLabelResults.data) {
      for (const row of defaultLabelResults.data) {
        if (!seenPubkeys.has(row.pubkey)) {
          seenPubkeys.add(row.pubkey);
          results.push({
            pubkey: row.pubkey,
            label: row.label,
            isDefault: true,
          });
        }
      }
    }

    // User labels (override defaults)
    if (!userLabelResults.error && userLabelResults.data) {
      for (const row of userLabelResults.data) {
        if (!seenPubkeys.has(row.pubkey)) {
          seenPubkeys.add(row.pubkey);
          results.push({
            pubkey: row.pubkey,
            label: row.label,
            isDefault: false,
          });
        } else {
          // User label overrides default - update existing result
          const idx = results.findIndex((r) => r.pubkey === row.pubkey);
          if (idx !== -1) {
            results[idx].label = row.label;
            results[idx].isDefault = false;
          }
        }
      }
    }

    // Then add pubkey matches (without labels unless they have one)
    if (!pubkeyResults.error && pubkeyResults.data) {
      for (const row of pubkeyResults.data) {
        if (!seenPubkeys.has(row.pubkey) && results.length < limit) {
          seenPubkeys.add(row.pubkey);
          results.push({ pubkey: row.pubkey });
        }
      }
    }

    return NextResponse.json({
      results: results.slice(0, limit),
    });
  } catch (e: unknown) {
    return apiErrorResponse("Search GET error", e);
  }
}
