# AGENTS.md - AI Coding Agent Guidelines

Guidelines for AI coding agents working in the SolanaMyAdmin codebase.

## Project Overview

SolanaMyAdmin is a Solana program explorer built with Next.js 16 (App Router), React 19, and TypeScript. It follows a "Lightweight Index, Heavy Client" architecture - indexing only pubkeys/types in Supabase, with JIT binary data fetching from Solana RPC.

## Build & Development Commands

```bash
pnpm dev              # Start Next.js dev server
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # Run ESLint (flat config)
pnpm indexer          # Run Solana account indexer
pnpm seed-defaults    # Seed default labels, favorites, and views
```

### Running Scripts Manually

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' ts-node scripts/<script-name>.ts
```

### Testing

No test framework configured. When adding tests, use Vitest (recommended for Next.js).

## Code Style Guidelines

### Naming Conventions

| Type | Convention | Examples |
|------|------------|----------|
| Files | kebab-case | `use-auth.ts`, `data-service.ts` |
| Components | PascalCase | `Sidebar`, `AccountFilter` |
| Functions/Variables | camelCase | `fetchAccounts`, `signInWithEmail` |
| Constants | UPPER_SNAKE_CASE | `TOKEN_PROGRAM_ID` |
| Types/Interfaces | PascalCase | `AccountMeta`, `AccountRow` |
| Props interfaces | `*Props` suffix | `SidebarProps` |
| Booleans | `is*`/`has*` prefix | `isLoading`, `hasError` |

### Import Order

1. React/Next.js imports
2. Third-party libraries  
3. Internal `@/` imports (components, hooks, lib)
4. Relative imports (use sparingly)

```typescript
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
```

### Path Aliases

Use `@/*` alias for all internal imports (maps to `./src/*`):

```typescript
import { supabase } from "@/lib/db/supabase";
import { Sidebar } from "@/components/sidebar";
```

## TypeScript Configuration

- **Strict mode** enabled (`strict: true`)
- **Implicit any allowed** (`noImplicitAny: false`)
- Target: ES2020, Module resolution: bundler

When explicit typing needed for external data:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data = response as any;
```

## Error Handling Patterns

### API Routes

```typescript
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // ... business logic
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: unknown) {
    console.error("Descriptive error message:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### Client-Side Hooks

```typescript
} catch (e: unknown) {
  console.error("Error fetching data:", e);
  if (e instanceof Error) {
    setError(e.message);
  } else {
    setError("An unknown error occurred");
  }
}
```

### HTTP Status Codes

- `401`: Unauthorized (missing/invalid auth)
- `404`: Resource not found
- `500`: Server/unknown errors

## Component Patterns

- Mark interactive components with `"use client"` directive
- **Named exports** for components: `export function Sidebar() {}`
- **Default exports** for pages: `export default function DashboardPage() {}`
- Use **shadcn/ui** (Radix + Tailwind) from `src/components/ui/`
- Use `cn()` utility for conditional classes:

```typescript
import { cn } from "@/lib/utils";
<div className={cn("base-classes", conditional && "conditional-classes")} />
```

## Authentication Pattern

API routes authenticate via Bearer token:

```typescript
const authHeader = req.headers.get("authorization");
const token = authHeader?.split(" ")[1];
const { data: { user }, error } = await supabase.auth.getUser(token);
```

## Key Architecture Concepts

1. **DataService** (`src/lib/solana/data-service.ts`): Switches between DB (mainnet) and RPC (devnet/testnet) strategies
2. **Enrichment Engine** (`src/lib/utils/enricher.ts`): Transforms raw Solana data into human-readable format
3. **Indexer** (`scripts/indexer.ts`): Background worker populating account indexes

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   └── auth/              # Auth callbacks
├── components/
│   ├── ui/                # shadcn/ui primitives
│   └── *.tsx              # Feature components
├── hooks/                 # Custom React hooks (use-*.ts)
├── lib/
│   ├── db/                # Supabase client
│   ├── solana/            # Solana utilities
│   └── utils/             # Utility functions
└── middleware.ts          # Auth middleware
```

## Dependencies Reference

- **Framework**: Next.js 16, React 19, TypeScript 5
- **Styling**: Tailwind CSS 4, shadcn/ui, lucide-react icons
- **Solana**: @solana/kit, @coral-xyz/anchor
- **Database**: Supabase (@supabase/supabase-js, @supabase/ssr)
- **Utilities**: date-fns, bn.js, jsondiffpatch, p-map
