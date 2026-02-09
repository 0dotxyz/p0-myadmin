/**
 * Project0MyAdmin Streaming Worker
 *
 * Connects to Dragon's Mouth gRPC and streams account changes to Supabase.
 * Simplified for internal tool - subscribes to both marginfi programs on startup.
 */

import { config, validateConfig, PROGRAMS } from "./config";
import { initDb } from "./db";
import { GrpcClient, AccountUpdate } from "./grpc";
import { ChangeProcessor } from "./processor";

// Global state
let grpcClient: GrpcClient;
let processor: ChangeProcessor;
let isShuttingDown = false;

// Log stats periodically
function logStats(): void {
  const stats = processor.getStats();
  console.log(
    `[Stats] received=${stats.updatesReceived} | ` +
      `changes=${stats.changesDetected} | ` +
      `buffer=${stats.bufferSize} | ` +
      `slot=${stats.lastProcessedSlot} | ` +
      `programs=${grpcClient.getSubscribedPrograms().length}`
  );
}

async function main() {
  console.log("=".repeat(60));
  console.log("Project0MyAdmin Streaming Worker");
  console.log("=".repeat(60));

  // Validate configuration
  try {
    validateConfig();
    console.log("Configuration validated");
  } catch (error) {
    console.error("Configuration error:", error);
    process.exit(1);
  }

  // Initialize database
  initDb();
  console.log("Database initialized");

  // Initialize processor
  processor = new ChangeProcessor();

  // Initialize gRPC client
  grpcClient = new GrpcClient();
  grpcClient.setAccountUpdateCallback((update: AccountUpdate) => {
    processor.addUpdate(update);
  });

  // Connect to Dragon's Mouth
  try {
    await grpcClient.connect();
  } catch (error) {
    console.error("Failed to connect to gRPC:", error);
    process.exit(1);
  }

  // Start the change processor
  processor.start();

  // Subscribe to both hardcoded programs
  const programs = Object.values(PROGRAMS);
  console.log(`Subscribing to ${programs.length} programs...`);

  for (const program of programs) {
    try {
      await grpcClient.subscribeToProgram(program.programId);
      console.log(`Added subscription for ${program.id} (${program.programId})`);
    } catch (error) {
      console.error(`Failed to add subscription for ${program.id}:`, error);
    }
  }

  // Send all subscriptions in a single request
  try {
    await grpcClient.sendSubscriptions();
  } catch (error) {
    console.error("Failed to send subscriptions:", error);
    process.exit(1);
  }

  // Start stats logging interval (every 30 seconds)
  const statsInterval = setInterval(logStats, 30000);

  console.log("=".repeat(60));
  console.log("Worker started successfully");
  console.log(`gRPC endpoint: ${config.grpc.endpoint}`);
  console.log(
    `Update buffer interval: ${config.worker.updateBufferInterval}ms`
  );
  console.log(`Programs: ${programs.map((p) => p.id).join(", ")}`);
  console.log("=".repeat(60));

  // Handle graceful shutdown
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log("\nShutting down...");

    // Stop intervals
    clearInterval(statsInterval);

    // Stop processor and flush remaining updates
    processor.stop();
    await processor.flush();

    // Disconnect gRPC
    await grpcClient.disconnect();

    console.log("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Start the worker
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
