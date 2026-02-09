/**
 * Configuration for the streaming worker
 * 
 * Hardcoded for the two marginfi programs.
 */

import "dotenv/config";

// Program configuration - must match src/lib/config/programs.ts
export const PROGRAMS = {
  marginfi: {
    id: "marginfi",
    programId: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  },
  "marginfi-staging": {
    id: "marginfi-staging",
    programId: "stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct",
  },
} as const;

export type ProgramKey = keyof typeof PROGRAMS;
export const PROGRAM_IDS = Object.values(PROGRAMS).map((p) => p.programId);

export const config = {
  // Triton Dragon's Mouth gRPC
  grpc: {
    endpoint: process.env.GRPC_ENDPOINT || "",
    token: process.env.GRPC_TOKEN || "",
  },

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },

  // Worker settings
  worker: {
    // How long to buffer updates before processing (ms)
    updateBufferInterval: parseInt(process.env.UPDATE_BUFFER_MS || "100"),

    // Max changes to keep per account (enforced by cleanup job)
    maxChangesPerAccount: parseInt(
      process.env.MAX_CHANGES_PER_ACCOUNT || "10"
    ),
  },
};

// Validate required config
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.grpc.endpoint) {
    errors.push("GRPC_ENDPOINT is required");
  }
  if (!config.grpc.token) {
    errors.push("GRPC_TOKEN is required");
  }
  if (!config.supabase.url) {
    errors.push("SUPABASE_URL is required");
  }
  if (!config.supabase.serviceRoleKey) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is required");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }
}
