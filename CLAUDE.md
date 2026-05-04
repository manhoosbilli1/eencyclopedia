# CLAUDE.md — eencyclopedia

> AI agent guide. Read this before touching any code. For the full product spec see PLAN.md.

## What this is

**eencyclopedia** is a circuit & schematic encyclopedia for electronics engineers. Users upload `.kicad_sch` files; the app parses them, renders an SVG, generates an AI summary, and makes circuits searchable via hybrid FTS + vector RAG.

- Solo-built by Krish (krish.shoaib55@gmail.com)
- Closed beta target: 2026-05-02
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
| AI provider | Gemini 2.5 Flash (default) OR Claude Sonnet 4.6 — switch via `AI_PROVIDER` env var |
| Embeddings | Voyage `voyage-3` (1024-d) |
| Styling | Tailwind CSS v3 with HSL token system |

## Non-negotiable design rules

1. **AI must route through Haiku/Flash first** unless user says `/sonnet` or `/opus`. See `lib/ai/router.ts`.
2. **Per-circuit AI summary on upload** — chat never sees raw S-exp, only the structured summary.
3. **Every AI call writes to `ai_calls` table.** No exceptions.
4. **5→50 component cap** on circuits in V0 (raised in migration 0006).
5. **RLS on every table.** Service role only in edge functions / server actions.
6. **No raw user content in tool-decision JSON** — prompt injection risk.
7. **Disclosure footer on every AI response**: `AI-assisted output. Verify against datasheets and standards before fabrication.`

## Key file paths

```
app/
  page.tsx                    ← landing page
  circuit/[id]/page.tsx       ← circuit detail (SVG + AI summary)
  circuit/new/upload-form.tsx ← upload UI
  circuit/[id]/schematic-viewer.tsx ← client SVG viewer with tooltips
  chat/chat-client.tsx        ← streaming chat UI
  calc/page.tsx               ← 12 calculators

lib/
  kicad/
    parse.ts        ← .kicad_sch → KiCad AST
    normalise.ts    ← KiCad AST → eencyc canonical AST
    render.ts       ← canonical AST → SVG (glyph-based, no lib_symbols)
    symbols.ts      ← hardcoded component glyphs (resistor, cap, diode, etc.)
    sexp.ts         ← S-expression tokenizer
  ai/
    llm.ts          ← provider-agnostic entry point (Anthropic/Gemini)
    anthropic.ts    ← Anthropic SDK wrapper with ai_calls metering
    gemini.ts       ← Gemini SDK wrapper with ai_calls metering
    router.ts       ← Haiku-first message routing
    rag.ts          ← hybrid retrieval (FTS + pgvector RRF)
    system-prompts.ts ← eencyclopedia AI persona
    voyage.ts       ← embedding client
  calc/index.ts     ← 12 deterministic calculator functions (no AI)
  circuits/actions.ts ← createSchematic, regenerateSummary, backfillMyCircuits server actions
  supabase/
    server.ts       ← SSR-safe client (cookie-bound)
    admin.ts        ← service-role client (server-only)
    client.ts       ← browser client
  env.ts            ← Zod-validated env (fails fast if keys missing)

supabase/migrations/
  0001_init.sql           ← all tables + RLS + trigger
  0002_storage_schematics.sql ← 'schematics' storage bucket
  0003_fix_grants_ai_calls.sql
  0004_match_kb_chunks.sql ← match_kb_chunks() vector search function
  0005_circuit_favorites.sql ← circuit_favorites table
  0006_raise_component_cap.sql ← component_count cap → 50
```

## Database tables (canonical)

See `supabase/migrations/0001_init.sql` for full schema.

Key tables:
- `profiles` — one per auth user, karma, tier, settings
- `schematics` — uploaded circuits (sexp, svg_url, ai_summary, summary_embedding)
- `schematic_components` — per-circuit component index (designator, value)
- `circuit_favorites` — user ↔ circuit bookmarks (from 0005)
- `components` — global parts catalogue (MPN-keyed)
- `kb_chunks` — RAG knowledge base (embeddings, source metadata)
- `ai_calls` — every LLM call metered here (tokens, cost, schematic_id)
- `karma_events` — additive karma ledger

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
- `VOYAGE_API_KEY` — for embeddings (required regardless of AI_PROVIDER)

## Routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | public | Landing |
| `/login` | public | Magic-link sign-in |
| `/auth/callback` | public | PKCE exchange |
| `/calc` | public | 12 calculators |
| `/onboarding` | authed | Username + settings picker |
| `/library` | authed | Circuit listing + FTS |
| `/circuit/new` | authed | Upload .kicad_sch |
| `/circuit/[id]` | RLS | Detail: SVG + AI summary |
| `/favorites` | authed | Bookmarked circuits |
| `/chat` | authed | EE-tuned streaming chat |
| `/admin/seed` | admin | Bulk circuit seed upload |

## What's NOT done yet (V0 todo)

- [ ] Stripe / billing (V1)
- [ ] ngspice WASM live sim (V1)
- [ ] Forum/comments (V1)
- [ ] Distributor pricing (V1)
- [ ] Datasheet ingest pipeline (V1)
- [ ] `SymbolRenderer.tsx` — alternative renderer using real lib_symbols (WIP, not wired)
- [ ] `pnpm db:types` — types.ts is a placeholder until `supabase link` is run on the machine

## Multi-agent guidance (.agents/ configs in this repo)

See `.agents/` for agent role definitions used by Claude Code's Agent tool and ruflo.
Each agent has a specific domain. Don't overlap domains without coordinating.

## Important constraints

- **Path alias**: `@` → project root (not `./src`)
- **No `src/` directory** — `app/`, `lib/`, `components/` are at the project root
- **`lib/` at root is intentional** — do not move to `src/lib`
- `pnpm` only — no `npm install` in this repo
- TypeScript strict mode — no `any` without a comment explaining why
- Tailwind v3 HSL token system — use `bg-card`, `text-muted-foreground`, `border-border` etc.
