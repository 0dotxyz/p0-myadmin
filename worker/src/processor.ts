/**
 * Change detection and storage processor
 *
 * Buffers incoming updates, compares hashes, and stores changes.
 * Simplified for internal tool - no subscription slot updates.
 */

import { createHash } from "crypto";
import { config } from "./config";
import { getLatestHashes, insertAccountStates, AccountState } from "./db";
import { AccountUpdate } from "./grpc";

// Debug mode - set DEBUG=true in environment to enable verbose logging
const DEBUG = process.env.DEBUG === "true";

// Buffered update with computed hash
interface BufferedUpdate {
  pubkey: string;
  programId: string;
  slot: bigint;
  data: Buffer;
  dataHash: string;
  discriminator: string | null;
  isDeleted: boolean;
}

export class ChangeProcessor {
  private buffer: Map<string, BufferedUpdate> = new Map();
  private processInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  // Stats for logging
  private stats = {
    updatesReceived: 0,
    changesDetected: 0,
    lastProcessedSlot: 0n,
  };

  constructor() {}

  // Start the processor
  start(): void {
    if (this.processInterval) return;

    console.log(
      `Starting change processor (buffer interval: ${config.worker.updateBufferInterval}ms, debug: ${DEBUG})`
    );

    this.processInterval = setInterval(() => {
      this.processBuffer();
    }, config.worker.updateBufferInterval);
  }

  // Stop the processor
  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  // Add an update to the buffer
  addUpdate(update: AccountUpdate): void {
    this.stats.updatesReceived++;

    // Compute hash of account data
    const dataHash = createHash("sha256").update(update.data).digest("hex");

    // Extract discriminator (first 8 bytes as hex)
    const discriminator =
      update.data.length >= 8
        ? update.data.subarray(0, 8).toString("hex")
        : null;

    // Check if account is deleted (zero lamports or empty data)
    const isDeleted = update.lamports === 0n || update.data.length === 0;

    const buffered: BufferedUpdate = {
      pubkey: update.pubkey,
      programId: update.owner,
      slot: update.slot,
      data: update.data,
      dataHash,
      discriminator,
      isDeleted,
    };

    // Buffer by pubkey - later updates for same pubkey overwrite earlier ones
    this.buffer.set(update.pubkey, buffered);

    // Track latest slot
    if (update.slot > this.stats.lastProcessedSlot) {
      this.stats.lastProcessedSlot = update.slot;
    }
  }

  // Process the buffer
  private async processBuffer(): Promise<void> {
    if (this.isProcessing || this.buffer.size === 0) return;

    this.isProcessing = true;

    try {
      // Get all buffered updates and clear after processing
      const updates = Array.from(this.buffer.values());

      // Group updates by program for batch hash lookups
      const updatesByProgram = new Map<string, BufferedUpdate[]>();
      for (const update of updates) {
        const existing = updatesByProgram.get(update.programId) || [];
        existing.push(update);
        updatesByProgram.set(update.programId, existing);
      }

      // Process each program's updates
      const states: AccountState[] = [];

      for (const [programId, programUpdates] of updatesByProgram) {
        // Batch query for latest hashes for this program
        const pubkeys = programUpdates.map((u) => u.pubkey);
        const existingHashes = await getLatestHashes(programId, pubkeys);

        if (DEBUG) {
          console.log(
            `[Debug] Hash lookup for ${programId.slice(0, 8)}...: ${pubkeys.length} queried, ${existingHashes.size} had baselines`
          );
        }

        for (const update of programUpdates) {
          const existingHash = existingHashes.get(update.pubkey);

          // Only store changes for accounts that have a baseline (existing hash)
          // Skip accounts we've never seen - they need indexer-created baseline first
          if (!existingHash) {
            continue;
          }

          // Check if data actually changed
          if (existingHash !== update.dataHash) {
            const changeType: "update" | "delete" = update.isDeleted
              ? "delete"
              : "update";

            states.push({
              pubkey: update.pubkey,
              program_id: update.programId,
              discriminator: update.discriminator,
              slot: Number(update.slot),
              change_type: changeType,
              data: update.data.toString("base64"),
              data_hash: update.dataHash,
            });

            this.stats.changesDetected++;

            if (DEBUG) {
              console.log(
                `[Debug] Change detected: ${update.pubkey.slice(0, 8)}... | ${changeType}`
              );
            }
          }
        }
      }

      // Insert states if any
      if (states.length > 0) {
        await insertAccountStates(states);
        console.log(
          `Inserted ${states.length} changes | slot=${this.stats.lastProcessedSlot}`
        );
      }

      // Clear buffer only after all DB operations succeed
      this.buffer.clear();
    } catch (error) {
      console.error("Error processing buffer:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Get current stats
  getStats(): {
    updatesReceived: number;
    changesDetected: number;
    lastProcessedSlot: bigint;
    bufferSize: number;
  } {
    return {
      ...this.stats,
      bufferSize: this.buffer.size,
    };
  }

  // Force process any remaining updates (for shutdown)
  async flush(): Promise<void> {
    if (this.buffer.size > 0) {
      console.log(`Flushing ${this.buffer.size} buffered updates...`);
      await this.processBuffer();
    }
  }
}
