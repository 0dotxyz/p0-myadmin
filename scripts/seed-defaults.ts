/**
 * Seed Default Data for Programs
 *
 * Seeds default labels, favorites, and views for the marginfi programs.
 * These are admin-controlled defaults visible to all users.
 *
 * Run with: pnpm seed-defaults
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Program configuration - must match src/lib/config/programs.ts
const PROGRAMS = {
  marginfi: "marginfi",
  "marginfi-staging": "marginfi-staging",
} as const;

type ProgramId = keyof typeof PROGRAMS;

// Type definitions
interface MetadataEntry {
  label?: string;
  isFavorite?: boolean;
}

interface ViewEntry {
  name: string;
  accounts: string[];
}

/**
 * Seed default labels for a program
 */
async function seedLabels(
  programId: ProgramId,
  metadata: Record<string, MetadataEntry>
) {
  console.log(`\n  Seeding labels for ${programId}...`);

  // Extract labels only
  const labels = Object.entries(metadata)
    .filter(([_, data]) => data.label)
    .map(([pubkey, data]) => ({
      program: programId,
      pubkey,
      label: data.label!,
    }));

  if (labels.length === 0) {
    console.log(`    No labels to seed`);
    return;
  }

  // Delete existing labels for this program
  const { error: deleteError } = await supabase
    .from("default_labels")
    .delete()
    .eq("program", programId);

  if (deleteError) {
    console.error(`    Error deleting old labels:`, deleteError.message);
    return;
  }

  // Insert new labels in chunks
  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < labels.length; i += CHUNK_SIZE) {
    const chunk = labels.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("default_labels").insert(chunk);

    if (error) {
      console.error(`    Error inserting labels:`, error.message);
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`    Seeded ${inserted} labels`);
}

/**
 * Seed default favorites for a program
 */
async function seedFavorites(
  programId: ProgramId,
  metadata: Record<string, MetadataEntry>
) {
  console.log(`  Seeding favorites for ${programId}...`);

  // Extract favorites only
  const favorites = Object.entries(metadata)
    .filter(([_, data]) => data.isFavorite)
    .map(([pubkey]) => ({
      program: programId,
      pubkey,
    }));

  if (favorites.length === 0) {
    console.log(`    No favorites to seed`);
    return;
  }

  // Delete existing favorites for this program
  const { error: deleteError } = await supabase
    .from("default_favorites")
    .delete()
    .eq("program", programId);

  if (deleteError) {
    console.error(`    Error deleting old favorites:`, deleteError.message);
    return;
  }

  // Insert new favorites in chunks
  const CHUNK_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < favorites.length; i += CHUNK_SIZE) {
    const chunk = favorites.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("default_favorites").insert(chunk);

    if (error) {
      console.error(`    Error inserting favorites:`, error.message);
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`    Seeded ${inserted} favorites`);
}

/**
 * Seed default views for a program
 */
async function seedViews(programId: ProgramId, viewEntries: ViewEntry[]) {
  console.log(`  Seeding views for ${programId}...`);

  if (!viewEntries || viewEntries.length === 0) {
    console.log(`    No views to seed`);
    return;
  }

  // Get existing views for this program
  const { data: existingViews } = await supabase
    .from("default_views")
    .select("id, name")
    .eq("program", programId);

  const existingViewMap = new Map(
    (existingViews || []).map((v) => [v.name, v.id])
  );
  const newViewNames = new Set(viewEntries.map((v) => v.name));

  // Delete views that no longer exist in the JSON
  for (const [name, id] of existingViewMap) {
    if (!newViewNames.has(name)) {
      await supabase.from("default_view_accounts").delete().eq("view_id", id);
      await supabase.from("default_views").delete().eq("id", id);
      console.log(`    Deleted stale view "${name}"`);
    }
  }

  // Process each view
  for (const viewEntry of viewEntries) {
    if (!viewEntry.name || !Array.isArray(viewEntry.accounts)) {
      console.warn(`    Invalid view entry, skipping:`, viewEntry);
      continue;
    }

    let viewId: string;

    if (existingViewMap.has(viewEntry.name)) {
      // Update existing view
      viewId = existingViewMap.get(viewEntry.name)!;
      console.log(`    Updating view "${viewEntry.name}"...`);

      // Delete existing accounts
      await supabase.from("default_view_accounts").delete().eq("view_id", viewId);
    } else {
      // Create new view
      const { data: newView, error: viewError } = await supabase
        .from("default_views")
        .insert({
          program: programId,
          name: viewEntry.name,
        })
        .select("id")
        .single();

      if (viewError || !newView) {
        console.error(`    Error creating view "${viewEntry.name}":`, viewError?.message);
        continue;
      }

      viewId = newView.id;
      console.log(`    Created view "${viewEntry.name}"`);
    }

    // Insert view accounts
    if (viewEntry.accounts.length > 0) {
      const viewAccounts = viewEntry.accounts.map((pubkey) => ({
        view_id: viewId,
        pubkey,
        type: null, // Could be enhanced to include account type
      }));

      const { error: accountsError } = await supabase
        .from("default_view_accounts")
        .insert(viewAccounts);

      if (accountsError) {
        console.error(`    Error adding accounts to view:`, accountsError.message);
      } else {
        console.log(`      Added ${viewEntry.accounts.length} accounts`);
      }
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Seeding Default Data for Programs");
  console.log("=".repeat(60));

  // Load metadata file
  const metadataPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "defaults",
    "account-metadata.json"
  );

  let metadata: Record<string, Record<string, MetadataEntry>> = {};

  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    console.log("\nLoaded account-metadata.json");
  } else {
    console.warn("\naccount-metadata.json not found, skipping labels/favorites");
  }

  // Load views file
  const viewsPath = path.join(
    process.cwd(),
    "src",
    "lib",
    "defaults",
    "views.json"
  );

  let views: Record<string, ViewEntry[]> = {};

  if (fs.existsSync(viewsPath)) {
    views = JSON.parse(fs.readFileSync(viewsPath, "utf-8"));
    console.log("Loaded views.json");
  } else {
    console.warn("views.json not found, skipping views");
  }

  // Process each program
  for (const programId of Object.keys(PROGRAMS) as ProgramId[]) {
    console.log(`\n--- Processing ${programId} ---`);

    // Seed labels and favorites if we have metadata for this program
    const programMetadata = metadata[programId];
    if (programMetadata) {
      await seedLabels(programId, programMetadata);
      await seedFavorites(programId, programMetadata);
    } else {
      console.log(`  No metadata found for ${programId}`);
    }

    // Seed views if we have view definitions for this program
    const programViews = views[programId];
    if (programViews) {
      await seedViews(programId, programViews);
    } else {
      console.log(`  No views found for ${programId}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Seeding complete!");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
