// Dragon's Mouth gRPC client for streaming account updates

import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeUpdate,
  SubscribeUpdateAccount,
} from "@triton-one/yellowstone-grpc";
import { ClientDuplexStream } from "@grpc/grpc-js";
import { config } from "./config";

// Decoded account update with string pubkey/owner
export interface AccountUpdate {
  pubkey: string;
  owner: string;
  lamports: bigint;
  slot: bigint;
  data: Buffer;
  executable: boolean;
  rentEpoch: bigint;
}

// Callback type for account updates
export type AccountUpdateCallback = (update: AccountUpdate) => void;

// Convert Uint8Array to base58 string (pubkey format)
function toBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let result = "";
  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  // Leading zeros
  for (const byte of bytes) {
    if (byte === 0) result += ALPHABET[0];
    else break;
  }

  // Convert digits to string
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }

  return result;
}

export class GrpcClient {
  private client: Client;
  private stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate> | null =
    null;
  private subscriptions: Map<string, string> = new Map(); // programId -> subscriptionKey
  private onAccountUpdate: AccountUpdateCallback | null = null;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 20;
  private readonly baseReconnectDelay = 1000; // 1 second
  private readonly maxReconnectDelay = 60000; // 60 seconds
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.client = new Client(config.grpc.endpoint, config.grpc.token, {});
  }

  // Set callback for account updates
  setAccountUpdateCallback(callback: AccountUpdateCallback): void {
    this.onAccountUpdate = callback;
  }

  // Connect and start streaming
  async connect(): Promise<void> {
    console.log("Connecting to Dragon's Mouth gRPC...");

    try {
      this.stream = await this.client.subscribe();
      console.log("gRPC stream connected");

      // Handle incoming messages
      this.stream.on("data", (update: SubscribeUpdate) => {
        if (process.env.DEBUG === "true") {
          // Log raw message receipt
          const keys = Object.keys(update).filter(k => (update as any)[k] != null);
          console.log(`[gRPC Raw] Message received with keys: ${keys.join(', ') || 'empty'}`);
          
          // Log filters response to see subscription status
          if (update.filters) {
            console.log(`[gRPC] Filters response:`, JSON.stringify(update.filters, null, 2));
          }
        }
        this.handleUpdate(update);
      });

      // Handle errors
      this.stream.on("error", (error: Error) => {
        console.error("gRPC stream error:", error.message);
        this.handleDisconnect();
      });

      // Handle stream end
      this.stream.on("end", () => {
        console.log("gRPC stream ended");
        this.handleDisconnect();
      });

      // Start ping interval to keep connection alive
      this.startPingInterval();

      // Re-subscribe to all programs after connect
      await this.resubscribeAll();
    } catch (error) {
      console.error("Failed to connect to gRPC:", error);
      throw error;
    }
  }

  // Subscribe to a program's accounts (adds to pending, call sendSubscriptions to commit)
  async subscribeToProgram(programId: string): Promise<void> {
    if (!this.stream) {
      throw new Error("gRPC stream not connected");
    }

    // Check if already subscribed
    if (this.subscriptions.has(programId)) {
      console.log(`Already subscribed to program: ${programId}`);
      return;
    }

    const subscriptionKey = `program_${programId}`;
    this.subscriptions.set(programId, subscriptionKey);
    console.log(`Subscribing to program: ${programId}`);
  }

  // Send all subscriptions in a single request
  async sendSubscriptions(): Promise<void> {
    if (!this.stream) {
      throw new Error("gRPC stream not connected");
    }

    if (this.subscriptions.size === 0) {
      console.log("No subscriptions to send");
      return;
    }

    // Build combined subscription request for all programs
    const accountsFilter: SubscribeRequest["accounts"] = {};
    
    for (const [programId, subscriptionKey] of this.subscriptions) {
      accountsFilter[subscriptionKey] = {
        owner: [programId],
        account: [],
        filters: [],
      };
    }

    const request: SubscribeRequest = {
      accounts: accountsFilter,
      slots: {
        slots: {
          filterByCommitment: true,
        },
      },
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      commitment: CommitmentLevel.CONFIRMED,
      accountsDataSlice: [],
    };
    
    if (process.env.DEBUG === "true") {
      console.log(`[gRPC] Combined subscription request:`, JSON.stringify(request, null, 2));
    }

    // Send subscription request
    return new Promise((resolve, reject) => {
      this.stream!.write(request, (error: Error | null | undefined) => {
        if (error) {
          console.error(`Failed to send subscriptions:`, error);
          reject(error);
        } else {
          console.log(`Sent subscriptions for ${this.subscriptions.size} programs`);
          resolve();
        }
      });
    });
  }

  // Unsubscribe from a program
  async unsubscribeFromProgram(programId: string): Promise<void> {
    if (!this.stream) {
      throw new Error("gRPC stream not connected");
    }

    const subscriptionKey = this.subscriptions.get(programId);
    if (!subscriptionKey) {
      console.log(`Not subscribed to program: ${programId}`);
      return;
    }

    console.log(`Unsubscribing from program: ${programId}`);

    // Send empty subscription to remove
    const request: SubscribeRequest = {
      accounts: {},
      slots: {},
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [],
    };

    return new Promise((resolve, reject) => {
      this.stream!.write(request, (error: Error | null | undefined) => {
        if (error) {
          reject(error);
        } else {
          this.subscriptions.delete(programId);
          console.log(`Unsubscribed from program: ${programId}`);
          resolve();
        }
      });
    });
  }

  // Get list of subscribed programs
  getSubscribedPrograms(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // Handle incoming updates
  private handleUpdate(update: SubscribeUpdate): void {
    // Debug: log all update types received
    if (process.env.DEBUG === "true") {
      const updateTypes = Object.keys(update).filter(k => (update as any)[k] != null);
      if (updateTypes.length > 0 && !updateTypes.includes('pong')) {
        console.log(`[gRPC] Received update types: ${updateTypes.join(', ')}`);
      }
    }

    // Handle pong responses
    if (update.pong) {
      if (process.env.DEBUG === "true") {
        console.log(`[gRPC] Pong received`);
      }
      return;
    }

    // Handle account updates
    if (update.account) {
      if (process.env.DEBUG === "true") {
        console.log(`[gRPC] Account update: ${update.account.account?.pubkey ? 'has pubkey' : 'no pubkey'}`);
      }
      this.handleAccountUpdate(update.account);
    }

    // Handle slot updates (for tracking last_slot)
    if (update.slot) {
      if (process.env.DEBUG === "true") {
        console.log(`[gRPC] Slot update: ${update.slot.slot}`);
      }
    }
  }

  // Process account update
  private handleAccountUpdate(update: SubscribeUpdateAccount): void {
    const accountInfo = update.account;
    if (!accountInfo) return;

    const decoded: AccountUpdate = {
      pubkey: toBase58(accountInfo.pubkey),
      owner: toBase58(accountInfo.owner),
      lamports: BigInt(accountInfo.lamports),
      slot: BigInt(update.slot),
      data: Buffer.from(accountInfo.data),
      executable: accountInfo.executable,
      rentEpoch: BigInt(accountInfo.rentEpoch),
    };

    // Call the callback if set
    if (this.onAccountUpdate) {
      this.onAccountUpdate(decoded);
    }
  }

  // Handle disconnection with exponential backoff
  private handleDisconnect(): void {
    if (this.reconnecting) return;

    this.reconnecting = true;
    this.stopPingInterval();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `gRPC: Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up. Manual restart required.`
      );
      this.reconnecting = false;
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 60s
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log(
      `gRPC: Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${(delay / 1000).toFixed(1)}s...`
    );

    setTimeout(async () => {
      try {
        await this.connect();
        console.log(`gRPC: Reconnected successfully after ${this.reconnectAttempts} attempt(s)`);
        this.reconnectAttempts = 0; // Reset on success
        this.reconnecting = false;
      } catch (error) {
        console.error("gRPC: Reconnection failed:", error);
        this.reconnecting = false;
        this.handleDisconnect(); // Try again with incremented backoff
      }
    }, delay);
  }

  // Re-subscribe to all programs after reconnect
  private async resubscribeAll(): Promise<void> {
    const programs = Array.from(this.subscriptions.keys());
    this.subscriptions.clear(); // Clear so subscribeToProgram works

    for (const programId of programs) {
      try {
        await this.subscribeToProgram(programId);
      } catch (error) {
        console.error(`Failed to resubscribe to ${programId}:`, error);
      }
    }
  }

  // Start ping interval to keep connection alive
  private startPingInterval(): void {
    this.stopPingInterval();

    // Send ping every 30 seconds
    this.pingInterval = setInterval(() => {
      if (this.stream) {
        const pingRequest: SubscribeRequest = {
          accounts: {},
          slots: {},
          transactions: {},
          transactionsStatus: {},
          blocks: {},
          blocksMeta: {},
          entry: {},
          accountsDataSlice: [],
          ping: { id: Date.now() },
        };

        this.stream.write(pingRequest, (error: Error | null | undefined) => {
          if (error) {
            console.error("Ping failed:", error);
          }
        });
      }
    }, 30000);
  }

  // Stop ping interval
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // Graceful shutdown
  async disconnect(): Promise<void> {
    this.stopPingInterval();

    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    this.subscriptions.clear();
    console.log("gRPC client disconnected");
  }
}
