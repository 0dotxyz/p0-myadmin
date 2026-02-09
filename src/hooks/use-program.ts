"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { 
  PROGRAMS, 
  DEFAULT_PROGRAM, 
  isValidProgram,
  getIdl,
  getAccountTypes,
  type ProgramId 
} from "@/lib/config";
import type { Idl } from "@coral-xyz/anchor";

/**
 * Hook for managing the current program selection
 * 
 * Program is stored in URL query param: ?program=marginfi
 * This enables sharing links to specific programs.
 */
export function useProgram() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get current program from URL, fallback to default
  const programId = useMemo((): ProgramId => {
    const param = searchParams.get("program");
    if (param && isValidProgram(param)) {
      return param;
    }
    return DEFAULT_PROGRAM;
  }, [searchParams]);

  // Get program config
  const program = useMemo(() => PROGRAMS[programId], [programId]);

  // Get IDL for current program
  const idl: Idl = useMemo(() => getIdl(programId), [programId]);

  // Get account types for current program
  const accountTypes = useMemo(() => getAccountTypes(programId), [programId]);

  // Switch to a different program
  const setProgram = useCallback((newProgramId: ProgramId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("program", newProgramId);
    router.push(`/?${params.toString()}`);
  }, [searchParams, router]);

  return {
    programId,
    program,
    programAddress: program.programId,
    idl,
    accountTypes,
    setProgram,
    allPrograms: PROGRAMS,
  };
}
