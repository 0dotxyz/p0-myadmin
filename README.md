# SolanaMyAdmin

A Solana program explorer. Browse, search, and track on-chain account data with labels, favorites, and historical snapshots.

## Architecture

SolanaMyAdmin follows a **"Lightweight Index, Heavy Client"** pattern:

- **Supabase** stores only pubkeys, discriminators, and change hashes (lightweight index)
- **Binary account data** is fetched just-in-time from Solana RPC (heavy client)
- **Token metadata** is enriched via Birdeye API
- A **gRPC streaming worker** (separate service) detects real-time account changes via Triton Dragon's Mouth

**Two services run in parallel:**

1. **Next.js app** -- web UI, API routes, auth
2. **gRPC worker** -- streams account changes from Solana into Supabase

## Programs

Two programs are supported (hardcoded):

| Program          | Program ID                                  | Description         |
| ---------------- | ------------------------------------------- | ------------------- |
| marginfi         | MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA | Production marginfi |
| marginfi-staging | stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct | Staging marginfi    |

## Prerequisites

- Node.js 18+
- pnpm
- Supabase project
- Solana RPC endpoint (e.g., Ironforge, Helius, Triton)
- Triton Dragon's Mouth gRPC subscription (for the streaming worker)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
cd worker && pnpm install && cd ..
```

### 2. Environment

Create `.env.local` in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Solana RPC (server-side only)
RPC_URL="https://your-rpc-endpoint.com"

# Token enrichment
BIRDEYE_API_KEY="your-birdeye-key"
```

Create `worker/.env` for the gRPC worker:

```bash
# Triton Dragon's Mouth gRPC
GRPC_ENDPOINT="https://your-grpc-endpoint.com"
GRPC_TOKEN="your-grpc-token"

# Supabase (service role - bypasses RLS)
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional (defaults shown)
UPDATE_BUFFER_MS="100"
MAX_CHANGES_PER_ACCOUNT="10"
```

### 3. Database

Run the migrations in Supabase SQL Editor:

```
migrations/init.sql
migrations/002_internal_tool.sql
```

This creates all tables, RLS policies, indexes, and helper functions.

### 4. Seed Data

```bash
pnpm seed-defaults   # Seed default labels, favorites, and views
pnpm indexer         # Index marginfi program accounts
```

### 5. Run

```bash
# Terminal 1: Next.js app
pnpm dev

# Terminal 2: gRPC streaming worker
cd worker && pnpm dev
```

Open http://localhost:3000

## Commands

### Next.js App

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `pnpm dev`           | Start dev server                    |
| `pnpm build`         | Production build                    |
| `pnpm start`         | Start production server             |
| `pnpm lint`          | Run ESLint                          |
| `pnpm indexer`       | Index marginfi program accounts     |
| `pnpm seed-defaults` | Seed default labels/favorites/views |

### gRPC Worker (run from `worker/` directory)

| Command        | Description                  |
| -------------- | ---------------------------- |
| `pnpm dev`     | Start worker with hot reload |
| `pnpm build`   | Compile TypeScript           |
| `pnpm start`   | Run compiled worker          |
| `pnpm cleanup` | Prune old account state rows |

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # API routes
│   │   ├── accounts/           # Account listing, info, history
│   │   ├── favorites/          # User favorites
│   │   ├── labels/             # User labels
│   │   ├── rpc/                # RPC proxy (account-info)
│   │   ├── search/             # Account search
│   │   ├── token-metadata/     # Birdeye token metadata
│   │   └── views/              # Saved views
│   ├── auth/                   # OAuth callback
│   └── page.tsx                # Main explorer page
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   └── *.tsx                   # Feature components
├── hooks/                      # Custom React hooks
├── lib/
│   ├── config/                 # Program and IDL configuration
│   ├── db/                     # Supabase client
│   ├── solana/                 # Data service
│   └── utils/                  # Encoder, enricher, formatter
└── middleware.ts               # Auth guard

scripts/                        # Indexer and seed scripts
migrations/                     # SQL schema
worker/                         # Standalone gRPC streaming worker
    └── src/
        ├── index.ts            # Main loop
        ├── config.ts           # Environment + program config
        ├── db.ts               # Database queries
        ├── grpc.ts             # Dragon's Mouth gRPC client
        ├── processor.ts        # Change detection and buffering
        └── cleanup.ts          # History pruning job
```

## Auth

- **Google OAuth** -- any Google account can sign in
- **Read access is public** -- anyone can browse account data
- **Write operations require auth** -- labels, favorites, views need sign-in
- API routes authenticate via `Authorization: Bearer <token>` headers

## Data Model

### Default Tables (Admin-controlled)

- `default_labels` - Labels seeded via `pnpm seed-defaults`
- `default_favorites` - Favorites seeded via `pnpm seed-defaults`
- `default_views` - Saved views seeded via `pnpm seed-defaults`

### User Tables (User-controlled)

- `user_labels` - User-created labels (override defaults)
- `user_favorites` - User-created favorites (merged with defaults)
- `user_views` - User-created saved views

### Account State

- `account_state` - Historical snapshots with composite PK `(program_id, pubkey, created_at)`
