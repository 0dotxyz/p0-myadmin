/**
 * Input validation and error handling utilities for API routes
 */

import { NextResponse } from "next/server";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Returns a sanitized error message for API responses.
 * In production, returns a generic message to avoid leaking internals.
 * In development, returns the full error message for debugging.
 */
export function safeErrorMessage(e: unknown, fallback = "Internal server error"): string {
  if (!IS_PRODUCTION) {
    return e instanceof Error ? e.message : "Unknown error";
  }
  return fallback;
}

/**
 * Standard error response for API catch blocks.
 * Logs the full error server-side, returns sanitized message to client.
 */
export function apiErrorResponse(
  context: string,
  e: unknown,
  status = 500,
  fallback = "Internal server error"
): NextResponse {
  console.error(`${context}:`, e);
  return NextResponse.json({ error: safeErrorMessage(e, fallback) }, { status });
}

// Base58 alphabet (used by Solana for pubkeys)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Validates that a string looks like a Solana pubkey (base58, 32-44 chars)
 */
export function isValidPubkey(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  if (value.length < 32 || value.length > 44) return false;
  
  // Check all characters are valid base58
  for (const char of value) {
    if (!BASE58_ALPHABET.includes(char)) return false;
  }
  
  return true;
}

/**
 * Validates and sanitizes a search query
 * Returns null if invalid, sanitized string if valid
 */
export function sanitizeSearchQuery(
  value: string | null,
  maxLength = 100
): string | null {
  if (!value || typeof value !== "string") return null;
  
  // Trim whitespace
  const trimmed = value.trim();
  
  // Check length
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  
  // Remove any potentially dangerous characters for LIKE queries
  // Allow alphanumeric, spaces, and common punctuation
  const sanitized = trimmed
    .replace(/[^\w\s\-_.@]/g, "")
    // Escape LIKE metacharacters so they match literally
    .replace(/[_%]/g, "\\$&");
  
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Validates an email address format
 */
export function isValidEmail(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validates a UUID format
 */
export function isValidUuid(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates pagination parameters
 */
export function validatePagination(
  page: string | null,
  limit: string | null,
  defaults = { page: 1, limit: 50, maxLimit: 100 }
): { page: number; limit: number } {
  const parsedPage = page ? parseInt(page, 10) : defaults.page;
  const parsedLimit = limit ? parseInt(limit, 10) : defaults.limit;
  
  return {
    page: Math.max(1, isNaN(parsedPage) ? defaults.page : parsedPage),
    limit: Math.min(
      defaults.maxLimit,
      Math.max(1, isNaN(parsedLimit) ? defaults.limit : parsedLimit)
    ),
  };
}
