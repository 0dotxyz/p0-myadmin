/**
 * Program Configuration
 * 
 * Defines the two marginfi programs supported by this explorer.
 * IDLs are stored as JSON files and loaded dynamically.
 */

export const PROGRAMS = {
  marginfi: {
    id: 'marginfi',
    programId: 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA',
    name: 'marginfi',
  },
  'marginfi-staging': {
    id: 'marginfi-staging',
    programId: 'stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct',
    name: 'marginfi (Staging)',
  },
} as const;

export type ProgramId = keyof typeof PROGRAMS;
export type ProgramConfig = (typeof PROGRAMS)[ProgramId];

export const PROGRAM_IDS = Object.keys(PROGRAMS) as ProgramId[];
export const DEFAULT_PROGRAM: ProgramId = 'marginfi';

/**
 * Check if a string is a valid program ID
 */
export function isValidProgram(program: string): program is ProgramId {
  return program in PROGRAMS;
}

/**
 * Get program config by ID
 */
export function getProgram(programId: ProgramId): ProgramConfig {
  return PROGRAMS[programId];
}

/**
 * Get program config by Solana address
 */
export function getProgramByAddress(address: string): ProgramConfig | undefined {
  return Object.values(PROGRAMS).find(p => p.programId === address);
}
