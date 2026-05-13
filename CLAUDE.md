# CLAUDE.md — eencyclopedia

> AI agent guide. Read this before touching any code. For the full spec see PLAN.md.

## What this is

**eencyclopedia** is a circuit & schematic encyclopedia for electronics engineers. Users upload `.kicad_sch` files; the app parses them, renders an SVG, generates an AI summary for search, and makes circuits findable via hybrid FTS + vector search. There is also a browser-based schematic editor with KiCad round-trip.

- Solo-built by Krish (krish.shoaib55@gmail.com)
- Closed beta — perfecting the core loop, no new features
- Supabase project ref: `dgsvkgspvaxghjppsncn` (eu-west-2, London)

## Commands

```bash
pnpm install          # first-time setup
pnpm dev              # dev server at http://localhost:3000
pnpm test             # Vitest suite (parser, calc, units)
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm db:types         # regenerate lib/supabase/database.types.ts from live schema
```

## Tech stack (locked — don't change without discussion)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router, TypeScript strict |
| DB / Auth / Storage | Supabase (Postgres 15, pgvector, RLS-default-deny) |
| Hosting | Vercel |
| AI (upload summary only) | Gemini 2.5 Flash (default) OR Claude Sonnet 4.6 — switch via `AI_PROVIDER` env var |
| Embeddings | Voyage `voyage-3` (1024-d) |
| Styling | Tailwind CSS v3 with HSL token system |

## Non-negotiable rules

1. **Scope is frozen.** No new features. Fix and polish what exists.
2. **No AI chat.** The `/chat` route and `/api/chat` are deleted. Do not recreate them.
3. **No simulation.** `lib/sim` and `/api/sim` are deleted. Do not recreate them.
4. **AI is for upload summaries only** — one model call per circuit upload for search quality. Never used for real-time chat.
5. **Every AI call writes to `ai_calls` table.** No exceptions.
6. **RLS on every table.** Service role only in server actions / edge functions.
7. **50→200 component cap** on circuits (migration 0011).
8. **Performance:** use `next/dynamic` for heavy client components; no new heavy deps.
9. **`pnpm` only** — no `npm install` in this repo.
10. **TypeScript strict** — no `any` without a comment explaining why.

## Key file paths

```
app/
  page.tsx                      ← landing page
  circuit/[id]/page.tsx         ← circuit detail (SVG + AI summary + BOM)
  circuit/new/upload-form.tsx   ← upload UI
  circuit/[id]/schematic-viewer.tsx ← client SVG viewer with tooltips
  calc/page.tsx                 ← 12 calculators
  features/page.tsx             ← feature status matrix
  suggestions/page.tsx          ← public suggestion box
  schematic/new/                ← scratch editor
  schematic/[slug]/             ← shared scratch view

lib/
  kicad/
    parse.ts        ← .kicad_sch → KiCad AST
    normalise.ts    ← KiCad AST → eencyc canonical AST
    render.ts       ← canonical AST → SVG
    symbols.ts      ← hardcoded component glyphs
    sexp.ts         ← S-expression tokenizer
  ai/
    llm.ts          ← provider-agnostic entry point (Anthropic/Gemini)
    anthropic.ts    ← Anthropic SDK wrapper with ai_calls metering
    gemini.ts       ← Gemini SDK wrapper with ai_calls metering
    voyage.ts       ← embedding client
    pricing.ts      ← token cost tables
  calc/index.ts     ← 12 deterministic calculator functions (no AI)
  circuits/actions.ts ← createSchematic, regenerateSummary server actions
  supabase/
    server.ts       ← SSR-safe client (cookie-bound)
    admin.ts        ← service-role client (server-only)
    client.ts       ← browser client
  env.ts            ← Zod-validated env (fails fast if keys missing)

supabase/migrations/
  0001_init.sql           ← all tables + RLS
  0002_storage_schematics.sql
  0003_fix_grants_ai_calls.sql
  0004_match_kb_chunks.sql
  0005_circuit_favorites.sql
  0006_raise_component_cap.sql
  0007_embeddings_384d.sql
  0008_stars_and_comments.sql
  0009_shared_schematics.sql
  0010_fork_lineage.sql
  0011_raise_component_cap_200.sql
  0012_suggestions.sql
```

## Database tables (canonical)

- `profiles` — one per auth user, karma, settings
- `schematics` — circuits (sexp, svg_url, ai_summary, summary_embedding)
- `schematic_components` — per-circuit component index
- `circuit_favorites` — user ↔ circuit bookmarks
- `components` — global parts catalogue (MPN-keyed)
- `kb_chunks` — vector search index
- `ai_calls` — every model call metered
- `karma_events` — additive karma ledger
- `suggestions` — public suggestion box posts
- `suggestion_upvotes` — per-user upvote records

## Canonical S-exp format (stored in `schematics.sexp`)

```
(eencyc-schematic
  (version 1)
  (units mm)
  (component (designator "R1") (mpn "" "") (value "10k") (pos 50 50) (rot 0)
             (pin "1" (net "VIN")) (pin "2" (net "OUT")))
  (net "VIN") (net "OUT") (net "GND"))
```

## AI provider switching

Set `AI_PROVIDER=anthropic` in `.env.local` to use Claude. Keys:
- `ANTHROPIC_API_KEY` — present and valid
- `GEMINI_API_KEY` — present and valid (current default)
- `VOYAGE_API_KEY` — required regardless of AI_PROVIDER

## Routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | public | Landing |
| `/login` | public | Magic-link sign-in |
| `/auth/callback` | public | PKCE exchange |
| `/calc` | public | 12 calculators |
| `/onboarding` | authed | Username + settings |
| `/library` | authed | Circuit listing + FTS + vector search |
| `/circuit/new` | authed | Upload .kicad_sch |
| `/circuit/[id]` | RLS | Detail: SVG + AI summary + BOM |
| `/schematic/new` | public | Scratch editor |
| `/schematic/[slug]` | public | Shared scratch view |
| `/favorites` | authed | Bookmarked circuits |
| `/profile/[username]` | public | Public profile |
| `/settings` | authed | Account settings |
| `/features` | public | Feature status matrix |
| `/suggestions` | public | Suggestion box |
| `/wiki` | public | Usage documentation |
| `/admin/seed` | admin | Bulk circuit seed |
| `/admin/ingest` | admin | Direct file ingest |

## Path alias

- `@` → project root (not `./src`)
- No `src/` directory — `app/`, `lib/`, `components/` are at root
- `lib/` at root is intentional — do not move

## What's NOT in this project

- No AI chat — deleted, do not recreate
- No simulation — deleted, do not recreate  
- No billing / Stripe — not planned until traction
- No distributor pricing — out of scope
- No datasheet ingest pipeline — out of scope
- No Eagle/Altium import — out of scope
- No PCB (.kicad_pcb) ingest — out of scope
