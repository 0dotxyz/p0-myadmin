/**
 * IDL Loader
 * 
 * Loads IDL files for each program.
 * IDLs are imported statically to enable tree-shaking and type checking.
 */

import type { Idl } from "@coral-xyz/anchor";
import { ProgramId } from "./programs";

// Import IDLs statically
import marginfiIdl from "@/lib/idl/marginfi.json";
import marginfiStagingIdl from "@/lib/idl/marginfi-staging.json";

// Type assertion for IDLs
const IDLS: Record<ProgramId, Idl> = {
  marginfi: marginfiIdl as unknown as Idl,
  "marginfi-staging": marginfiStagingIdl as unknown as Idl,
};

/**
 * Get IDL for a program
 */
export function getIdl(programId: ProgramId): Idl {
  return IDLS[programId];
}

/**
 * Get account types from IDL
 */
export function getAccountTypes(programId: ProgramId): string[] {
  const idl = getIdl(programId);
  if (!idl.accounts) return [];
  return idl.accounts.map((acc: { name: string }) => acc.name).sort();
}

/**
 * Get discriminator for an account type
 */
export function getDiscriminator(programId: ProgramId, accountType: string): Buffer | null {
  const idl = getIdl(programId);
  if (!idl.accounts) return null;
  
  const account = idl.accounts.find(
    (acc: { name: string; discriminator?: number[] }) => acc.name === accountType
  );
  
  if (!account || !account.discriminator) return null;
  return Buffer.from(account.discriminator);
}

/**
 * Get account type from discriminator
 */
export function getAccountTypeFromDiscriminator(
  programId: ProgramId, 
  discriminator: Buffer
): string | null {
  const idl = getIdl(programId);
  if (!idl.accounts) return null;
  
  const discHex = discriminator.toString("hex");
  
  const account = idl.accounts.find(
    (acc: { name: string; discriminator?: number[] }) => {
      if (!acc.discriminator) return false;
      return Buffer.from(acc.discriminator).toString("hex") === discHex;
    }
  );
  
  return account?.name ?? null;
}
